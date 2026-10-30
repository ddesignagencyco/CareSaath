import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Optional,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
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
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import type Stripe from 'stripe';
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
import { RealtimeService } from '../realtime/realtime.service.js';
import { paymentReceiptDocument, paymentReceiptNumber } from '../receipts/receipt-data.js';
import type { ReceiptAudience } from '../receipts/receipt-data.js';
import { buildReceiptPdf } from '../receipts/receipt-pdf.js';
import { sendPdf } from '../receipts/send-pdf.js';
import type { PdfFile } from '../receipts/send-pdf.js';
import { StripeService } from './stripe.service.js';

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

/** Stripe rejects checkouts below ~US$0.50 (about PKR 140); configurable in whole PKR. */
const STRIPE_MIN_CHARGE_PKR = Number(process.env['STRIPE_MIN_CHARGE_PKR'] ?? 140);

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

  @ApiPropertyOptional({ example: 'Fatima', description: 'Free-text search: patient name, caregiver name, or amount (PKR or paisa)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

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
    @Optional() private readonly stripe?: StripeService,
    @Optional() private readonly realtime?: RealtimeService,
  ) {}

  /** Tell the customer, the caregiver and the admins that a payment changed. */
  private async emitPayment(paymentId: string, action: string, status: PaymentStatus) {
    if (!this.realtime) return;
    const parties = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        visitId: true,
        visit: { select: { booking: { select: { customerId: true, caregiver: { select: { userId: true } } } } } },
      },
    });
    if (!parties) return;
    this.realtime.entityUpdated(
      {
        users: [parties.visit.booking.customerId, parties.visit.booking.caregiver.userId],
        roles: ['ADMIN'],
      },
      { type: 'payment', id: paymentId, action, status, data: { visitId: parties.visitId } },
    );
  }

  /** Card payments go through Stripe whenever it is configured. */
  private usesStripe(method: PaymentMethod): boolean {
    return method === PaymentMethod.CARD && Boolean(this.stripe?.enabled);
  }

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
    if (visit.booking.status !== BookingStatus.CONFIRMED && visit.booking.status !== BookingStatus.COMPLETED) {
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
    if (this.usesStripe(dto.method) && amount < STRIPE_MIN_CHARGE_PKR * 100) {
      throw new BadRequestException(
        `Card payments require a minimum of PKR ${STRIPE_MIN_CHARGE_PKR} (this visit is PKR ${amount / 100})`,
      );
    }
    // The platform funds promo discounts: the caregiver is paid commission on the
    // full undiscounted rate, and the discount comes entirely out of the
    // platform's commission share (which can go negative on a steep promo).
    const percentage = Number(visit.booking.caregiver.commissionRate.percentage);
    const { caregiverAmount } = splitCommission(visit.booking.rateSnapshot, percentage);
    const commissionAmount = amount - caregiverAmount;

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
    await this.emitPayment(payment.id, 'initiated', PaymentStatus.PENDING);
    if (this.usesStripe(dto.method)) {
      try {
        const session = await this.stripe!.createCheckoutSession({
          paymentId: payment.id,
          visitId: visit.id,
          amount,
          description: 'CareSaath home visit',
        });
        const withRef = await this.prisma.payment.update({
          where: { id: payment.id },
          data: { gatewayRef: session.id },
        });
        return { payment: withRef, checkoutUrl: session.url };
      } catch (err) {
        // Don't leave a PENDING row that would block retrying with another method.
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.FAILED },
        });
        await this.emitPayment(payment.id, 'failed', PaymentStatus.FAILED);
        this.logger.error(`Stripe checkout failed for payment ${payment.id}: ${(err as Error).message}`);
        throw new BadGatewayException('The card payment could not be started, please try again');
      }
    }
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
      message: `The customer will pay Rs ${amount / 100} in cash for your visit. Confirm once you have received it; the visit can only be closed after both of you confirm.`,
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
    if (payment.caregiverConfirmedAt) {
      throw new BadRequestException(
        'The caregiver has already confirmed receiving this cash; raise a dispute if that is wrong',
      );
    }
    const updated = await this.prisma.payment.update({
      where: { id },
      data: { status: PaymentStatus.FAILED },
    });
    if (this.usesStripe(payment.method) && payment.gatewayRef?.startsWith('cs_')) {
      await this.stripe!.expireSession(payment.gatewayRef);
    }
    await this.audit.log({
      actorId: user.sub,
      action: 'payment.cancelled',
      entityType: 'Payment',
      entityId: id,
      metadata: { method: payment.method },
    });
    await this.emitPayment(id, 'cancelled', PaymentStatus.FAILED);
    return updated;
  }

  private async markPaid(paymentId: string, source: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        visit: {
          include: {
            booking: {
              include: {
                customer: { select: { id: true, phone: true } },
                caregiver: { select: { userId: true } },
              },
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
      message: `Payment of Rs ${payment.amount / 100} was verified for your visit. Your receipt is ready to download.`,
    });
    const caregiverUserId = payment.visit.booking.caregiver?.userId;
    if (caregiverUserId) {
      await this.notifications.notify({
        userId: caregiverUserId,
        event: 'payment.paid',
        payload: { paymentId, visitId: payment.visitId, amount: payment.amount },
        message: `Payment of Rs ${payment.amount / 100} was verified. Rs ${payment.caregiverAmount / 100} is now in your earnings.`,
      });
    }
    await this.emitPayment(paymentId, 'paid', PaymentStatus.PAID);
    return updated;
  }

  /** Cash can only be confirmed once the caregiver has actually arrived. */
  private static readonly CASH_CONFIRMABLE_VISIT_STATUSES: VisitStatus[] = [
    VisitStatus.CHECKED_IN,
    VisitStatus.IN_PROGRESS,
    VisitStatus.CHECKED_OUT,
    VisitStatus.COMPLETED,
  ];

  private async loadCashPayment(id: string, party: Prisma.PaymentWhereInput) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, ...party },
      include: {
        visit: {
          select: {
            status: true,
            booking: { select: { customerId: true, caregiver: { select: { userId: true } } } },
          },
        },
      },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    if (payment.method !== PaymentMethod.CASH) {
      throw new BadRequestException('Only cash payments are confirmed this way');
    }
    return payment;
  }

  /**
   * Cash is a two-sided check (TRD §6.5): the customer confirms handing the money
   * over and the caregiver confirms receiving it. Each side's confirmation is
   * stored with its timestamp; the payment becomes PAID only when both exist.
   * Confirming again is a no-op, so retries are safe.
   */
  private async recordCashConfirmation(
    payment: Awaited<ReturnType<PaymentsService['loadCashPayment']>>,
    side: 'customer' | 'caregiver',
    actorId: string,
    note?: string,
  ) {
    if (payment.status === PaymentStatus.PAID) {
      return payment;
    }
    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException(`This payment is ${payment.status} and can no longer be confirmed`);
    }
    if (!PaymentsService.CASH_CONFIRMABLE_VISIT_STATUSES.includes(payment.visit.status)) {
      throw new BadRequestException('Cash can only be confirmed once the caregiver has arrived at the visit');
    }
    const field = side === 'customer' ? 'customerConfirmedAt' : 'caregiverConfirmedAt';
    if (payment[field]) {
      return payment;
    }
    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        [field]: new Date(),
        ...(side === 'caregiver' && note ? { confirmationNote: note } : {}),
      },
    });
    await this.audit.log({
      actorId,
      action: `payment.cash.${side}_confirmed`,
      entityType: 'Payment',
      entityId: payment.id,
      metadata: { amount: payment.amount },
    });
    if (updated.customerConfirmedAt && updated.caregiverConfirmedAt) {
      // Both sides have confirmed: settle (this also notifies both and pushes the update).
      return this.markPaid(payment.id, 'cash');
    }
    const customerId = payment.visit.booking.customerId;
    const caregiverUserId = payment.visit.booking.caregiver.userId;
    await this.notifications.notify(
      side === 'customer'
        ? {
            userId: caregiverUserId,
            event: 'payment.cash.customer_confirmed',
            payload: { paymentId: payment.id, visitId: payment.visitId, amount: payment.amount },
            message: `The customer says they handed you Rs ${payment.amount / 100} in cash. Confirm once you have received it.`,
          }
        : {
            userId: customerId,
            event: 'payment.cash.caregiver_confirmed',
            payload: { paymentId: payment.id, visitId: payment.visitId, amount: payment.amount },
            message: `The caregiver says they received Rs ${payment.amount / 100} in cash. Confirm to finish the payment.`,
          },
    );
    await this.emitPayment(payment.id, `${side}_confirmed`, PaymentStatus.PENDING);
    return updated;
  }

  /** The customer confirms they handed the cash to the caregiver. */
  async confirmCashAsCustomer(user: AuthUser, paymentId: string) {
    const payment = await this.loadCashPayment(paymentId, {
      visit: { booking: { customerId: user.sub } },
    });
    return this.recordCashConfirmation(payment, 'customer', user.sub);
  }

  /** The assigned caregiver confirms they received the cash. */
  async confirmCash(user: AuthUser, paymentId: string, dto: CashConfirmationDto = {}) {
    const profile = await this.prisma.caregiverProfile.findUnique({
      where: { userId: user.sub },
      select: { id: true },
    });
    if (!profile) {
      throw new NotFoundException('Caregiver profile not found');
    }
    const payment = await this.loadCashPayment(paymentId, {
      visit: { booking: { caregiverId: profile.id } },
    });
    return this.recordCashConfirmation(payment, 'caregiver', user.sub, dto.note);
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
      await this.emitPayment(payment.id, 'failed', PaymentStatus.FAILED);
      return updated;
    }
    throw new BadRequestException('Unsupported webhook status');
  }

  /**
   * Stripe webhook (signature already verified). Settlement is idempotent, and a
   * session is only trusted when its amount and currency match the payment.
   */
  async handleStripeEvent(event: Stripe.Event) {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object;
        if (session.payment_status !== 'paid') {
          return { received: true, settled: false };
        }
        const payment = await this.findStripePayment(session);
        if (!payment) return { received: true, settled: false };
        if (session.currency !== 'pkr' || session.amount_total !== payment.amount) {
          this.logger.error(
            `Stripe session ${session.id} does not match payment ${payment.id} (${session.amount_total} ${session.currency} vs ${payment.amount} pkr); not settling`,
          );
          return { received: true, settled: false };
        }
        await this.markPaid(payment.id, 'stripe');
        return { received: true, settled: true };
      }
      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed': {
        const payment = await this.findStripePayment(event.data.object);
        if (payment?.status === PaymentStatus.PENDING) {
          await this.prisma.payment.update({
            where: { id: payment.id },
            data: { status: PaymentStatus.FAILED },
          });
          await this.audit.log({
            actorId: null,
            action: 'payment.failed',
            entityType: 'Payment',
            entityId: payment.id,
            metadata: { gatewayRef: event.data.object.id, source: 'stripe', event: event.type },
          });
          await this.emitPayment(payment.id, 'failed', PaymentStatus.FAILED);
        }
        return { received: true, settled: false };
      }
      default:
        return { received: true, settled: false };
    }
  }

  private async findStripePayment(session: Stripe.Checkout.Session) {
    const payment = await this.prisma.payment.findFirst({
      where: {
        method: PaymentMethod.CARD,
        OR: [
          { gatewayRef: session.id },
          ...(session.metadata?.['paymentId'] ? [{ id: session.metadata['paymentId'] }] : []),
        ],
      },
    });
    if (!payment) {
      this.logger.warn(`Stripe event for unknown session ${session.id}`);
    }
    return payment;
  }

  /**
   * PDF receipt for a verified payment. Customers get a receipt without the
   * platform commission; the caregiver and admins get the full breakdown. Only
   * the parties on the visit (or an admin) can download it.
   */
  async receipt(user: AuthUser, id: string): Promise<PdfFile> {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        visit: {
          select: {
            scheduledDate: true,
            timeWindowStart: true,
            timeWindowEnd: true,
            booking: {
              select: {
                customerId: true,
                rateSnapshot: true,
                discountAmount: true,
                serviceType: true,
                patient: { select: { name: true } },
                customer: { select: { fullName: true, phone: true } },
                caregiver: { select: { userId: true, specialty: true, user: { select: { fullName: true } } } },
                promoCode: { select: { code: true } },
              },
            },
          },
        },
      },
    });
    const { booking } = payment?.visit ?? {};
    let audience: ReceiptAudience | null = null;
    if (booking) {
      if (user.role === UserRole.ADMIN) audience = 'admin';
      else if (user.role === UserRole.CUSTOMER && booking.customerId === user.sub) audience = 'customer';
      else if (user.role === UserRole.CAREGIVER && booking.caregiver.userId === user.sub) audience = 'caregiver';
    }
    if (!payment || !audience) {
      // Same answer for "missing" and "not yours" so ids cannot be probed.
      throw new NotFoundException('Payment not found');
    }
    if (payment.status !== PaymentStatus.PAID) {
      throw new BadRequestException('A receipt is available once the payment has been verified');
    }
    const pdf = await buildReceiptPdf(paymentReceiptDocument(payment, audience));
    return { filename: `caresaath-receipt-${paymentReceiptNumber(payment)}.pdf`, pdf };
  }

  /** Operator view: caregiver + customer context alongside the commission breakdown. */
  private adminPaymentInclude() {
    return {
      visit: {
        include: {
          booking: {
            include: {
              patient: { select: { id: true, name: true } },
              customer: { select: { id: true, phone: true, fullName: true } },
              caregiver: {
                select: { id: true, specialty: true, user: { select: { fullName: true } } },
              },
            },
          },
        },
      },
      payoutRequest: { select: { id: true, status: true } },
    } satisfies Prisma.PaymentInclude;
  }

  /** ?q= — patient / caregiver / customer name, or the amount in PKR or paisa. */
  private paymentSearchWhere(q: string | undefined): Prisma.PaymentWhereInput {
    const term = q?.trim();
    if (!term) return {};
    const contains = { contains: term, mode: 'insensitive' as const };
    const amount = /^\d+(\.\d+)?$/.test(term) ? Number(term) : null;
    return {
      OR: [
        { visit: { booking: { patient: { name: contains } } } },
        { visit: { booking: { caregiver: { user: { fullName: contains } } } } },
        { visit: { booking: { customer: { fullName: contains } } } },
        ...(amount !== null ? [{ amount: { in: [Math.round(amount), Math.round(amount * 100)] } }] : []),
      ],
    };
  }

  async listForAdmin(query: ListPaymentsQueryDto): Promise<Paginated<unknown>> {
    const where: Prisma.PaymentWhereInput = {
      ...(query.visitId ? { visitId: query.visitId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...this.paymentSearchWhere(query.q),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: this.adminPaymentInclude(),
      }),
    ]);
    return paginate(items, query.page, query.limit, total);
  }

  async listForCustomer(user: AuthUser, query: ListPaymentsQueryDto): Promise<Paginated<unknown>> {
    const where: Prisma.PaymentWhereInput = {
      AND: [
        { visit: { booking: { customerId: user.sub } } },
        query.visitId ? { visitId: query.visitId } : {},
        query.status ? { status: query.status } : {},
        this.paymentSearchWhere(query.q),
      ],
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
    description: 'Customer payment records, newest first, paginated. Filter with ?status=, ?visitId= and free-text ?q= (patient / caregiver name / amount in PKR or paisa).',
  })
  list(@CurrentUser() user: AuthUser, @Query() query: ListPaymentsQueryDto) {
    return this.payments.listForCustomer(user, query);
  }

  @Post(':id/confirm-cash')
  @ApiOperation({
    summary: 'Confirm you handed over the cash',
    description:
      'Customer side of the cash check. Cash is only PAID, and the visit can only be closed, once BOTH the customer (this call) and the caregiver (POST /caregiver/payments/{id}/confirm-cash) have confirmed. Allowed once the caregiver has arrived. Idempotent.',
  })
  confirmCash(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.payments.confirmCashAsCustomer(user, id);
  }

  @Get(':id/receipt')
  @ApiOperation({
    summary: 'Download the payment receipt (PDF)',
    description: 'PDF receipt for a verified payment, sent as an attachment (add ?inline=true to view it in the browser). Not available until the payment is PAID.',
  })
  async receipt(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
    @Query('inline') inline?: string,
  ) {
    sendPdf(res, await this.payments.receipt(user, id), inline === 'true');
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

  @Get(':id/receipt')
  @ApiOperation({
    summary: 'Download the payment record (PDF)',
    description: 'PDF record of a verified payment for a visit you were assigned, including commission and your earnings. ?inline=true views it in the browser.',
  })
  async receipt(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
    @Query('inline') inline?: string,
  ) {
    sendPdf(res, await this.payments.receipt(user, id), inline === 'true');
  }

  @Post(':id/confirm-cash')
  @ApiOperation({
    summary: 'Confirm cash collection on-site',
    description:
      'Caregiver side of the cash check: confirms the cash was received. The payment becomes PAID (and the visit can be closed) only once the customer has confirmed handing it over too; until then it stays PENDING with caregiverConfirmedAt set. Idempotent.',
  })
  confirmCash(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CashConfirmationDto,
  ) {
    return this.payments.confirmCash(user, id, dto);
  }
}

