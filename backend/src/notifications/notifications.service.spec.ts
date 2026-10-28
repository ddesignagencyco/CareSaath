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
const caregiverUser: AuthUser = { sub: 'u-2', role: 'CAREGIVER', phone: '+923001234568' };

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
  let email: ReturnType<typeof adapter>;
  let service: NotificationsService;
  let realtime: { emit: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = createPrismaMock();
    wireTransaction(prisma);
    prisma.user.findUnique.mockResolvedValue({ role: 'CAREGIVER' });
    prisma.notification.create.mockResolvedValue({ id: 'n-1' });
    prisma.notification.update.mockResolvedValue({ id: 'n-1', status: 'SENT' });
    push = adapter(NotificationChannel.PUSH);
    sms = adapter(NotificationChannel.SMS);
    whatsapp = adapter(NotificationChannel.WHATSAPP, false);
    email = adapter(NotificationChannel.EMAIL);
    realtime = { emit: vi.fn() };
    service = new NotificationsService(
      prisma as never,
      sms as never,
      whatsapp as never,
      push as never,
      email as never,
      realtime as never,
    );
  });

  it('persists an in-app record without a phone', async () => {
    await service.notify({ userId: 'u-1', event: 'booking.requested', payload: {} });
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        audienceRole: 'CAREGIVER',
        title: 'New booking request',
        channel: 'PUSH',
      }),
    });
    expect(sms.send).not.toHaveBeenCalled();
  });

  it('dispatches over every enabled channel that can be reached', async () => {
    await service.notify({
      userId: 'u-1',
      phone: '+923001234567',
      event: 'booking.requested',
      payload: {},
      message: 'Confirmed',
    });
    expect(prisma.notification.create).toHaveBeenCalledTimes(2);
    expect(sms.send).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+923001234567', message: 'Confirmed' } as Partial<ChannelDelivery>),
    );
    expect(whatsapp.send).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
  });

  it('emails the recipient when they have an email on file', async () => {
    prisma.user.findUnique.mockResolvedValue({ role: 'CAREGIVER', email: 'care@example.com' });
    await service.notify({
      userId: 'u-1',
      event: 'booking.requested',
      payload: {},
      message: 'Confirmed',
    });
    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'care@example.com',
        title: 'New booking request',
        message: 'Confirmed',
      } as Partial<ChannelDelivery>),
    );
  });

  it('skips email when the recipient has no email on file', async () => {
    await service.notify({ userId: 'u-1', event: 'booking.requested', payload: {} });
    expect(email.send).not.toHaveBeenCalled();
  });

  it('marks a notification FAILED when the adapter throws', async () => {
    sms.send.mockRejectedValue(new Error('gateway down'));
    await service.notify({
      userId: 'u-1',
      phone: '+923001234567',
      event: 'booking.requested',
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
      service.notify({ userId: 'u-1', event: 'booking.requested', payload: {} }),
    ).resolves.toBeUndefined();
  });

  it('drops an event addressed to a user of the wrong role', async () => {
    prisma.user.findUnique.mockResolvedValue({ role: 'CUSTOMER' });
    await service.notify({ userId: 'u-1', event: 'booking.requested', payload: {} });
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(realtime.emit).not.toHaveBeenCalled();
  });

  it('drops an event that is not in the catalogue', async () => {
    await service.notify({ userId: 'u-2', event: 'made.up.event', payload: {} });
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('pushes the in-app notification live to that user only', async () => {
    await service.notify({ userId: 'u-2', event: 'booking.requested', payload: {}, message: 'Hi' });
    expect(realtime.emit).toHaveBeenCalledTimes(1);
    expect(realtime.emit).toHaveBeenCalledWith(
      { users: ['u-2'] },
      'notification.created',
      expect.objectContaining({ id: 'n-1', readAt: null }),
    );
  });

  it('notifies every active admin and nobody else', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 'a-1' }, { id: 'a-2' }]);
    prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
    await service.notifyAdmins({ event: 'payout.requested', payload: {} });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { role: 'ADMIN', status: 'ACTIVE' } }),
    );
    expect(prisma.notification.create).toHaveBeenCalledTimes(2);
  });

  it('paginates only the caller role in-app feed', async () => {
    prisma.notification.count.mockResolvedValue(1);
    prisma.notification.findMany.mockResolvedValue([{ id: 'n-1' }]);
    const result = await service.listForUser(user, { page: 1, limit: 20 });
    expect(result).toEqual({ items: [{ id: 'n-1' }], page: 1, limit: 20, total: 1 });
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { userId: 'u-1', audienceRole: 'CUSTOMER', channel: 'PUSH' },
    });
  });

  it('counts unread for the caller role only', async () => {
    prisma.notification.count.mockResolvedValue(3);
    await expect(service.unreadCount(caregiverUser)).resolves.toEqual({ unread: 3 });
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { userId: 'u-2', audienceRole: 'CAREGIVER', channel: 'PUSH', readAt: null },
    });
  });

  it('tells the other open sessions when notifications are marked read', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 2 });
    await service.markRead(user, { ids: ['n-1', 'n-2'] });
    expect(realtime.emit).toHaveBeenCalledWith({ users: ['u-1'] }, 'notification.read', {
      ids: ['n-1', 'n-2'],
      before: null,
    });
  });
});
