import { beforeEach, describe, expect, it } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  PayoutsService,
  decryptAccountNumber,
  encryptAccountNumber,
  maskAccountNumber,
} from './payouts.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import {
  createAuditMock,
  createNotificationsMock,
  createPrismaMock,
  wireTransaction,
} from '../../test/test-helpers.js';

const caregiver: AuthUser = { sub: 'u-cg', role: 'CAREGIVER', phone: '+923001234568' };
const admin: AuthUser = { sub: 'u-admin', role: 'ADMIN', phone: '+923000000000' };

describe('account number encryption', () => {
  it('round-trips a value through encryption', () => {
    const enc = encryptAccountNumber('PK36SCBL0000001123456702');
    expect(enc).not.toContain('PK36');
    expect(decryptAccountNumber(enc)).toBe('PK36SCBL0000001123456702');
  });

  it('produces a different ciphertext each time (random IV)', () => {
    expect(encryptAccountNumber('123456')).not.toBe(encryptAccountNumber('123456'));
  });

  it('masks all but the last four digits', () => {
    expect(maskAccountNumber('PK36SCBL0000001123456702')).toBe('****6702');
  });
});

describe('PayoutsService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let notifications: ReturnType<typeof createNotificationsMock>;
  let service: PayoutsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    wireTransaction(prisma);
    notifications = createNotificationsMock();
    service = new PayoutsService(prisma as never, createAuditMock() as never, notifications as never);
  });

  it('rejects when the caregiver has no profile', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue(null);
    await expect(service.earnings(caregiver)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('summarises available, pending and lifetime earnings', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue({ id: 'cg-1' });
    prisma.payment.aggregate
      .mockResolvedValueOnce({ _sum: { caregiverAmount: 4800 }, _count: { _all: 1 } })
      .mockResolvedValueOnce({ _sum: { caregiverAmount: 9600 }, _count: { _all: 2 } })
      .mockResolvedValueOnce({
        _sum: { caregiverAmount: 14400, commissionAmount: 3600 },
        _count: { _all: 3 },
      });
    prisma.payoutRequest.findMany.mockResolvedValue([{ id: 'pr-1' }]);

    const result = await service.earnings(caregiver);

    expect(result).toMatchObject({
      availableAmount: 4800,
      availableCount: 1,
      pendingAmount: 9600,
      pendingCount: 2,
      lifetimeEarnings: 14400,
      lifetimeCommission: 3600,
      lifetimeVisits: 3,
    });
  });

  it('creates a payout account with an encrypted number', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue({ id: 'cg-1' });
    prisma.payoutAccount.create.mockImplementation(async ({ data }: never) => ({
      id: 'acct-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
    }));

    const result = await service.createAccount(caregiver, {
      type: 'BANK' as never,
      provider: 'HBL',
      accountTitle: 'Ali Khan',
      accountNumber: 'PK36SCBL0000001123456702',
    });

    expect(result).toMatchObject({ id: 'acct-1', accountNumber: '****6702' });
    const createArg = prisma.payoutAccount.create.mock.calls[0][0] as {
      data: { accountNumber: string };
    };
    expect(createArg.data.accountNumber).not.toBe('PK36SCBL0000001123456702');
    expect(decryptAccountNumber(createArg.data.accountNumber)).toBe('PK36SCBL0000001123456702');
  });

  it('refuses to delete an account with an in-progress payout', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue({ id: 'cg-1' });
    prisma.payoutAccount.findFirst.mockResolvedValue({ id: 'acct-1' });
    prisma.payoutRequest.count.mockResolvedValue(1);
    await expect(service.deleteAccount(caregiver, 'acct-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a payout request beyond available earnings', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue({ id: 'cg-1' });
    prisma.payoutAccount.findFirst.mockResolvedValue({ id: 'acct-1' });
    prisma.payment.findMany.mockResolvedValue([{ id: 'pay-1', caregiverAmount: 1000 }]);
    await expect(
      service.createPayoutRequest(caregiver, { payoutAccountId: 'acct-1', amount: 5000 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a payout request and attaches settled payments up to the amount', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue({ id: 'cg-1' });
    prisma.payoutAccount.findFirst.mockResolvedValue({ id: 'acct-1' });
    prisma.payment.findMany.mockResolvedValue([
      { id: 'pay-1', caregiverAmount: 3000 },
      { id: 'pay-2', caregiverAmount: 3000 },
    ]);
    prisma.payoutRequest.create.mockResolvedValue({ id: 'pr-1', amount: 5000 });
    prisma.payment.updateMany.mockResolvedValue({ count: 2 });

    const result = await service.createPayoutRequest(caregiver, {
      payoutAccountId: 'acct-1',
      amount: 5000,
    });

    expect(result).toMatchObject({ id: 'pr-1' });
    expect(prisma.payment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['pay-1', 'pay-2'] } },
      data: { payoutRequestId: 'pr-1' },
    });
  });

  it('advances a REQUESTED payout to PROCESSING on approval', async () => {
    prisma.payoutRequest.findUnique.mockResolvedValue({
      id: 'pr-1',
      status: 'REQUESTED',
      amount: 5000,
      caregiver: { userId: 'u-cg', user: { phone: null } },
    });
    prisma.payoutRequest.update.mockResolvedValue({ id: 'pr-1', status: 'PROCESSING' });
    prisma.payoutRequest.findUniqueOrThrow.mockResolvedValue({
      id: 'pr-1',
      status: 'PROCESSING',
      payoutAccount: { accountNumber: 'not-encrypted' },
    });

    const result = await service.approve(admin, 'pr-1', {});
    expect(result).toMatchObject({ status: 'PROCESSING' });
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'payout.processing' }),
    );
  });

  const transferredPayout = (overrides: Record<string, unknown> = {}) => ({
    id: 'pr-1',
    status: 'TRANSFERRED',
    amount: 5000,
    issueReportedAt: null,
    caregiver: { userId: 'u-cg', user: { phone: '+923001234568' } },
    payoutAccount: { provider: 'JazzCash' },
    ...overrides,
  });
  const detail = (status: string) => ({
    id: 'pr-1',
    status,
    payoutAccount: { accountNumber: 'not-encrypted' },
  });

  it('moves an approved payout to TRANSFERRED (not PAID) and asks the caregiver to confirm', async () => {
    prisma.payoutRequest.findUnique.mockResolvedValue(transferredPayout({ status: 'PROCESSING' }));
    prisma.payoutRequest.update.mockResolvedValue({});
    prisma.payoutRequest.findUniqueOrThrow.mockResolvedValue(detail('TRANSFERRED'));

    const result = await service.markTransferred(admin, 'pr-1', { reference: 'TXN-1' });

    expect(result).toMatchObject({ status: 'TRANSFERRED' });
    expect(prisma.payoutRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'TRANSFERRED',
          transferReference: 'TXN-1',
          transferredAt: expect.any(Date),
        }),
      }),
    );
    expect((prisma.payoutRequest.update.mock.calls[0]![0] as { data: Record<string, unknown> }).data).not.toHaveProperty('processedAt');
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-cg',
        event: 'payout.transferred',
        message: expect.stringContaining('Please confirm once you have received it'),
      }),
    );
  });

  it('keeps the deprecated mark-paid alias from skipping the caregiver confirmation', async () => {
    prisma.payoutRequest.findUnique.mockResolvedValue(transferredPayout({ status: 'PROCESSING' }));
    prisma.payoutRequest.update.mockResolvedValue({});
    prisma.payoutRequest.findUniqueOrThrow.mockResolvedValue(detail('TRANSFERRED'));
    await expect(service.markPaid(admin, 'pr-1', {})).resolves.toMatchObject({ status: 'TRANSFERRED' });
  });

  it('does not let an admin re-transfer unless the caregiver reported a problem', async () => {
    prisma.payoutRequest.findUnique.mockResolvedValue(transferredPayout());
    await expect(service.markTransferred(admin, 'pr-1', {})).rejects.toBeInstanceOf(BadRequestException);

    prisma.payoutRequest.findUnique.mockResolvedValue(transferredPayout({ issueReportedAt: new Date() }));
    prisma.payoutRequest.update.mockResolvedValue({});
    prisma.payoutRequest.findUniqueOrThrow.mockResolvedValue(detail('TRANSFERRED'));
    await expect(service.markTransferred(admin, 'pr-1', { reference: 'TXN-2' })).resolves.toBeDefined();
    expect(prisma.payoutRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ issueReportedAt: null, issueNote: null }),
      }),
    );
  });

  it('cannot reject money that was already transferred', async () => {
    prisma.payoutRequest.findUnique.mockResolvedValue(transferredPayout());
    await expect(service.reject(admin, 'pr-1', { reason: 'x' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks a payout PAID only when the caregiver confirms, and tells the admins', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue({ id: 'cg-1' });
    prisma.payoutRequest.findFirst.mockResolvedValue(transferredPayout());
    prisma.payoutRequest.update.mockResolvedValue({});
    prisma.payoutRequest.findUniqueOrThrow.mockResolvedValue(detail('PAID'));

    const result = await service.confirmReceived(caregiver, 'pr-1');

    expect(result).toMatchObject({ status: 'PAID' });
    expect(prisma.payoutRequest.update).toHaveBeenCalledWith({
      where: { id: 'pr-1' },
      data: expect.objectContaining({
        status: 'PAID',
        caregiverConfirmedAt: expect.any(Date),
        processedAt: expect.any(Date),
      }),
    });
    expect(notifications.notifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'payout.confirmed' }),
    );
  });

  it('refuses to confirm a payout the admin has not transferred, and is idempotent once paid', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue({ id: 'cg-1' });
    prisma.payoutRequest.findFirst.mockResolvedValue(transferredPayout({ status: 'PROCESSING' }));
    await expect(service.confirmReceived(caregiver, 'pr-1')).rejects.toBeInstanceOf(BadRequestException);

    prisma.payoutRequest.findFirst.mockResolvedValue(transferredPayout({ status: 'PAID' }));
    prisma.payoutRequest.findUniqueOrThrow.mockResolvedValue(detail('PAID'));
    prisma.payoutRequest.update.mockClear();
    await service.confirmReceived(caregiver, 'pr-1');
    expect(prisma.payoutRequest.update).not.toHaveBeenCalled();
  });

  it('lets only the owning caregiver confirm', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue({ id: 'cg-other' });
    prisma.payoutRequest.findFirst.mockResolvedValue(null);
    await expect(service.confirmReceived(caregiver, 'pr-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('records a not-received report and alerts the admins without changing the status', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue({ id: 'cg-1' });
    prisma.payoutRequest.findFirst.mockResolvedValue(transferredPayout());
    prisma.payoutRequest.update.mockResolvedValue({});
    prisma.payoutRequest.findUniqueOrThrow.mockResolvedValue(detail('TRANSFERRED'));

    await service.reportNotReceived(caregiver, 'pr-1', { note: 'not here' });

    expect(prisma.payoutRequest.update).toHaveBeenCalledWith({
      where: { id: 'pr-1' },
      data: { issueReportedAt: expect.any(Date), issueNote: 'not here' },
    });
    expect(notifications.notifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'payout.issue_reported' }),
    );
  });

  it('alerts the admins when a caregiver requests a payout', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue({ id: 'cg-1' });
    prisma.payoutAccount.findFirst.mockResolvedValue({ id: 'acc-1' });
    prisma.payment.findMany.mockResolvedValue([{ id: 'pay-1', caregiverAmount: 5000 }]);
    prisma.payoutRequest.create.mockResolvedValue({ id: 'pr-9', amount: 5000 });
    prisma.payment.updateMany.mockResolvedValue({ count: 1 });
    await service.createPayoutRequest(caregiver, { payoutAccountId: 'acc-1', amount: 5000 });
    expect(notifications.notifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'payout.requested' }),
    );
  });

  it('requires a reason to reject a payout', async () => {
    prisma.payoutRequest.findUnique.mockResolvedValue({
      id: 'pr-1',
      status: 'REQUESTED',
      amount: 5000,
      caregiver: { userId: 'u-cg', user: { phone: null } },
    });
    await expect(service.reject(admin, 'pr-1', {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('releases payments back to the earnings pool on rejection', async () => {
    prisma.payoutRequest.findUnique.mockResolvedValue({
      id: 'pr-1',
      status: 'REQUESTED',
      amount: 5000,
      caregiver: { userId: 'u-cg', user: { phone: null } },
    });
    prisma.payoutRequest.update.mockResolvedValue({ id: 'pr-1', status: 'REJECTED' });
    prisma.payoutRequest.findUniqueOrThrow.mockResolvedValue({
      id: 'pr-1',
      status: 'REJECTED',
      payoutAccount: { accountNumber: 'not-encrypted' },
    });
    prisma.payment.updateMany.mockResolvedValue({ count: 2 });

    await service.reject(admin, 'pr-1', { reason: 'invalid account' });

    expect(prisma.payoutRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rejectionReason: 'invalid account' }),
      }),
    );

    expect(prisma.payment.updateMany).toHaveBeenCalledWith({
      where: { payoutRequestId: 'pr-1' },
      data: { payoutRequestId: null },
    });
  });

  it('rejects an invalid payout transition', async () => {
    prisma.payoutRequest.findUnique.mockResolvedValue({
      id: 'pr-1',
      status: 'PAID',
      amount: 5000,
      caregiver: { userId: 'u-cg', user: { phone: null } },
    });
    await expect(service.approve(admin, 'pr-1', {})).rejects.toBeInstanceOf(BadRequestException);
  });
});
