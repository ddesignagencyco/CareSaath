import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingExpiryService } from './booking-expiry.service.js';
import { createAuditMock, createNotificationsMock, createPrismaMock, wireTransaction } from '../../test/test-helpers.js';

describe('BookingExpiryService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let audit: ReturnType<typeof createAuditMock>;
  let notifications: ReturnType<typeof createNotificationsMock>;
  let realtime: { entityUpdated: ReturnType<typeof vi.fn> };
  let service: BookingExpiryService;

  beforeEach(() => {
    prisma = createPrismaMock();
    wireTransaction(prisma);
    audit = createAuditMock();
    notifications = createNotificationsMock();
    realtime = { entityUpdated: vi.fn() };
    service = new BookingExpiryService(prisma as never, audit as never, notifications as never, realtime as never);
  });

  it('does nothing when no booking has passed its respondBy deadline', async () => {
    prisma.booking.findMany.mockResolvedValue([]);
    const result = await service.run();
    expect(result).toEqual({ expired: 0 });
    expect(audit.log).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('auto-declines an expired booking and notifies the customer', async () => {
    prisma.booking.findMany.mockResolvedValue([
      { id: 'b-1', customerId: 'cust-1', caregiverId: 'cg-1', caregiver: { userId: 'u-caregiver' } },
    ]);

    const result = await service.run();

    expect(result).toEqual({ expired: 1 });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'booking.expired', entityId: 'b-1' }),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'cust-1', event: 'booking.declined' }),
    );
    expect(realtime.entityUpdated).toHaveBeenCalledWith(
      { users: ['cust-1', 'u-caregiver'] },
      expect.objectContaining({ type: 'booking', id: 'b-1', action: 'expired', status: 'DECLINED' }),
    );
  });
});
