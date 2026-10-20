import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationChannel } from '../generated/prisma/client.js';
import { NotificationsService } from './notifications.module.js';
import type {
  ChannelDelivery,
  NotificationChannelAdapter,
} from './channels.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import {
  createPrismaMock,
  wireTransaction,
} from '../../test/test-helpers.js';

const user: AuthUser = { sub: 'u-1', role: 'CUSTOMER', phone: '+923001234567' };

function adapter(channel: NotificationChannel, enabled = true): NotificationChannelAdapter & { send: ReturnType<typeof vi.fn> } {
  return {
    channel,
    enabled: () => enabled,
    send: vi.fn().mockResolvedValue(undefined),
  } as never;
}

describe('NotificationsService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let push: ReturnType<typeof adapter>;
  let sms: ReturnType<typeof adapter>;
  let whatsapp: ReturnType<typeof adapter>;
  let service: NotificationsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    wireTransaction(prisma);
    prisma.notification.create.mockResolvedValue({ id: 'n-1' });
    prisma.notification.update.mockResolvedValue({});
    push = adapter(NotificationChannel.PUSH);
    sms = adapter(NotificationChannel.SMS);
    whatsapp = adapter(NotificationChannel.WHATSAPP, false);
    service = new NotificationsService(
      prisma as never,
      sms as never,
      whatsapp as never,
      push as never,
    );
  });

  it('persists an in-app record without a phone', async () => {
    await service.notify({ userId: 'u-1', event: 'booking.requested', payload: {} });
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(sms.send).not.toHaveBeenCalled();
  });

  it('dispatches over every enabled channel that can be reached', async () => {
    await service.notify({
      userId: 'u-1',
      phone: '+923001234567',
      event: 'visit.confirmed',
      payload: {},
      message: 'Confirmed',
    });
    expect(prisma.notification.create).toHaveBeenCalledTimes(2);
    expect(sms.send).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+923001234567', message: 'Confirmed' } as Partial<ChannelDelivery>),
    );
    expect(whatsapp.send).not.toHaveBeenCalled();
  });

  it('marks a notification FAILED when the adapter throws', async () => {
    sms.send.mockRejectedValue(new Error('gateway down'));
    await service.notify({
      userId: 'u-1',
      phone: '+923001234567',
      event: 'visit.confirmed',
      payload: {},
      message: 'Confirmed',
    });
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: { id: 'n-1' },
      data: expect.objectContaining({ status: 'FAILED' }),
    });
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
