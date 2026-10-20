import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  BookingStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  UserRole,
  VisitStatus,
} from '../generated/prisma/client.js';
import { AuditService } from '../common/audit/audit.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Paginated, paginate } from '../common/dto/pagination.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { NotificationsModule, NotificationsService } from '../notifications/notifications.module.js';

/**
 * Digital payment methods all start PENDING and settle via a gateway webhook;
 * CASH starts PENDING and settles when the caregiver confirms receipt on-site.
 */
const GATEWAY_METHODS: PaymentMethod[] = [
  PaymentMethod.CARD,
  PaymentMethod.JAZZCASH,
  PaymentMethod.EASYPAISA,
];

export function isGatewayMethod(method: PaymentMethod): boolean {
  return GATEWAY_METHODS.includes(method);
}

/**
 * FR-A4 / TRD §6.5: platform commission is a per-category percentage applied at
 * payment time, then split into the commission and caregiver shares. Amounts are
 * integer minor units (paisa).
 */
export function splitCommission(
  amount: number,
  percentage: number,
): { commissionAmount: number; caregiverAmount: number } {
  const commissionAmount = Math.round((amount * percentage) / 100);
  return { commissionAmount, caregiverAmount: amount - commissionAmount };
}

export class InitiatePaymentDto {
  @ApiProperty()
  @IsString()
  visitId!: string;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  amount?: number;
}

export class CashConfirmationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class GatewayWebhookDto {
  @ApiProperty()
  @IsString()
  gatewayRef!: string;

  @ApiProperty({ enum: ['PAID', 'FAILED'] })
  @IsEnum(PaymentStatus)
  status!: PaymentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  signature?: string;
}

export class ListPaymentsQueryDto {
  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

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
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private paymentInclude() {
    return {
      visit: {
        include: {
          booking: {
            include: {
              patient: { select: { id: true, name: true } },
              customer: { select: { id: true, phone: true, fullName: true } },
            },
          },
        },
      },
      payoutRequest: { select: { id: true, status: true } },
    } satisfies Prisma.PaymentInclude;
  }

  /** Load a visit the customer owns, rejecting anything not payable yet. */
  private async loadPayableVisit(user: AuthUser, visitId: string) {
    const visit = await this.prisma.visit.findFirst({
      where: { id: visitId, booking: { customerId: user.sub } },
      include: { booking: { include: { caregiver: { include: { commissionRate: true } } } } },
    });
    if (!visit) {
      throw new NotFoundException('Visit not found');
    }
    if (visit.booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('The booking must be confirmed before paying');
    }
    if (visit.status === VisitStatus.CANCELLED || visit.status === VisitStatus.DECLINED) {
      throw new BadRequestException('This visit is no longer payable');
    }
    return visit;
  }

  /** FR-C8, TRD §6.5: start a payment for a visit. */
  async initiate(user: AuthUser, dto: InitiatePaymentDto) {
    const visit = await this.loadPayableVisit(user, dto.visitId);
    const existing = await this.prisma.payment.findFirst({
      where: { visitId: visit.id, status: { in: [PaymentStatus.PENDING, PaymentStatus.PAID] } },
    });
    if (existing) {
      throw new BadRequestException(
        existing.status === PaymentStatus.PAID
          ? 'This visit has already been paid'
          : 'A payment for this visit is already in progress',
      );
    }
    const amount = dto.amount ?? visit.booking.rateSnapshot - visit.booking.discountAmount;
    if (amount <= 0) {
      throw new BadRequestException('Payment amount must be positive');
    }
    const percentage = Number(visit.booking.caregiver.commissionRate.percentage);
    const { commissionAmount, caregiverAmount } = splitCommission(amount, percentage);

    const payment = await this.prisma.payment.create({
      data: {
        visitId: visit.id,
        method: dto.method,
        status: PaymentStatus.PENDING,
        amount,
        commissionAmount,
        caregiverAmount,
        gatewayRef: null,
      },
    });
    await this.audit.log({
      actorId: user.sub,
      action: 'payment.initiated',
      entityType: 'Payment',
      entityId: payment.id,
      metadata: { visitId: visit.id, method: dto.method, amount },
    });
    if (isGatewayMethod(dto.method)) {
      // The gateway integration is TBD (TRD §6.5); the ref stands in for the
      // hosted-checkout redirect reference until merchant credentials exist.
      const gatewayRef = `gw_${payment.id}`;
      return this.prisma.payment.update({
        where: { id: payment.id },
        data: { gatewayRef },
      });
    }
    return payment;
  }

