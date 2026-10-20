import { beforeEach, describe, expect, it } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  PaymentsService,
  isGatewayMethod,
  splitCommission,
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
      caregiver: { id: 'cg-1', commissionRate: { percentage: 20 } },
    },
    ...overrides,
  };
}

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

    expect(result).toMatchObject({ gatewayRef: 'gw_pay-2' });
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

  it('lets the assigned caregiver confirm a cash payment', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue({ id: 'cg-1' });
    prisma.payment.findFirst.mockResolvedValue({ id: 'pay-4', method: 'CASH', status: 'PENDING' });
    prisma.payment.findUnique.mockResolvedValue({
      id: 'pay-4',
      status: 'PENDING',
      amount: 5000,
      visitId: 'v-1',
      visit: { booking: { customer: { id: 'u-cust', phone: null } } },
    });
    prisma.payment.update.mockResolvedValue({ id: 'pay-4', status: 'PAID' });

    const result = await service.confirmCash(caregiver, 'pay-4');
    expect(result).toMatchObject({ status: 'PAID' });
  });

  it('rejects confirming a non-cash payment', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue({ id: 'cg-1' });
    prisma.payment.findFirst.mockResolvedValue({ id: 'pay-5', method: 'CARD', status: 'PENDING' });
    await expect(service.confirmCash(caregiver, 'pay-5')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
