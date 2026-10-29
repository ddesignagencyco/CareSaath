import {
  Controller,
  Get,
  Injectable,
  Module,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Prisma, UserRole } from '../generated/prisma/client.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Paginated, paginate } from '../common/dto/pagination.js';
import { PrismaService } from '../common/prisma/prisma.service.js';

export class ListCallLogsQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Only calls for this visit' })
  @IsOptional()
  @IsUUID()
  visitId?: string;

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

const CALL_LOG_INCLUDE = {
  caller: { select: { id: true, fullName: true, phone: true, role: true } },
  callee: { select: { id: true, fullName: true, phone: true, role: true } },
} satisfies Prisma.CallLogInclude;

/** Admin read-only audit trail for WebRTC calls, used to investigate safety incidents. */
@Injectable()
export class AdminCallLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListCallLogsQueryDto): Promise<Paginated<unknown>> {
    const where: Prisma.CallLogWhereInput = query.visitId ? { visitId: query.visitId } : {};
    const [total, items] = await this.prisma.$transaction([
      this.prisma.callLog.count({ where }),
      this.prisma.callLog.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: CALL_LOG_INCLUDE,
      }),
    ]);
    return paginate(items, query.page, query.limit, total);
  }
}

@ApiTags('Admin - Safety & Disputes')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/call-logs')
export class AdminCallLogsController {
  constructor(private readonly callLogs: AdminCallLogsService) {}

  @Get()
  @ApiOperation({
    summary: 'Audit WebRTC call history',
    description: 'Lists in-app voice/video calls (caller, callee, status, duration) for safety-incident investigation. Filter with ?visitId=.',
  })
  list(@Query() query: ListCallLogsQueryDto) {
    return this.callLogs.list(query);
  }
}

@Module({
  controllers: [AdminCallLogsController],
  providers: [AdminCallLogsService],
  exports: [AdminCallLogsService],
})
export class AdminCallLogsModule {}
