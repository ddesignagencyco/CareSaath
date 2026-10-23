import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { AuditService } from '../common/audit/audit.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PrismaService } from '../common/prisma/prisma.service.js';

export class AvailabilityRuleDto {
  @ApiProperty({
    example: 1,
    minimum: 0,
    maximum: 6,
    description: 'Day of week: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday',
  })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @ApiProperty({ example: '09:00', description: 'Start time in 24h format (HH:mm)' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @ApiProperty({ example: '17:00', description: 'End time in 24h format (HH:mm)' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;
}

export class SetAvailabilityDto {
  @ApiProperty({
    type: [AvailabilityRuleDto],
    description: 'Weekly recurring availability schedule rules',
  })
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(7 * 4)
  @ValidateNested({ each: true })
  @Type(() => AvailabilityRuleDto)
  rules!: AvailabilityRuleDto[];
}

export class BlockDto {
  @ApiProperty({ example: '2026-11-01', description: 'Block start date (YYYY-MM-DD)' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: '2026-11-03', description: 'Block end date (YYYY-MM-DD)' })
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional({ example: 'Family wedding / out of town', description: 'Optional reason for block' })
  @IsOptional()
  @IsString()
  reason?: string;
}

/** Blocks are stored as UTC-midnight dates; "today" must be the calendar day in Pakistan (UTC+5). */
export function todayInPakistan(now = new Date()): Date {
  const pkt = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  return new Date(`${pkt.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async caregiverId(user: AuthUser): Promise<string> {
    const profile = await this.prisma.caregiverProfile.findUnique({
      where: { userId: user.sub },
      select: { id: true },
    });
    if (!profile) {
      throw new NotFoundException('Caregiver profile not found');
    }
    return profile.id;
  }

  async get(user: AuthUser) {
    const caregiverId = await this.caregiverId(user);
    const [rules, blocks] = await this.prisma.$transaction([
      this.prisma.availabilityRule.findMany({
        where: { caregiverId },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      }),
      this.prisma.availabilityBlock.findMany({
        where: { caregiverId, endDate: { gte: todayInPakistan() } },
        orderBy: { startDate: 'asc' },
      }),
    ]);
    return { rules, blocks };
  }

  /** FR-CG4: full replace of the weekly availability set. */
  async setRules(user: AuthUser, dto: SetAvailabilityDto) {
    const caregiverId = await this.caregiverId(user);
    const seen = new Set<string>();
    for (const rule of dto.rules) {
      if (rule.startTime >= rule.endTime) {
        throw new BadRequestException(`Invalid window for day ${rule.dayOfWeek}: start must be before end`);
      }
      const slot = `${rule.dayOfWeek}@${rule.startTime}`;
      if (seen.has(slot)) {
        throw new BadRequestException(
          `Duplicate window for day ${rule.dayOfWeek} starting at ${rule.startTime}`,
        );
      }
      seen.add(slot);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.availabilityRule.deleteMany({ where: { caregiverId } });
      if (dto.rules.length > 0) {
        await tx.availabilityRule.createMany({
          data: dto.rules.map((r) => ({
            caregiverId,
            dayOfWeek: r.dayOfWeek,
            startTime: r.startTime,
            endTime: r.endTime,
          })),
        });
      }
    });
    await this.audit.log({
      actorId: user.sub,
      action: 'caregiver.availability.set',
      entityType: 'CaregiverProfile',
      entityId: caregiverId,
      metadata: { rules: dto.rules.length },
    });
    return this.get(user);
  }

  async addBlock(user: AuthUser, dto: BlockDto) {
    const caregiverId = await this.caregiverId(user);
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end < start) {
      throw new BadRequestException('endDate must be on or after startDate');
    }
    const block = await this.prisma.availabilityBlock.create({
      data: { caregiverId, startDate: start, endDate: end, reason: dto.reason ?? null },
    });
    await this.audit.log({
      actorId: user.sub,
      action: 'caregiver.availability.blocked',
      entityType: 'AvailabilityBlock',
      entityId: block.id,
    });
    return block;
  }

  async removeBlock(user: AuthUser, id: string) {
    const caregiverId = await this.caregiverId(user);
    const block = await this.prisma.availabilityBlock.findFirst({
      where: { id, caregiverId },
    });
    if (!block) {
      throw new NotFoundException('Block not found');
    }
    await this.prisma.availabilityBlock.delete({ where: { id } });
    return { ok: true as const };
  }
}

@ApiTags('Caregiver - Availability')
@ApiBearerAuth()
@Roles('CAREGIVER')
@Controller('caregiver/availability')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get()
  @ApiOperation({
    summary: 'Get caregiver schedule rules and blocked dates',
    description: 'Returns the recurring weekly schedule and any specific blackout dates for the caregiver.',
  })
  get(@CurrentUser() user: AuthUser) {
    return this.availability.get(user);
  }

  @Put()
  @ApiOperation({
    summary: 'Set weekly availability rules',
    description: 'Overwrites existing recurring availability rules for days of the week and working hours.',
  })
  set(@CurrentUser() user: AuthUser, @Body() dto: SetAvailabilityDto) {
    return this.availability.setRules(user, dto);
  }

  @Post('blocks')
  @ApiOperation({
    summary: 'Add an unavailable calendar block',
    description: 'Blacks out a date range so no visits can be booked during that time.',
  })
  addBlock(@CurrentUser() user: AuthUser, @Body() dto: BlockDto) {
    return this.availability.addBlock(user, dto);
  }

  @Delete('blocks/:id')
  @ApiOperation({
    summary: 'Remove an unavailable calendar block',
    description: 'Deletes a blackout date range by ID.',
  })
  removeBlock(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.availability.removeBlock(user, id);
  }
}

@Module({
  controllers: [AvailabilityController],
  providers: [AvailabilityService],
})
export class AvailabilityModule {}
