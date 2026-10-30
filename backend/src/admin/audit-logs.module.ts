import {
  Controller,
  Get,
  Injectable,
  Module,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { Prisma, UserRole } from '../generated/prisma/client.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Paginated, paginate } from '../common/dto/pagination.js';
import { PrismaService } from '../common/prisma/prisma.service.js';

export class ListAuditLogsQueryDto {
  @ApiPropertyOptional({ example: 'CaregiverProfile', description: 'Only entries for this entity type' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  entityType?: string;

  @ApiPropertyOptional({ description: 'Only entries for this entity id (combine with entityType)' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  entityId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Only entries by this actor' })
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({ example: 'booking.', description: 'Action prefix, e.g. "booking." or "caregiver.strike"' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  action?: string;

  @ApiPropertyOptional({ example: '2026-10-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  to?: string;

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

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  /** null for system actions (cron jobs, automatic strikes) or a deleted actor. */
  actorName: string | null;
  actorRole: UserRole | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Prisma.JsonValue;
  at: Date;
}

/** Admin read-only view of the append-only audit trail (SRS §6 Auditability). */
@Injectable()
export class AdminAuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListAuditLogsQueryDto): Promise<Paginated<AuditLogEntry>> {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.action ? { action: { startsWith: query.action } } : {}),
      ...(query.from || query.to
        ? {
            at: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { at: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { actor: { select: { fullName: true, role: true } } },
      }),
    ]);
    const items = rows.map(({ actor, ...row }) => ({
      id: row.id,
      actorId: row.actorId,
      actorName: actor?.fullName || null,
      actorRole: actor?.role ?? null,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      metadata: row.metadata,
      at: row.at,
    }));
    return paginate(items, query.page, query.limit, total);
  }
}

@ApiTags('Admin - Safety & Disputes')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/audit-logs')
export class AdminAuditLogsController {
  constructor(private readonly auditLogs: AdminAuditLogsService) {}

  @Get()
  @ApiOperation({
    summary: 'Browse the audit trail',
    description: 'Append-only audit log, newest first: { id, actorId, actorName, actorRole, action, entityType, entityId, metadata, at }. Filter with ?entityType=&entityId=&actorId=&action=(prefix)&from=&to=.',
  })
  list(@Query() query: ListAuditLogsQueryDto) {
    return this.auditLogs.list(query);
  }
}

@Module({
  controllers: [AdminAuditLogsController],
  providers: [AdminAuditLogsService],
  exports: [AdminAuditLogsService],
})
export class AdminAuditLogsModule {}
