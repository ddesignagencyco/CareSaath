import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
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
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { BookingStatus, PromoDiscountType, UserRole } from '../generated/prisma/client.js';
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

  @ApiPropertyOptional({ nullable: true, description: 'Maximum redemptions; null or omitted means unlimited' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  maxUses?: number | null;

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

  @ApiPropertyOptional({ nullable: true, description: 'Maximum redemptions; null clears the limit (unlimited)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  maxUses?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class PromoQuoteQueryDto {
  @ApiProperty({ example: 'WELCOME10' })
  @IsString()
  @MinLength(1)
  @MaxLength(24)
  code!: string;

  @ApiProperty({ format: 'uuid', description: 'Caregiver whose visit rate the discount is applied to' })
  @IsUUID()
  caregiverId!: string;
}

/** A PERCENT promo is capped at 100 and the validity window must be forward in time. */
function assertPromoRules(rule: {
  discountType: PromoDiscountType;
  discountValue: number;
  validFrom: Date;
  validTo: Date;
}) {
  if (rule.discountType === PromoDiscountType.PERCENT && rule.discountValue > 100) {
    throw new BadRequestException('A percentage discount cannot exceed 100');
  }
  if (rule.validTo <= rule.validFrom) {
    throw new BadRequestException('validTo must be after validFrom');
  }
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
    const code = dto.code.trim().toUpperCase();
    assertPromoRules({
      discountType: dto.discountType,
      discountValue: dto.discountValue,
      validFrom: new Date(dto.validFrom),
      validTo: new Date(dto.validTo),
    });
    const existing = await this.prisma.promoCode.findUnique({ where: { code } });
    if (existing) {
      throw new ConflictException('A promo code with this code already exists');
    }
    const promo = await this.prisma.promoCode.create({
      data: {
        code,
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
    assertPromoRules({
      discountType: dto.discountType ?? promo.discountType,
      discountValue: dto.discountValue ?? promo.discountValue,
      validFrom: dto.validFrom ? new Date(dto.validFrom) : promo.validFrom,
      validTo: dto.validTo ? new Date(dto.validTo) : promo.validTo,
    });
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
  /** Customer-facing preview of what a code would take off a caregiver's visit rate. */
  async previewForCaregiver(customerId: string, query: PromoQuoteQueryDto) {
    const caregiver = await this.prisma.caregiverProfile.findFirst({
      where: { id: query.caregiverId, verificationStatus: 'APPROVED', user: { status: 'ACTIVE' } },
      select: { ratePerVisit: true },
    });
    if (!caregiver) {
      throw new NotFoundException('Caregiver not available');
    }
    const { promo, discountAmount } = await this.quote(
      query.code,
      caregiver.ratePerVisit,
      new Date(),
      customerId,
    );
    return {
      code: promo.code,
      discountAmount,
      perVisitAfterDiscount: caregiver.ratePerVisit - discountAmount,
    };
  }

  async quote(code: string, baseAmount: number, now = new Date(), customerId?: string) {
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
    if (customerId) {
      const alreadyUsed = await this.prisma.booking.count({
        where: {
          customerId,
          promoCodeId: promo.id,
          status: { notIn: [BookingStatus.CANCELLED, BookingStatus.DECLINED] },
        },
      });
      if (alreadyUsed > 0) {
        throw new BadRequestException('You have already used this promo code');
      }
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

@ApiTags('Admin - Promos & Config')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/promos')
export class PromosController {
  constructor(private readonly promos: PromosService) {}

  @Get()
  @ApiOperation({
    summary: 'List promo codes',
    description: 'Retrieves all promo discount codes with valid date windows and usage statistics.',
  })
  list() {
    return this.promos.list();
  }

  @Post()
  @ApiOperation({
    summary: 'Create promo discount code',
    description: 'Creates a percentage or fixed-amount discount promo code.',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePromoDto) {
    return this.promos.create(user, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update promo code',
    description: 'Modifies valid dates, active status, or max uses for a promo code.',
  })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePromoDto,
  ) {
    return this.promos.update(user, id, dto);
  }
}

@ApiTags('Customer - Bookings')
@ApiBearerAuth()
@Roles(UserRole.CUSTOMER)
@Controller('promos')
export class PromoQuoteController {
  constructor(private readonly promos: PromosService) {}

  @Get('quote')
  @ApiOperation({
    summary: 'Preview a promo code discount',
    description:
      'Validates a promo code for the signed-in customer and returns the per-visit discount for the given caregiver, so the review step can show the final price before booking. The discount applies to every visit of the booking; the code is redeemed once per booking.',
  })
  quote(@CurrentUser() user: AuthUser, @Query() query: PromoQuoteQueryDto) {
    return this.promos.previewForCaregiver(user.sub, query);
  }
}

@Module({
  controllers: [PromosController, PromoQuoteController],
  providers: [PromosService],
  exports: [PromosService],
})
export class PromosModule {}
