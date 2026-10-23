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
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  BookingStatus,
  BookingType,
  Prisma,
  UserRole,
} from '../generated/prisma/client.js';
import { AuditService } from '../common/audit/audit.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Paginated, paginate } from '../common/dto/pagination.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { StorageService, withFileUrl } from '../common/storage/storage.module.js';
import { NotificationsModule, NotificationsService } from '../notifications/notifications.module.js';
import { PromosModule, PromosService } from '../promos/promos.module.js';
import { PlatformConfigModule, ConfigService } from '../config/platform-config.module.js';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function toDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export class CreateBookingDto {
  @ApiProperty({
    format: 'uuid',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Patient profile UUID (registered under customer)',
  })
  @IsUUID()
  patientId!: string;

  @ApiProperty({
    format: 'uuid',
    example: 'c1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Caregiver profile UUID (must be an APPROVED caregiver)',
  })
  @IsUUID()
  caregiverId!: string;

  @ApiProperty({
    format: 'uuid',
    example: 'd1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Saved address UUID for the home visit location',
  })
  @IsUUID()
  addressId!: string;

  @ApiPropertyOptional({
    enum: BookingType,
    example: BookingType.SINGLE,
    description: 'Booking schedule type: SINGLE (default) or RECURRING',
  })
  @IsOptional()
  @IsEnum(BookingType)
  type?: BookingType;

  @ApiProperty({
    example: '2026-10-25',
    description: 'Start date of the booking (YYYY-MM-DD)',
  })
  @IsDateString()
  startDate!: string;

  @ApiProperty({
    example: '2026-10-25',
    description: 'End date of the booking (YYYY-MM-DD). Same as startDate for SINGLE.',
  })
  @IsDateString()
  endDate!: string;

  @ApiProperty({ example: '09:00', description: 'Daily arrival time window start (HH:mm)' })
  @IsString()
  @Matches(TIME_RE)
  timeWindowStart!: string;

  @ApiProperty({ example: '11:00', description: 'Daily arrival time window end (HH:mm)' })
  @IsString()
  @Matches(TIME_RE)
  timeWindowEnd!: string;

  @ApiPropertyOptional({
    description: 'Recurring days-of-week as integers (1=Mon..7=Sun). Required for RECURRING bookings.',
    example: [1, 3, 5],
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  weekdays?: number[];

  @ApiPropertyOptional({
    description: 'Optional discount promo code (e.g. WELCOME10)',
    example: 'WELCOME10',
  })
  @IsOptional()
  @IsString()
  @MaxLength(24)
  promoCode?: string;
}

export class CancelBookingDto {
  @ApiPropertyOptional({
    example: 'Travel plans changed; will rebook next week.',
    description: 'Customer cancellation reason',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class RescheduleVisitDto {
  @ApiProperty({
    format: 'uuid',
    example: 'v1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Visit UUID to reschedule',
  })
  @IsUUID()
  visitId!: string;

  @ApiProperty({
    example: '2026-10-28',
    description: 'New date for the visit (YYYY-MM-DD)',
  })
  @IsDateString()
  newDate!: string;

  @ApiProperty({ example: '10:00', description: 'New time window start (HH:mm)' })
  @IsString()
  @Matches(TIME_RE)
  timeWindowStart!: string;

  @ApiProperty({ example: '12:00', description: 'New time window end (HH:mm)' })
  @IsString()
  @Matches(TIME_RE)
  timeWindowEnd!: string;
}

export class RejectBookingDto extends CancelBookingDto {}

export class ListBookingsQueryDto {
  @ApiPropertyOptional({ enum: BookingStatus, description: 'Filter by booking status' })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

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

export function expandOccurrences(
  startDate: Date,
  endDate: Date,
  type: BookingType,
  weekdays: number[],
): Date[] {
  const dates: Date[] = [];
  if (type === BookingType.SINGLE) {
    dates.push(startDate);
    return dates;
  }
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    // JS getUTCDay: 0=Sun..6=Sat -> convert to 1=Mon..7=Sun
    const isoDay = cursor.getUTCDay() === 0 ? 7 : cursor.getUTCDay();
    if (weekdays.includes(isoDay)) {
      dates.push(new Date(cursor));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly promos: PromosService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

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

  /** FR-C6, FR-C7: create a single or recurring booking with per-occurrence visits. */
  async createCustomerBooking(user: AuthUser, dto: CreateBookingDto) {
    const startDate = toDateOnly(dto.startDate);
    const endDate = toDateOnly(dto.endDate);
    if (endDate < startDate) {
      throw new BadRequestException('endDate must be on or after startDate');
    }
    if (dto.timeWindowStart >= dto.timeWindowEnd) {
      throw new BadRequestException('timeWindowStart must be before timeWindowEnd');
    }
    if (dto.type === BookingType.RECURRING && (!dto.weekdays || dto.weekdays.length === 0)) {
      throw new BadRequestException('weekdays are required for a recurring booking');
    }

    const [patient, address, caregiver] = await Promise.all([
      this.prisma.patientProfile.findFirst({
        where: { id: dto.patientId, ownerUserId: user.sub },
      }),
      this.prisma.address.findFirst({ where: { id: dto.addressId, userId: user.sub } }),
      this.prisma.caregiverProfile.findFirst({
        where: {
          id: dto.caregiverId,
          verificationStatus: 'APPROVED',
          user: { status: 'ACTIVE' },
        },
        include: { commissionRate: true },
      }),
    ]);
    if (!patient) {
      throw new NotFoundException('Patient profile not found');
    }
    if (!address) {
      throw new NotFoundException('Address not found');
    }
    if (!caregiver) {
      throw new NotFoundException('Caregiver not available');
    }

    const occurrences = expandOccurrences(
      startDate,
      endDate,
      dto.type ?? BookingType.SINGLE,
      dto.weekdays ?? [],
    );
    if (occurrences.length === 0) {
      throw new BadRequestException('The recurrence rule produces no visits');
    }

    const now = new Date();
    const respondWindowMinutes = await this.config.getNumber('booking.respondWindowMinutes');
    const respondBy = new Date(now.getTime() + respondWindowMinutes * 60 * 1000);
    const rateSnapshot = caregiver.ratePerVisit;

    let promoId: string | null = null;
    let discountAmount = 0;
    if (dto.promoCode) {
      const quote = await this.promos.quote(dto.promoCode, rateSnapshot, now, user.sub);
      promoId = quote.promo.id;
      discountAmount = quote.discountAmount;
    }

    const booking = await this.prisma.$transaction(async (tx) => {
      const created = await tx.booking.create({
        data: {
          customerId: user.sub,
          patientId: dto.patientId,
          caregiverId: caregiver.id,
          addressId: dto.addressId,
          type: dto.type ?? BookingType.SINGLE,
          recurrenceRule:
            dto.type === BookingType.RECURRING
              ? { weekdays: dto.weekdays ?? [], startDate: dto.startDate, endDate: dto.endDate }
              : undefined,
          startDate,
          endDate,
          timeWindowStart: dto.timeWindowStart,
          timeWindowEnd: dto.timeWindowEnd,
          serviceType: caregiver.specialty,
          rateSnapshot,
          promoCodeId: promoId,
          discountAmount,
          respondBy,
          status: BookingStatus.REQUESTED,
        },
      });
      await tx.visit.createMany({
        data: occurrences.map((date) => ({
          bookingId: created.id,
          scheduledDate: date,
          timeWindowStart: dto.timeWindowStart,
          timeWindowEnd: dto.timeWindowEnd,
          status: 'REQUESTED' as const,
        })),
      });
      return created;
    });

    if (promoId) {
      await this.promos.redeem(promoId);
    }

    await this.audit.log({
      actorId: user.sub,
      action: 'booking.created',
      entityType: 'Booking',
      entityId: booking.id,
      metadata: { visits: occurrences.length, caregiverId: caregiver.id, discountAmount },
    });
    await this.notifications.notify({
      userId: caregiver.userId,
      event: 'booking.requested',
      payload: { bookingId: booking.id, visits: occurrences.length },
    });
    return this.getBooking(booking.id);
  }

  private bookingInclude() {
    return {
      visits: { orderBy: { scheduledDate: 'asc' as const } },
      patient: { select: { id: true, name: true, relationship: true } },
      address: true,
      caregiver: {
        select: {
          id: true,
          specialty: true,
          userId: true,
          licenseNumber: true,
          licenseBody: true,
          ratingAverage: true,
          ratingCount: true,
          user: { select: { fullName: true } },
        },
      },
      prescriptions: {
        orderBy: { createdAt: 'desc' as const },
        select: {
          id: true,
          mimeType: true,
          sizeBytes: true,
          createdAt: true,
          uploadedById: true,
          fileKey: true,
        },
      },
    } satisfies Prisma.BookingInclude;
  }

  /** Prescriptions carry a viewable `url`; the internal storage key is not exposed. */
  private async presentBooking<T extends { prescriptions: Array<{ fileKey: string }> }>(booking: T) {
    const prescriptions = await Promise.all(
      booking.prescriptions.map(async ({ fileKey, ...rest }) => {
        const { url } = await withFileUrl(this.storage, { fileKey });
        return { ...rest, url };
      }),
    );
    return { ...booking, prescriptions };
  }

  async getBooking(id: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: this.bookingInclude(),
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    return this.presentBooking(booking);
  }

  async listCustomer(user: AuthUser, query: ListBookingsQueryDto): Promise<Paginated<unknown>> {
    const where: Prisma.BookingWhereInput = {
      customerId: user.sub,
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { visits: { orderBy: { scheduledDate: 'asc' } } },
      }),
    ]);
    return paginate(items, query.page, query.limit, total);
  }

  async getCustomerBooking(user: AuthUser, id: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id, customerId: user.sub },
      include: this.bookingInclude(),
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    return this.presentBooking(booking);
  }

  /** FR-C5: attach a doctor's prescription / care-plan document to a booking. */
  async uploadPrescription(
    user: AuthUser,
    bookingId: string,
    file: { originalname: string; mimetype: string; buffer: Buffer },
  ) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, customerId: user.sub },
      select: {
        id: true,
        status: true,
        caregiver: { select: { userId: true } },
      },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (booking.status === BookingStatus.CANCELLED || booking.status === BookingStatus.DECLINED) {
      throw new BadRequestException('Cannot attach documents to a closed booking');
    }
    this.storage.validateUpload(file.mimetype, file.buffer.length);
    const stored = await this.storage.put(
      `bookings/${bookingId}/prescriptions`,
      file.originalname,
      file.buffer,
      file.mimetype,
    );
    const doc = await this.prisma.prescriptionDocument.create({
      data: {
        bookingId,
        uploadedById: user.sub,
        fileKey: stored.fileKey,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
      },
    });
    await this.audit.log({
      actorId: user.sub,
      action: 'prescription.uploaded',
      entityType: 'PrescriptionDocument',
      entityId: doc.id,
      metadata: { bookingId },
    });
    await this.notifications.notify({
      userId: booking.caregiver.userId,
      event: 'booking.prescription.uploaded',
      payload: { bookingId, documentId: doc.id },
    });
    return {
      id: doc.id,
      bookingId: doc.bookingId,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      createdAt: doc.createdAt,
      url: (await withFileUrl(this.storage, doc)).url,
    };
  }

  /** Signed URL to view a prescription; visible to the owning customer and assigned caregiver. */
  async prescriptionUrl(user: AuthUser, bookingId: string, documentId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId },
      select: { customerId: true, caregiverId: true },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    const caregiverId = await this.caregiverProfileId(user).catch(() => null);
    const isCustomer = booking.customerId === user.sub;
    const isCaregiver = caregiverId !== null && booking.caregiverId === caregiverId;
    if (!isCustomer && !isCaregiver && user.role !== UserRole.ADMIN) {
      throw new NotFoundException('Prescription not found');
    }
    const doc = await this.prisma.prescriptionDocument.findFirst({
      where: { id: documentId, bookingId },
    });
    if (!doc) {
      throw new NotFoundException('Prescription not found');
    }
    return { url: await this.storage.presignedGet(doc.fileKey), mimeType: doc.mimeType };
  }

  async listCaregiver(user: AuthUser, query: ListBookingsQueryDto): Promise<Paginated<unknown>> {
    const caregiverId = await this.caregiverProfileId(user);
    const where: Prisma.BookingWhereInput = {
      caregiverId,
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          patient: { select: { id: true, name: true, relationship: true } },
          address: true,
          visits: { orderBy: { scheduledDate: 'asc' } },
        },
      }),
    ]);
    return paginate(items, query.page, query.limit, total);
  }

  /** FR-CG5: accept a requested booking; all pending visits become CONFIRMED. */
  async accept(user: AuthUser, id: string) {
    const caregiverId = await this.caregiverProfileId(user);
    const booking = await this.prisma.booking.findFirst({ where: { id, caregiverId } });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (booking.status !== BookingStatus.REQUESTED) {
      throw new BadRequestException('Only requested bookings can be accepted');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id },
        data: { status: BookingStatus.CONFIRMED },
      });
      await tx.visit.updateMany({
        where: { bookingId: id, status: 'REQUESTED' },
        data: { status: 'CONFIRMED' },
      });
    });
    await this.audit.log({
      actorId: user.sub,
      action: 'booking.accepted',
      entityType: 'Booking',
      entityId: id,
    });
    await this.notifyCustomer(booking.customerId, 'booking.confirmed', {
      bookingId: id,
    });
    return this.getBooking(id);
  }

  async decline(user: AuthUser, id: string, dto: RejectBookingDto) {
    const caregiverId = await this.caregiverProfileId(user);
    const booking = await this.prisma.booking.findFirst({ where: { id, caregiverId } });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (booking.status !== BookingStatus.REQUESTED) {
      throw new BadRequestException('Only requested bookings can be declined');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id },
        data: {
          status: BookingStatus.DECLINED,
          cancelledAt: new Date(),
          cancelledById: user.sub,
          cancelReason: dto.reason ?? null,
        },
      });
      await tx.visit.updateMany({
        where: { bookingId: id, status: { in: ['REQUESTED', 'CONFIRMED'] } },
        data: { status: 'DECLINED' },
      });
    });
    await this.audit.log({
      actorId: user.sub,
      action: 'booking.declined',
      entityType: 'Booking',
      entityId: id,
      metadata: { reason: dto.reason ?? null },
    });
    await this.notifyCustomer(booking.customerId, 'booking.declined', { bookingId: id });
    return this.getBooking(id);
  }

  /** FR-C13 (gap-fill): cancel a booking that has not started. */
  async cancelCustomer(user: AuthUser, id: string, dto: CancelBookingDto) {
    const booking = await this.prisma.booking.findFirst({
      where: { id, customerId: user.sub },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (booking.status !== BookingStatus.REQUESTED && booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('Only requested or confirmed bookings can be cancelled');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledById: user.sub,
          cancelReason: dto.reason ?? null,
        },
      });
      await tx.visit.updateMany({
        where: { bookingId: id, status: { in: ['REQUESTED', 'CONFIRMED'] } },
        data: { status: 'CANCELLED' },
      });
    });
    await this.audit.log({
      actorId: user.sub,
      action: 'booking.cancelled',
      entityType: 'Booking',
      entityId: id,
      metadata: { reason: dto.reason ?? null },
    });
    const profile = await this.prisma.caregiverProfile.findUnique({
      where: { id: booking.caregiverId },
      select: { userId: true },
    });
    if (profile) {
      await this.notifications.notify({
        userId: profile.userId,
        event: 'booking.cancelled',
        payload: { bookingId: id },
      });
    }
    return this.getBooking(id);
  }

  /**
   * FR-C13: reschedule a single not-yet-started visit. The original visit is
   * CANCELLED and a replacement visit with the new date/time is created and
   * linked via rescheduledFromId (history preserved).
   */
  async rescheduleCustomer(user: AuthUser, bookingId: string, dto: RescheduleVisitDto) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, customerId: user.sub },
      include: { caregiver: { select: { id: true, userId: true } } },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (booking.status === BookingStatus.CANCELLED || booking.status === BookingStatus.DECLINED) {
      throw new BadRequestException('Cannot reschedule a closed booking');
    }
    if (dto.timeWindowStart >= dto.timeWindowEnd) {
      throw new BadRequestException('timeWindowStart must be before timeWindowEnd');
    }
    const visit = await this.prisma.visit.findFirst({
      where: { id: dto.visitId, bookingId },
    });
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }
    const reschedulable = ['REQUESTED', 'CONFIRMED'] as const;
    if (!reschedulable.includes(visit.status as (typeof reschedulable)[number])) {
      throw new BadRequestException('Only requested or confirmed visits can be rescheduled');
    }

    const replacement = await this.prisma.$transaction(async (tx) => {
      await tx.visit.update({
        where: { id: visit.id },
        data: { status: 'CANCELLED' },
      });
      await tx.visitStatusHistory.create({
        data: {
          visitId: visit.id,
          fromStatus: visit.status,
          toStatus: 'CANCELLED',
          actorId: user.sub,
        },
      });
      const created = await tx.visit.create({
        data: {
          bookingId,
          scheduledDate: toDateOnly(dto.newDate),
          timeWindowStart: dto.timeWindowStart,
          timeWindowEnd: dto.timeWindowEnd,
          status: booking.status === BookingStatus.CONFIRMED ? 'CONFIRMED' : 'REQUESTED',
          rescheduledFromId: visit.id,
        },
      });
      await tx.visitStatusHistory.create({
        data: { visitId: created.id, toStatus: created.status, actorId: user.sub },
      });
      return created;
    });

    await this.audit.log({
      actorId: user.sub,
      action: 'visit.rescheduled',
      entityType: 'Visit',
      entityId: visit.id,
      metadata: { bookingId, replacementVisitId: replacement.id, newDate: dto.newDate },
    });
    await this.notifications.notify({
      userId: booking.caregiver.userId,
      event: 'visit.rescheduled',
      payload: {
        bookingId,
        originalVisitId: visit.id,
        visitId: replacement.id,
        scheduledDate: dto.newDate,
      },
    });
    return replacement;
  }

  private async notifyCustomer(
    customerId: string,
    event: string,
    payload: Prisma.InputJsonObject,
  ) {
    await this.notifications.notify({ userId: customerId, event, payload });
  }}

