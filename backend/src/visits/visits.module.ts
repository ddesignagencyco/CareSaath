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
  IsIn,
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
  BookingStatus,
  CheckMethod,
  OtpPurpose,
  PaymentMethod,
  PaymentStatus,
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
import { StorageService, withFileUrl } from '../common/storage/storage.module.js';
import { RealtimeEvents, RealtimeService } from '../realtime/realtime.service.js';
import { NotificationsModule, NotificationsService } from '../notifications/notifications.module.js';
import { SmsService } from '../auth/sms.service.js';
import { PlatformConfigModule, ConfigService } from '../config/platform-config.module.js';
import { CaregiversModule, CaregiversService } from '../caregivers/caregivers.module.js';
import { distanceMeters } from '../common/geo.js';

/** FR-CG7 check-in OTP verification limits. */
const CHECKIN_OTP_MAX_ATTEMPTS = 5;
/** An OTP may be issued before arrival (check-in) or while care is under way (check-out). */
const VISIT_OTP_STATUSES: VisitStatus[] = [
  VisitStatus.CONFIRMED,
  VisitStatus.EN_ROUTE,
  VisitStatus.CHECKED_IN,
  VisitStatus.IN_PROGRESS,
];
/**
 * Live GPS tracking while EN_ROUTE (FR: "track the visit live"). The caregiver
 * app posts a fix roughly every 10-15s; the last one is cached briefly so a
 * reconnecting customer gets it immediately, and purged once the caregiver
 * checks in (no long-term location retention).
 */
const VISIT_LOCATION_TTL_SECONDS = Number(process.env['VISIT_LOCATION_TTL_SECONDS'] ?? 60);
/** Rough average travel speed used only for the ETA estimate shown to the customer. */
const VISIT_LOCATION_AVERAGE_SPEED_KMH = Number(process.env['VISIT_LOCATION_AVERAGE_SPEED_KMH'] ?? 25);

/** A booking is complete once none of its visits is in one of these states. */
const OPEN_VISIT_STATUSES: VisitStatus[] = [
  VisitStatus.REQUESTED,
  VisitStatus.CONFIRMED,
  VisitStatus.EN_ROUTE,
  VisitStatus.CHECKED_IN,
  VisitStatus.IN_PROGRESS,
  VisitStatus.CHECKED_OUT,
];

/** Combine a visit's scheduled date with its time-window start into one instant (UTC). */
export function scheduledStartAt(visit: { scheduledDate: Date; timeWindowStart: string }): Date {
  const [hours, minutes] = visit.timeWindowStart.split(':').map(Number);
  const start = new Date(visit.scheduledDate);
  start.setUTCHours(hours, minutes, 0, 0);
  return start;
}

/** Re-exported so existing `from '../visits/visits.module.js'` imports keep working. */
export { distanceMeters };

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
 * Privacy (customer<->caregiver boundary): the caregiver never sees the
 * customer's phone number; the two parties contact each other via in-app
 * chat/call instead. The internal `loadForCaregiver` still selects it (needed
 * server-side to send the check-in OTP), so this strips it only from
 * responses actually returned to the caregiver.
 */
