import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  LicenseBody,
  Prisma,
  Specialty,
  VerificationStatus,
} from '../generated/prisma/client.js';
import { AuditService } from '../common/audit/audit.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { StorageService } from '../common/storage/storage.module.js';
import { Paginated, paginate } from '../common/dto/pagination.js';

export class RegisterCaregiverDto {
  @ApiProperty()
  @IsString()
  @MinLength(15)
  @MaxLength(15)
  cnic!: string; // 13 digits, stored as string

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  licenseNumber!: string;

  @ApiProperty({ enum: LicenseBody })
  @IsEnum(LicenseBody)
  licenseBody!: LicenseBody;

  @ApiProperty({ enum: Specialty })
  @IsEnum(Specialty)
  specialty!: Specialty;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  experienceYears?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @ApiProperty({ description: 'e.g. { "cities": ["Lahore"] }' })
  @IsArray()
  @IsString({ each: true })
  serviceCities!: string[];

  @ApiProperty({ description: 'Rate per visit in paisa (minor units)' })
  @IsInt()
  @Min(1000)
  ratePerVisit!: number;
}

export class UpdateCaregiverProfileDto {
  @ApiPropertyOptional({ enum: Specialty })
  @IsOptional()
  @IsEnum(Specialty)
  specialty?: Specialty;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1000)
  ratePerVisit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceCities?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  experienceYears?: number;
}

export class SearchQueryDto {
  @ApiPropertyOptional({ enum: Specialty })
  @IsOptional()
  @IsEnum(Specialty)
  specialty?: Specialty;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

@Injectable()
export class CaregiversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  async register(user: AuthUser, dto: RegisterCaregiverDto) {
    const existing = await this.prisma.caregiverProfile.findUnique({
      where: { userId: user.sub },
    });
    if (existing) {
      throw new NotFoundException('Caregiver profile already exists');
    }
    const commission = await this.prisma.commissionRate.findUnique({
      where: { category: dto.specialty },
    });
    if (!commission) {
      throw new NotFoundException(
        'Commission rate not configured for this specialty (run seed)',
      );
    }

