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
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
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
  Prisma,
  UserRole,
  VisitStatus,
} from '../generated/prisma/client.js';
import { AuditService } from '../common/audit/audit.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Paginated, paginate } from '../common/dto/pagination.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { NotificationsModule, NotificationsService } from '../notifications/notifications.module.js';

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
  @ApiPropertyOptional({ enum: CheckMethod, default: CheckMethod.GPS })
  @IsOptional()
  @IsEnum(CheckMethod)
  method?: CheckMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lng?: number;
}

export class VisitNoteDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  summary!: string;
}

export class ListVisitsQueryDto {
  @ApiPropertyOptional({ enum: VisitStatus })
  @IsOptional()
  @IsEnum(VisitStatus)
  status?: VisitStatus;

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
export class VisitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
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
    return visit;
  }

  private async loadForCustomer(user: AuthUser, id: string) {
    const visit = await this.prisma.visit.findFirst({
      where: { id, booking: { customerId: user.sub } },
      include: this.visitInclude(),
    });
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }
    return visit;
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

  /** FR-CG7: check in with GPS or OTP confirmation. */
  async checkIn(user: AuthUser, id: string, dto: CheckInDto) {
    const method = dto.method ?? CheckMethod.GPS;
    if (method === CheckMethod.GPS && (dto.lat === undefined || dto.lng === undefined)) {
      throw new BadRequestException('GPS check-in requires lat and lng');
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

@ApiTags('caregiver-visits')
@ApiBearerAuth()
@Roles(UserRole.CAREGIVER)
@Controller('caregiver/visits')
export class CaregiverVisitsController {
  constructor(private readonly visits: VisitsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListVisitsQueryDto) {
    return this.visits.listCaregiver(user, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.visits.getCaregiver(user, id);
  }

  @Post(':id/en-route')
  enRoute(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.visits.enRoute(user, id);
  }

  @Post(':id/check-in')
  checkIn(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CheckInDto,
  ) {
    return this.visits.checkIn(user, id, dto);
  }

  @Post(':id/check-out')
  checkOut(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CheckInDto,
  ) {
    return this.visits.checkOut(user, id, dto);
  }

  @Post(':id/note')
  note(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VisitNoteDto,
  ) {
    return this.visits.submitNote(user, id, dto);
  }
}

@ApiTags('customer-visits')
@ApiBearerAuth()
@Roles(UserRole.CUSTOMER, UserRole.ADMIN)
@Controller('customer/visits')
export class CustomerVisitsController {
  constructor(private readonly visits: VisitsService) {}

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.visits.getCustomer(user, id);
  }
}

@Module({
  imports: [NotificationsModule],
  controllers: [CaregiverVisitsController, CustomerVisitsController],
  providers: [VisitsService],
  exports: [VisitsService],
})
export class VisitsModule {}