  private async markPaid(paymentId: string, source: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        visit: {
          include: {
            booking: {
              include: { customer: { select: { id: true, phone: true } } },
            },
          },
        },
      },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    if (payment.status === PaymentStatus.PAID) {
      return payment;
    }
    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException(`Cannot settle a payment in ${payment.status} state`);
    }
    const updated = await this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: PaymentStatus.PAID, paidAt: new Date() },
    });
    await this.audit.log({
      actorId: null,
      action: 'payment.paid',
      entityType: 'Payment',
      entityId: paymentId,
      metadata: { source, amount: payment.amount },
    });
    await this.notifications.notify({
      userId: payment.visit.booking.customer.id,
      phone: payment.visit.booking.customer.phone,
      event: 'payment.paid',
      payload: { paymentId, visitId: payment.visitId, amount: payment.amount },
      message: `Payment of Rs ${payment.amount / 100} received for your visit.`,
    });
    return updated;
  }

  /** Cash on visit (TRD §6.5): the assigned caregiver confirms receipt. */
  async confirmCash(user: AuthUser, paymentId: string) {
    const profile = await this.prisma.caregiverProfile.findUnique({
      where: { userId: user.sub },
      select: { id: true },
    });
    if (!profile) {
      throw new NotFoundException('Caregiver profile not found');
    }
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, visit: { booking: { caregiverId: profile.id } } },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    if (payment.method !== PaymentMethod.CASH) {
      throw new BadRequestException('Only cash payments are confirmed this way');
    }
    return this.markPaid(paymentId, 'cash');
  }

  /**
   * TRD §6.5: gateway webhook. Idempotent by design — replays return the
   * already-settled record and never move a payment out of a terminal state.
   */
  async handleGatewayWebhook(dto: GatewayWebhookDto) {
    const payment = await this.prisma.payment.findFirst({
      where: { gatewayRef: dto.gatewayRef },
    });
    if (!payment) {
      this.logger.warn(`Webhook for unknown gatewayRef ${dto.gatewayRef}`);
      throw new NotFoundException('Payment not found for gateway reference');
    }
    if (dto.status === PaymentStatus.PAID) {
      return this.markPaid(payment.id, 'gateway');
    }
    if (dto.status === PaymentStatus.FAILED) {
      if (payment.status !== PaymentStatus.PENDING) {
        return payment;
      }
      const updated = await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });
      await this.audit.log({
        actorId: null,
        action: 'payment.failed',
        entityType: 'Payment',
        entityId: payment.id,
        metadata: { gatewayRef: dto.gatewayRef },
      });
      return updated;
    }
    throw new BadRequestException('Unsupported webhook status');
  }

  async listForCustomer(user: AuthUser, query: ListPaymentsQueryDto): Promise<Paginated<unknown>> {
    const where: Prisma.PaymentWhereInput = {
      visit: { booking: { customerId: user.sub } },
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: this.paymentInclude(),
      }),
    ]);
    return paginate(items, query.page, query.limit, total);
  }

  async getForCustomer(user: AuthUser, id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, visit: { booking: { customerId: user.sub } } },
      include: this.paymentInclude(),
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    return payment;
  }
}

@ApiTags('payments')
@ApiBearerAuth()
@Roles(UserRole.CUSTOMER)
@Controller('customer/payments')
export class CustomerPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  initiate(@CurrentUser() user: AuthUser, @Body() dto: InitiatePaymentDto) {
    return this.payments.initiate(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListPaymentsQueryDto) {
    return this.payments.listForCustomer(user, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payments.getForCustomer(user, id);
  }
}

@ApiTags('payments')
@ApiBearerAuth()
@Roles(UserRole.CAREGIVER)
@Controller('caregiver/payments')
export class CaregiverPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post(':id/confirm-cash')
  confirmCash(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payments.confirmCash(user, id);
  }
}

/**
 * Gateway callbacks (FR-C8 / TRD §6.5). Public; signature verification depends
 * on merchant credentials that are still TBD, so the raw body is accepted and
 * settlement is idempotent.
 */
@ApiTags('payments')
@Controller('payments')
export class PaymentWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @ApiHeader({ name: 'x-gateway-signature', required: false })
  @Post('webhook/:provider')
  webhook(@Body() dto: GatewayWebhookDto) {
    return this.payments.handleGatewayWebhook(dto);
  }
}

@Module({
  imports: [NotificationsModule],
  controllers: [
    CustomerPaymentsController,
    CaregiverPaymentsController,
    PaymentWebhookController,
  ],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