    const profile = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.sub },
        data: { role: 'CAREGIVER' },
      });
      return tx.caregiverProfile.create({
        data: {
          userId: user.sub,
          cnic: dto.cnic,
          licenseNumber: dto.licenseNumber,
          licenseBody: dto.licenseBody,
          specialty: dto.specialty,
          experienceYears: dto.experienceYears ?? null,
          bio: dto.bio ?? null,
          serviceArea: { cities: dto.serviceCities },
          ratePerVisit: dto.ratePerVisit,
          commissionRateId: commission.id,
        },
      });
    });
    await this.audit.log({
      actorId: user.sub,
      action: 'caregiver.registered',
      entityType: 'CaregiverProfile',
      entityId: profile.id,
      metadata: { status: VerificationStatus.PENDING },
    });
    return profile;
  }

  async getMine(user: AuthUser) {
    const profile = await this.prisma.caregiverProfile.findUnique({
      where: { userId: user.sub },
      include: {
        documents: true,
        credentialReviews: { orderBy: { decidedAt: 'desc' }, take: 5 },
        commissionRate: true,
      },
    });
    if (!profile) {
      throw new NotFoundException('Caregiver profile not found');
    }
    return profile;
  }

  async updateProfile(user: AuthUser, dto: UpdateCaregiverProfileDto) {
    const profile = await this.prisma.caregiverProfile.findUnique({
      where: { userId: user.sub },
    });
    if (!profile) {
      throw new NotFoundException('Caregiver profile not found');
    }
    let commissionRateId = profile.commissionRateId;
    if (dto.specialty && dto.specialty !== profile.specialty) {
      const commission = await this.prisma.commissionRate.findUnique({
        where: { category: dto.specialty },
      });
      if (!commission) {
        throw new NotFoundException('Commission rate not configured for this specialty');
      }
      commissionRateId = commission.id;
    }
    const updated = await this.prisma.caregiverProfile.update({
      where: { id: profile.id },
      data: {
        ...(dto.specialty !== undefined ? { specialty: dto.specialty } : {}),
        ...(dto.ratePerVisit !== undefined ? { ratePerVisit: dto.ratePerVisit } : {}),
        ...(dto.serviceCities !== undefined
          ? { serviceArea: { cities: dto.serviceCities } }
          : {}),
        ...(dto.bio !== undefined ? { bio: dto.bio } : {}),
        ...(dto.experienceYears !== undefined
          ? { experienceYears: dto.experienceYears }
          : {}),
        commissionRateId,
      },
    });
    await this.audit.log({
      actorId: user.sub,
      action: 'caregiver.profile.updated',
      entityType: 'CaregiverProfile',
      entityId: profile.id,
    });
    return updated;
  }

  async uploadDocument(
    user: AuthUser,
    type: string,
    file: { originalname: string; mimetype: string; buffer: Buffer },
  ) {
    const profile = await this.prisma.caregiverProfile.findUnique({
      where: { userId: user.sub },
    });
    if (!profile) {
      throw new NotFoundException('Caregiver profile not found');
    }
    this.storage.validateUpload(file.mimetype, file.buffer.length);
    const stored = await this.storage.put(
      `caregivers/${profile.id}/docs`,
      file.originalname,
      file.buffer,
      file.mimetype,
    );
    const doc = await this.prisma.caregiverDocument.create({
      data: {
        caregiverId: profile.id,
        type: type as 'LICENSE' | 'CERTIFICATE' | 'CNIC_COPY' | 'OTHER',
        fileKey: stored.fileKey,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
      },
    });
    await this.audit.log({
      actorId: user.sub,
      action: 'caregiver.document.uploaded',
      entityType: 'CaregiverDocument',
      entityId: doc.id,
      metadata: { type: doc.type },
    });
    return doc;
  }

  async documentUrl(user: AuthUser, documentId: string) {
    const profile = await this.prisma.caregiverProfile.findUnique({
      where: { userId: user.sub },
    });
    if (!profile) {
      throw new NotFoundException('Caregiver profile not found');
    }
    const doc = await this.prisma.caregiverDocument.findFirst({
      where: { id: documentId, caregiverId: profile.id },
    });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }
    return { url: await this.storage.presignedGet(doc.fileKey) };
  }

  /** Public search (FR-C3, FR-C4): only APPROVED caregivers of ACTIVE users. */
  async search(query: SearchQueryDto): Promise<Paginated<unknown>> {
    const where: Prisma.CaregiverProfileWhereInput = {
      verificationStatus: VerificationStatus.APPROVED,
      user: { status: 'ACTIVE' },
      ...(query.specialty ? { specialty: query.specialty } : {}),
      ...(query.city
        ? { serviceArea: { path: ['cities'], array_contains: [query.city] } }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.caregiverProfile.count({ where }),
      this.prisma.caregiverProfile.findMany({
        where,
        orderBy: { ratingAverage: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          specialty: true,
          ratePerVisit: true,
          experienceYears: true,
          bio: true,
          ratingAverage: true,
          ratingCount: true,
          serviceArea: true,
          user: { select: { fullName: true } },
        },
      }),
    ]);
    return paginate(items, query.page, query.limit, total);
  }

  /** Public caregiver profile (FR-C4). */
  async getPublic(id: string) {
    const profile = await this.prisma.caregiverProfile.findFirst({
      where: {
        id,
        verificationStatus: VerificationStatus.APPROVED,
        user: { status: 'ACTIVE' },
      },
      select: {
        id: true,
        specialty: true,
        licenseNumber: true,
        licenseBody: true,
        experienceYears: true,
        bio: true,
        photoKey: true,
        ratePerVisit: true,
        serviceArea: true,
        ratingAverage: true,
        ratingCount: true,
        createdAt: true,
        user: { select: { fullName: true } },
        availabilityRules: {
          orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
          select: { dayOfWeek: true, startTime: true, endTime: true },
        },
      },
    });
    if (!profile) {
      throw new NotFoundException('Caregiver not found');
    }
    return profile;
  }

  async photoUrl(user: AuthUser) {
    const profile = await this.prisma.caregiverProfile.findUnique({
      where: { userId: user.sub },
    });
    if (!profile?.photoKey) {
      throw new NotFoundException('No photo uploaded');
    }
    return { url: await this.storage.presignedGet(profile.photoKey) };
  }

  async uploadPhoto(
    user: AuthUser,
    file: { originalname: string; mimetype: string; buffer: Buffer },
  ) {
    const profile = await this.prisma.caregiverProfile.findUnique({
      where: { userId: user.sub },
    });
    if (!profile) {
      throw new NotFoundException('Caregiver profile not found');
    }
    this.storage.validateUpload(file.mimetype, file.buffer.length);
    const stored = await this.storage.put(
      `caregivers/${profile.id}/photo`,
      file.originalname,
      file.buffer,
      file.mimetype,
    );
    await this.prisma.caregiverProfile.update({
      where: { id: profile.id },
      data: { photoKey: stored.fileKey },
    });
    return { photoKey: stored.fileKey };
  }
}

@ApiTags('caregiver')
@ApiBearerAuth()
@Controller('caregiver')
export class CaregiverController {
  constructor(private readonly caregivers: CaregiversService) {}

  @Post('register')
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterCaregiverDto) {
    return this.caregivers.register(user, dto);
  }

  @Get('profile')
  me(@CurrentUser() user: AuthUser) {
    return this.caregivers.getMine(user);
  }

  @Patch('profile')
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateCaregiverProfileDto) {
    return this.caregivers.updateProfile(user, dto);
  }

  @Post('documents')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  uploadDocument(
    @CurrentUser() user: AuthUser,
    @Body('type') type: string,
    @UploadedFile() file: { originalname: string; mimetype: string; buffer: Buffer },
  ) {
    const allowed = ['LICENSE', 'CERTIFICATE', 'CNIC_COPY', 'OTHER'];
    const docType = allowed.includes(type) ? type : 'OTHER';
    return this.caregivers.uploadDocument(user, docType, file);
  }

  @Get('documents/:id/url')
  documentUrl(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.caregivers.documentUrl(user, id);
  }

  @Post('photo')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  uploadPhoto(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: { originalname: string; mimetype: string; buffer: Buffer },
  ) {
    return this.caregivers.uploadPhoto(user, file);
  }

  @Get('photo/url')
  photoUrl(@CurrentUser() user: AuthUser) {
    return this.caregivers.photoUrl(user);
  }
}

@ApiTags('caregivers')
@Controller('caregivers')
export class PublicCaregiverController {
  constructor(private readonly caregivers: CaregiversService) {}

  @Get()
  search(@Query() query: SearchQueryDto) {
    return this.caregivers.search(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.caregivers.getPublic(id);
  }
}

@Module({
  controllers: [CaregiverController, PublicCaregiverController],
  providers: [CaregiversService],
})
export class CaregiversModule {}
