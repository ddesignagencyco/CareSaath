import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationsService } from './notifications.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import {
  createPrismaMock,
  wireTransaction,
} from '../../test/test-helpers.js';

const user: AuthUser = { sub: 'u-1', role: 'CUSTOMER', phone: '+923001234567' };

describe('NotificationsService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let sms: { sendVisitAlert: ReturnType<typeof vi.fn> };
  let service: NotificationsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    wireTransaction(prisma);
    sms = { sendVisitAlert: vi.fn().mockResolvedValue(undefined) };
    service = new NotificationsService(prisma as never, sms as never);
  });

  it('persists an in-app record without a phone', async () => {
    prisma.notification.create.mockResolvedValue({ id: 'n-1' });
    await service.notify({ userId: 'u-1', event: 'booking.requested', payload: {} });
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(sms.sendVisitAlert).not.toHaveBeenCalled();
  });

  it('also dispatches an SMS when a phone is supplied', async () => {
    prisma.notification.create.mockResolvedValue({ id: 'n-1' });
    prisma.notification.update.mockResolvedValue({});
    await service.notify({
      userId: 'u-1',
      phone: '+923001234567',
      event: 'visit.confirmed',
      payload: {},
      message: 'Confirmed',
    });
    expect(prisma.notification.create).toHaveBeenCalledTimes(2);
    expect(sms.sendVisitAlert).toHaveBeenCalledWith('+923001234567', 'Confirmed');
  });

  it('never throws when persistence fails', async () => {
    prisma.notification.create.mockRejectedValue(new Error('db down'));
    await expect(
      service.notify({ userId: 'u-1', event: 'x', payload: {} }),
    ).resolves.toBeUndefined();
  });

  it('paginates the user inbox', async () => {
    prisma.notification.count.mockResolvedValue(1);
    prisma.notification.findMany.mockResolvedValue([{ id: 'n-1' }]);
    const result = await service.listForUser(user, { page: 1, limit: 20 });
    expect(result).toEqual({ items: [{ id: 'n-1' }], page: 1, limit: 20, total: 1 });
  });
});
