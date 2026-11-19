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
  @ApiPropertyOptional({ example: 'About Us', description: 'Page title' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiProperty({ example: '<h2>Our Mission</h2><p>CareSaath provides verified in-home medical care...</p>', description: 'Page HTML or rich text content' })
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
    content: `<h2>Trusted Home Healthcare for Pakistan</h2>
<p>CareSaath is Pakistan's premier verified home healthcare marketplace, connecting patients and families with licensed nurses, certified physiotherapists, and medical attendants for safe, compassionate clinical care at home.</p>

<h3>How We Verify Caregivers</h3>
<ul>
  <li><strong>PNC & PMDC Credential Check:</strong> Every caregiver's government license and qualifications are verified against official medical registers.</li>
  <li><strong>Identity & Background:</strong> Nadra CNIC validation, background checks, and residential address verification.</li>
  <li><strong>In-Person Clinical Screening:</strong> Hands-on evaluation of nursing and rehabilitation competencies by clinical supervisors.</li>
  <li><strong>Periodic Re-verification:</strong> Annual credential re-checks ensuring that all active caregivers remain in full compliance.</li>
</ul>

<h3>Safety & Patient Trust</h3>
<p>Every home visit is monitored with real-time GPS geofencing, one-time passcode (OTP) check-in, and an in-app SOS emergency escalation protocol directly linked to Rescue 1122 and our clinical response team.</p>`,
  },
  terms: {
    title: 'Terms of Service',
    content: `<h2>Terms of Service</h2>
<p>These terms govern your use of the CareSaath application, verified healthcare professional bookings, and home visits across Pakistan. By booking a visit, you agree to these terms.</p>

<h3>1. Healthcare Marketplace Platform</h3>
<p>CareSaath connects customers with independent, credential-verified nurses, physiotherapists, and caregivers. CareSaath facilitates bookings, safety monitoring, and payments — clinical care is the direct professional responsibility of the attending caregiver.</p>

<h3>2. Accounts & Booking Eligibility</h3>
<ul>
  <li>Accounts are verified via phone number and one-time passcode (OTP).</li>
  <li>Customers must provide accurate patient information and medical history context.</li>
  <li>Family members may book care on behalf of relatives with their consent.</li>
</ul>

<h3>3. Caregiver Conduct & Safety</h3>
<ul>
  <li>Caregivers set their specialties, verified visit rates, and availability.</li>
  <li>In-app SOS buttons and incident reporting tools are active throughout every visit.</li>
  <li>Zero-tolerance policy for harassment, misconduct, or policy violations.</li>
</ul>

<h3>4. Emergency Disclaimer</h3>
<p>CareSaath is not a critical emergency dispatch service. In life-threatening emergencies, immediately contact Rescue 1122 or proceed to the nearest hospital emergency room.</p>`,
  },
  privacy: {
    title: 'Privacy Policy',
    content: `<h2>Privacy Policy</h2>
<p>CareSaath connects families with verified caregivers. Because home healthcare involves sensitive personal information, protecting your medical and personal data is central to our platform architecture.</p>

<h3>1. Information We Collect</h3>
<ul>
  <li><strong>Account & Identity:</strong> Phone number, full name, and preferred communication language.</li>
  <li><strong>Patient Profiles:</strong> Patient name, age, relationship, and basic health context required for clinical visits.</li>
  <li><strong>Location & Addresses:</strong> Service addresses and GPS geofencing coordinates for visit check-in and check-out verification.</li>
  <li><strong>Prescriptions & Care Plans:</strong> Clinical notes and medical documents uploaded by customers or attending caregivers.</li>
</ul>

<h3>2. How We Protect Your Data</h3>
<p>All sensitive health documents and personal information are encrypted in transit (TLS 1.3) and at rest (AES-256). Access is strictly restricted to the assigned caregiver during active bookings and authorized compliance personnel.</p>

<h3>3. Information Sharing</h3>
<p>We do not sell personal data. Information is shared only with the assigned caregiver for scheduled visit delivery, licensed payment gateways (SBP regulated), and regulatory authorities where mandated by law.</p>`,
  },
};

const DEFAULT_CONTACT_INFO = {
  email: 'support@caresaath.com',
  phone: '+92 42 111 227 372',
  whatsapp: '+92 300 2273728',
  address: 'Gulberg III, Lahore, Pakistan',
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
    const defaultData = DEFAULT_PAGES[slug] ?? { title: slug, content: '' };
    const title = dto.title || defaultData.title;
    const data = { title, content: dto.content };
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
      metadata: { title },
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
