import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import webpush from 'web-push';
import { NotificationsService } from './notifications.module.js';
import { WebPushService } from './web-push.service.js';
import { createPrismaMock } from '../../test/test-helpers.js';

const user = { sub: 'u-1', role: 'CUSTOMER', phone: '+92' } as never;
const adapter = (channel: string) => ({ channel, enabled: () => true, send: vi.fn() });

function notificationsWith(webPush: WebPushService | undefined) {
  const prisma = createPrismaMock();
  const service = new NotificationsService(
    prisma as never,
    adapter('SMS') as never,
    adapter('WHATSAPP') as never,
    adapter('PUSH') as never,
    adapter('EMAIL') as never,
    undefined,
    webPush,
  );
  return { service, prisma };
}

describe('Web push', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('reports disabled and refuses subscriptions without VAPID keys', async () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', '');
    vi.stubEnv('VAPID_PRIVATE_KEY', '');
    const { service } = notificationsWith(new WebPushService(createPrismaMock() as never));
    expect(service.pushConfig()).toEqual({ enabled: false, vapidPublicKey: null });
    await expect(
      service.subscribePush(user, { endpoint: 'https://push.test/1', keys: { p256dh: 'p', auth: 'a' } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('upserts a subscription per endpoint when configured', async () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', 'pub');
    vi.stubEnv('VAPID_PRIVATE_KEY', 'priv');
    const { service, prisma } = notificationsWith(new WebPushService(createPrismaMock() as never));
    prisma.pushSubscription.upsert.mockResolvedValue({ id: 's-1', endpoint: 'https://push.test/1', createdAt: new Date() });
    expect(service.pushConfig()).toEqual({ enabled: true, vapidPublicKey: 'pub' });
    await service.subscribePush(user, { endpoint: 'https://push.test/1', keys: { p256dh: 'p', auth: 'a' } }, 'UA');
    expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { endpoint: 'https://push.test/1' } }),
    );
  });

  it('sends to every subscription and prunes expired ones', async () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', 'pub');
    vi.stubEnv('VAPID_PRIVATE_KEY', 'priv');
    const prisma = createPrismaMock();
    prisma.pushSubscription.findMany.mockResolvedValue([
      { id: 's-ok', endpoint: 'https://push.test/ok', p256dh: 'p', auth: 'a' },
      { id: 's-gone', endpoint: 'https://push.test/gone', p256dh: 'p', auth: 'a' },
    ]);
    const send = vi.spyOn(webpush, 'sendNotification').mockImplementation(async (sub) => {
      if (sub.endpoint.endsWith('gone')) throw Object.assign(new Error('Gone'), { statusCode: 410 });
      return { statusCode: 201, body: '', headers: {} };
    });
    await new WebPushService(prisma as never).sendToUser('u-1', { id: 'n-1', event: 'booking.confirmed', title: 'T', body: null, data: {} });
    expect(send).toHaveBeenCalledTimes(2);
    expect(prisma.pushSubscription.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 's-ok' } }));
    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { id: 's-gone' } });
  });
});
