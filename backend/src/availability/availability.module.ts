import {
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
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
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
} from 'class-validator';
import { AuditService } from '../common/audit/audit.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { PrismaService } from '../common/prisma/prisma.service.js';

class AvailabilityRuleDto {
  @ApiProperty({ minimum: 0, maximum: 6 })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @ApiProperty({ example: '09:00' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @ApiProperty({ example: '17:00' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;
}

class SetAvailabilityDto {
  @ApiProperty({ type: [AvailabilityRuleDto] })
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(7 * 4)
  rules!: AvailabilityRuleDto[];
}

class BlockDto {
  @ApiProperty()
  @IsDateString()
  startDate!: string;

  @ApiProperty()
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
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
        where: { caregiverId, endDate: { gte: new Date() } },
        orderBy: { startDate: 'asc' },
      }),
    ]);
    return { rules, blocks };
  }

  /** FR-CG4: full replace of the weekly availability set. */
  async setRules(user: AuthUser, dto: SetAvailabilityDto) {
    const caregiverId = await this.caregiverId(user);
    for (const rule of dto.rules) {
      if (rule.startTime >= rule.endTime) {
        throw new NotFoundException(`Invalid window for day ${rule.dayOfWeek}: start must be before end`);
      }
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
      throw new NotFoundException('endDate must be on or after startDate');
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

@ApiTags('availability')
@ApiBearerAuth()
@Controller('caregiver/availability')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.availability.get(user);
  }

  @Put()
  set(@CurrentUser() user: AuthUser, @Body() dto: SetAvailabilityDto) {
    return this.availability.setRules(user, dto);
  }

  @Post('blocks')
  addBlock(@CurrentUser() user: AuthUser, @Body() dto: BlockDto) {
    return this.availability.addBlock(user, dto);
  }

  @Delete('blocks/:id')
  removeBlock(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.availability.removeBlock(user, id);
  }
}

@Module({
  controllers: [AvailabilityController],
  providers: [AvailabilityService],
})
export class AvailabilityModule {}
