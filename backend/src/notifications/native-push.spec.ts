import { describe, expect, it, vi } from 'vitest';
import { NotificationsService } from './notifications.module.js';
import { ANDROID_CHANNEL_ID, NativePushService } from './native-push.service.js';
import { createPrismaMock } from '../../test/test-helpers.js';

const user = { sub: 'u-1', role: 'CUSTOMER', phone: '+92' } as never;
const adapter = (channel: string) => ({ channel, enabled: () => true, send: vi.fn() });
const payload = { id: 'n-1', event: 'booking.accepted', title: 'Booking accepted', body: 'See you soon', data: { bookingId: 'b-1' } };

function firebaseWith(sendEachForMulticast: ReturnType<typeof vi.fn> | null) {
  return { messaging: sendEachForMulticast ? { sendEachForMulticast } : null } as never;
}

function notificationsWith(nativePush: NativePushService, prisma = createPrismaMock()) {
  const service = new NotificationsService(
    prisma as never,
    adapter('SMS') as never,
    adapter('WHATSAPP') as never,
    adapter('PUSH') as never,
    adapter('EMAIL') as never,
    undefined,
    undefined,
    nativePush,
  );
  return { service, prisma };
}

describe('Native push (FCM)', () => {
  it('is a no-op without Firebase credentials', async () => {
    const prisma = createPrismaMock();
    const push = new NativePushService(prisma as never, firebaseWith(null));
    expect(push.enabled()).toBe(false);
    await push.sendToUser('u-1', payload);
    expect(prisma.deviceToken.findMany).not.toHaveBeenCalled();
  });

  it('upserts a device per token, moving it to the signed-in user', async () => {
    const send = vi.fn();
    const { service, prisma } = notificationsWith(new NativePushService(createPrismaMock() as never, firebaseWith(send)));
    prisma.deviceToken.upsert.mockResolvedValue({ id: 'd-1', platform: 'ANDROID' });
    const result = await service.registerDevice(user, { token: 'tok-1', platform: 'ANDROID' as never });
    expect(prisma.deviceToken.upsert).toHaveBeenCalledWith({
      where: { token: 'tok-1' },
      update: { userId: 'u-1', platform: 'ANDROID' },
      create: { userId: 'u-1', token: 'tok-1', platform: 'ANDROID' },
    });
    expect(result).toEqual({ id: 'd-1', platform: 'ANDROID', enabled: true });
  });

  it('only removes the caller\'s own token', async () => {
    const { service, prisma } = notificationsWith(new NativePushService(createPrismaMock() as never, firebaseWith(null)));
    prisma.deviceToken.deleteMany.mockResolvedValue({ count: 1 });
    await service.unregisterDevice(user, { token: 'tok-1' });
    expect(prisma.deviceToken.deleteMany).toHaveBeenCalledWith({ where: { token: 'tok-1', userId: 'u-1' } });
  });

  it('sends to every device, prunes dead tokens and stamps delivered ones', async () => {
    const prisma = createPrismaMock();
    prisma.deviceToken.findMany.mockResolvedValue([
      { id: 'd-ok', token: 'tok-ok' },
      { id: 'd-dead', token: 'tok-dead' },
      { id: 'd-flaky', token: 'tok-flaky' },
    ]);
    const send = vi.fn().mockResolvedValue({
      responses: [
        { success: true },
        { success: false, error: { code: 'messaging/registration-token-not-registered', message: 'gone' } },
        { success: false, error: { code: 'messaging/internal-error', message: 'retry later' } },
      ],
    });
    await new NativePushService(prisma as never, firebaseWith(send)).sendToUser('u-1', payload);

    const message = send.mock.calls[0][0];
    expect(message.tokens).toEqual(['tok-ok', 'tok-dead', 'tok-flaky']);
    expect(message.notification).toEqual({ title: 'Booking accepted', body: 'See you soon' });
    expect(message.data).toEqual({ notificationId: 'n-1', event: 'booking.accepted', payload: '{"bookingId":"b-1"}' });
    expect(message.android.notification.channelId).toBe(ANDROID_CHANNEL_ID);
    // Only the token FCM says is permanently gone is deleted; a transient error keeps the row.
    expect(prisma.deviceToken.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['d-dead'] } } });
    expect(prisma.deviceToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['d-ok'] } } }),
    );
  });

  it('never throws when FCM itself fails', async () => {
    const prisma = createPrismaMock();
    prisma.deviceToken.findMany.mockResolvedValue([{ id: 'd-1', token: 'tok-1' }]);
    const send = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(new NativePushService(prisma as never, firebaseWith(send)).sendToUser('u-1', payload)).resolves.toBeUndefined();
  });
});
