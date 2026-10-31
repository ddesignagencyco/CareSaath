import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Optional,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  SetMetadata,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Transform, Type } from 'class-transformer';
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
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  LicenseBody,
  Prisma,
  Specialty,
  StrikeReason,
  VerificationStatus,
  VisitStatus,
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
import { IS_PUBLIC_KEY, Public } from '../common/decorators/public.decorator.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { RedisService } from '../common/redis/redis.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthService } from '../auth/auth.service.js';
import { NotificationsModule, NotificationsService } from '../notifications/notifications.module.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { StorageService, withFileUrl } from '../common/storage/storage.module.js';
import { Paginated, paginate } from '../common/dto/pagination.js';
import { PlatformConfigModule, ConfigService } from '../config/platform-config.module.js';
import { todayInPakistan } from '../availability/availability.module.js';
import { distanceMeters } from '../common/geo.js';
import { resolveCaregiverBadge } from './badge.js';

/** ERD §3.1 / TRD §9: caregiver CNIC is stored encrypted at rest. */
const CNIC_KEY = deriveKey('CNIC_ENCRYPTION_KEY', 'caresaath-dev-cnic-key');

/**
 * Result of a public search: the page itself plus where it came from. The
 * cache state is exposed as the `X-Cache` response header so the load tests
 * can measure the Redis hit ratio.
 */
export interface SearchResult {
  result: Paginated<unknown>;
  cache: 'HIT' | 'MISS';
}

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

  @ApiPropertyOptional({
    example: 50000,
    description: 'Lower bound of the self-set pricing bracket (paisa). Defaults to ratePerVisit when omitted.',
  })
  @IsOptional()
  @IsInt()
  @Min(1000)
  minRatePerVisit?: number;

  @ApiPropertyOptional({
    example: 80000,
    description: 'Upper bound of the self-set pricing bracket (paisa). Defaults to ratePerVisit when omitted.',
  })
  @IsOptional()
  @IsInt()
  @Min(1000)
  maxRatePerVisit?: number;
}

export class UpdateCaregiverProfileDto {
  @ApiPropertyOptional({ enum: Specialty, example: Specialty.NURSING })
  @IsOptional()
  @IsEnum(Specialty)
  specialty?: Specialty;

  @ApiPropertyOptional({ example: 65000, description: 'New rate per visit in paisa; must stay within the current (or newly set) pricing bracket' })
  @IsOptional()
  @IsInt()
  @Min(1000)
  ratePerVisit?: number;

  @ApiPropertyOptional({ example: 50000, description: 'New lower bound of the pricing bracket (paisa)' })
  @IsOptional()
  @IsInt()
  @Min(1000)
  minRatePerVisit?: number;

  @ApiPropertyOptional({ example: 80000, description: 'New upper bound of the pricing bracket (paisa)' })
  @IsOptional()
  @IsInt()
  @Min(1000)
  maxRatePerVisit?: number;

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

export class UpdateLocationDto {
  @ApiProperty({ example: 31.5204, description: 'Current latitude' })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ example: 74.3587, description: 'Current longitude' })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;
}

export class SetAvailableNowDto {
  @ApiProperty({
    example: true,
    description: 'true opts in to immediate (ASAP / emergency) requests right now; false opts out. Only counts while the live location is fresh.',
  })
  @IsBoolean()
  available!: boolean;
}

export class ServiceAreaDto {
  @ApiProperty({ example: 'Lahore', description: 'City this zone is within (must be one of serviceCities)' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  city!: string;

  @ApiPropertyOptional({ example: 'DHA Phase 5', description: 'Display label for the zone (not matched on)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @ApiProperty({ example: 31.4697 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ example: 74.4142 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @ApiPropertyOptional({ example: 5000, default: 5000, description: 'Coverage radius around the point, in metres' })
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(50_000)
  radiusMeters?: number;
}

export class SetServiceAreasDto {
  @ApiProperty({
    type: [ServiceAreaDto],
    description: 'Full replace of sub-city coverage zones. An empty list means "whole city" coverage for every serviceCities entry.',
  })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ServiceAreaDto)
  areas!: ServiceAreaDto[];
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

  @ApiPropertyOptional({
    example: 31.4697,
    description: 'Customer address latitude. With lng, narrows results to caregivers whose sub-city zones (if any) actually cover this point, not just the city.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({ example: 74.4142, description: 'Customer address longitude (see lat).' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @ApiPropertyOptional({
    example: true,
    description:
      'Nearby-now (emergency) search: only APPROVED caregivers who are available now with a fresh live location within booking.immediateMaxDistanceMeters of lat/lng (both required). Each result carries distanceMeters and etaMinutes, sorted nearest first. Never cached.',
  })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : value))
  @IsBoolean()
  immediate?: boolean;

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

/** A caregiver actively engaged with a patient right now (mirrors BookingsModule): can't take an ASAP request. */
const ON_VISIT_STATUSES: VisitStatus[] = [
  VisitStatus.EN_ROUTE,
  VisitStatus.CHECKED_IN,
  VisitStatus.IN_PROGRESS,
];

/** A caregiver's rate must sit within the bracket they set for themselves. */
function assertRateWithinBracket(rate: number, min: number, max: number): void {
  if (min > max) {
    throw new BadRequestException('minRatePerVisit must not be greater than maxRatePerVisit');
  }
  if (rate < min || rate > max) {
    throw new BadRequestException(
      `ratePerVisit (${rate}) must be between the pricing bracket ${min}-${max}`,
    );
  }
}

@Injectable()
export class CaregiversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly realtime?: RealtimeService,
  ) {}

