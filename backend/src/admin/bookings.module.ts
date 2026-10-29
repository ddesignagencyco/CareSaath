import {
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { BookingStatus, Prisma, UserRole, VisitStatus } from '../generated/prisma/client.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Paginated, paginate } from '../common/dto/pagination.js';
import { PrismaService } from '../common/prisma/prisma.service.js';

export class ListAdminBookingsQueryDto {
  @ApiPropertyOptional({ enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @ApiPropertyOptional({ description: 'true: only ASAP (isImmediate) bookings' })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  isImmediate?: boolean;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  caregiverId?: string;

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

export class ListAdminVisitsQueryDto {
  @ApiPropertyOptional({ enum: VisitStatus })
  @IsOptional()
  @IsEnum(VisitStatus)
  status?: VisitStatus;

  @ApiPropertyOptional({ format: 'uuid', description: 'Only visits for this booking' })
  @IsOptional()
  @IsUUID()
  bookingId?: string;

  @ApiPropertyOptional({ example: '2026-10-25', description: 'Only visits scheduled on or after this date' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31', description: 'Only visits scheduled on or before this date' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sort: 'asc' | 'desc' = 'desc';

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

const ADMIN_BOOKING_INCLUDE = {
  customer: { select: { id: true, fullName: true, phone: true } },
  caregiver: { select: { id: true, specialty: true, user: { select: { fullName: true } } } },
  patient: { select: { id: true, name: true, relationship: true } },
  address: { select: { id: true, addressLine: true, city: true } },
  visits: { select: { id: true, status: true, scheduledDate: true } },
} satisfies Prisma.BookingInclude;

const ADMIN_VISIT_INCLUDE = {
  booking: {
    select: {
      id: true,
      status: true,
      isImmediate: true,
      cancelledAt: true,
      cancelledById: true,
      cancelReason: true,
      customer: { select: { id: true, fullName: true, phone: true } },
      caregiver: { select: { id: true, specialty: true, user: { select: { fullName: true } } } },
      address: { select: { id: true, addressLine: true, city: true } },
    },
  },
  statusHistory: { orderBy: { at: 'asc' as const } },
} satisfies Prisma.VisitInclude;

/**
 * Admin read-only bookings/visits browser (pre-prod QA gap: operators had no
 * admin/* endpoint to look up a booking/visit, ASAP bookings, GPS check-in/out,
 * or cancellations — they could only see what customers/caregivers see).
 */
@Injectable()
export class AdminBookingsService {
  constructor(private readonly prisma: PrismaService) {}

  async listBookings(query: ListAdminBookingsQueryDto): Promise<Paginated<unknown>> {
    const where: Prisma.BookingWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.isImmediate !== undefined ? { isImmediate: query.isImmediate } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.caregiverId ? { caregiverId: query.caregiverId } : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: ADMIN_BOOKING_INCLUDE,
      }),
    ]);
    return paginate(items, query.page, query.limit, total);
  }

  async getBooking(id: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: ADMIN_BOOKING_INCLUDE,
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    return booking;
  }

  async listVisits(query: ListAdminVisitsQueryDto): Promise<Paginated<unknown>> {
    const scheduledDate: Prisma.DateTimeFilter = {};
    if (query.from) scheduledDate.gte = new Date(query.from);
    if (query.to) scheduledDate.lte = new Date(query.to);
    const where: Prisma.VisitWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.bookingId ? { bookingId: query.bookingId } : {}),
      ...(Object.keys(scheduledDate).length > 0 ? { scheduledDate } : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.visit.count({ where }),
      this.prisma.visit.findMany({
        where,
        orderBy: { scheduledDate: query.sort },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: ADMIN_VISIT_INCLUDE,
      }),
    ]);
    return paginate(items, query.page, query.limit, total);
  }

  async getVisit(id: string) {
    const visit = await this.prisma.visit.findUnique({
      where: { id },
      include: ADMIN_VISIT_INCLUDE,
    });
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }
    return visit;
  }
}

@ApiTags('Admin - Bookings & Visits')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/bookings')
export class AdminBookingsController {
  constructor(private readonly service: AdminBookingsService) {}

  @Get()
  @ApiOperation({
    summary: 'Browse all bookings',
    description: 'Operator lookup of any booking, filterable by status, ASAP (isImmediate), customer, or caregiver.',
  })
  list(@Query() query: ListAdminBookingsQueryDto) {
    return this.service.listBookings(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'View a booking',
    description: 'Full booking detail including customer, caregiver, address, and its visits, for operator lookup.',
  })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getBooking(id);
  }
}

@ApiTags('Admin - Bookings & Visits')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/visits')
export class AdminVisitsController {
  constructor(private readonly service: AdminBookingsService) {}

  @Get()
  @ApiOperation({
    summary: 'Browse all visits',
    description: 'Operator lookup of any visit (timeline, GPS check-in/out, cancellation), filterable by status, booking, or date range.',
  })
  list(@Query() query: ListAdminVisitsQueryDto) {
    return this.service.listVisits(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'View a visit',
    description: 'Full visit detail: status timeline, GPS check-in/out, and the parent booking (including cancellation reason if cancelled).',
  })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getVisit(id);
  }
}

@Module({
  controllers: [AdminBookingsController, AdminVisitsController],
  providers: [AdminBookingsService],
  exports: [AdminBookingsService],
})
export class AdminBookingsModule {}