@ApiTags('Customer - Bookings')
@ApiBearerAuth()
@Roles(UserRole.CUSTOMER, UserRole.ADMIN)
@Controller('customer/bookings')
export class CustomerBookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  @ApiOperation({
    summary: 'List customer bookings',
    description: 'Retrieves all bookings made by the customer with status filtering and pagination.',
  })
  list(@CurrentUser() user: AuthUser, @Query() query: ListBookingsQueryDto) {
    return this.bookings.listCustomer(user, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get booking details by ID',
    description: 'Returns full booking info including scheduled visits, patient profile, and address details.',
  })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.getCustomerBooking(user, id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create single or recurring booking',
    description: 'Initiates a booking request for an approved caregiver. For recurring bookings, generates scheduled visits across selected weekdays.',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBookingDto) {
    return this.bookings.createCustomerBooking(user, dto);
  }

  @Patch(':id/cancel')
  @ApiOperation({
    summary: 'Cancel booking',
    description: 'Cancels an active booking and its future visits within the permitted cancellation notice window.',
  })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelBookingDto,
  ) {
    return this.bookings.cancelCustomer(user, id, dto);
  }

  @Post(':id/prescriptions')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload doctor prescription or care plan',
    description: 'Attaches a prescription image or PDF to the booking for the assigned caregiver.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'Prescription document (PDF, PNG, JPG, max 10MB)' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  uploadPrescription(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: { originalname: string; mimetype: string; buffer: Buffer },
  ) {
    return this.bookings.uploadPrescription(user, id, file);
  }

  @Get(':id/prescriptions/:documentId')
  @ApiOperation({
    summary: 'Get presigned URL for prescription',
    description: 'Generates a secure temporary URL for the customer to view the prescription.',
  })
  prescriptionUrl(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.bookings.prescriptionUrl(user, id, documentId);
  }

  @Patch(':id/reschedule')
  @ApiOperation({
    summary: 'Reschedule booking visit',
    description: 'Moves a visit to a new date and time window if permitted by notice rules.',
  })
  reschedule(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RescheduleVisitDto,
  ) {
    return this.bookings.rescheduleCustomer(user, id, dto);
  }
}

