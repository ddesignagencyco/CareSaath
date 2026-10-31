import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Optional,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  CaregiverBadge,
  CredentialDecision,
  CredentialReviewKind,
  Prisma,
  StrikeReason,
  UserStatus,
  VerificationStatus,
} from '../generated/prisma/client.js';
import { AuditService } from '../common/audit/audit.module.js';
import { decryptMaybe, deriveKey } from '../common/crypto/field-encryption.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { RedisService } from '../common/redis/redis.module.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { StorageService, withFileUrl } from '../common/storage/storage.module.js';
import { NotificationsModule, NotificationsService } from '../notifications/notifications.module.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { paginate } from '../common/dto/pagination.js';
import { computeCaregiverBadge } from '../caregivers/badge.js';
import { CaregiversModule, CaregiversService } from '../caregivers/caregivers.module.js';

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

export class SetBadgeDto {
  @ApiProperty({
    enum: CaregiverBadge,
    nullable: true,
    example: CaregiverBadge.GOLD,
    description: 'Tier to pin the caregiver to; null clears the override (back to the auto-computed tier).',
  })
  @ValidateIf((_, value) => value !== null)
  @IsEnum(CaregiverBadge)
  badge!: CaregiverBadge | null;
}

export class ManageStrikesDto {
  @ApiProperty({ enum: ['add', 'reset'], description: 'add: record one manual strike; reset: clear every strike (count back to 0).' })
  @IsIn(['add', 'reset'])
  op!: 'add' | 'reset';

  @ApiPropertyOptional({ enum: StrikeReason, description: 'Required for op=add.' })
  @ValidateIf((dto: ManageStrikesDto) => dto.op === 'add')
  @IsEnum(StrikeReason)
  reason?: StrikeReason;

