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
  Patch,
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
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { DisputeStatus, Prisma, UserRole } from '../generated/prisma/client.js';
import { AuditService } from '../common/audit/audit.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Paginated, paginate } from '../common/dto/pagination.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { NotificationsModule, NotificationsService } from '../notifications/notifications.module.js';

export class RaiseDisputeDto {
  @ApiProperty()
  @IsString()
  @IsUUID()
  visitId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(5)
  @MaxLength(4000)
  description!: string;
}

export class ResolveDisputeDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  resolutionNote!: string;
}

export class ListDisputesQueryDto {
  @ApiPropertyOptional({ enum: DisputeStatus })
  @IsOptional()
  @IsEnum(DisputeStatus)
  status?: DisputeStatus;

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
export class DisputesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    @Optional() private readonly realtime?: RealtimeService,
  ) {}

  /**
   * FR-A7: either party on a visit may raise a dispute. The customer must own
   * the booking; the caregiver must be the assigned profile.
   */
  async raise(user: AuthUser, dto: RaiseDisputeDto) {
    let visit: { id: string; booking: { customerId: string; caregiverId: string; caregiver: { userId: string } } } | null;
    if (user.role === UserRole.CAREGIVER) {
      const profile = await this.prisma.caregiverProfile.findUnique({
        where: { userId: user.sub },
        select: { id: true },
      });
      if (!profile) {
        throw new NotFoundException('Caregiver profile not found');
      }
      visit = await this.prisma.visit.findFirst({
        where: { id: dto.visitId, booking: { caregiverId: profile.id } },
        include: { booking: { include: { caregiver: { select: { userId: true } } } } },
      });
    } else {
      visit = await this.prisma.visit.findFirst({
        where: { id: dto.visitId, booking: { customerId: user.sub } },
        include: { booking: { include: { caregiver: { select: { userId: true } } } } },
      });
    }
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }
    const open = await this.prisma.dispute.findFirst({
      where: { visitId: visit.id, raisedById: user.sub, status: DisputeStatus.OPEN },
    });
    if (open) {
      throw new BadRequestException('You already have an open dispute for this visit');
    }
    const againstUserId =
      user.role === UserRole.CAREGIVER
        ? visit.booking.customerId
        : visit.booking.caregiver.userId;

    const dispute = await this.prisma.dispute.create({
      data: {
        visitId: visit.id,
        raisedById: user.sub,
        againstUserId,
        description: dto.description,
        status: DisputeStatus.OPEN,
      },
    });
    await this.audit.log({
      actorId: user.sub,
      action: 'dispute.raised',
      entityType: 'Dispute',
      entityId: dispute.id,
      metadata: { visitId: visit.id, againstUserId },
    });
    await this.notifications.notify({
      userId: againstUserId,
      event: 'dispute.raised',
      payload: { disputeId: dispute.id, visitId: visit.id },
      message: 'A dispute was raised on one of your visits. An admin will review it.',
    });
    await this.notifications.notifyAdmins({
      event: 'dispute.raised.admin',
      payload: { disputeId: dispute.id, visitId: visit.id },
      message: 'A new visit dispute is waiting for review.',
    });
    this.realtime?.entityUpdated(
      { users: [user.sub, againstUserId], roles: ['ADMIN'] },
      { type: 'dispute', id: dispute.id, action: 'raised', status: dispute.status },
    );
    return dispute;
  }

  private disputeInclude() {
    return {
      raisedBy: { select: { id: true, fullName: true, role: true } },
      againstUser: { select: { id: true, fullName: true, role: true } },
      visit: { select: { id: true, bookingId: true, status: true, scheduledDate: true } },
    } satisfies Prisma.DisputeInclude;
  }

  listMine(user: AuthUser): Promise<unknown[]> {
    return this.prisma.dispute.findMany({
      where: { OR: [{ raisedById: user.sub }, { againstUserId: user.sub }] },
      orderBy: { createdAt: 'desc' },
      include: { visit: { select: { id: true, bookingId: true, status: true, scheduledDate: true } } },
    });
  }

  async listAll(query: ListDisputesQueryDto): Promise<Paginated<unknown>> {
    const where: Prisma.DisputeWhereInput = query.status ? { status: query.status } : {};
    const [total, items] = await this.prisma.$transaction([
      this.prisma.dispute.count({ where }),
      this.prisma.dispute.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: this.disputeInclude(),
      }),
    ]);
    return paginate(items, query.page, query.limit, total);
  }

  /** FR-A7: admin mediation closes the dispute with a resolution note. */
  async resolve(admin: AuthUser, id: string, dto: ResolveDisputeDto) {
    const dispute = await this.prisma.dispute.findUnique({ where: { id } });
    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }
    if (dispute.status === DisputeStatus.RESOLVED) {
      throw new BadRequestException('This dispute is already resolved');
    }
    const updated = await this.prisma.dispute.update({
      where: { id },
      data: {
        status: DisputeStatus.RESOLVED,
        resolutionNote: dto.resolutionNote,
        resolvedById: admin.sub,
        resolvedAt: new Date(),
      },
      include: this.disputeInclude(),
    });
    await this.audit.log({
      actorId: admin.sub,
      action: 'dispute.resolved',
      entityType: 'Dispute',
      entityId: id,
      metadata: { resolutionNote: dto.resolutionNote },
    });
    for (const userId of [dispute.againstUserId]) {
      await this.notifications.notify({
        userId,
        event: 'dispute.resolved',
        payload: { disputeId: id },
        message: 'A dispute involving you was resolved by an admin.',
      });
    }
    this.realtime?.entityUpdated(
      { users: [dispute.raisedById, dispute.againstUserId], roles: ['ADMIN'] },
      { type: 'dispute', id, action: 'resolved', status: DisputeStatus.RESOLVED },
    );
    await this.notifications.notify({
      userId: dispute.raisedById,
      event: 'dispute.resolved',
      payload: { disputeId: id },
    });
    return updated;
  }
}

@ApiTags('Disputes')
@ApiBearerAuth()
@Roles(UserRole.CUSTOMER, UserRole.CAREGIVER)
@Controller('disputes')
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Post()
  @ApiOperation({
    summary: 'Raise a dispute on a visit',
    description: 'Customer or caregiver raises a dispute regarding a completed or cancelled visit.',
  })
  raise(@CurrentUser() user: AuthUser, @Body() dto: RaiseDisputeDto) {
    return this.disputes.raise(user, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List my disputes',
    description: 'Retrieves disputes raised by or involving the authenticated user.',
  })
  listMine(@CurrentUser() user: AuthUser) {
    return this.disputes.listMine(user);
  }
}

@ApiTags('Admin - Safety & Disputes')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/disputes')
export class AdminDisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Get()
  @ApiOperation({
    summary: 'List platform disputes queue',
    description: 'Admin overview of disputes with status filtering and pagination.',
  })
  list(@Query() query: ListDisputesQueryDto) {
    return this.disputes.listAll(query);
  }

  @Patch(':id/resolve')
  @ApiOperation({
    summary: 'Resolve dispute',
    description: 'Admin resolves a dispute with a documented mediation decision note.',
  })
  resolve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveDisputeDto,
  ) {
    return this.disputes.resolve(user, id, dto);
  }
}

@Module({
  imports: [NotificationsModule],
  controllers: [DisputesController, AdminDisputesController],
  providers: [DisputesService],
  exports: [DisputesService],
})
export class DisputesModule {}
