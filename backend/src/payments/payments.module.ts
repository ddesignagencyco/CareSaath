import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
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

/** A gateway payment still PENDING after this long is abandoned (set to FAILED) on the next attempt. */
const GATEWAY_PENDING_TTL_MINUTES = Number(process.env['PAYMENT_PENDING_TTL_MINUTES'] ?? 30);

/** Hosted-checkout base; the gateway integration is TBD (TRD §6.5) until merchant credentials exist. */
function checkoutUrlFor(method: PaymentMethod, gatewayRef: string): string {
  const base = process.env['PAYMENT_CHECKOUT_BASE_URL'] ?? 'https://checkout.caresaath.pk';
  return `${base.replace(/\/+$/, '')}/${method.toLowerCase()}/${encodeURIComponent(gatewayRef)}`;
}

const WEBHOOK_PROVIDERS = ['card', 'jazzcash', 'easypaisa'];

/**
 * Webhook authenticity (TRD §6.5). The gateway signs `<gatewayRef>:<status>` with
 * HMAC-SHA256 (hex) using a shared secret: PAYMENT_WEBHOOK_SECRET_<PROVIDER>, or
 * PAYMENT_WEBHOOK_SECRET for all providers. With no secret configured, webhooks
 * are accepted in development but refused in production (fail closed).
 */
export function verifyWebhookSignature(
  provider: string,
  gatewayRef: string,
  status: string,
  signature: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const secret =
    env[`PAYMENT_WEBHOOK_SECRET_${provider.toUpperCase()}`] ?? env['PAYMENT_WEBHOOK_SECRET'];
  if (!secret) {
    if (env['NODE_ENV'] === 'production') {
      throw new ServiceUnavailableException('Payment webhook secret is not configured');
    }
    return;
  }
  const expected = createHmac('sha256', secret).update(`${gatewayRef}:${status}`).digest();
  const given = Buffer.from(signature ?? '', 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new UnauthorizedException('Invalid webhook signature');
  }
}

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
  @ApiProperty({ format: 'uuid', example: 'v1b2c3d4-e5f6-7890-abcd-ef1234567890', description: 'Visit UUID to pay for' })
  @IsUUID()
  visitId!: string;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.JAZZCASH, description: 'Selected payment method (CASH, JAZZCASH, EASYPAISA, CARD)' })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;
}

