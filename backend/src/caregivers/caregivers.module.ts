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
import { Type } from 'class-transformer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
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
import {
  decryptMaybe,
  deriveKey,
  encryptField,
  maskValue,
} from '../common/crypto/field-encryption.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { RedisService } from '../common/redis/redis.module.js';
import { StorageService } from '../common/storage/storage.module.js';
import { Paginated, paginate } from '../common/dto/pagination.js';
import { PlatformConfigModule, ConfigService } from '../config/platform-config.module.js';

/** ERD §3.1 / TRD §9: caregiver CNIC is stored encrypted at rest. */
const CNIC_KEY = deriveKey('CNIC_ENCRYPTION_KEY', 'caresaath-dev-cnic-key');

export class RegisterCaregiverDto {
  @ApiProperty({
    example: '35201-1111111-1',
    description: '13-digit Pakistani CNIC with dashes (15 characters total)',
  })
  @IsString()
  @MinLength(15)
  @MaxLength(15)
  cnic!: string;

  @ApiProperty({
    example: 'PNC-100001',
    description: 'Official license or registration number (e.g. PNC or PMDC)',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  licenseNumber!: string;

  @ApiProperty({
    enum: LicenseBody,
    example: LicenseBody.PNC,
    description: 'Licensing medical authority (PNC or PMDC)',
  })
  @IsEnum(LicenseBody)
  licenseBody!: LicenseBody;

  @ApiProperty({
    enum: Specialty,
    example: Specialty.NURSING,
    description: 'Primary clinical specialization',
  })
  @IsEnum(Specialty)
  specialty!: Specialty;

  @ApiPropertyOptional({ example: 8, description: 'Years of clinical experience' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  experienceYears?: number;

  @ApiPropertyOptional({
    example: 'Registered nurse with 8 years of hospital and intensive home-care experience.',
    description: 'Professional summary / bio',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @ApiProperty({
    example: ['Lahore'],
    description: 'List of cities where the caregiver provides home visits',
  })
  @IsArray()
  @IsString({ each: true })
  serviceCities!: string[];

  @ApiProperty({
    example: 60000,
    description: 'Rate per visit in paisa / minor units (e.g. 60000 paisa = PKR 600)',
  })
  @IsInt()
  @Min(1000)
  ratePerVisit!: number;
}

export class UpdateCaregiverProfileDto {
  @ApiPropertyOptional({ enum: Specialty, example: Specialty.NURSING })
  @IsOptional()
  @IsEnum(Specialty)
  specialty?: Specialty;

  @ApiPropertyOptional({ example: 65000, description: 'New rate per visit in paisa' })
  @IsOptional()
  @IsInt()
  @Min(1000)
  ratePerVisit?: number;

  @ApiPropertyOptional({ example: ['Lahore', 'Kasur'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceCities?: string[];

  @ApiPropertyOptional({ example: 'Updated bio highlighting stroke rehabilitation expertise.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @ApiPropertyOptional({ example: 9 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  experienceYears?: number;
}

export class SearchQueryDto {
  @ApiPropertyOptional({ enum: Specialty, example: Specialty.NURSING, description: 'Filter by specialty' })
  @IsOptional()
  @IsEnum(Specialty)
  specialty?: Specialty;

  @ApiPropertyOptional({ example: 'Lahore', description: 'Filter by pilot city' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 1, default: 1, description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ example: 20, default: 20, description: 'Items per page' })
  @IsOptional()
  @Type(() => Number)
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
    private readonly redis: RedisService,
    private readonly config: ConfigService,
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
          cnic: encryptField(dto.cnic, CNIC_KEY),
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
    const cnic = decryptMaybe(profile.cnic, CNIC_KEY);
    return { ...profile, cnic: cnic ? maskValue(cnic, 4) : null };
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
    const cacheKey = `search:caregivers:${query.specialty ?? 'all'}:${query.city ?? 'all'}:${query.page}:${query.limit}`;
    const ttlSeconds = await this.config.getNumber('search.cacheTtlSeconds');
    if (ttlSeconds > 0) {
      const cached = await this.redis.client.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as Paginated<unknown>;
      }
    }

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
    const result = paginate(items, query.page, query.limit, total);
    if (ttlSeconds > 0) {
      await this.redis.client.set(cacheKey, JSON.stringify(result), 'EX', ttlSeconds);
    }
    return result;
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

@ApiTags('Caregiver - Profile')
@ApiBearerAuth()
@Controller('caregiver')
export class CaregiverController {
  constructor(private readonly caregivers: CaregiversService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Caregiver onboarding registration',
    description:
      'Registers caregiver profile with license, specialty, CNIC, and service cities. Initial status is PENDING admin verification.',
  })
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterCaregiverDto) {
    return this.caregivers.register(user, dto);
  }

  @Get('profile')
  @ApiOperation({
    summary: 'Get my caregiver profile',
    description:
      'Returns the authenticated caregiver profile, verification status, uploaded documents, reviews, and masked CNIC.',
  })
  me(@CurrentUser() user: AuthUser) {
    return this.caregivers.getMine(user);
  }

  @Patch('profile')
  @ApiOperation({
    summary: 'Update caregiver profile',
    description: 'Updates bio, visit rates, service cities, and experience.',
  })
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateCaregiverProfileDto) {
    return this.caregivers.updateProfile(user, dto);
  }

  @Post('documents')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload credential documents',
    description:
      'Uploads license certificates, degrees, or CNIC copies for admin verification review.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'type'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Document file (PDF, PNG, JPG, max 10MB)' },
        type: {
          type: 'string',
          enum: ['LICENSE', 'CERTIFICATE', 'CNIC_COPY', 'OTHER'],
          example: 'LICENSE',
          description: 'Document category',
        },
      },
    },
  })
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
  @ApiOperation({
    summary: 'Get presigned URL for document',
    description: 'Generates a short-lived secure URL to view or download an uploaded document.',
  })
  documentUrl(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.caregivers.documentUrl(user, id);
  }

  @Post('photo')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload profile photo',
    description: 'Uploads caregiver professional portrait photo (PNG/JPEG).',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Profile photo file' },
      },
    },
  })
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
  @ApiOperation({
    summary: 'Get presigned URL for profile photo',
    description: 'Generates a secure presigned URL to view the caregiver photo.',
  })
  photoUrl(@CurrentUser() user: AuthUser) {
    return this.caregivers.photoUrl(user);
  }
}

@ApiTags('Customer - Discovery')
@Public()
@Controller('caregivers')
export class PublicCaregiverController {
  constructor(private readonly caregivers: CaregiversService) {}

  @Get()
  @ApiOperation({
    summary: 'Search verified caregivers',
    description:
      'Public search for verified, approved caregivers filtered by specialty and city. Cached in Redis for low-latency under 3G networks.',
  })
  search(@Query() query: SearchQueryDto) {
    return this.caregivers.search(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get public caregiver profile',
    description:
      'Public details for a verified caregiver: qualifications, ratings, rate per visit, bio, and weekly availability rules.',
  })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.caregivers.getPublic(id);
  }
}

@Module({
  imports: [PlatformConfigModule],
  controllers: [CaregiverController, PublicCaregiverController],
  providers: [CaregiversService],
})
export class CaregiversModule {}
