import { beforeEach, describe, expect, it } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DisputesService } from './disputes.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import {
  createAuditMock,
  createNotificationsMock,
  createPrismaMock,
  wireTransaction,
} from '../../test/test-helpers.js';

const customer: AuthUser = { sub: 'u-cust', role: 'CUSTOMER', phone: '+923001234567' };
const caregiver: AuthUser = { sub: 'u-cg', role: 'CAREGIVER', phone: '+923001234568' };
const admin: AuthUser = { sub: 'u-admin', role: 'ADMIN', phone: '+923000000000' };

describe('DisputesService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let notifications: ReturnType<typeof createNotificationsMock>;
  let service: DisputesService;

  beforeEach(() => {
    prisma = createPrismaMock();
    wireTransaction(prisma);
    notifications = createNotificationsMock();
    service = new DisputesService(prisma as never, createAuditMock() as never, notifications as never);
  });

  it('rejects a customer dispute for a visit they do not own', async () => {
    prisma.visit.findFirst.mockResolvedValue(null);
    await expect(
      service.raise(customer, { visitId: 'v-1', description: 'late arrival' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a second open dispute by the same user on a visit', async () => {
    prisma.visit.findFirst.mockResolvedValue({
      id: 'v-1',
      booking: { customerId: 'u-cust', caregiverId: 'cg-1', caregiver: { userId: 'u-cg' } },
    });
    prisma.dispute.findFirst.mockResolvedValue({ id: 'd-1' });
    await expect(
      service.raise(customer, { visitId: 'v-1', description: 'late arrival' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('raises a dispute against the caregiver for a customer', async () => {
    prisma.visit.findFirst.mockResolvedValue({
      id: 'v-1',
      booking: { customerId: 'u-cust', caregiverId: 'cg-1', caregiver: { userId: 'u-cg' } },
    });
    prisma.dispute.findFirst.mockResolvedValue(null);
    prisma.dispute.create.mockResolvedValue({ id: 'd-1', status: 'OPEN' });

    const result = await service.raise(customer, { visitId: 'v-1', description: 'late arrival' });

    expect(result).toMatchObject({ id: 'd-1' });
    expect(prisma.dispute.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ againstUserId: 'u-cg', raisedById: 'u-cust' }),
    });
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-cg', event: 'dispute.raised' }),
    );
  });

  it('raises a dispute against the customer for a caregiver', async () => {
    prisma.caregiverProfile.findUnique.mockResolvedValue({ id: 'cg-1' });
    prisma.visit.findFirst.mockResolvedValue({
      id: 'v-1',
      booking: { customerId: 'u-cust', caregiverId: 'cg-1', caregiver: { userId: 'u-cg' } },
    });
    prisma.dispute.findFirst.mockResolvedValue(null);
    prisma.dispute.create.mockResolvedValue({ id: 'd-2' });

    await service.raise(caregiver, { visitId: 'v-1', description: 'no access at door' });

    expect(prisma.dispute.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ againstUserId: 'u-cust', raisedById: 'u-cg' }),
    });
  });

  it('rejects resolving an already resolved dispute', async () => {
    prisma.dispute.findUnique.mockResolvedValue({ id: 'd-1', status: 'RESOLVED' });
    await expect(service.resolve(admin, 'd-1', { resolutionNote: 'done' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('resolves an open dispute and notifies the raiser', async () => {
    prisma.dispute.findUnique.mockResolvedValue({ id: 'd-1', status: 'OPEN', raisedById: 'u-cust' });
    prisma.dispute.update.mockResolvedValue({ id: 'd-1', status: 'RESOLVED' });

    const result = await service.resolve(admin, 'd-1', { resolutionNote: 'refunded' });

    expect(result).toMatchObject({ status: 'RESOLVED' });
    expect(prisma.dispute.update).toHaveBeenCalledWith({
      where: { id: 'd-1' },
      data: expect.objectContaining({ status: 'RESOLVED', resolvedById: 'u-admin' }),
    });
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-cust', event: 'dispute.resolved' }),
    );
  });
});