  /** Public search results are cached in Redis; any coverage/visibility change must drop them. */
  private async invalidateSearchCache(): Promise<void> {
    try {
      await this.redis.deleteByPattern('search:caregivers:*');
    } catch {
      // The cache is short-lived; never fail the caregiver action over it.
    }
  }

  async register(user: AuthUser, dto: RegisterCaregiverDto) {
    const existing = await this.prisma.caregiverProfile.findUnique({
      where: { userId: user.sub },
    });
    if (existing) {
      throw new ConflictException('Caregiver profile already exists');
    }
    const commission = await this.prisma.commissionRate.findUnique({
      where: { category: dto.specialty },
    });
    if (!commission) {
      throw new NotFoundException(
        'Commission rate not configured for this specialty (run seed)',
      );
    }
    const minRatePerVisit = dto.minRatePerVisit ?? dto.ratePerVisit;
    const maxRatePerVisit = dto.maxRatePerVisit ?? dto.ratePerVisit;
    assertRateWithinBracket(dto.ratePerVisit, minRatePerVisit, maxRatePerVisit);

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
          minRatePerVisit,
          maxRatePerVisit,
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
    // The account's role just changed; hand back tokens that carry CAREGIVER so no refresh round-trip is needed.
    await this.notifications?.notifyAdmins({
      event: 'caregiver.registered',
      payload: { caregiverId: profile.id, specialty: dto.specialty },
      message: 'A new caregiver registered and is waiting for verification.',
    });
    this.realtime?.entityUpdated(
      { users: [user.sub], roles: ['ADMIN'] },
      { type: 'caregiver', id: profile.id, action: 'registered', status: VerificationStatus.PENDING },
    );
    const tokens = await this.auth.issueTokens(user.sub, 'CAREGIVER', user.phone);
    return { ...profile, ...tokens };
  }

  /** Public delivery URL for a stored photo key, or null when none was uploaded. */
  private async photoUrlFor(photoKey: string | null): Promise<string | null> {
    return photoKey ? this.storage.presignedGet(photoKey) : null;
  }