@ApiTags('Admin - Finance & Payouts')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @ApiOperation({
    summary: 'List all payments',
    description: 'Operator view of payments across every visit, with the per-visit commission breakdown (amount / commissionAmount / caregiverAmount) and caregiver + customer context. Filter with ?status= / ?visitId=.',
  })
  list(@Query() query: ListPaymentsQueryDto) {
    return this.payments.listForAdmin(query);
  }

  @Get(':id/receipt')
  @ApiOperation({
    summary: 'Download any payment record (PDF)',
    description: 'Admin copy of the receipt for a verified payment, with the full commission breakdown. ?inline=true views it in the browser.',
  })
  async receipt(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
    @Query('inline') inline?: string,
  ) {
    sendPdf(res, await this.payments.receipt(user, id), inline === 'true');
  }
}

@ApiTags('System & Webhooks')
@Controller('payments')
export class PaymentWebhookController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly stripe: StripeService,
  ) {}

  @Public()
  @ApiHeader({ name: 'stripe-signature', required: true, description: 'Stripe webhook signature' })
  @Post('webhook/stripe')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Stripe webhook callback',
    description: 'Receives checkout.session.* events from Stripe. The signature is verified against STRIPE_WEBHOOK_SECRET using the raw request body; settlement is idempotent.',
  })
  stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    if (!req.rawBody) {
      throw new BadRequestException('Missing request body');
    }
    let event: Stripe.Event;
    try {
      event = this.stripe.constructEvent(req.rawBody, signature);
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      throw new BadRequestException('Invalid Stripe signature');
    }
    return this.payments.handleStripeEvent(event);
  }

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
    if (provider.toLowerCase() === 'card' && this.stripe.enabled) {
      // Card settlement is Stripe-only once Stripe is configured.
      throw new NotFoundException('Use /payments/webhook/stripe for card payments');
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
    AdminPaymentsController,
    PaymentWebhookController,
  ],
  providers: [PaymentsService, StripeService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
