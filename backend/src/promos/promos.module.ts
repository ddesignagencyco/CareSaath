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
} from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PromoDiscountType, UserRole } from '../generated/prisma/client.js';
import { AuditService } from '../common/audit/audit.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PrismaService } from '../common/prisma/prisma.service.js';

export class CreatePromoDto {
  @ApiProperty({ example: 'WELCOME10' })
  @IsString()
  @MinLength(3)
  @MaxLength(24)
  code!: string;

  @ApiProperty({ enum: PromoDiscountType })
  @IsEnum(PromoDiscountType)
  discountType!: PromoDiscountType;

  @ApiProperty({ description: 'PERCENT: 1-100. FIXED: minor units (paisa).' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  discountValue!: number;

  @ApiProperty()
  @IsDateString()
  validFrom!: string;

  @ApiProperty()
  @IsDateString()
  validTo!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  maxUses?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdatePromoDto {
  @ApiPropertyOptional({ enum: PromoDiscountType })
  @IsOptional()
  @IsEnum(PromoDiscountType)
  discountType?: PromoDiscountType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  discountValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  validTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  maxUses?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/**
 * FR-A8: discount calculation. PERCENT discounts are a percentage of the
 * base amount (capped at the amount); FIXED discounts are minor units. The
 * result is clamped so a booking can never go negative.
 */
export function computeDiscount(
  baseAmount: number,
  discountType: PromoDiscountType,
  discountValue: number,
): number {
  const raw =
    discountType === PromoDiscountType.PERCENT
      ? Math.round((baseAmount * discountValue) / 100)
      : discountValue;
  return Math.max(0, Math.min(raw, baseAmount));
}

@Injectable()
export class PromosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async create(admin: AuthUser, dto: CreatePromoDto) {
    const existing = await this.prisma.promoCode.findUnique({ where: { code: dto.code } });
    if (existing) {
      throw new BadRequestException('A promo code with this code already exists');
    }
    const promo = await this.prisma.promoCode.create({
      data: {
        code: dto.code.toUpperCase(),
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        validFrom: new Date(dto.validFrom),
        validTo: new Date(dto.validTo),
        maxUses: dto.maxUses ?? null,
        active: dto.active ?? true,
      },
    });
    await this.audit.log({
      actorId: admin.sub,
      action: 'promo.created',
      entityType: 'PromoCode',
      entityId: promo.id,
      metadata: { code: promo.code },
    });
    return promo;
  }

  async update(admin: AuthUser, id: string, dto: UpdatePromoDto) {
    const promo = await this.prisma.promoCode.findUnique({ where: { id } });
    if (!promo) {
      throw new NotFoundException('Promo code not found');
    }
    const updated = await this.prisma.promoCode.update({
      where: { id },
      data: {
        ...(dto.discountType ? { discountType: dto.discountType } : {}),
        ...(dto.discountValue !== undefined ? { discountValue: dto.discountValue } : {}),
        ...(dto.validFrom ? { validFrom: new Date(dto.validFrom) } : {}),
        ...(dto.validTo ? { validTo: new Date(dto.validTo) } : {}),
        ...(dto.maxUses !== undefined ? { maxUses: dto.maxUses } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
    await this.audit.log({
      actorId: admin.sub,
      action: 'promo.updated',
      entityType: 'PromoCode',
      entityId: id,
    });
    return updated;
  }

  /** Validate a code and return the discount for the given base amount. */
  async quote(code: string, baseAmount: number, now = new Date()) {
    const promo = await this.prisma.promoCode.findUnique({
      where: { code: code.toUpperCase() },
    });
    if (!promo || !promo.active) {
      throw new BadRequestException('Promo code is not valid');
    }
    if (now < promo.validFrom || now > promo.validTo) {
      throw new BadRequestException('Promo code is outside its validity window');
    }
    if (promo.maxUses !== null && promo.usesCount >= promo.maxUses) {
      throw new BadRequestException('Promo code has reached its usage limit');
    }
    return { promo, discountAmount: computeDiscount(baseAmount, promo.discountType, promo.discountValue) };
  }

  /** Increment usage for a redeemed code (best-effort, never fails the booking). */
  async redeem(promoId: string) {
    await this.prisma.promoCode.update({
      where: { id: promoId },
      data: { usesCount: { increment: 1 } },
    });
  }
}

@ApiTags('admin-promos')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/promos')
export class PromosController {
  constructor(private readonly promos: PromosService) {}

  @Get()
  list() {
    return this.promos.list();
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePromoDto) {
    return this.promos.create(user, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePromoDto,
  ) {
    return this.promos.update(user, id, dto);
  }
}

@Module({
  controllers: [PromosController],
  providers: [PromosService],
  exports: [PromosService],
})
export class PromosModule {}
