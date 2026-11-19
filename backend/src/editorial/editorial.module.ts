import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { UserRole } from '../generated/prisma/client.js';
import { AuditService } from '../common/audit/audit.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PrismaService } from '../common/prisma/prisma.service.js';

export class UpdateEditorialPageDto {
  @ApiProperty({ example: 'About Us', description: 'Page title' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ example: '<h2>Our Mission</h2><p>CareSaath provides verified in-home medical care...</p>', description: 'Page HTML or markdown content' })
  @IsString()
  content!: string;
}

export class UpdateContactInfoDto {
  @ApiPropertyOptional({ example: 'info@caresaath.com' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ example: 'caregivers@caresaath.pk' })
  @IsOptional()
  @IsString()
  caregiverEmail?: string;

  @ApiPropertyOptional({ example: 'hello@caresaath.pk' })
  @IsOptional()
  @IsString()
  pressEmail?: string;

  @ApiPropertyOptional({ example: '+92 300 0000000' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: '+92 300 0000000' })
  @IsOptional()
  @IsString()
  whatsapp?: string;

  @ApiPropertyOptional({ example: 'Main Gulberg III, Lahore, Pakistan' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Mon - Sat: 9:00 AM - 9:00 PM' })
  @IsOptional()
  @IsString()
  hours?: string;
}

const DEFAULT_PAGES: Record<string, { title: string; content: string }> = {
  about: {
    title: 'About CareSaath',
    content: `CareSaath is Pakistan's premier home healthcare platform, connecting patients and families with verified nurses, physiotherapists, and medical attendants for certified in-home clinical care.`,
  },
  terms: {
    title: 'Terms of Service',
    content: `These terms govern your use of the CareSaath application, verified healthcare professional bookings, and home visits in Pakistan.`,
  },
  privacy: {
    title: 'Privacy Policy',
    content: `CareSaath protects patient and customer personal and health information using end-to-end encryption and strict data minimization.`,
  },
};

const DEFAULT_CONTACT_INFO = {
  email: 'info@caresaath.com',
  caregiverEmail: 'caregivers@caresaath.pk',
  pressEmail: 'hello@caresaath.pk',
  phone: '+92 42 111 227 372',
  whatsapp: '+92 300 2273728',
  address: 'Gulberg III, Lahore, Pakistan',
  hours: '24/7 Helpline & Dispatch',
};

@Injectable()
export class EditorialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listPages() {
    const keys = Object.keys(DEFAULT_PAGES).map((slug) => `editorial.page.${slug}`);
    const rows = await this.prisma.platformConfig.findMany({
      where: { key: { in: keys } },
    });
    const map = new Map(rows.map((r) => [r.key, r]));

    return Object.keys(DEFAULT_PAGES).map((slug) => {
      const row = map.get(`editorial.page.${slug}`);
      const val = row?.value as { title?: string; content?: string } | undefined;
      return {
        slug,
        title: val?.title ?? DEFAULT_PAGES[slug].title,
        updatedAt: row?.updatedAt ?? null,
      };
    });
  }

  async getPage(slug: string) {
    const key = `editorial.page.${slug}`;
    const row = await this.prisma.platformConfig.findUnique({ where: { key } });
    if (!row && !DEFAULT_PAGES[slug]) {
      throw new NotFoundException(`Editorial page "${slug}" not found`);
    }
    const val = row?.value as { title?: string; content?: string } | undefined;
    const defaultData = DEFAULT_PAGES[slug] ?? { title: slug, content: '' };
    return {
      slug,
      title: val?.title ?? defaultData.title,
      content: val?.content ?? defaultData.content,
      updatedAt: row?.updatedAt ?? null,
    };
  }

  async updatePage(admin: AuthUser, slug: string, dto: UpdateEditorialPageDto) {
    const key = `editorial.page.${slug}`;
    const data = { title: dto.title, content: dto.content };
    await this.prisma.platformConfig.upsert({
      where: { key },
      update: { value: data },
      create: { key, value: data },
    });
    await this.audit.log({
      actorId: admin.sub,
      action: 'editorial.page_updated',
      entityType: 'EditorialPage',
      entityId: slug,
      metadata: { title: dto.title },
    });
    return { slug, ...data };
  }

  async getContactInfo() {
    const row = await this.prisma.platformConfig.findUnique({
      where: { key: 'editorial.contactInfo' },
    });
    if (!row) return DEFAULT_CONTACT_INFO;
    return { ...DEFAULT_CONTACT_INFO, ...(row.value as object) };
  }

  async updateContactInfo(admin: AuthUser, dto: UpdateContactInfoDto) {
    const existing = await this.getContactInfo();
    const updated = { ...existing, ...dto };
    await this.prisma.platformConfig.upsert({
      where: { key: 'editorial.contactInfo' },
      update: { value: updated },
      create: { key: 'editorial.contactInfo', value: updated },
    });
    await this.audit.log({
      actorId: admin.sub,
      action: 'editorial.contact_info_updated',
      entityType: 'ContactInfo',
      entityId: 'global',
    });
    return updated;
  }
}

@ApiTags('Public - Editorial')
@Controller('editorial')
export class EditorialPublicController {
  constructor(private readonly editorial: EditorialService) {}

  @Get('pages')
  @ApiOperation({ summary: 'List all editorial pages' })
  listPages() {
    return this.editorial.listPages();
  }

  @Get('pages/:slug')
  @ApiOperation({ summary: 'Get editorial page content by slug' })
  getPage(@Param('slug') slug: string) {
    return this.editorial.getPage(slug);
  }

  @Get('contact-info')
  @ApiOperation({ summary: 'Get platform public contact information' })
  getContactInfo() {
    return this.editorial.getContactInfo();
  }
}

@ApiTags('Admin - Editorial')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/editorial')
export class AdminEditorialController {
  constructor(private readonly editorial: EditorialService) {}

  @Get('pages')
  @ApiOperation({ summary: 'List editorial pages' })
  listPages() {
    return this.editorial.listPages();
  }

  @Get('pages/:slug')
  @ApiOperation({ summary: 'Get editorial page' })
  getPage(@Param('slug') slug: string) {
    return this.editorial.getPage(slug);
  }

  @Put('pages/:slug')
  @ApiOperation({ summary: 'Update editorial page content' })
  updatePage(
    @CurrentUser() admin: AuthUser,
    @Param('slug') slug: string,
    @Body() dto: UpdateEditorialPageDto,
  ) {
    return this.editorial.updatePage(admin, slug, dto);
  }

  @Get('contact-info')
  @ApiOperation({ summary: 'Get contact info' })
  getContactInfo() {
    return this.editorial.getContactInfo();
  }

  @Put('contact-info')
  @ApiOperation({ summary: 'Update contact info' })
  updateContactInfo(
    @CurrentUser() admin: AuthUser,
    @Body() dto: UpdateContactInfoDto,
  ) {
    return this.editorial.updateContactInfo(admin, dto);
  }
}

@Module({
  controllers: [EditorialPublicController, AdminEditorialController],
  providers: [EditorialService],
  exports: [EditorialService],
})
export class EditorialModule {}