  /** How many visits this caregiver has fully completed, for ranking/badges. */
  private async completedVisitsCount(caregiverId: string): Promise<number> {
    return this.prisma.visit.count({
      where: { status: 'COMPLETED', booking: { caregiverId } },
    });
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
    const completedVisits = await this.completedVisitsCount(profile.id);
    return {
      ...profile,
      documents: await Promise.all(profile.documents.map((doc) => withFileUrl(this.storage, doc))),
      cnic: cnic ? maskValue(cnic, 4) : null,
      photoUrl: await this.photoUrlFor(profile.photoKey),
      availableNow: await this.isAvailableNow(profile),
      badge: resolveCaregiverBadge(profile.badgeOverride, {
        experienceYears: profile.experienceYears,
        ratingAverage: profile.ratingAverage,
        ratingCount: profile.ratingCount,
        completedVisits,
      }),
    };
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
    const ratePerVisit = dto.ratePerVisit ?? profile.ratePerVisit;
    const minRatePerVisit = dto.minRatePerVisit ?? profile.minRatePerVisit ?? ratePerVisit;
    const maxRatePerVisit = dto.maxRatePerVisit ?? profile.maxRatePerVisit ?? ratePerVisit;
    if (
      dto.ratePerVisit !== undefined ||
      dto.minRatePerVisit !== undefined ||
      dto.maxRatePerVisit !== undefined
    ) {
      assertRateWithinBracket(ratePerVisit, minRatePerVisit, maxRatePerVisit);
    }
    const updated = await this.prisma.caregiverProfile.update({
      where: { id: profile.id },
      data: {
        ...(dto.specialty !== undefined ? { specialty: dto.specialty } : {}),
        ...(dto.ratePerVisit !== undefined ? { ratePerVisit: dto.ratePerVisit } : {}),
        ...(dto.minRatePerVisit !== undefined ? { minRatePerVisit: dto.minRatePerVisit } : {}),
        ...(dto.maxRatePerVisit !== undefined ? { maxRatePerVisit: dto.maxRatePerVisit } : {}),
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

  /** Sub-city coverage zones, so search/booking can tell which part of a city a caregiver actually serves. */
  async listServiceAreas(user: AuthUser) {
    const profile = await this.prisma.caregiverProfile.findUnique({
      where: { userId: user.sub },
      select: { id: true },
    });
    if (!profile) {
      throw new NotFoundException('Caregiver profile not found');
    }
    return this.prisma.caregiverServiceArea.findMany({
      where: { caregiverId: profile.id },
      orderBy: { city: 'asc' },
    });
  }

  /** Full replace, mirroring AvailabilityService.setRules. An empty list reverts to whole-city coverage. */
  async setServiceAreas(user: AuthUser, dto: SetServiceAreasDto) {
    const profile = await this.prisma.caregiverProfile.findUnique({
      where: { userId: user.sub },
    });
    if (!profile) {
      throw new NotFoundException('Caregiver profile not found');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.caregiverServiceArea.deleteMany({ where: { caregiverId: profile.id } });
      if (dto.areas.length > 0) {
        await tx.caregiverServiceArea.createMany({
          data: dto.areas.map((a) => ({
            caregiverId: profile.id,
            city: a.city,
            label: a.label ?? null,
            latitude: a.lat,
            longitude: a.lng,
            radiusMeters: a.radiusMeters ?? 5000,
          })),
        });
      }
    });
    await this.audit.log({
      actorId: user.sub,
      action: 'caregiver.service_areas.set',
      entityType: 'CaregiverProfile',
      entityId: profile.id,
      metadata: { areas: dto.areas.length },
    });
    await this.invalidateSearchCache();
    return this.listServiceAreas(user);
  }

  async addServiceArea(user: AuthUser, dto: ServiceAreaDto) {
    const profile = await this.prisma.caregiverProfile.findUnique({
      where: { userId: user.sub },
      select: { id: true },
    });
    if (!profile) {
      throw new NotFoundException('Caregiver profile not found');
    }
    const area = await this.prisma.caregiverServiceArea.create({
      data: {
        caregiverId: profile.id,
        city: dto.city,
        label: dto.label ?? null,
        latitude: dto.lat,
        longitude: dto.lng,
        radiusMeters: dto.radiusMeters ?? 5000,
      },
    });
    await this.audit.log({
      actorId: user.sub,
      action: 'caregiver.service_area.added',
      entityType: 'CaregiverServiceArea',
      entityId: area.id,
    });
    await this.invalidateSearchCache();
    return area;
  }

  async removeServiceArea(user: AuthUser, id: string) {
    const profile = await this.prisma.caregiverProfile.findUnique({
      where: { userId: user.sub },
      select: { id: true },
    });
    if (!profile) {
      throw new NotFoundException('Caregiver profile not found');
    }
    const area = await this.prisma.caregiverServiceArea.findFirst({
      where: { id, caregiverId: profile.id },
    });
    if (!area) {
      throw new NotFoundException('Service area not found');
    }
    await this.prisma.caregiverServiceArea.delete({ where: { id } });
    await this.invalidateSearchCache();
    return { ok: true as const };
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
    await this.notifications?.notifyAdmins({
      event: 'caregiver.document.uploaded',
      payload: { caregiverId: profile.id, documentId: doc.id, type: doc.type },
      message: 'A caregiver uploaded a credential document for review.',
    });
    this.realtime?.entityUpdated(
      { users: [user.sub], roles: ['ADMIN'] },
      { type: 'caregiver', id: profile.id, action: 'document_uploaded', data: { documentId: doc.id, type: doc.type } },
    );
    return withFileUrl(this.storage, doc);
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

  /** Lets a caregiver remove a wrongly-uploaded document and re-upload, before verification locks it in. */
  async deleteDocument(user: AuthUser, documentId: string) {
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
    if (profile.verificationStatus === VerificationStatus.APPROVED) {
      throw new BadRequestException('Cannot remove a document once your profile is verified');
    }
    await this.prisma.caregiverDocument.delete({ where: { id: documentId } });
    await this.audit.log({
      actorId: user.sub,
      action: 'caregiver.document.deleted',
      entityType: 'CaregiverDocument',
      entityId: documentId,
      metadata: { type: doc.type },
    });
    return { ok: true as const };
  }

  /** Public search (FR-C3, FR-C4): only APPROVED caregivers of ACTIVE users. */
  async search(query: SearchQueryDto): Promise<SearchResult> {
    const hasPoint = query.lat !== undefined && query.lng !== undefined;
    const cacheKey = `search:caregivers:${query.specialty ?? 'all'}:${query.city ?? 'all'}:${hasPoint ? `${query.lat},${query.lng}` : 'any'}:${query.page}:${query.limit}`;
    const ttlSeconds = await this.config.getNumber('search.cacheTtlSeconds');
    if (ttlSeconds > 0) {
      const cached = await this.redis.client.get(cacheKey);
      if (cached) {
        return { result: JSON.parse(cached) as Paginated<unknown>, cache: 'HIT' };
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
    const baseSelect = {
      id: true,
      specialty: true,
      ratePerVisit: true,
      experienceYears: true,
      bio: true,
      ratingAverage: true,
      ratingCount: true,
      serviceArea: true,
      photoKey: true,
      badgeOverride: true,
      user: { select: { fullName: true } },
    } satisfies Prisma.CaregiverProfileSelect;

    let total: number;
    let items: Array<Prisma.CaregiverProfileGetPayload<{ select: typeof baseSelect }>>;
    if (hasPoint) {
      // Pilot-scale precision filter: there's no PostGIS here, so a true DB-level
      // radius query isn't available. Instead, fetch every city/specialty-matching
      // candidate (bounded at pilot-city scale), filter by sub-city coverage in
      // memory, then paginate the filtered set so the page is accurate.
      const candidates = await this.prisma.caregiverProfile.findMany({
        where,
        orderBy: { ratingAverage: 'desc' },
        select: {
          ...baseSelect,
          serviceAreas: { select: { city: true, latitude: true, longitude: true, radiusMeters: true } },
        },
      });
      const covering = candidates.filter((c) => {
        const zones = query.city ? c.serviceAreas.filter((z) => z.city === query.city) : c.serviceAreas;
        // No zones for the relevant city/at all means whole-area coverage (backward compatible).
        if (zones.length === 0) return true;
        return zones.some(
          (z) => distanceMeters(query.lat!, query.lng!, Number(z.latitude), Number(z.longitude)) <= z.radiusMeters,
        );
      });
      total = covering.length;
      items = covering
        .slice((query.page - 1) * query.limit, (query.page - 1) * query.limit + query.limit)
        .map(({ serviceAreas: _serviceAreas, ...rest }) => rest);
    } else {
      [total, items] = await this.prisma.$transaction([
        this.prisma.caregiverProfile.count({ where }),
        this.prisma.caregiverProfile.findMany({
          where,
          orderBy: { ratingAverage: 'desc' },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          select: baseSelect,
        }),
      ]);
    }
    const withPhotos = await Promise.all(
      items.map(async ({ photoKey, ...rest }) => {
        const completedVisits = await this.completedVisitsCount(rest.id);
        return {
          ...rest,
          photoUrl: await this.photoUrlFor(photoKey),
          badge: resolveCaregiverBadge(rest.badgeOverride, {
            experienceYears: rest.experienceYears,
            ratingAverage: rest.ratingAverage,
            ratingCount: rest.ratingCount,
            completedVisits,
          }),
        };
      }),
    );
    const result = paginate(withPhotos, query.page, query.limit, total);
    if (ttlSeconds > 0) {
      await this.redis.client.set(cacheKey, JSON.stringify(result), 'EX', ttlSeconds);
    }
    return { result, cache: 'MISS' };
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
        // Customers never see the raw license number (privacy); the council
        // (licenseBody) plus the APPROVED-only filter above is enough to show
        // "License verified by CareSaath". The number stays on admin/verification endpoints.
        licenseBody: true,
        experienceYears: true,
        bio: true,
        photoKey: true,
        ratePerVisit: true,
        serviceArea: true,
        ratingAverage: true,
        ratingCount: true,
        badgeOverride: true,
        createdAt: true,
        user: { select: { fullName: true } },
        availabilityRules: {
          orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
          select: { dayOfWeek: true, startTime: true, endTime: true },
        },
        // Upcoming blackout dates, so the booking screen can warn before the
        // customer picks a date the caregiver already marked unavailable.
        availabilityBlocks: {
          where: { endDate: { gte: todayInPakistan() } },
          orderBy: { startDate: 'asc' },
          select: { startDate: true, endDate: true, reason: true },
        },
        // Sub-city coverage; no rows for a city means the caregiver covers it in full.
        serviceAreas: {
          orderBy: { city: 'asc' },
          select: { city: true, label: true, latitude: true, longitude: true, radiusMeters: true },
        },
      },
    });
    if (!profile) {
      throw new NotFoundException('Caregiver not found');
    }
    const { photoKey, ...rest } = profile;
    const completedVisits = await this.completedVisitsCount(profile.id);
    return {
      ...rest,
      photoUrl: await this.photoUrlFor(photoKey),
      badge: resolveCaregiverBadge(profile.badgeOverride, {
        experienceYears: profile.experienceYears,
        ratingAverage: profile.ratingAverage,
        ratingCount: profile.ratingCount,
        completedVisits,
      }),
    };
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
    this.storage.validateImageUpload(file.mimetype, file.buffer.length);
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

  /** Live GPS fix, used to judge proximity for immediate bookings. */
  async updateLocation(user: AuthUser, dto: UpdateLocationDto) {
    const profile = await this.prisma.caregiverProfile.findUnique({
      where: { userId: user.sub },
      select: { id: true },
    });
    if (!profile) {
      throw new NotFoundException('Caregiver profile not found');
    }
    await this.prisma.caregiverProfile.update({
      where: { id: profile.id },
      data: { currentLat: dto.lat, currentLng: dto.lng, locationUpdatedAt: new Date() },
    });
    return { ok: true as const };
  }

  /** Hard off: clears the last-known GPS fix so location sharing is fully stopped server-side, not just paused on the client. */
  async stopSharingLocation(user: AuthUser) {
    const profile = await this.prisma.caregiverProfile.findUnique({
      where: { userId: user.sub },
      select: { id: true },
    });
    if (!profile) {
      throw new NotFoundException('Caregiver profile not found');
    }
    await this.prisma.caregiverProfile.update({
      where: { id: profile.id },
      // No location means no ASAP requests either: switch "available now" off too.
      data: { currentLat: null, currentLng: null, locationUpdatedAt: null, acceptingImmediate: false },
    });
    return { ok: true as const };
  }

  /**
   * "Available now" = opted in (acceptingImmediate) AND a live fix no older
   * than caregiver.availableNowMaxFixAgeMinutes AND not mid-visit AND not on a
   * blacked-out date. The location heartbeat (PATCH /caregiver/location) is
   * what keeps it alive; when the app stops sending fixes it lapses on its own.
   */
  async isAvailableNow(
    profile: { id: string; acceptingImmediate: boolean; locationUpdatedAt: Date | null; verificationStatus: VerificationStatus },
    now = new Date(),
  ): Promise<boolean> {
    if (!profile.acceptingImmediate || profile.verificationStatus !== VerificationStatus.APPROVED) {
      return false;
    }
    const maxAgeMinutes = await this.config.getNumber('caregiver.availableNowMaxFixAgeMinutes');
    if (!profile.locationUpdatedAt || now.getTime() - profile.locationUpdatedAt.getTime() > maxAgeMinutes * 60_000) {
      return false;
    }
    const today = todayInPakistan(now);
    const [onVisit, blocked] = await Promise.all([
      this.prisma.visit.count({ where: { status: { in: ON_VISIT_STATUSES }, booking: { caregiverId: profile.id } } }),
      this.prisma.availabilityBlock.count({
        where: { caregiverId: profile.id, startDate: { lte: today }, endDate: { gte: today } },
      }),
    ]);
    return onVisit === 0 && blocked === 0;
  }

  /** The caregiver's "available now" toggle for immediate / emergency requests. */
  async setAvailableNow(user: AuthUser, dto: SetAvailableNowDto) {
    const profile = await this.prisma.caregiverProfile.findUnique({
      where: { userId: user.sub },
      select: { id: true, verificationStatus: true },
    });
    if (!profile) {
      throw new NotFoundException('Caregiver profile not found');
    }
    if (dto.available && profile.verificationStatus !== VerificationStatus.APPROVED) {
      throw new BadRequestException('Only verified (APPROVED) caregivers can take immediate requests');
    }
    const updated = await this.prisma.caregiverProfile.update({
      where: { id: profile.id },
      data: { acceptingImmediate: dto.available },
      select: { id: true, acceptingImmediate: true, locationUpdatedAt: true, verificationStatus: true },
    });
    await this.audit.log({
      actorId: user.sub,
      action: dto.available ? 'caregiver.available_now.on' : 'caregiver.available_now.off',
      entityType: 'CaregiverProfile',
      entityId: profile.id,
    });
    return {
      acceptingImmediate: updated.acceptingImmediate,
      availableNow: await this.isAvailableNow(updated),
      locationUpdatedAt: updated.locationUpdatedAt,
    };
  }

  /**
   * Nearby-now (emergency) discovery: APPROVED caregivers of ACTIVE users who
   * are available now (see isAvailableNow) with a live fix within
   * booking.immediateMaxDistanceMeters of the customer's point, nearest first,
   * each with distanceMeters and a rough etaMinutes. Live data, never cached.
   * Same distance rule as the immediate-booking check, so a listed caregiver
   * can actually be booked ASAP.
   */
  async searchNearbyNow(query: SearchQueryDto): Promise<Paginated<unknown>> {
    if (query.lat === undefined || query.lng === undefined) {
      throw new BadRequestException('immediate=true requires lat and lng');
    }
    const lat = query.lat;
    const lng = query.lng;
    const now = new Date();
    const [maxDistanceMeters, maxAgeMinutes, speedKmh] = await Promise.all([
      this.config.getNumber('booking.immediateMaxDistanceMeters'),
      this.config.getNumber('caregiver.availableNowMaxFixAgeMinutes'),
      this.config.getNumber('booking.immediateAvgSpeedKmh'),
    ]);
    const today = todayInPakistan(now);
    // Cheap bounding box first so the DB narrows the candidates; the exact
    // great-circle distance is applied in memory below.
    const latDelta = maxDistanceMeters / 111_320;
    const lngDelta = maxDistanceMeters / (111_320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
    const candidates = await this.prisma.caregiverProfile.findMany({
      where: {
        verificationStatus: VerificationStatus.APPROVED,
        user: { status: 'ACTIVE' },
        acceptingImmediate: true,
        locationUpdatedAt: { gte: new Date(now.getTime() - maxAgeMinutes * 60_000) },
        currentLat: { gte: lat - latDelta, lte: lat + latDelta },
        currentLng: { gte: lng - lngDelta, lte: lng + lngDelta },
        ...(query.specialty ? { specialty: query.specialty } : {}),
        ...(query.city ? { serviceArea: { path: ['cities'], array_contains: [query.city] } } : {}),
        bookings: { none: { visits: { some: { status: { in: ON_VISIT_STATUSES } } } } },
        availabilityBlocks: { none: { startDate: { lte: today }, endDate: { gte: today } } },
      },
      select: {
        id: true,
        specialty: true,
        ratePerVisit: true,
        experienceYears: true,
        bio: true,
        ratingAverage: true,
        ratingCount: true,
        serviceArea: true,
        photoKey: true,
        badgeOverride: true,
        currentLat: true,
        currentLng: true,
        locationUpdatedAt: true,
        user: { select: { fullName: true } },
        serviceAreas: { select: { latitude: true, longitude: true, radiusMeters: true } },
      },
    });
    const metersPerMinute = (Math.max(speedKmh, 1) * 1000) / 60;
    const nearby = candidates
      .map(({ currentLat, currentLng, ...rest }) => {
        const meters = Math.round(distanceMeters(lat, lng, Number(currentLat), Number(currentLng)));
        return { ...rest, distanceMeters: meters, etaMinutes: Math.max(1, Math.ceil(meters / metersPerMinute)) };
      })
      // Within range AND the point falls in one of the caregiver's sub-city zones (no zones =
      // whole service city) — mirrors the booking's coverage check so a listed caregiver is bookable.
      .filter(
        (c) =>
          c.distanceMeters <= maxDistanceMeters &&
          (!c.serviceAreas?.length ||
            c.serviceAreas.some((z) => distanceMeters(lat, lng, Number(z.latitude), Number(z.longitude)) <= z.radiusMeters)),
      )
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
    const page = nearby.slice((query.page - 1) * query.limit, query.page * query.limit);
    const items = await Promise.all(
      page.map(async ({ photoKey, serviceAreas: _serviceAreas, ...rest }) => ({
        ...rest,
        availableNow: true,
        photoUrl: await this.photoUrlFor(photoKey),
        badge: resolveCaregiverBadge(rest.badgeOverride, {
          experienceYears: rest.experienceYears,
          ratingAverage: rest.ratingAverage,
          ratingCount: rest.ratingCount,
          completedVisits: await this.completedVisitsCount(rest.id),
        }),
      })),
    );
    return paginate(items, query.page, query.limit, nearby.length);
  }

  /**
   * Record a decline / late-arrival / no-show strike. Crossing
   * caregiver.strikeThreshold auto-suspends the caregiver (reuses
   * VerificationStatus.SUSPENDED) and alerts both the caregiver and admins.
   */
  async recordStrike(
    caregiverId: string,
    reason: StrikeReason,
    bookingId?: string,
    options: { note?: string; actorId?: string } = {},
  ): Promise<void> {
    await this.prisma.caregiverStrike.create({
      data: { caregiverId, bookingId: bookingId ?? null, reason, note: options.note ?? null },
    });
    const profile = await this.prisma.caregiverProfile.update({
      where: { id: caregiverId },
      data: { strikeCount: { increment: 1 } },
    });
    await this.audit.log({
      actorId: options.actorId ?? null,
      action: 'caregiver.strike.recorded',
      entityType: 'CaregiverProfile',
      entityId: caregiverId,
      metadata: {
        reason,
        bookingId: bookingId ?? null,
        strikeCount: profile.strikeCount,
        manual: Boolean(options.actorId),
        note: options.note ?? null,
      },
    });
    await this.notifications?.notify({
      userId: profile.userId,
      event: 'caregiver.strike.recorded',
      payload: { reason, strikeCount: profile.strikeCount },
      message: `A strike (${reason.replace(/_/g, ' ').toLowerCase()}) was recorded on your account.`,
    });

    const threshold = await this.config.getNumber('caregiver.strikeThreshold');
    if (profile.strikeCount < threshold || profile.verificationStatus === VerificationStatus.SUSPENDED) {
      return;
    }
    await this.prisma.caregiverProfile.update({
      where: { id: caregiverId },
      data: { verificationStatus: VerificationStatus.SUSPENDED },
    });
    await this.audit.log({
      actorId: null,
      action: 'caregiver.auto_suspended',
      entityType: 'CaregiverProfile',
      entityId: caregiverId,
      metadata: { strikeCount: profile.strikeCount, threshold },
    });
    await this.notifications?.notify({
      userId: profile.userId,
      event: 'caregiver.suspended',
      payload: { strikeCount: profile.strikeCount },
      message: `Your account was suspended after reaching ${profile.strikeCount} strikes.`,
    });
    await this.notifications?.notifyAdmins({
      event: 'caregiver.suspended.admin',
      payload: { caregiverId, strikeCount: profile.strikeCount },
      message: `A caregiver was auto-suspended after ${profile.strikeCount} strikes.`,
    });
    this.realtime?.entityUpdated(
      { users: [profile.userId], roles: ['ADMIN'] },
      { type: 'caregiver', id: caregiverId, action: 'suspended', status: VerificationStatus.SUSPENDED },
    );
  }

  /** The caregiver's own strike history (reason/date), so they understand why they were struck/suspended. */
  async listOwnStrikes(user: AuthUser) {
    const profile = await this.prisma.caregiverProfile.findUnique({
      where: { userId: user.sub },
      select: { id: true },
    });
    if (!profile) {
      throw new NotFoundException('Caregiver profile not found');
    }
    return this.prisma.caregiverStrike.findMany({
      where: { caregiverId: profile.id },
      orderBy: { createdAt: 'desc' },
    });
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
      'Registers caregiver profile with license, specialty, CNIC, and service cities. Initial status is PENDING admin verification. The account role changes from CUSTOMER to CAREGIVER (one role per account), so the response also carries a fresh accessToken/refreshToken pair for the new role. Returns 409 if a profile already exists.',
  })
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterCaregiverDto) {
    return this.caregivers.register(user, dto);
  }

  @Patch('location')
  @ApiOperation({
    summary: 'Update live location',
    description: 'Updates the caregiver\'s current GPS fix; used to judge proximity for immediate (ASAP) bookings.',
  })
  updateLocation(@CurrentUser() user: AuthUser, @Body() dto: UpdateLocationDto) {
    return this.caregivers.updateLocation(user, dto);
  }

  @Delete('location')
  @ApiOperation({
    summary: 'Stop sharing live location',
    description: "Clears the caregiver's last known GPS fix so location sharing is turned off entirely, not just paused on the client.",
  })
  stopSharingLocation(@CurrentUser() user: AuthUser) {
    return this.caregivers.stopSharingLocation(user);
  }

  @Put('available-now')
  @ApiOperation({
    summary: 'Toggle "available now" for immediate requests',
    description:
      'Opts in/out of immediate (ASAP / emergency) requests. While on, the caregiver shows in the nearby-now search only as long as the app keeps sending live fixes (PATCH /caregiver/location) no older than caregiver.availableNowMaxFixAgeMinutes, they are not mid-visit, and today is not blacked out. Returns { acceptingImmediate, availableNow, locationUpdatedAt }.',
  })
  setAvailableNow(@CurrentUser() user: AuthUser, @Body() dto: SetAvailableNowDto) {
    return this.caregivers.setAvailableNow(user, dto);
  }

  @Get('service-areas')
  @ApiOperation({
    summary: 'List my sub-city coverage zones',
    description: 'Named radius-around-a-point zones within a city. No zones for a city means whole-city coverage.',
  })
  listServiceAreas(@CurrentUser() user: AuthUser) {
    return this.caregivers.listServiceAreas(user);
  }

  @Put('service-areas')
  @ApiOperation({
    summary: 'Set my sub-city coverage zones',
    description: 'Full replace of coverage zones. An empty list reverts to whole-city coverage.',
  })
  setServiceAreas(@CurrentUser() user: AuthUser, @Body() dto: SetServiceAreasDto) {
    return this.caregivers.setServiceAreas(user, dto);
  }

  @Post('service-areas')
  @ApiOperation({
    summary: 'Add a sub-city coverage zone',
    description: 'Adds one zone without replacing the existing ones.',
  })
  addServiceArea(@CurrentUser() user: AuthUser, @Body() dto: ServiceAreaDto) {
    return this.caregivers.addServiceArea(user, dto);
  }

  @Delete('service-areas/:id')
  @ApiOperation({
    summary: 'Remove a sub-city coverage zone',
  })
  removeServiceArea(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.caregivers.removeServiceArea(user, id);
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

  @Delete('documents/:id')
  @ApiOperation({
    summary: 'Delete a credential document',
    description: 'Removes a wrongly-uploaded document so it can be replaced. Only available before your profile is verified (APPROVED).',
  })
  deleteDocument(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.caregivers.deleteDocument(user, id);
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

  @Get('strikes')
  @ApiOperation({
    summary: 'View my strike history',
    description: 'Lists declines, late arrivals and no-shows recorded on the caregiver\'s own account, most recent first.',
  })
  listStrikes(@CurrentUser() user: AuthUser) {
    return this.caregivers.listOwnStrikes(user);
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
      'Public search for verified, approved caregivers filtered by specialty and city. Cached in Redis for low-latency under 3G networks. The X-Cache header reports whether the page came from Redis (HIT) or PostgreSQL (MISS). With ?immediate=true&lat=&lng= it becomes the nearby-now (emergency) search: only caregivers available right now within booking.immediateMaxDistanceMeters, each with distanceMeters + etaMinutes, nearest first (X-Cache: BYPASS).',
  })
  async search(@Query() query: SearchQueryDto, @Res({ passthrough: true }) res: Response) {
    const { result, cache } = await this.caregivers.search(query);
    res.setHeader('x-cache', cache);
    return result;
  }

  // Live-location (available-now) data is NOT exposed anonymously: unlike the public city
  // search above, nearby-now requires a signed-in user. Method-level override of the
  // controller's @Public() so the global JwtAuthGuard enforces a valid token here.
  @Get('nearby')
  @SetMetadata(IS_PUBLIC_KEY, false)
  @ApiOperation({
    summary: 'Nearby-now (emergency) search — authenticated',
    description:
      'Caregivers available right now within booking.immediateMaxDistanceMeters of lat/lng (both required), each with distanceMeters + etaMinutes, nearest first. Requires a signed-in user. Never cached.',
  })
  async nearby(@Query() query: SearchQueryDto, @Res({ passthrough: true }) res: Response) {
    res.setHeader('x-cache', 'BYPASS');
    return this.caregivers.searchNearbyNow({ ...query, immediate: true });
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
  imports: [PlatformConfigModule, AuthModule, NotificationsModule],
  controllers: [CaregiverController, PublicCaregiverController],
  providers: [CaregiversService],
  exports: [CaregiversService],
})
export class CaregiversModule {}
