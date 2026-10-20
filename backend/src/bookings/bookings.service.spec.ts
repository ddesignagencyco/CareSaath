import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BookingStatus } from '../generated/prisma/client.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { BookingsService } from './bookings.module.js';

const caregiverUser: AuthUser = { sub: 'u-caregiver', role: 'CAREGIVER', phone: '+923000000000' };

function makeService(overrides: Record<string, unknown> = {}) {
  const prisma = {
    caregiverProfile: {
      findUnique: vi.fn().mockResolvedValue({ id: 'cg-1' }),
    },
    booking: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    visit: { updateMany: vi.fn() },
    $transaction: vi.fn(),
    ...overrides,
  };
  const audit = { log: vi.fn() };
  const notifications = { notify: vi.fn() };
  const service = new BookingsService(prisma as never, audit as never, notifications as never);
  return { service, prisma, audit, notifications };
}

describe('BookingsService.accept', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects when no caregiver profile exists', async () => {
    const { service, prisma } = makeService();
    prisma.caregiverProfile.findUnique.mockResolvedValue(null);
    await expect(service.accept(caregiverUser, 'b-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects accepting a booking that is not REQUESTED', async () => {
    const { service, prisma } = makeService();
    prisma.booking.findFirst.mockResolvedValue({ id: 'b-1', status: BookingStatus.CONFIRMED });
    await expect(service.accept(caregiverUser, 'b-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('confirms the booking and its requested visits, then notifies the customer', async () => {
    const { service, prisma, notifications, audit } = makeService();
    prisma.booking.findFirst.mockResolvedValue({
      id: 'b-1',
      status: BookingStatus.REQUESTED,
      customerId: 'cust-1',
    });
    prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({ booking: { update: vi.fn() }, visit: { updateMany: vi.fn() } }),
    );
    prisma.booking.findUnique.mockResolvedValue({ id: 'b-1', status: BookingStatus.CONFIRMED });

    const result = await service.accept(caregiverUser, 'b-1');

    expect(result).toMatchObject({ id: 'b-1', status: BookingStatus.CONFIRMED });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'booking.accepted', entityId: 'b-1' }),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'cust-1', event: 'booking.confirmed' }),
    );
  });
});
