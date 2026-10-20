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
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { createHash, randomInt } from 'node:crypto';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  CheckMethod,
  OtpPurpose,
  Prisma,
  UserRole,
  VisitStatus,
} from '../generated/prisma/client.js';
import { AuditService } from '../common/audit/audit.module.js';
import { decryptMaybe, deriveKey } from '../common/crypto/field-encryption.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Paginated, paginate } from '../common/dto/pagination.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { RedisService } from '../common/redis/redis.module.js';
import { NotificationsModule, NotificationsService } from '../notifications/notifications.module.js';
import { SmsService } from '../auth/sms.service.js';
import { PlatformConfigModule, ConfigService } from '../config/platform-config.module.js';

/** FR-CG7 check-in OTP verification limits. */
const CHECKIN_OTP_MAX_ATTEMPTS = 5;
const VISIT_CHECKIN_STATUSES: VisitStatus[] = [VisitStatus.CONFIRMED, VisitStatus.EN_ROUTE];

/** Must match the key used by PatientsModule to encrypt medical context. */
const MEDICAL_KEY = deriveKey('MEDICAL_ENCRYPTION_KEY', 'caresaath-dev-medical-key');

/** Decrypt the patient's medical context for the caregiver (FR-CG6). */
function presentVisit<T extends { booking: { patient: { medicalContext: string | null } } }>(
  visit: T,
): T {
  return {
    ...visit,
    booking: {
      ...visit.booking,
      patient: {
        ...visit.booking.patient,
        medicalContext: decryptMaybe(visit.booking.patient.medicalContext, MEDICAL_KEY),
      },
    },
  };
}

/**
 * Visit state machine (TRD §6.3). Transitions are enforced here only; every
 * accepted transition writes a VisitStatusHistory row and notifies the customer.
 */
const ALLOWED_TRANSITIONS: Record<VisitStatus, VisitStatus[]> = {
  REQUESTED: [VisitStatus.CONFIRMED, VisitStatus.DECLINED, VisitStatus.CANCELLED],
  CONFIRMED: [VisitStatus.EN_ROUTE, VisitStatus.CANCELLED],
  EN_ROUTE: [VisitStatus.CHECKED_IN],
  CHECKED_IN: [VisitStatus.IN_PROGRESS],
  IN_PROGRESS: [VisitStatus.CHECKED_OUT],
  CHECKED_OUT: [VisitStatus.COMPLETED],
  COMPLETED: [],
  DECLINED: [],
  CANCELLED: [],
};