@ApiTags('Caregiver - Bookings')
@ApiBearerAuth()
@Roles(UserRole.CAREGIVER)
@Controller('caregiver/bookings')
export class CaregiverBookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  @ApiOperation({
    summary: 'List incoming booking requests',
    description: 'Retrieves booking requests assigned to the caregiver with status filtering.',
  })
  list(@CurrentUser() user: AuthUser, @Query() query: ListBookingsQueryDto) {
    return this.bookings.listCaregiver(user, query);
  }

  @Post(':id/accept')
  @ApiOperation({
    summary: 'Accept booking request',
    description: 'Caregiver accepts an incoming booking request within the response window.',
  })
  accept(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.accept(user, id);
  }

  @Post(':id/decline')
  @ApiOperation({
    summary: 'Decline booking request',
    description: 'Caregiver declines a booking request with a reason.',
  })
  decline(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectBookingDto,
  ) {
    return this.bookings.decline(user, id, dto);
  }

  @Get(':id/prescriptions/:documentId')
  @ApiOperation({
    summary: 'Caregiver view booking prescription',
    description: 'Generates a secure presigned URL for the caregiver to inspect the patient prescription.',
  })
  prescriptionUrl(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.bookings.prescriptionUrl(user, id, documentId);
  }
}

@Module({
  imports: [NotificationsModule, PromosModule, PlatformConfigModule],
  controllers: [CustomerBookingsController, CaregiverBookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
