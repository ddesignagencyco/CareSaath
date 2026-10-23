import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  CredentialDecision,
  CredentialReviewKind,
  UserStatus,
  VerificationStatus,
} from '../generated/prisma/client.js';
import { AuditService } from '../common/audit/audit.module.js';
import { decryptMaybe, deriveKey } from '../common/crypto/field-encryption.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { RedisService } from '../common/redis/redis.module.js';
import { StorageService } from '../common/storage/storage.module.js';
import { NotificationsModule, NotificationsService } from '../notifications/notifications.module.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { paginate } from '../common/dto/pagination.js';

/** Must match the key used by CaregiversModule to encrypt CNIC. */
const CNIC_KEY = deriveKey('CNIC_ENCRYPTION_KEY', 'caresaath-dev-cnic-key');

/** Admins need the CNIC for PNC/PMDC cross-check; decrypt it for display. */
function presentCnic<T extends { cnic: string }>(profile: T): Omit<T, 'cnic'> & { cnic: string | null } {
  return { ...profile, cnic: decryptMaybe(profile.cnic, CNIC_KEY) };
}

export class DecisionDto {
  @ApiPropertyOptional({ example: 'PNC registry record validated and active.', description: 'Admin verification notes' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class ReverifyDto {
  @ApiPropertyOptional({ example: '365', description: 'Days until next credential re-verification (default 365)' })
  @IsOptional()
  @IsString()
  reverifyInDays?: string;
}

export class ListCaregiversQueryDto {
  @ApiPropertyOptional({ enum: VerificationStatus })
  @IsOptional()
  @IsEnum(VerificationStatus)
  status?: VerificationStatus;

  @ApiPropertyOptional({
    example: '2027-01-31',
    description: 'Only caregivers whose re-verification is due on or before this date; results are sorted by due date',
  })
  @IsOptional()
  @IsDateString()
  reverifyDueBefore?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly redis: RedisService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Public search results are cached in Redis; any visibility change must drop them. */
  private async invalidateSearchCache(): Promise<void> {
    try {
      await this.redis.deleteByPattern('search:caregivers:*');
    } catch {
      // The cache is short-lived; never fail the admin action over it.
    }
  }

  private async notifyCaregiver(profileId: string, event: string, message: string) {
    const profile = await this.prisma.caregiverProfile.findUnique({
      where: { id: profileId },
      select: { user: { select: { id: true, phone: true } } },
    });
    if (!profile) return;
    await this.notifications.notify({
      userId: profile.user.id,
      phone: profile.user.phone,
      event,
      payload: { caregiverId: profileId },
      message,
    });
  }

  async list(query: ListCaregiversQueryDto) {
    const where = {
      ...(query.status ? { verificationStatus: query.status } : {}),
      ...(query.reverifyDueBefore
        ? { reverifyDueAt: { lte: new Date(query.reverifyDueBefore) } }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.caregiverProfile.count({ where }),
      this.prisma.caregiverProfile.findMany({
        where,
        orderBy: query.reverifyDueBefore ? { reverifyDueAt: 'asc' } : { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          user: { select: { id: true, phone: true, fullName: true, status: true } },
          documents: true,
        },
      }),
    ]);
    return paginate(items.map(presentCnic), query.page, query.limit, total);
  }

  private async load(id: string) {
    const profile = await this.prisma.caregiverProfile.findUnique({
      where: { id },
      include: { documents: true },
    });
    if (!profile) {
      throw new NotFoundException('Caregiver not found');
    }
    return profile;
  }

  /** Same shape as the list endpoint: user included, CNIC decrypted. */
  private async loadPresented(id: string) {
    const profile = await this.prisma.caregiverProfile.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, phone: true, fullName: true, status: true } },
        documents: true,
      },
    });
    if (!profile) {
      throw new NotFoundException('Caregiver not found');
    }
    return presentCnic(profile);
  }

  /** FR-A1: approve after manual PNC/PMDC cross-check (SRS §7.5). */
  async approve(admin: AuthUser, id: string, dto: DecisionDto) {
    const profile = await this.load(id);
    if (profile.verificationStatus === VerificationStatus.APPROVED) {
      throw new BadRequestException('Already approved');
    }
    if (profile.documents.length === 0) {
      throw new BadRequestException('No documents uploaded to review');
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.caregiverProfile.update({
        where: { id },
        data: {
          verificationStatus: VerificationStatus.APPROVED,
          approvedAt: now,
          reverifyDueAt: new Date(now.getTime() + 365 * 24 * 3600 * 1000),
        },
      });
      await tx.credentialReview.create({
        data: {
          caregiverId: id,
          reviewerId: admin.sub,
          kind: CredentialReviewKind.INITIAL,
          decision: CredentialDecision.APPROVED,
          reason: dto.reason ?? null,
          decidedAt: now,
        },
      });
    });
    await this.audit.log({
      actorId: admin.sub,
      action: 'credential.approved',
      entityType: 'CaregiverProfile',
      entityId: id,
    });
    await this.invalidateSearchCache();
    await this.notifyCaregiver(id, 'caregiver.verification.approved', 'Your CareSaath profile has been verified. You are now visible to families.');
    return this.loadPresented(id);
  }

  async reject(admin: AuthUser, id: string, dto: DecisionDto) {
    const profile = await this.load(id);
    if (profile.verificationStatus === VerificationStatus.APPROVED) {
      throw new BadRequestException('Use suspend for an approved caregiver');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.caregiverProfile.update({
        where: { id },
        data: { verificationStatus: VerificationStatus.REJECTED },
      });
      await tx.credentialReview.create({
        data: {
          caregiverId: id,
          reviewerId: admin.sub,
          kind: CredentialReviewKind.INITIAL,
          decision: CredentialDecision.REJECTED,
          reason: dto.reason ?? 'Documents failed verification',
          decidedAt: new Date(),
        },
      });
    });
    await this.audit.log({
      actorId: admin.sub,
      action: 'credential.rejected',
      entityType: 'CaregiverProfile',
      entityId: id,
      metadata: { reason: dto.reason ?? null },
    });
    await this.invalidateSearchCache();
    await this.notifyCaregiver(id, 'caregiver.verification.rejected', `Your CareSaath verification was not approved${dto.reason ? `: ${dto.reason}` : '.'}`);
    return this.loadPresented(id);
  }

  /** FR-A2: periodic re-verification. */
  async reverify(admin: AuthUser, id: string, dto: ReverifyDto) {
    const profile = await this.load(id);
    const days = Number(dto.reverifyInDays ?? 365);
    await this.prisma.$transaction(async (tx) => {
      await tx.caregiverProfile.update({
        where: { id },
        data: {
          reverifyDueAt: new Date(Date.now() + days * 24 * 3600 * 1000),
          verificationStatus: VerificationStatus.PENDING,
          approvedAt: null,
        },
      });
      await tx.credentialReview.create({
        data: {
          caregiverId: id,
          reviewerId: admin.sub,
          kind: CredentialReviewKind.PERIODIC,
          decision: CredentialDecision.REJECTED,
          reason: 'Re-verification requested',
          decidedAt: new Date(),
        },
      });
    });
    await this.audit.log({
      actorId: admin.sub,
      action: 'credential.reverify.requested',
      entityType: 'CaregiverProfile',
      entityId: id,
      metadata: { reverifyInDays: days },
    });
    await this.invalidateSearchCache();
    return this.loadPresented(profile.id);
  }

  /** FR-A3: suspend (temporary) — profile disappears from search. */
  async suspend(admin: AuthUser, id: string, dto: DecisionDto) {
    await this.load(id);
    await this.prisma.caregiverProfile.update({
      where: { id },
      data: { verificationStatus: VerificationStatus.SUSPENDED },
    });
    await this.audit.log({
      actorId: admin.sub,
      action: 'caregiver.suspended',
      entityType: 'CaregiverProfile',
      entityId: id,
      metadata: { reason: dto.reason ?? null },
    });
    await this.invalidateSearchCache();
    return this.loadPresented(id);
  }

  /** FR-A3: deactivate — user-level block. */
  async deactivate(admin: AuthUser, id: string, dto: DecisionDto) {
    const profile = await this.load(id);
    await this.prisma.user.update({
      where: { id: profile.userId },
      data: { status: UserStatus.DEACTIVATED },
    });
    await this.audit.log({
      actorId: admin.sub,
      action: 'caregiver.deactivated',
      entityType: 'User',
      entityId: profile.userId,
      metadata: { reason: dto.reason ?? null },
    });
    await this.invalidateSearchCache();
    return this.loadPresented(id);
  }

  async reactivate(admin: AuthUser, id: string) {
    const profile = await this.load(id);
    const liftSuspension = profile.verificationStatus === VerificationStatus.SUSPENDED;
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: profile.userId },
        data: { status: UserStatus.ACTIVE },
      });
      if (liftSuspension) {
        // approvedAt / reverifyDueAt are deliberately left untouched.
        await tx.caregiverProfile.update({
          where: { id },
          data: { verificationStatus: VerificationStatus.APPROVED },
        });
      }
    });
    await this.audit.log({
      actorId: admin.sub,
      action: 'caregiver.reactivated',
      entityType: 'User',
      entityId: profile.userId,
      metadata: { suspensionLifted: liftSuspension },
    });
    await this.invalidateSearchCache();
    return this.loadPresented(id);
  }

  async documentUrl(id: string, documentId: string) {
    const profile = await this.load(id);
    const doc = profile.documents.find((d) => d.id === documentId);
    if (!doc) {
      throw new NotFoundException('Document not found');
    }
    return { url: await this.storage.presignedGet(doc.fileKey), mimeType: doc.mimeType };
  }
}

