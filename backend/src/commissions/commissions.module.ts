import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Param,
  ParseEnumPipe,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';
import { Specialty, UserRole } from '../generated/prisma/client.js';
import { AuditService } from '../common/audit/audit.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PrismaService } from '../common/prisma/prisma.service.js';

export class UpdateCommissionRateDto {
  @ApiProperty({ minimum: 0, maximum: 100, description: 'Percentage retained by the platform' })
  @IsNumber()
  @Min(0)
  @Max(100)
  percentage!: number;
}

/**
 * FR-A4: commission is configured per caregiver category. Rates are never
 * deleted — the current effective row is upserted so past payments keep the
 * percentage captured at payment time (ERD §3.5).
 */
@Injectable()
export class CommissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.commissionRate.findMany({ orderBy: { category: 'asc' } });
  }

  async upsert(admin: AuthUser, category: Specialty, dto: UpdateCommissionRateDto) {
    const rate = await this.prisma.commissionRate.upsert({
      where: { category },
      update: { percentage: dto.percentage, effectiveFrom: new Date() },
      create: { category, percentage: dto.percentage },
    });
    await this.audit.log({
      actorId: admin.sub,
      action: 'commission_rate.updated',
      entityType: 'CommissionRate',
      entityId: rate.id,
      metadata: { category, percentage: dto.percentage },
    });
    return rate;
  }
}

@ApiTags('admin-commissions')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/commissions')
export class CommissionsController {
  constructor(private readonly commissions: CommissionsService) {}

  @Get()
  list() {
    return this.commissions.list();
  }

  @Put(':category')
  upsert(
    @CurrentUser() user: AuthUser,
    @Param('category', new ParseEnumPipe(Specialty)) category: Specialty,
    @Body() dto: UpdateCommissionRateDto,
  ) {
    return this.commissions.upsert(user, category, dto);
  }
}

@Module({
  controllers: [CommissionsController],
  providers: [CommissionsService],
  exports: [CommissionsService],
})
export class CommissionsModule {}