export function canTransition(from: VisitStatus, to: VisitStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export class CheckInDto {
  @ApiPropertyOptional({ enum: CheckMethod, default: CheckMethod.GPS, example: CheckMethod.GPS })
  @IsOptional()
  @IsEnum(CheckMethod)
  method?: CheckMethod;

  @ApiPropertyOptional({ example: 31.516300, description: 'Latitude coordinate (required when method is GPS)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ example: 74.345200, description: 'Longitude coordinate (required when method is GPS)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;

  @ApiPropertyOptional({ example: '123456', description: '6-digit OTP code received from customer (required when method is OTP)' })
  @IsOptional()
  @ApiPropertyOptional({ example: '123456', description: '6-digit OTP code received from customer (required when method is OTP)' })
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(8)
  code?: string;
}

export class VisitNoteDto {
  @ApiProperty({
    example: 'Vitals normal (BP 120/80, pulse 72). Wound dressing replaced with sterile gauze. Patient reported no pain.',
    description: 'Clinical visit summary note',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  summary!: string;
}

export class ListVisitsQueryDto {
  @ApiPropertyOptional({ enum: VisitStatus, description: 'Filter by visit lifecycle status' })
  @IsOptional()
  @IsEnum(VisitStatus)
  status?: VisitStatus;

  @ApiPropertyOptional({ example: '2026-10-25', description: 'Filter by scheduled date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

@Injectable()
export class VisitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly redis: RedisService,
    private readonly sms: SmsService,
    private readonly config: ConfigService,
  ) {}

  private async checkinTtlSeconds(): Promise<number> {
    return this.config.getNumber('otp.checkinTtlSeconds');
  }

  private hashOtp(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  private checkInOtpKey(visitId: string): string {
    return `otp:${OtpPurpose.VISIT_CHECKIN}:${visitId}`;
  }

  private async caregiverProfileId(user: AuthUser): Promise<string> {
    const profile = await this.prisma.caregiverProfile.findUnique({
      where: { userId: user.sub },
      select: { id: true },
    });
    if (!profile) {
      throw new NotFoundException('Caregiver profile not found');
    }
    return profile.id;
  }

  private visitInclude() {
    return {
      booking: {
        include: {
          patient: true,
          address: true,
          prescriptions: true,
          customer: { select: { id: true, phone: true, fullName: true } },
        },
      },
      statusHistory: { orderBy: { at: 'asc' as const } },
      note: true,
      review: true,
    } satisfies Prisma.VisitInclude;
  }

  private async loadForCaregiver(user: AuthUser, id: string) {
    const caregiverId = await this.caregiverProfileId(user);
    const visit = await this.prisma.visit.findFirst({
      where: { id, booking: { caregiverId } },
      include: this.visitInclude(),
    });
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }
    return presentVisit(visit);
  }

  private async loadForCustomer(user: AuthUser, id: string) {
    const visit = await this.prisma.visit.findFirst({
      where: { id, booking: { customerId: user.sub } },
      include: this.visitInclude(),
    });
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }
    return presentVisit(visit);
  }

  async listCaregiver(user: AuthUser, query: ListVisitsQueryDto): Promise<Paginated<unknown>> {
    const caregiverId = await this.caregiverProfileId(user);
    const where: Prisma.VisitWhereInput = {
      booking: { caregiverId },
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.visit.count({ where }),
      this.prisma.visit.findMany({
        where,
        orderBy: { scheduledDate: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          booking: {
            include: { patient: { select: { name: true, relationship: true } }, address: true },
          },
        },
      }),
    ]);
    return paginate(items, query.page, query.limit, total);
  }

  /** FR-CG6, FR-C9, FR-C11: full visit context for the assigned caregiver. */
  getCaregiver(user: AuthUser, id: string) {
    return this.loadForCaregiver(user, id);
  }

  /** FR-C9, FR-C11: customer view of a visit, including the note when present. */
  getCustomer(user: AuthUser, id: string) {
    return this.loadForCustomer(user, id);
  }

  /** Shared transition helper: validates, persists history and notifies. */
  private async transition(
    actor: AuthUser,
    visitId: string,
    to: VisitStatus,
    extra: Prisma.VisitUpdateInput = {},
  ) {
    const visit = await this.prisma.visit.findUnique({
      where: { id: visitId },
      include: { booking: { include: { customer: { select: { id: true, phone: true } } } } },
    });
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }
    if (!canTransition(visit.status, to)) {
      throw new BadRequestException(`Cannot move visit from ${visit.status} to ${to}`);
    }
    const from = visit.status;
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.visit.update({
        where: { id: visitId },
        data: { status: to, ...extra },
      });
      await tx.visitStatusHistory.create({
        data: { visitId, fromStatus: from, toStatus: to, actorId: actor.sub },
      });
      return result;
    });
    await this.audit.log({
      actorId: actor.sub,
      action: `visit.${to.toLowerCase()}`,
      entityType: 'Visit',
      entityId: visitId,
      metadata: { from, to },
    });
    await this.notifications.notify({
      userId: visit.booking.customer.id,
      phone: visit.booking.customer.phone,
      event: `visit.${to.toLowerCase()}`,
      payload: { visitId, bookingId: visit.bookingId, status: to },
      message: `Your CareSaath visit status is now ${to.replace(/_/g, ' ').toLowerCase()}.`,
    });
    return updated;
  }

  /** FR-C9 / TRD §6.3: "Visit day arrives" caregiver action. */
  async enRoute(user: AuthUser, id: string) {
    return this.runCaregiverTransition(user, id, VisitStatus.EN_ROUTE, {
      enRouteAt: new Date(),
    });
  }

  /**
   * FR-CG7: issue a check-in OTP to the *customer's* phone. The customer reads
   * the code to the caregiver, who then checks in with method=OTP.
   */
  async requestCheckInOtp(user: AuthUser, id: string) {
    const visit = await this.loadForCaregiver(user, id);
    if (!VISIT_CHECKIN_STATUSES.includes(visit.status)) {
      throw new BadRequestException(
        `A check-in OTP can only be issued for a confirmed or en-route visit (now ${visit.status})`,
      );
    }
    const code = randomInt(100000, 999999).toString();
    const codeHash = this.hashOtp(code);
    const key = this.checkInOtpKey(id);
    const ttlSeconds = await this.checkinTtlSeconds();
    await this.redis.client.set(key, codeHash, 'EX', ttlSeconds);
    await this.prisma.otpCode.create({
      data: {
        userId: visit.booking.customer.id,
        phone: visit.booking.customer.phone,
        codeHash,
        purpose: OtpPurpose.VISIT_CHECKIN,
        visitId: id,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      },
    });
    await this.sms.sendOtp(visit.booking.customer.phone, code);
    await this.audit.log({
      actorId: user.sub,
      action: 'visit.checkin_otp.requested',
      entityType: 'Visit',
      entityId: id,
    });
    return { ttlSeconds, sentTo: visit.booking.customer.phone };
  }

  /** Validate and consume a check-in OTP; throws on mismatch or expiry. */
  private async verifyCheckInOtp(visitId: string, code: string | undefined) {
    const key = this.checkInOtpKey(visitId);
    const stored = await this.redis.client.get(key);
    if (!stored) {
      throw new UnauthorizedException('Check-in OTP expired or not requested');
    }
    const attemptsKey = `${key}:attempts`;
    const attempts = await this.redis.client.incr(attemptsKey);
    if (attempts === 1) {
      await this.redis.client.expire(attemptsKey, await this.checkinTtlSeconds());
    }
    if (attempts > CHECKIN_OTP_MAX_ATTEMPTS) {
      await this.redis.client.del(key, attemptsKey);
      throw new UnauthorizedException('Too many attempts, request a new OTP');
    }
    if (!code || stored !== this.hashOtp(code)) {
      throw new UnauthorizedException('Invalid check-in OTP');
    }
    await this.redis.client.del(key, attemptsKey);
    await this.prisma.otpCode.updateMany({
      where: { visitId, purpose: OtpPurpose.VISIT_CHECKIN, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  }

  /** FR-CG7: check in with GPS or OTP confirmation. */
  async checkIn(user: AuthUser, id: string, dto: CheckInDto) {
    const method = dto.method ?? CheckMethod.GPS;
    if (method === CheckMethod.GPS && (dto.lat === undefined || dto.lng === undefined)) {
      throw new BadRequestException('GPS check-in requires lat and lng');
    }
    if (method === CheckMethod.OTP) {
      await this.verifyCheckInOtp(id, dto.code);
    }
    return this.runCaregiverTransition(user, id, VisitStatus.CHECKED_IN, {
      checkInAt: new Date(),
      checkInMethod: method,
      checkInLat: dto.lat ?? null,
      checkInLng: dto.lng ?? null,
    });
  }

  /** FR-CG7: check out; care moves to IN_PROGRESS then CHECKED_OUT. */
  async checkOut(user: AuthUser, id: string, dto: CheckInDto) {
    const visit = await this.loadForCaregiver(user, id);
    if (visit.status === VisitStatus.CHECKED_IN) {
      await this.runCaregiverTransition(user, id, VisitStatus.IN_PROGRESS, {});
    }
    const method = dto.method ?? CheckMethod.GPS;
    if (method === CheckMethod.GPS && (dto.lat === undefined || dto.lng === undefined)) {
      throw new BadRequestException('GPS check-out requires lat and lng');
    }
    return this.runCaregiverTransition(user, id, VisitStatus.CHECKED_OUT, {
      checkOutAt: new Date(),
      checkOutMethod: method,
      checkOutLat: dto.lat ?? null,
      checkOutLng: dto.lng ?? null,
    });
  }

  /** FR-CG8: submit the visit note; CHECKED_OUT -> COMPLETED. */
  async submitNote(user: AuthUser, id: string, dto: VisitNoteDto) {
    const visit = await this.loadForCaregiver(user, id);
    const caregiverId = await this.caregiverProfileId(user);
    if (visit.note) {
      throw new BadRequestException('A note has already been submitted for this visit');
    }
    const updated = await this.runCaregiverTransition(user, id, VisitStatus.COMPLETED, {});
    await this.prisma.visitNote.create({
      data: { visitId: id, caregiverId, summary: dto.summary },
    });
    await this.audit.log({
      actorId: user.sub,
      action: 'visit.note.submitted',
      entityType: 'Visit',
      entityId: id,
    });
    return this.loadForCaregiver(user, updated.id);
  }

  private async runCaregiverTransition(
    user: AuthUser,
    id: string,
    to: VisitStatus,
    extra: Prisma.VisitUpdateInput,
  ) {
    await this.loadForCaregiver(user, id);
    return this.transition(user, id, to, extra);
  }
}

@ApiTags('Caregiver - Visits')
@ApiBearerAuth()
@Roles(UserRole.CAREGIVER)
@Controller('caregiver/visits')
export class CaregiverVisitsController {
  constructor(private readonly visits: VisitsService) {}

  @Get()
  @ApiOperation({
    summary: 'List caregiver visits',
    description: 'Lists all visits scheduled for the authenticated caregiver with status and date filtering.',
  })
  list(@CurrentUser() user: AuthUser, @Query() query: ListVisitsQueryDto) {
    return this.visits.listCaregiver(user, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get visit details',
    description: 'Retrieves visit details including decrypted patient medical context, address, and status history.',
  })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.visits.getCaregiver(user, id);
  }

  @Post(':id/en-route')
  @ApiOperation({
    summary: 'Mark caregiver en route',
    description: 'Notifies customer that the caregiver is on the way to the visit address.',
  })
  enRoute(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.visits.enRoute(user, id);
  }

  @Post(':id/check-in-otp')
  @ApiOperation({
    summary: 'Request OTP check-in code',
    description: 'Generates and sends a 6-digit arrival verification OTP to the customer.',
  })
  requestCheckInOtp(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.visits.requestCheckInOtp(user, id);
  }

  @Post(':id/check-in')
  @ApiOperation({
    summary: 'Caregiver check-in',
    description: 'Verifies caregiver arrival using GPS coordinates or customer-provided OTP.',
  })
  checkIn(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CheckInDto,
  ) {
    return this.visits.checkIn(user, id, dto);
  }

  @Post(':id/check-out')
  @ApiOperation({
    summary: 'Caregiver check-out',
    description: 'Records departure time and coordinates from the patient location.',
  })
  checkOut(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CheckInDto,
  ) {
    return this.visits.checkOut(user, id, dto);
  }

  @Post(':id/note')
  @ApiOperation({
    summary: 'Submit clinical visit note',
    description: 'Submits visit notes and moves visit status to COMPLETED.',
  })
  note(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VisitNoteDto,
  ) {
    return this.visits.submitNote(user, id, dto);
  }
}

@ApiTags('Customer - Visits')
@ApiBearerAuth()
@Roles(UserRole.CUSTOMER, UserRole.ADMIN)
@Controller('customer/visits')
export class CustomerVisitsController {
  constructor(private readonly visits: VisitsService) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Track visit progress',
    description: 'Customer tracks real-time visit status (Requested -> Confirmed -> EnRoute -> CheckedIn -> Completed).',
  })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.visits.getCustomer(user, id);
  }
}

@Module({
  imports: [NotificationsModule, PlatformConfigModule],
  controllers: [CaregiverVisitsController, CustomerVisitsController],
  providers: [VisitsService, SmsService],
  exports: [VisitsService],
})
export class VisitsModule {}