export class CashConfirmationDto {
  @ApiPropertyOptional({ example: 'Received PKR 600 in cash from customer.', description: 'Receipt note' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class GatewayWebhookDto {
  @ApiProperty({ example: 'JC-TRX-987654321', description: 'Gateway transaction reference' })
  @IsString()
  gatewayRef!: string;

  @ApiProperty({ enum: ['PAID', 'FAILED'], example: 'PAID', description: 'Payment settlement outcome' })
  @IsEnum(PaymentStatus)
  status!: PaymentStatus;

  @ApiPropertyOptional({ example: 'sig_a98b7c6d5e4f', description: 'HMAC gateway signature' })
  @IsOptional()
  @IsString()
  signature?: string;
}

export class ListPaymentsQueryDto {
  @ApiPropertyOptional({ enum: PaymentStatus, description: 'Filter by payment status' })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional({ format: 'uuid', description: 'Only payments for this visit' })
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
      include: {
        booking: {
          include: {
            caregiver: {
              include: {
                commissionRate: true,
                user: { select: { id: true, phone: true } },
              },
            },
          },
        },
      },
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

  /** Abandon gateway payments left PENDING past the TTL so they stop blocking the visit. */
  private async expireStaleGatewayPayments(visitId: string) {
    const cutoff = new Date(Date.now() - GATEWAY_PENDING_TTL_MINUTES * 60 * 1000);
    await this.prisma.payment.updateMany({
      where: {
        visitId,
        status: PaymentStatus.PENDING,
        method: { in: GATEWAY_METHODS },
        createdAt: { lt: cutoff },
      },
      data: { status: PaymentStatus.FAILED },
    });
  }

  /**
   * FR-C8, TRD §6.5: start a payment for a visit. The amount is always computed
   * server-side from the booking's rate snapshot minus its discount. Gateway
   * methods return `{ payment, checkoutUrl }`; cash returns the payment row.
   */
  async initiate(user: AuthUser, dto: InitiatePaymentDto) {
    const visit = await this.loadPayableVisit(user, dto.visitId);
    await this.expireStaleGatewayPayments(visit.id);
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
    const amount = visit.booking.rateSnapshot - visit.booking.discountAmount;
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
      // hosted-checkout reference until merchant credentials exist.
      const gatewayRef = `gw_${payment.id}`;
      const withRef = await this.prisma.payment.update({
        where: { id: payment.id },
        data: { gatewayRef },
      });
      return { payment: withRef, checkoutUrl: checkoutUrlFor(dto.method, gatewayRef) };
    }
    const caregiverUser = visit.booking.caregiver.user;
    await this.notifications.notify({
      userId: caregiverUser.id,
      phone: caregiverUser.phone,
      event: 'payment.cash.initiated',
      payload: { paymentId: payment.id, visitId: visit.id, amount },
      message: `The customer will pay Rs ${amount / 100} in cash for your visit. Confirm once you have received it.`,
    });
    return payment;
  }

  /** The customer abandons a payment that is still PENDING so another method can be tried. */
  async cancel(user: AuthUser, id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, visit: { booking: { customerId: user.sub } } },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException(`Only a pending payment can be cancelled (this one is ${payment.status})`);
    }
    const updated = await this.prisma.payment.update({
      where: { id },
      data: { status: PaymentStatus.FAILED },
    });
    await this.audit.log({
      actorId: user.sub,
      action: 'payment.cancelled',
      entityType: 'Payment',
      entityId: id,
      metadata: { method: payment.method },
    });
    return updated;
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
      ...(query.visitId ? { visitId: query.visitId } : {}),
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

@ApiTags('Customer - Payments')
@ApiBearerAuth()
@Roles(UserRole.CUSTOMER)
@Controller('customer/payments')
export class CustomerPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @ApiOperation({
    summary: 'Initiate visit payment',
    description: 'Creates a payment for a visit. The amount is always the booking rate minus its discount. Cash returns the payment row; CARD / JAZZCASH / EASYPAISA return { payment, checkoutUrl } for the hosted checkout.',
  })
  initiate(@CurrentUser() user: AuthUser, @Body() dto: InitiatePaymentDto) {
    return this.payments.initiate(user, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List customer payment receipts',
    description: 'Retrieves history of customer payment records with status and pagination.',
  })
  list(@CurrentUser() user: AuthUser, @Query() query: ListPaymentsQueryDto) {
    return this.payments.listForCustomer(user, query);
  }

  @Patch(':id/cancel')
  @ApiOperation({
    summary: 'Cancel a pending payment',
    description: 'Abandons a payment that is still PENDING (sets it to FAILED) so another method can be used for the visit. Gateway payments also expire automatically after PAYMENT_PENDING_TTL_MINUTES (default 30).',
  })
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payments.cancel(user, id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get payment receipt details',
    description: 'Retrieves payment amount, commission share, gateway reference, and status.',
  })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payments.getForCustomer(user, id);
  }
}

@ApiTags('Caregiver - Payments')
@ApiBearerAuth()
@Roles(UserRole.CAREGIVER)
@Controller('caregiver/payments')
export class CaregiverPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post(':id/confirm-cash')
  @ApiOperation({
    summary: 'Confirm cash collection on-site',
    description: 'Caregiver confirms receipt of cash-on-visit from the customer, transitioning payment to PAID.',
  })
  confirmCash(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payments.confirmCash(user, id);
  }
}

@ApiTags('System & Webhooks')
@Controller('payments')
export class PaymentWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @ApiHeader({
    name: 'x-gateway-signature',
    required: false,
    description: 'Hex HMAC-SHA256 of "<gatewayRef>:<status>" using the provider webhook secret. Required whenever a secret is configured (always in production). May also be sent as "signature" in the body.',
  })
  @Post('webhook/:provider')
  @ApiOperation({
    summary: 'Payment gateway webhook callback',
    description: 'Receives asynchronous payment notifications from JazzCash, Easypaisa, or Card processors. Idempotent settlement.',
  })
  webhook(
    @Param('provider') provider: string,
    @Body() dto: GatewayWebhookDto,
    @Headers('x-gateway-signature') headerSignature?: string,
  ) {
    if (!WEBHOOK_PROVIDERS.includes(provider.toLowerCase())) {
      throw new NotFoundException('Unknown payment provider');
    }
    verifyWebhookSignature(provider, dto.gatewayRef, dto.status, headerSignature ?? dto.signature);
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
