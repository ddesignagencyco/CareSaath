import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadGatewayException, BadRequestException, NotFoundException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import {
  PaymentsService,
  isGatewayMethod,
  splitCommission,
  verifyWebhookSignature,
} from './payments.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import {
  createAuditMock,
  createNotificationsMock,
  createPrismaMock,
  wireTransaction,
} from '../../test/test-helpers.js';

const customer: AuthUser = { sub: 'u-cust', role: 'CUSTOMER', phone: '+923001234567' };
const caregiver: AuthUser = { sub: 'u-cg', role: 'CAREGIVER', phone: '+923001234568' };

function payableVisit(overrides: Record<string, unknown> = {}) {
  return {
    id: 'v-1',
    status: 'CONFIRMED',
    booking: {
      id: 'b-1',
      status: 'CONFIRMED',
      customerId: 'u-cust',
      rateSnapshot: 6000,
      discountAmount: 0,
      caregiver: {
        id: 'cg-1',
        commissionRate: { percentage: 20 },
        user: { id: 'u-cg', phone: '+923001234568' },
      },
    },
    ...overrides,
  };
}

describe('verifyWebhookSignature', () => {
  const sign = (secret: string, ref: string, status: string) =>
    createHmac('sha256', secret).update(`${ref}:${status}`).digest('hex');

  it('accepts a correctly signed webhook', () => {
    const env = { PAYMENT_WEBHOOK_SECRET: 's3cret' };
    expect(() =>
      verifyWebhookSignature('card', 'gw_1', 'PAID', sign('s3cret', 'gw_1', 'PAID'), env),
    ).not.toThrow();
  });

  it('rejects a missing, malformed or tampered signature', () => {
    const env = { PAYMENT_WEBHOOK_SECRET: 's3cret' };
    expect(() => verifyWebhookSignature('card', 'gw_1', 'PAID', undefined, env)).toThrow();
    expect(() => verifyWebhookSignature('card', 'gw_1', 'PAID', 'zz', env)).toThrow();
    expect(() =>
      verifyWebhookSignature('card', 'gw_1', 'PAID', sign('s3cret', 'gw_1', 'FAILED'), env),
    ).toThrow(/Invalid webhook signature/);
  });

  it('prefers a provider-specific secret over the shared one', () => {
    const env = { PAYMENT_WEBHOOK_SECRET: 'shared', PAYMENT_WEBHOOK_SECRET_JAZZCASH: 'jc' };
    expect(() =>
      verifyWebhookSignature('jazzcash', 'gw_1', 'PAID', sign('jc', 'gw_1', 'PAID'), env),
    ).not.toThrow();
    expect(() =>
      verifyWebhookSignature('jazzcash', 'gw_1', 'PAID', sign('shared', 'gw_1', 'PAID'), env),
    ).toThrow();
  });

  it('is open in development without a secret but fails closed in production', () => {
    expect(() => verifyWebhookSignature('card', 'gw_1', 'PAID', undefined, {})).not.toThrow();
    expect(() =>
      verifyWebhookSignature('card', 'gw_1', 'PAID', undefined, { NODE_ENV: 'production' }),
    ).toThrow(/not configured/);
  });
});

describe('splitCommission', () => {
  it('splits an amount using the category percentage', () => {
    expect(splitCommission(6000, 20)).toEqual({ commissionAmount: 1200, caregiverAmount: 4800 });
  });

  it('rounds the platform share to the nearest minor unit', () => {
    expect(splitCommission(1001, 15)).toEqual({ commissionAmount: 150, caregiverAmount: 851 });
  });

  it('handles a zero commission', () => {
    expect(splitCommission(5000, 0)).toEqual({ commissionAmount: 0, caregiverAmount: 5000 });
  });
});

describe('isGatewayMethod', () => {
  it('classifies cash as non-gateway and digital as gateway', () => {
    expect(isGatewayMethod('CASH' as never)).toBe(false);
    expect(isGatewayMethod('CARD' as never)).toBe(true);
    expect(isGatewayMethod('JAZZCASH' as never)).toBe(true);
    expect(isGatewayMethod('EASYPAISA' as never)).toBe(true);
  });
});