  @ApiPropertyOptional({ example: 'Customer reported repeated lateness by phone.', description: 'Optional note for op=add.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
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

  @ApiPropertyOptional({ example: 'Fatima', description: 'Search by name, phone, or license number' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

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
    private readonly caregivers: CaregiversService,
    @Optional() private readonly realtime?: RealtimeService,
  ) {}

  /** Load the presented caregiver and tell that caregiver and the admins their status changed. */
  private async finish(id: string, action: string) {
    const profile = await this.loadPresented(id);
    this.realtime?.entityUpdated(
      { users: [profile.userId], roles: ['ADMIN'] },
      {
        type: 'caregiver',
        id,
        action,
        status: profile.verificationStatus,
        data: { userStatus: profile.user.status },
      },
    );
    return profile;
  }

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
    const where: Prisma.CaregiverProfileWhereInput = {
      ...(query.status ? { verificationStatus: query.status } : {}),
      ...(query.reverifyDueBefore
        ? { reverifyDueAt: { lte: new Date(query.reverifyDueBefore) } }
        : {}),
      ...(query.q
        ? {
            OR: [
              { user: { fullName: { contains: query.q, mode: 'insensitive' } } },
              { user: { phone: { contains: query.q } } },
              { licenseNumber: { contains: query.q, mode: 'insensitive' } },
            ],
          }
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
    const presented = await Promise.all(
      items.map(async (item) => this.withBadge(await this.withDocumentUrls(presentCnic(item)))),
    );
    return paginate(presented, query.page, query.limit, total);
  }

  /** Give every credential document a viewable `url` (see GET .../documents/:id/url for a fresh one). */
  private async withDocumentUrls<T extends { documents: Array<{ fileKey: string }> }>(profile: T) {
    const documents = await Promise.all(profile.documents.map((doc) => withFileUrl(this.storage, doc)));
    return { ...profile, documents };
  }

  /**
   * The badge is otherwise computed only on the caregiver's own GET
   * /caregiver/profile; the admin list/detail returned raw columns, so the
   * drawer couldn't show the tier. Same ranking logic, computed here too.
   * `badge` is what everyone sees (override wins), `computedBadge` the
   * automatic tier, `badgeOverride` the admin pin (null = auto).
   */
  private async withBadge<
    T extends {
      id: string;
      badgeOverride: CaregiverBadge | null;
      experienceYears: number | null;
      ratingAverage: number | string | { toString(): string };
      ratingCount: number;
    },
  >(profile: T) {
    const completedVisits = await this.prisma.visit.count({
      where: { status: 'COMPLETED', booking: { caregiverId: profile.id } },
    });
    const computedBadge = computeCaregiverBadge({
      experienceYears: profile.experienceYears,
      ratingAverage: profile.ratingAverage,
      ratingCount: profile.ratingCount,
      completedVisits,
    });
    return { ...profile, badge: profile.badgeOverride ?? computedBadge, computedBadge };
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
    return this.withBadge(await this.withDocumentUrls(presentCnic(profile)));
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
    return this.finish(id, 'approved');
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
    return this.finish(id, 'rejected');
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
    return this.finish(profile.id, 'reverify_requested');
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
    return this.finish(id, 'suspended');
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
    return this.finish(id, 'deactivated');
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
        // approvedAt / reverifyDueAt are deliberately left untouched, but the
        // strike count resets — otherwise the next strike re-suspends immediately.
        await tx.caregiverProfile.update({
          where: { id },
          data: { verificationStatus: VerificationStatus.APPROVED, strikeCount: 0 },
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
    return this.finish(id, 'reactivated');
  }

  /** Caregiver strike history (reason/date), most recent first. */
  async listStrikes(id: string) {
    await this.load(id);
    return this.prisma.caregiverStrike.findMany({
      where: { caregiverId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Pin (or with null, un-pin) the caregiver's tier badge. */
  async setBadge(admin: AuthUser, id: string, dto: SetBadgeDto) {
    const profile = await this.load(id);
    await this.prisma.caregiverProfile.update({
      where: { id },
      data: { badgeOverride: dto.badge },
    });
    await this.audit.log({
      actorId: admin.sub,
      action: dto.badge ? 'caregiver.badge.overridden' : 'caregiver.badge.override_cleared',
      entityType: 'CaregiverProfile',
      entityId: id,
      metadata: { from: profile.badgeOverride, to: dto.badge },
    });
    await this.invalidateSearchCache();
    return this.finish(id, 'badge_set');
  }

  /**
   * Manual strike management. `add` goes through the same path as automatic
   * strikes (so crossing caregiver.strikeThreshold still auto-suspends);
   * `reset` deletes the strike rows and zeroes strikeCount. A reset does not
   * lift a suspension by itself; use reactivate for that.
   */
  async manageStrikes(admin: AuthUser, id: string, dto: ManageStrikesDto) {
    const profile = await this.load(id);
    if (dto.op === 'add') {
      await this.caregivers.recordStrike(id, dto.reason!, undefined, { note: dto.note, actorId: admin.sub });
    } else {
      const cleared = await this.prisma.$transaction(async (tx) => {
        const removed = await tx.caregiverStrike.deleteMany({ where: { caregiverId: id } });
        await tx.caregiverProfile.update({ where: { id }, data: { strikeCount: 0 } });
        return removed.count;
      });
      await this.audit.log({
        actorId: admin.sub,
        action: 'caregiver.strikes.reset',
        entityType: 'CaregiverProfile',
        entityId: id,
        metadata: { previousStrikeCount: profile.strikeCount, strikesCleared: cleared },
      });
    }
    return this.finish(id, dto.op === 'add' ? 'strike_added' : 'strikes_reset');
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
    description: 'Admin queue of caregiver registrations filtered by status (PENDING, APPROVED, REJECTED, SUSPENDED). Search by name, phone, or license number with ?q=.',
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

  @Get(':id/strikes')
  @ApiOperation({
    summary: 'View caregiver strike history',
    description: 'Lists declines, late arrivals and no-shows recorded against this caregiver, most recent first.',
  })
  listStrikes(@Param('id', ParseUUIDPipe) id: string) {
    return this.verification.listStrikes(id);
  }

  @Post(':id/badge')
  @ApiOperation({
    summary: 'Override caregiver tier badge',
    description: 'Pins the caregiver to a tier (BRONZE/SILVER/GOLD/PLATINUM); { badge: null } clears the override so the auto-computed tier applies again. The record carries badge (effective), badgeOverride and computedBadge.',
  })
  setBadge(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetBadgeDto,
  ) {
    return this.verification.setBadge(admin, id, dto);
  }

  @Post(':id/strikes')
  @ApiOperation({
    summary: 'Add a manual strike or reset strikes',
    description: "{ op: 'add', reason, note? } records one strike (auto-suspends at caregiver.strikeThreshold, like automatic strikes); { op: 'reset' } clears every strike and sets strikeCount to 0 (a suspension is not lifted; use reactivate). Returns the updated caregiver record.",
  })
  manageStrikes(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ManageStrikesDto,
  ) {
    return this.verification.manageStrikes(admin, id, dto);
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
  imports: [NotificationsModule, CaregiversModule],
  controllers: [VerificationController],
  providers: [VerificationService],
})
export class VerificationModule {}
