import { beforeEach, describe, expect, it } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VisitsService } from './visits.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import {
  createAuditMock,
  createNotificationsMock,
  createPrismaMock,
  wireTransaction,
} from '../../test/test-helpers.js';

const caregiver: AuthUser = { sub: 'u-cg', role: 'CAREGIVER', phone: '+923001234567' };

function visitFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'v-1',
    bookingId: 'b-1',
    status: 'CONFIRMED',
    note: null,
    booking: { customerId: 'u-cust', customer: { id: 'u-cust', phone: '+923000000001' } },
    ...overrides,
  };
}

describe('VisitsService transitions', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let notifications: ReturnType<typeof createNotificationsMock>;
  let service: VisitsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    notifications = createNotificationsMock();
    wireTransaction(prisma);
    service = new VisitsService(
      prisma as never,
      createAuditMock() as never,
      notifications as never,
    );
    prisma.caregiverProfile.findUnique.mockResolvedValue({ id: 'cg-1' });
  });

  it('throws when the visit is not assigned to the caregiver', async () => {
    prisma.visit.findFirst.mockResolvedValue(null);
    await expect(service.enRoute(caregiver, 'v-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects an illegal transition', async () => {
    prisma.visit.findFirst.mockResolvedValue(visitFixture({ status: 'CONFIRMED' }));
    prisma.visit.findUnique.mockResolvedValue(visitFixture({ status: 'CONFIRMED' }));
    await expect(service.checkOut(caregiver, 'v-1', { lat: 1, lng: 2 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('requires coordinates for a GPS check-in', async () => {
    prisma.visit.findFirst.mockResolvedValue(visitFixture({ status: 'EN_ROUTE' }));
    await expect(service.checkIn(caregiver, 'v-1', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('moves EN_ROUTE -> CHECKED_IN and notifies the customer', async () => {
    prisma.visit.findFirst.mockResolvedValue(visitFixture({ status: 'EN_ROUTE' }));
    prisma.visit.findUnique.mockResolvedValue(visitFixture({ status: 'EN_ROUTE' }));
    prisma.visit.update.mockResolvedValue({ id: 'v-1', status: 'CHECKED_IN' });
    prisma.visitStatusHistory.create.mockResolvedValue({});

    const result = await service.checkIn(caregiver, 'v-1', { lat: 31.5, lng: 74.3 });

    expect(result).toMatchObject({ status: 'CHECKED_IN' });
    expect(prisma.visitStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fromStatus: 'EN_ROUTE', toStatus: 'CHECKED_IN' }),
      }),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-cust', event: 'visit.checked_in' }),
    );
  });

  it('refuses a second note on the same visit', async () => {
    prisma.visit.findFirst.mockResolvedValue(visitFixture({ note: { id: 'note-1' } }));
    await expect(
      service.submitNote(caregiver, 'v-1', { summary: 'done' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