@ApiTags('Admin - Caregivers')
@ApiBearerAuth()
@Controller('admin/caregivers')
@Roles('ADMIN')
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Get()
  @ApiOperation({
    summary: 'List caregivers verification queue',
    description: 'Admin queue of caregiver registrations filtered by status (PENDING, APPROVED, REJECTED, SUSPENDED).',
  })
  list(@Query() query: ListCaregiversQueryDto) {
    return this.verification.list(query);
  }

  @Post(':id/approve')
  @ApiOperation({
    summary: 'Approve caregiver credentials',
    description: 'Approves caregiver profile after license verification; makes caregiver discoverable in search.',
  })
  approve(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecisionDto,
  ) {
    return this.verification.approve(admin, id, dto);
  }

  @Post(':id/reject')
  @ApiOperation({
    summary: 'Reject caregiver registration',
    description: 'Rejects caregiver credentials with an audit note.',
  })
  reject(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecisionDto,
  ) {
    return this.verification.reject(admin, id, dto);
  }

  @Post(':id/reverify')
  @ApiOperation({
    summary: 'Record periodic re-verification',
    description: 'Records annual credential reverification and sets the next reverification date.',
  })
  reverify(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverifyDto,
  ) {
    return this.verification.reverify(admin, id, dto);
  }

  @Post(':id/suspend')
  @ApiOperation({
    summary: 'Suspend caregiver',
    description: 'Suspends caregiver profile due to unresolved dispute or policy violation; hides from search.',
  })
  suspend(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecisionDto,
  ) {
    return this.verification.suspend(admin, id, dto);
  }

  @Post(':id/deactivate')
  @ApiOperation({
    summary: 'Deactivate caregiver account',
    description: 'Blocks the caregiver user account (status DEACTIVATED) and removes them from search. Use reactivate to restore.',
  })
  deactivate(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecisionDto,
  ) {
    return this.verification.deactivate(admin, id, dto);
  }

  @Post(':id/reactivate')
  @ApiOperation({
    summary: 'Reactivate suspended caregiver',
    description: 'Reactivates a deactivated account and lifts a suspension (verification status returns to APPROVED, original approval and re-verification dates are kept).',
  })
  reactivate(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.verification.reactivate(admin, id);
  }

  @Get(':id/documents/:documentId/url')
  @ApiOperation({
    summary: 'Admin view caregiver credential document',
    description: 'Generates secure presigned URL for admin to view degree, PNC license, or CNIC copy.',
  })
  documentUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.verification.documentUrl(id, documentId);
  }
}

@Module({
  imports: [NotificationsModule],
  controllers: [VerificationController],
  providers: [VerificationService],
})
export class VerificationModule {}