describe('PaymentsService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let notifications: ReturnType<typeof createNotificationsMock>;
  let service: PaymentsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    wireTransaction(prisma);
    notifications = createNotificationsMock();
    service = new PaymentsService(prisma as never, createAuditMock() as never, notifications as never);
  });

  it('rejects payment for a visit the customer does not own', async () => {
    prisma.visit.findFirst.mockResolvedValue(null);
    await expect(
      service.initiate(customer, { visitId: 'v-1', method: 'CASH' as never }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects payment before the booking is confirmed', async () => {
    prisma.visit.findFirst.mockResolvedValue(
      payableVisit({ booking: { ...payableVisit().booking, status: 'REQUESTED' } }),
    );
    await expect(
      service.initiate(customer, { visitId: 'v-1', method: 'CASH' as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('initiates a cash payment with a commission split', async () => {
    prisma.visit.findFirst.mockResolvedValue(payableVisit());
    prisma.payment.findFirst.mockResolvedValue(null);
    prisma.payment.create.mockImplementation(async ({ data }: never) => ({ id: 'pay-1', ...data }));

    const result = await service.initiate(customer, { visitId: 'v-1', method: 'CASH' as never });

    expect(result).toMatchObject({
      id: 'pay-1',
      amount: 6000,
      commissionAmount: 1200,
      caregiverAmount: 4800,
      status: 'PENDING',
    });
    expect(prisma.payment.create).toHaveBeenCalled();
  });

  it('returns a gateway reference for digital methods', async () => {
    prisma.visit.findFirst.mockResolvedValue(payableVisit());
    prisma.payment.findFirst.mockResolvedValue(null);
    prisma.payment.create.mockResolvedValue({ id: 'pay-2' });
    prisma.payment.update.mockImplementation(async ({ where, data }: never) => ({
      id: where.id,
      ...data,
    }));

    const result = await service.initiate(customer, { visitId: 'v-1', method: 'JAZZCASH' as never });

    expect(result).toMatchObject({
      payment: { gatewayRef: 'gw_pay-2' },
      checkoutUrl: expect.stringContaining('gw_pay-2'),
    });
  });

  it('always charges the booking rate minus discount, ignoring any client amount', async () => {
    prisma.visit.findFirst.mockResolvedValue(payableVisit());
    prisma.payment.findFirst.mockResolvedValue(null);
    prisma.payment.create.mockImplementation(async ({ data }: never) => ({ id: 'pay-1', ...data }));

    const result = await service.initiate(customer, {
      visitId: 'v-1',
      method: 'CASH' as never,
      amount: 1,
    } as never);

    expect(result).toMatchObject({ amount: 6000 });
  });

  it('lets a customer abandon a pending payment', async () => {
    prisma.payment.findFirst.mockResolvedValue({ id: 'pay-1', status: 'PENDING', method: 'CARD' });
    prisma.payment.update.mockResolvedValue({ id: 'pay-1', status: 'FAILED' });
    await expect(service.cancel(customer, 'pay-1')).resolves.toMatchObject({ status: 'FAILED' });
  });

  it('refuses to cancel a payment that is no longer pending', async () => {
    prisma.payment.findFirst.mockResolvedValue({ id: 'pay-1', status: 'PAID', method: 'CASH' });
    await expect(service.cancel(customer, 'pay-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a second payment on the same visit', async () => {
    prisma.visit.findFirst.mockResolvedValue(payableVisit());
    prisma.payment.findFirst.mockResolvedValue({ id: 'pay-1', status: 'PAID' });
    await expect(
      service.initiate(customer, { visitId: 'v-1', method: 'CASH' as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a non-positive amount', async () => {
    prisma.visit.findFirst.mockResolvedValue(
      payableVisit({ booking: { ...payableVisit().booking, rateSnapshot: 0, discountAmount: 0 } }),
    );
    prisma.payment.findFirst.mockResolvedValue(null);
    await expect(
      service.initiate(customer, { visitId: 'v-1', method: 'CASH' as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('settles a pending payment on webhook and notifies the customer', async () => {
    prisma.payment.findFirst.mockResolvedValue({ id: 'pay-3', status: 'PENDING', amount: 6000 });
    prisma.payment.findUnique.mockResolvedValue({
      id: 'pay-3',
      status: 'PENDING',
      amount: 6000,
      visitId: 'v-1',
      visit: { booking: { customer: { id: 'u-cust', phone: '+92300' } } },
    });
    prisma.payment.update.mockResolvedValue({ id: 'pay-3', status: 'PAID' });

    const result = await service.handleGatewayWebhook({
      gatewayRef: 'gw_pay-3',
      status: 'PAID' as never,
    });

    expect(result).toMatchObject({ status: 'PAID' });
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'payment.paid', userId: 'u-cust' }),
    );
  });

  it('treats a repeated PAID webhook as idempotent', async () => {
    prisma.payment.findFirst.mockResolvedValue({ id: 'pay-3', status: 'PAID', amount: 6000 });
    prisma.payment.findUnique.mockResolvedValue({
      id: 'pay-3',
      status: 'PAID',
      amount: 6000,
      visitId: 'v-1',
      visit: { booking: { customer: { id: 'u-cust', phone: null } } },
    });

    const result = await service.handleGatewayWebhook({
      gatewayRef: 'gw_pay-3',
      status: 'PAID' as never,
    });

    expect(result).toMatchObject({ status: 'PAID' });
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it('ignores a FAILED webhook for an already-settled payment', async () => {
    prisma.payment.findFirst.mockResolvedValue({ id: 'pay-3', status: 'PAID', amount: 6000 });
    const result = await service.handleGatewayWebhook({
      gatewayRef: 'gw_pay-3',
      status: 'FAILED' as never,
    });
    expect(result).toMatchObject({ status: 'PAID' });
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it('rejects a webhook for an unknown gateway reference', async () => {
    prisma.payment.findFirst.mockResolvedValue(null);
    await expect(
      service.handleGatewayWebhook({ gatewayRef: 'nope', status: 'PAID' as never }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  const cashPayment = (overrides: Record<string, unknown> = {}) => ({
    id: 'pay-4',
    method: 'CASH',
    status: 'PENDING',
    amount: 5000,
    visitId: 'v-1',
    customerConfirmedAt: null,
    caregiverConfirmedAt: null,
    visit: {
      status: 'CHECKED_OUT',
      booking: { customerId: 'u-cust', caregiver: { userId: 'u-cg' } },
    },
    ...overrides,
  });
  const settleFixture = () => ({
    id: 'pay-4',
    status: 'PENDING',
    amount: 5000,
    caregiverAmount: 4000,
    visitId: 'v-1',
    visit: { booking: { customer: { id: 'u-cust', phone: null }, caregiver: { userId: 'u-cg' } } },
  });

  const receiptPayment = (overrides: Record<string, unknown> = {}) => ({
    id: 'abcdef12-0000-4000-8000-000000000000',
    method: 'CASH',
    status: 'PAID',
    amount: 5000,
    commissionAmount: 1000,
    caregiverAmount: 4000,
    gatewayRef: null,
    paidAt: new Date('2026-10-26T09:30:00.000Z'),
    customerConfirmedAt: new Date(),
    caregiverConfirmedAt: new Date(),
    visit: {
      scheduledDate: new Date('2026-10-26T00:00:00.000Z'),
      timeWindowStart: '09:00',
      timeWindowEnd: '11:00',
      booking: {
        customerId: 'u-cust',
        rateSnapshot: 5000,
        discountAmount: 0,
        serviceType: 'NURSING',
        patient: { name: 'P' },
        customer: { fullName: 'C', phone: '+923001234567' },
        caregiver: { userId: 'u-cg', specialty: 'NURSING', user: { fullName: 'G' } },
        promoCode: null,
      },
    },
    ...overrides,
  });

  it('gives the customer and the assigned caregiver a PDF receipt for a verified payment', async () => {
    prisma.payment.findUnique.mockResolvedValue(receiptPayment());
    for (const who of [customer, caregiver]) {
      const file = await service.receipt(who, 'pay-4');
      expect(file.filename).toBe('caresaath-receipt-CS-2026-ABCDEF12.pdf');
      expect(file.pdf.subarray(0, 5).toString()).toBe('%PDF-');
    }
  });

  it('lets an admin download any receipt', async () => {
    prisma.payment.findUnique.mockResolvedValue(receiptPayment());
    const file = await service.receipt({ sub: 'u-admin', role: 'ADMIN', phone: '+923000000000' }, 'pay-4');
    expect(file.pdf.length).toBeGreaterThan(1000);
  });

  it('hides a receipt from anyone who is not on the visit, the same as a missing payment', async () => {
    prisma.payment.findUnique.mockResolvedValue(receiptPayment());
    const stranger: AuthUser = { sub: 'u-other', role: 'CUSTOMER', phone: '+923009999999' };
    await expect(service.receipt(stranger, 'pay-4')).rejects.toBeInstanceOf(NotFoundException);
    const otherCaregiver: AuthUser = { sub: 'u-cg2', role: 'CAREGIVER', phone: '+923008888888' };
    await expect(service.receipt(otherCaregiver, 'pay-4')).rejects.toBeInstanceOf(NotFoundException);
    prisma.payment.findUnique.mockResolvedValue(null);
    await expect(service.receipt(customer, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('issues no receipt until the payment is verified', async () => {
    prisma.payment.findUnique.mockResolvedValue(receiptPayment({ status: 'PENDING' }));
    await expect(service.receipt(customer, 'pay-4')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps cash PENDING when only the caregiver has confirmed, and tells the customer', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue({ id: 'cg-1' });
    prisma.payment.findFirst.mockResolvedValue(cashPayment());
    prisma.payment.update.mockResolvedValue(cashPayment({ caregiverConfirmedAt: new Date() }));

    const result = await service.confirmCash(caregiver, 'pay-4', { note: 'Received Rs 50' });

    expect(result).toMatchObject({ status: 'PENDING' });
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'pay-4' },
      data: { caregiverConfirmedAt: expect.any(Date), confirmationNote: 'Received Rs 50' },
    });
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-cust', event: 'payment.cash.caregiver_confirmed' }),
    );
    expect(prisma.payment.findUnique).not.toHaveBeenCalledWith(
      expect.objectContaining({ include: expect.anything() }),
    );
  });

  it('keeps cash PENDING when only the customer has confirmed, and tells the caregiver', async () => {
    prisma.payment.findFirst.mockResolvedValue(cashPayment());
    prisma.payment.update.mockResolvedValue(cashPayment({ customerConfirmedAt: new Date() }));

    const result = await service.confirmCashAsCustomer(customer, 'pay-4');

    expect(result).toMatchObject({ status: 'PENDING' });
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-cg', event: 'payment.cash.customer_confirmed' }),
    );
  });

  it('settles cash as PAID once the second side confirms, notifying both', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue({ id: 'cg-1' });
    prisma.payment.findFirst.mockResolvedValue(cashPayment({ customerConfirmedAt: new Date() }));
    prisma.payment.update
      .mockResolvedValueOnce(
        cashPayment({ customerConfirmedAt: new Date(), caregiverConfirmedAt: new Date() }),
      )
      .mockResolvedValueOnce({ id: 'pay-4', status: 'PAID' });
    prisma.payment.findUnique.mockResolvedValue(settleFixture());

    const result = await service.confirmCash(caregiver, 'pay-4');

    expect(result).toMatchObject({ status: 'PAID' });
    expect(prisma.payment.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PAID' }) }),
    );
    const paidTo = notifications.notify.mock.calls
      .map(([n]: [{ userId: string; event: string }]) => [n.userId, n.event])
      .filter(([, event]: string[]) => event === 'payment.paid');
    expect(paidTo).toEqual([
      ['u-cust', 'payment.paid'],
      ['u-cg', 'payment.paid'],
    ]);
  });

  it('is a no-op when the same side confirms twice', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue({ id: 'cg-1' });
    prisma.payment.findFirst.mockResolvedValue(cashPayment({ caregiverConfirmedAt: new Date() }));
    await service.confirmCash(caregiver, 'pay-4');
    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('refuses to confirm cash before the caregiver has arrived', async () => {
    prisma.payment.findFirst.mockResolvedValue(cashPayment({ visit: { status: 'CONFIRMED', booking: { customerId: 'u-cust', caregiver: { userId: 'u-cg' } } } }));
    await expect(service.confirmCashAsCustomer(customer, 'pay-4')).rejects.toThrow(/caregiver has arrived/);
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it('refuses to confirm a payment that already failed', async () => {
    prisma.payment.findFirst.mockResolvedValue(cashPayment({ status: 'FAILED' }));
    await expect(service.confirmCashAsCustomer(customer, 'pay-4')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not let the customer cancel cash the caregiver already confirmed', async () => {
    prisma.payment.findFirst.mockResolvedValue({
      id: 'pay-4', status: 'PENDING', method: 'CASH', caregiverConfirmedAt: new Date(),
    });
    await expect(service.cancel(customer, 'pay-4')).rejects.toThrow(/already confirmed/);
  });

  it('rejects confirming a non-cash payment', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue({ id: 'cg-1' });
    prisma.payment.findFirst.mockResolvedValue({ id: 'pay-5', method: 'CARD', status: 'PENDING' });
    await expect(service.confirmCash(caregiver, 'pay-5')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('PaymentsService with Stripe', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let notifications: ReturnType<typeof createNotificationsMock>;
  let stripe: {
    enabled: boolean;
    createCheckoutSession: ReturnType<typeof vi.fn>;
    expireSession: ReturnType<typeof vi.fn>;
  };
  let service: PaymentsService;

  const session = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'cs_test_1',
      payment_status: 'paid',
      currency: 'pkr',
      amount_total: 60000,
      metadata: { paymentId: 'pay-1' },
      ...overrides,
    }) as never;
  const event = (type: string, object: unknown) => ({ type, data: { object } }) as never;

  /** Visit rates above Stripe's PKR minimum. */
  const cardVisit = () =>
    payableVisit({
      booking: { ...payableVisit().booking, rateSnapshot: 60000 },
    });

  beforeEach(() => {
    prisma = createPrismaMock();
    wireTransaction(prisma);
    notifications = createNotificationsMock();
    stripe = {
      enabled: true,
      createCheckoutSession: vi.fn().mockResolvedValue({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }),
      expireSession: vi.fn().mockResolvedValue(undefined),
    };
    service = new PaymentsService(
      prisma as never,
      createAuditMock() as never,
      notifications as never,
      stripe as never,
    );
  });

  it('starts a Stripe Checkout session for card payments and stores its id', async () => {
    prisma.visit.findFirst.mockResolvedValue(cardVisit());
    prisma.payment.findFirst.mockResolvedValue(null);
    prisma.payment.create.mockResolvedValue({ id: 'pay-1' });
    prisma.payment.update.mockImplementation(async ({ where, data }: never) => ({ id: where.id, ...data }));

    const result = await service.initiate(customer, { visitId: 'v-1', method: 'CARD' as never });

    expect(stripe.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: 'pay-1', amount: 60000 }),
    );
    expect(result).toMatchObject({
      payment: { gatewayRef: 'cs_test_1' },
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_1',
    });
  });

  it('rejects card payments below the Stripe minimum before creating a payment', async () => {
    prisma.visit.findFirst.mockResolvedValue(
      payableVisit({ booking: { ...payableVisit().booking, rateSnapshot: 10000 } }),
    );
    prisma.payment.findFirst.mockResolvedValue(null);

    await expect(
      service.initiate(customer, { visitId: 'v-1', method: 'CARD' as never }),
    ).rejects.toThrow(/minimum of PKR 140/);
    expect(prisma.payment.create).not.toHaveBeenCalled();
    expect(stripe.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('does not use Stripe for cash or wallet payments', async () => {
    prisma.visit.findFirst.mockResolvedValue(payableVisit());
    prisma.payment.findFirst.mockResolvedValue(null);
    prisma.payment.create.mockResolvedValue({ id: 'pay-1' });
    prisma.payment.update.mockImplementation(async ({ where, data }: never) => ({ id: where.id, ...data }));
    await service.initiate(customer, { visitId: 'v-1', method: 'JAZZCASH' as never });
    expect(stripe.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('fails the pending payment when Stripe cannot create the session', async () => {
    prisma.visit.findFirst.mockResolvedValue(cardVisit());
    prisma.payment.findFirst.mockResolvedValue(null);
    prisma.payment.create.mockResolvedValue({ id: 'pay-1' });
    prisma.payment.update.mockResolvedValue({});
    stripe.createCheckoutSession.mockRejectedValue(new Error('stripe down'));

    await expect(
      service.initiate(customer, { visitId: 'v-1', method: 'CARD' as never }),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'pay-1' },
      data: { status: 'FAILED' },
    });
  });

  it('settles a pending card payment on a paid checkout.session.completed', async () => {
    prisma.payment.findFirst.mockResolvedValue({ id: 'pay-1', amount: 60000, status: 'PENDING', method: 'CARD' });
    prisma.payment.findUnique.mockResolvedValue({
      id: 'pay-1',
      status: 'PENDING',
      amount: 60000,
      visitId: 'v-1',
      visit: { booking: { customer: { id: 'u-cust', phone: '+923001234567' } } },
    });
    prisma.payment.update.mockResolvedValue({ id: 'pay-1', status: 'PAID' });

    const result = await service.handleStripeEvent(event('checkout.session.completed', session()));

    expect(result).toEqual({ received: true, settled: true });
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PAID' }) }),
    );
  });

  it('does not settle when the amount or currency does not match', async () => {
    prisma.payment.findFirst.mockResolvedValue({ id: 'pay-1', amount: 60000, status: 'PENDING', method: 'CARD' });
    for (const bad of [{ amount_total: 100 }, { currency: 'usd' }]) {
      const result = await service.handleStripeEvent(event('checkout.session.completed', session(bad)));
      expect(result).toEqual({ received: true, settled: false });
    }
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it('does not settle an unpaid session', async () => {
    const result = await service.handleStripeEvent(
      event('checkout.session.completed', session({ payment_status: 'unpaid' })),
    );
    expect(result).toEqual({ received: true, settled: false });
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it('marks a pending payment FAILED when the session expires', async () => {
    prisma.payment.findFirst.mockResolvedValue({ id: 'pay-1', amount: 60000, status: 'PENDING', method: 'CARD' });
    prisma.payment.update.mockResolvedValue({});
    await service.handleStripeEvent(event('checkout.session.expired', session({ payment_status: 'unpaid' })));
    expect(prisma.payment.update).toHaveBeenCalledWith({ where: { id: 'pay-1' }, data: { status: 'FAILED' } });
  });

  it('expires the Stripe session when the customer cancels a card payment', async () => {
    prisma.payment.findFirst.mockResolvedValue({ id: 'pay-1', status: 'PENDING', method: 'CARD', gatewayRef: 'cs_test_1' });
    prisma.payment.update.mockResolvedValue({ id: 'pay-1', status: 'FAILED' });
    await service.cancel(customer, 'pay-1');
    expect(stripe.expireSession).toHaveBeenCalledWith('cs_test_1');
  });

  it('ignores unrelated Stripe events', async () => {
    const result = await service.handleStripeEvent(event('charge.refunded', {}));
    expect(result).toEqual({ received: true, settled: false });
  });
});
