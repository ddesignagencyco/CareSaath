import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { AdminBookingsService } from './bookings.module.js';
import { createPrismaMock, wireTransaction } from '../../test/test-helpers.js';

describe('AdminBookingsService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: AdminBookingsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    wireTransaction(prisma);
    service = new AdminBookingsService(prisma as never);
  });

  it('filters bookings by status, ASAP, customer, and caregiver', async () => {
    prisma.booking.count.mockResolvedValue(0);
    prisma.booking.findMany.mockResolvedValue([]);
    await service.listBookings({
      status: 'CONFIRMED' as never,
      isImmediate: true,
      customerId: 'cust-1',
      caregiverId: 'cg-1',
      page: 1,
      limit: 20,
    });
    expect(prisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'CONFIRMED', isImmediate: true, customerId: 'cust-1', caregiverId: 'cg-1' },
      }),
    );
  });

  it('404s for a missing booking', async () => {
    prisma.booking.findUnique.mockResolvedValue(null);
    await expect(service.getBooking('b-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('filters visits by date range', async () => {
    prisma.visit.count.mockResolvedValue(0);
    prisma.visit.findMany.mockResolvedValue([]);
    await service.listVisits({ from: '2026-11-01', to: '2026-11-30', sort: 'desc', page: 1, limit: 20 });
    expect(prisma.visit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { scheduledDate: { gte: new Date('2026-11-01'), lte: new Date('2026-11-30') } },
      }),
    );
  });

  it('404s for a missing visit', async () => {
    prisma.visit.findUnique.mockResolvedValue(null);
    await expect(service.getVisit('v-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
