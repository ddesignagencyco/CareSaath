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
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  IncidentPriority,
  IncidentStatus,
  Prisma,
  UserRole,
} from '../generated/prisma/client.js';
import { AuditService } from '../common/audit/audit.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Paginated, paginate } from '../common/dto/pagination.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { NotificationsModule, NotificationsService } from '../notifications/notifications.module.js';

export class UpdateIncidentDto {
  @ApiPropertyOptional({ enum: IncidentStatus })
  @IsOptional()
  @IsEnum(IncidentStatus)
  status?: IncidentStatus;

  @ApiPropertyOptional({ enum: IncidentPriority })
  @IsOptional()
  @IsEnum(IncidentPriority)
  priority?: IncidentPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class ListIncidentsQueryDto {
  @ApiPropertyOptional({ enum: IncidentStatus })
  @IsOptional()
  @IsEnum(IncidentStatus)
  status?: IncidentStatus;

  @ApiPropertyOptional({ enum: IncidentPriority })
  @IsOptional()
  @IsEnum(IncidentPriority)
  priority?: IncidentPriority;

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

/**
 * FR-A6: admins triage safety incidents. Every change appends an IncidentEvent
 * so the incident keeps a full audit trail (SRS Auditability).
 */
/** Same relations on the queue and on update responses so clients can swap rows in place. */
const INCIDENT_INCLUDE = {
  reportedBy: { select: { id: true, fullName: true, role: true, phone: true } },
  assignedAdmin: { select: { id: true, fullName: true } },
  events: { orderBy: { at: 'asc' } },
} satisfies Prisma.SafetyIncidentInclude;

@Injectable()
export class AdminSafetyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(query: ListIncidentsQueryDto): Promise<Paginated<unknown>> {
    const where: Prisma.SafetyIncidentWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.safetyIncident.count({ where }),
      this.prisma.safetyIncident.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: INCIDENT_INCLUDE,
      }),
    ]);
    return paginate(items, query.page, query.limit, total);
  }

  async update(admin: AuthUser, id: string, dto: UpdateIncidentDto) {
    const incident = await this.prisma.safetyIncident.findUnique({ where: { id } });
    if (!incident) {
      throw new NotFoundException('Safety incident not found');
    }
    if (!dto.status && !dto.priority && !dto.note) {
      throw new BadRequestException('Provide a status, priority or note to update');
    }
    const changes: string[] = [];
    if (dto.status && dto.status !== incident.status) changes.push(`status:${incident.status}->${dto.status}`);
    if (dto.priority && dto.priority !== incident.priority)
      changes.push(`priority:${incident.priority}->${dto.priority}`);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.safetyIncident.update({
        where: { id },
        data: {
          ...(dto.status ? { status: dto.status } : {}),
          ...(dto.priority ? { priority: dto.priority } : {}),
          ...(dto.status === IncidentStatus.RESOLVED ? { resolvedAt: new Date() } : {}),
          ...(!incident.assignedAdminId ? { assignedAdminId: admin.sub } : {}),
        },
        include: INCIDENT_INCLUDE,
      });
      await tx.incidentEvent.create({
        data: {
          incidentId: id,
          actorId: admin.sub,
          action: changes.length > 0 ? changes.join(',') : 'note',
          note: dto.note ?? null,
        },
      });
      return result;
    });
    await this.audit.log({
      actorId: admin.sub,
      action: 'safety_incident.updated',
      entityType: 'SafetyIncident',
      entityId: id,
      metadata: { changes, note: dto.note },
    });
    await this.notifications.notify({
      userId: incident.reportedById,
      event: 'safety_incident.updated',
      payload: { incidentId: id, status: updated.status, priority: updated.priority },
    });
    return updated;
  }
}

@ApiTags('Admin - Safety & Disputes')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/safety-incidents')
export class AdminSafetyController {
  constructor(private readonly safety: AdminSafetyService) {}

  @Get()
  @ApiOperation({
    summary: 'List safety incidents & SOS alerts',
    description: 'Admin triage queue of reported incidents and SOS triggers filtered by priority and status.',
  })
  list(@Query() query: ListIncidentsQueryDto) {
    return this.safety.list(query);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update incident status and priority',
    description: 'Admin updates incident status (IN_REVIEW, RESOLVED) with escalation notes.',
  })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIncidentDto,
  ) {
    return this.safety.update(user, id, dto);
  }
}

@Module({
  imports: [NotificationsModule],
  controllers: [AdminSafetyController],
  providers: [AdminSafetyService],
  exports: [AdminSafetyService],
})
export class AdminSafetyModule {}