function omitCustomerPhone<T extends { booking: { customer: { phone: string } } }>(visit: T) {
  const { phone, ...customer } = visit.booking.customer;
  void phone;
  return { ...visit, booking: { ...visit.booking, customer } };
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

export class UpdateVisitLocationDto {
  @ApiProperty({ example: 31.5204, description: 'Caregiver current latitude' })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ example: 74.3587, description: 'Caregiver current longitude' })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;
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

  @ApiPropertyOptional({ example: '2026-10-25', description: 'Only visits scheduled on or after this date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31', description: 'Only visits scheduled on or before this date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc', description: 'Sort by scheduled date' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sort: 'asc' | 'desc' = 'asc';

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
    private readonly caregivers: CaregiversService,
    @Optional() private readonly storage?: StorageService,
    @Optional() private readonly realtime?: RealtimeService,
  ) {}

  /** Prescriptions on the booking get a viewable `url` (the storage key stays internal). */
  private async withPrescriptionUrls<
    T extends { booking: { prescriptions: Array<{ fileKey: string }> } },
  >(visit: T) {
    const storage = this.storage;
    if (!storage) return visit;
    const prescriptions = await Promise.all(
      visit.booking.prescriptions.map(async ({ fileKey, ...rest }) => {
        const { url } = await withFileUrl(storage, { fileKey });
        return { ...rest, url };
      }),
    );
    return { ...visit, booking: { ...visit.booking, prescriptions } };
  }

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
          caregiver: {
            select: {
              id: true,
              // No raw license number in customer/caregiver-facing visit responses (privacy).
              licenseBody: true,
              specialty: true,
              ratingAverage: true,
              ratingCount: true,
              user: { select: { fullName: true } },
            },
          },
        },
      },
      statusHistory: { orderBy: { at: 'asc' as const } },
      note: true,
      review: true,
      payments: {
        select: {
          id: true,
          method: true,
          status: true,
          amount: true,
          caregiverAmount: true,
          paidAt: true,
          customerConfirmedAt: true,
          caregiverConfirmedAt: true,
        },
        orderBy: { createdAt: 'desc' as const },
      },
    } satisfies Prisma.VisitInclude;
  }

  /** Reject GPS fixes that are further from the visit address than the configured radius. */
  private async assertWithinGeofence(
    address: { latitude: Prisma.Decimal | number | string; longitude: Prisma.Decimal | number | string } | null,
    lat: number,
    lng: number,
    action: string,
  ) {
    const radius = await this.config.getNumber('visit.geofenceRadiusMeters');
    if (radius <= 0 || !address) return;
    const meters = distanceMeters(lat, lng, Number(address.latitude), Number(address.longitude));
    if (meters > radius) {
      throw new BadRequestException(
        `You are about ${Math.round(meters)} m from the visit address; ${action} is allowed within ${radius} m`,
      );
    }
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
    return this.withPrescriptionUrls(presentVisit(visit));
  }

  private async loadForCustomer(user: AuthUser, id: string) {
    const visit = await this.prisma.visit.findFirst({
      where: { id, booking: { customerId: user.sub } },
      include: this.visitInclude(),
    });
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }
    return this.withPrescriptionUrls(presentVisit(visit));
  }

  async listCaregiver(user: AuthUser, query: ListVisitsQueryDto): Promise<Paginated<unknown>> {
    const caregiverId = await this.caregiverProfileId(user);
    const scheduledDate: Prisma.DateTimeFilter = {};
    if (query.date) {
      scheduledDate.equals = new Date(query.date);
    } else {
      if (query.from) scheduledDate.gte = new Date(query.from);
      if (query.to) scheduledDate.lte = new Date(query.to);
    }
    const where: Prisma.VisitWhereInput = {
      booking: { caregiverId },
      ...(query.status ? { status: query.status } : {}),
      ...(Object.keys(scheduledDate).length > 0 ? { scheduledDate } : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.visit.count({ where }),
      this.prisma.visit.findMany({
        where,
        orderBy: { scheduledDate: query.sort },
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
  async getCaregiver(user: AuthUser, id: string) {
    return omitCustomerPhone(await this.loadForCaregiver(user, id));
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
      include: {
        booking: {
          include: {
            customer: { select: { id: true, phone: true } },
            caregiver: { select: { userId: true } },
          },
        },
      },
    });
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }
    if (!canTransition(visit.status, to)) {
      throw new BadRequestException(`Cannot move visit from ${visit.status} to ${to}`);
    }
    const from = visit.status;
    let bookingCompleted = false;
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.visit.update({
        where: { id: visitId },
        data: { status: to, ...extra },
      });
      await tx.visitStatusHistory.create({
        data: { visitId, fromStatus: from, toStatus: to, actorId: actor.sub },
      });
      if (to === VisitStatus.COMPLETED) {
        const open = await tx.visit.count({
          where: { bookingId: visit.bookingId, status: { in: OPEN_VISIT_STATUSES } },
        });
        if (open === 0) {
          const closed = await tx.booking.updateMany({
            where: { id: visit.bookingId, status: BookingStatus.CONFIRMED },
            data: { status: BookingStatus.COMPLETED },
          });
          bookingCompleted = closed.count > 0;
        }
      }
      return result;
    });
    if (from === VisitStatus.EN_ROUTE && to !== VisitStatus.EN_ROUTE) {
      // Leaving EN_ROUTE (normally CHECKED_IN) stops the live-location stream
      // and purges the cached fix; location is never retained beyond this window.
      await this.redis.client.del(this.visitLocationKey(visitId));
    }
    await this.audit.log({
      actorId: actor.sub,
      action: `visit.${to.toLowerCase()}`,
      entityType: 'Visit',
      entityId: visitId,
      metadata: { from, to },
    });
    const caregiverUserId = visit.booking.caregiver?.userId;
    if (bookingCompleted) {
      await this.audit.log({
        actorId: actor.sub,
        action: 'booking.completed',
        entityType: 'Booking',
        entityId: visit.bookingId,
      });
      for (const userId of [visit.booking.customer.id, caregiverUserId]) {
        if (userId) {
          await this.notifications.notify({
            userId,
            event: 'booking.completed',
            payload: { bookingId: visit.bookingId },
            message: 'All visits in this booking are complete.',
          });
        }
      }
    }
    const parties = { users: [visit.booking.customer.id, caregiverUserId] };
    this.realtime?.entityUpdated(parties, {
      type: 'visit',
      id: visitId,
      action: to.toLowerCase(),
      status: to,
      data: { bookingId: visit.bookingId },
    });
    if (bookingCompleted) {
      this.realtime?.entityUpdated(parties, {
        type: 'booking',
        id: visit.bookingId,
        action: 'completed',
        status: BookingStatus.COMPLETED,
      });
    }
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

  private visitLocationKey(visitId: string): string {
    return `visit:location:${visitId}`;
  }

  /**
   * Live GPS fix while the caregiver is EN_ROUTE. Relayed to the customer only
   * (never persisted in Postgres) and cached briefly in Redis so a
   * reconnecting customer can fetch the last fix immediately.
   */
  async updateLocation(user: AuthUser, id: string, dto: UpdateVisitLocationDto) {
    const caregiverId = await this.caregiverProfileId(user);
    const visit = await this.prisma.visit.findFirst({
      where: { id, booking: { caregiverId } },
      select: {
        status: true,
        booking: {
          select: {
            customerId: true,
            address: { select: { latitude: true, longitude: true } },
          },
        },
      },
    });
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }
    if (visit.status !== VisitStatus.EN_ROUTE) {
      throw new BadRequestException(
        `Location can only be shared while the visit is EN_ROUTE (now ${visit.status})`,
      );
    }
    const meters = distanceMeters(
      dto.lat,
      dto.lng,
      Number(visit.booking.address.latitude),
      Number(visit.booking.address.longitude),
    );
    const etaMinutes = Math.max(0, Math.round(meters / 1000 / VISIT_LOCATION_AVERAGE_SPEED_KMH * 60));
    const payload = { visitId: id, lat: dto.lat, lng: dto.lng, at: new Date().toISOString(), etaMinutes };
    await this.redis.client.set(
      this.visitLocationKey(id),
      JSON.stringify(payload),
      'EX',
      VISIT_LOCATION_TTL_SECONDS,
    );
    this.realtime?.emit({ users: [visit.booking.customerId] }, RealtimeEvents.visitLocation, payload);
    return { ok: true as const };
  }

  /** Last-known fix for the customer's own visit tracker (e.g. on reconnect); null once stale or not EN_ROUTE yet. */
  async getLocation(user: AuthUser, id: string) {
    const visit = await this.prisma.visit.findFirst({
      where: { id, booking: { customerId: user.sub } },
      select: { id: true },
    });
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }
    const cached = await this.redis.client.get(this.visitLocationKey(id));
    if (!cached) {
      return null;
    }
    return JSON.parse(cached) as { visitId: string; lat: number; lng: number; at: string; etaMinutes: number };
  }

  /**
   * FR-CG7: issue a check-in OTP to the *customer's* phone. The customer reads
   * the code to the caregiver, who then checks in with method=OTP.
   */
  async requestCheckInOtp(user: AuthUser, id: string) {
    const visit = await this.loadForCaregiver(user, id);
    if (!VISIT_OTP_STATUSES.includes(visit.status)) {
      throw new BadRequestException(
        `An OTP can only be issued for a confirmed, en-route or in-progress visit (now ${visit.status})`,
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
    // Validate the state first so a valid OTP is never burned on a check-in that cannot happen.
    const visit = await this.loadForCaregiver(user, id);
    if (visit.status !== VisitStatus.EN_ROUTE) {
      throw new BadRequestException(`Cannot move visit from ${visit.status} to CHECKED_IN`);
    }
    if (method === CheckMethod.GPS) {
      await this.assertWithinGeofence(visit.booking.address, dto.lat!, dto.lng!, 'check-in');
    } else {
      await this.verifyCheckInOtp(id, dto.code);
    }
    const checkInAt = new Date();
    const result = await this.runCaregiverTransition(user, id, VisitStatus.CHECKED_IN, {
      checkInAt,
      checkInMethod: method,
      checkInLat: dto.lat ?? null,
      checkInLng: dto.lng ?? null,
    });
    await this.assertNotLate(visit, checkInAt);
    return result;
  }

  /** A caregiver who checks in well past their window start gets a strike. */
  private async assertNotLate(
    visit: { booking: { caregiver: { id: string } | null }; bookingId: string; scheduledDate: Date; timeWindowStart: string },
    checkInAt: Date,
  ): Promise<void> {
    const caregiverId = visit.booking.caregiver?.id;
    if (!caregiverId) return;
    const graceMinutes = await this.config.getNumber('visit.lateArrivalGraceMinutes');
    const deadline = new Date(scheduledStartAt(visit).getTime() + graceMinutes * 60 * 1000);
    if (checkInAt > deadline) {
      await this.caregivers.recordStrike(caregiverId, 'LATE_ARRIVAL', visit.bookingId);
    }
  }

  /** FR-CG7: check out; care moves to IN_PROGRESS then CHECKED_OUT. */
  async checkOut(user: AuthUser, id: string, dto: CheckInDto) {
    const visit = await this.loadForCaregiver(user, id);
    const method = dto.method ?? CheckMethod.GPS;
    if (method === CheckMethod.GPS && (dto.lat === undefined || dto.lng === undefined)) {
      throw new BadRequestException('GPS check-out requires lat and lng');
    }
    if (visit.status !== VisitStatus.CHECKED_IN && visit.status !== VisitStatus.IN_PROGRESS) {
      throw new BadRequestException(`Cannot move visit from ${visit.status} to CHECKED_OUT`);
    }
    if (method === CheckMethod.GPS) {
      await this.assertWithinGeofence(visit.booking.address, dto.lat!, dto.lng!, 'check-out');
    } else {
      await this.verifyCheckInOtp(id, dto.code);
    }
    if (visit.status === VisitStatus.CHECKED_IN) {
      await this.runCaregiverTransition(user, id, VisitStatus.IN_PROGRESS, {});
    }
    return this.runCaregiverTransition(user, id, VisitStatus.CHECKED_OUT, {
      checkOutAt: new Date(),
      checkOutMethod: method,
      checkOutLat: dto.lat ?? null,
      checkOutLng: dto.lng ?? null,
    });
  }

  /**
   * A visit cannot be closed until its payment is verified: card settled, or cash
   * confirmed by BOTH the customer and the caregiver. Tunable with the
   * visit.requirePaymentBeforeComplete setting (0 turns the check off).
   */
  private async assertPaymentVerified(visitId: string): Promise<void> {
    if ((await this.config.getNumber('visit.requirePaymentBeforeComplete')) === 0) {
      return;
    }
    const payments = await this.prisma.payment.findMany({
      where: { visitId, status: { in: [PaymentStatus.PAID, PaymentStatus.PENDING] } },
      select: { status: true, method: true, customerConfirmedAt: true, caregiverConfirmedAt: true },
    });
    if (payments.some((p) => p.status === PaymentStatus.PAID)) {
      return;
    }
    const pending = payments[0];
    let reason: string;
    if (!pending) {
      reason = 'no payment has been made for this visit yet';
    } else if (pending.method !== PaymentMethod.CASH) {
      reason = 'the card payment has not been completed yet';
    } else if (!pending.customerConfirmedAt && !pending.caregiverConfirmedAt) {
      reason = 'neither the customer nor the caregiver has confirmed the cash payment';
    } else if (!pending.customerConfirmedAt) {
      reason = 'the customer has not confirmed handing over the cash';
    } else {
      reason = 'the caregiver has not confirmed receiving the cash';
    }
    throw new BadRequestException(
      `The visit cannot be completed until payment is verified by both sides: ${reason}`,
    );
  }

  /** FR-CG8: submit the visit note; CHECKED_OUT -> COMPLETED. */
  async submitNote(user: AuthUser, id: string, dto: VisitNoteDto) {
    const visit = await this.loadForCaregiver(user, id);
    const caregiverId = await this.caregiverProfileId(user);
    if (visit.note) {
      throw new BadRequestException('A note has already been submitted for this visit');
    }
    await this.assertPaymentVerified(id);
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
    return omitCustomerPhone(await this.loadForCaregiver(user, updated.id));
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

  @Post(':id/location')
  @ApiOperation({
    summary: 'Push a live GPS fix while en route',
    description: 'Caregiver app posts its current position roughly every 10-15s while the visit is EN_ROUTE; relayed live to the customer and briefly cached for reconnects. Rejected once the visit is no longer EN_ROUTE.',
  })
  updateLocation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVisitLocationDto,
  ) {
    return this.visits.updateLocation(user, id, dto);
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
    description: 'Verifies caregiver arrival using GPS coordinates (within the configured radius of the visit address) or a customer-provided OTP. The visit must be EN_ROUTE.',
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
    description: 'Records departure time and coordinates from the patient location. GPS check-out must be within the configured radius of the visit address; method OTP requires a code issued via POST /caregiver/visits/{id}/check-in-otp.',
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

  @Get(':id/location')
  @ApiOperation({
    summary: 'Last-known caregiver location',
    description: "Last GPS fix cached while the caregiver is EN_ROUTE (plus an ETA estimate), so a reconnecting client gets the live map's current state immediately. Null once the caregiver has checked in or no fix has arrived yet.",
  })
  getLocation(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.visits.getLocation(user, id);
  }
}

@Module({
  imports: [NotificationsModule, PlatformConfigModule, CaregiversModule],
  controllers: [CaregiverVisitsController, CustomerVisitsController],
  providers: [VisitsService, SmsService],
  exports: [VisitsService],
})
export class VisitsModule {}
