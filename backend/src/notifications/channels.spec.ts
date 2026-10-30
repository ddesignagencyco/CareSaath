import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrismaMock } from '../../test/test-helpers.js';
import { EmailChannelAdapter, isAllowedPushEndpoint, PushChannelAdapter } from './channels.js';

const webpush = vi.hoisted(() => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock('web-push', () => ({ default: webpush }));

function emailServiceMock() {
  return { sendEmail: vi.fn().mockResolvedValue(undefined) };
}

describe('EmailChannelAdapter', () => {
  it('skips sending when the recipient has no email', async () => {
    const emailService = emailServiceMock();
    const adapter = new EmailChannelAdapter(emailService as never);
    await adapter.send({ event: 'booking.requested' });
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });

  it('sends a standard-styled email for a customer/caregiver event', async () => {
    const emailService = emailServiceMock();
    const adapter = new EmailChannelAdapter(emailService as never);
    await adapter.send({
      event: 'booking.confirmed',
      email: 'customer@example.com',
      title: 'Booking accepted',
      message: 'Your booking was accepted.',
    });
    expect(emailService.sendEmail).toHaveBeenCalledWith(
      'customer@example.com',
      'Booking accepted',
      expect.stringContaining('Your booking was accepted.'),
    );
    const html = emailService.sendEmail.mock.calls[0][2] as string;
    expect(html).not.toContain('URGENT');
    expect(html).not.toContain('ACTION REQUIRED');
  });

  it('sends an action-required styled email for an admin-only event', async () => {
    const emailService = emailServiceMock();
    const adapter = new EmailChannelAdapter(emailService as never);
    await adapter.send({
      event: 'payout.requested',
      email: 'admin@example.com',
      title: 'New payout request',
      message: 'A caregiver requested a payout.',
    });
    const html = emailService.sendEmail.mock.calls[0][2] as string;
    expect(html).toContain('ACTION REQUIRED');
  });

  it('sends a critical-styled email for an SOS event', async () => {
    const emailService = emailServiceMock();
    const adapter = new EmailChannelAdapter(emailService as never);
    await adapter.send({
      event: 'safety_incident.sos',
      email: 'admin@example.com',
      title: 'SOS alert',
      message: 'Emergency raised.',
    });
    const html = emailService.sendEmail.mock.calls[0][2] as string;
    expect(html).toContain('URGENT');
  });

  it('propagates adapter failures so the notification is marked FAILED', async () => {
    const emailService = emailServiceMock();
    emailService.sendEmail.mockRejectedValue(new Error('smtp down'));
    const adapter = new EmailChannelAdapter(emailService as never);
    await expect(
      adapter.send({ event: 'booking.confirmed', email: 'customer@example.com', title: 'x' }),
    ).rejects.toThrow('smtp down');
  });
});

describe('PushChannelAdapter', () => {
  const delivery = {
    userId: 'u-1',
    notificationId: 'n-1',
    event: 'booking.confirmed',
    title: 'Booking accepted',
    message: 'Your booking was accepted.',
    payload: { bookingId: 'b-1' },
  };

  const subscription = {
    id: 's-1',
    endpoint: 'https://push.example/s-1',
    p256dh: 'p256dh-key',
    auth: 'auth-key',
  };

  beforeEach(() => {
    vi.stubEnv('VAPID_PUBLIC_KEY', 'public-key');
    vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key');
    vi.stubEnv('VAPID_SUBJECT', 'mailto:test@caresaath.com');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetAllMocks();
  });

  it('keeps the in-app channel enabled when VAPID is not configured', async () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', '');
    vi.stubEnv('VAPID_PRIVATE_KEY', '');
    const prisma = createPrismaMock();
    const adapter = new PushChannelAdapter(prisma as never);

    expect(adapter.enabled()).toBe(true);
    expect(adapter.publicVapidKey).toBeNull();
    await adapter.send(delivery);
    expect(prisma.pushSubscription.findMany).not.toHaveBeenCalled();
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it('sends the payload to every subscription for the user', async () => {
    const prisma = createPrismaMock();
    prisma.pushSubscription.findMany.mockResolvedValue([subscription]);
    prisma.pushSubscription.update.mockResolvedValue({});
    const adapter = new PushChannelAdapter(prisma as never);

    expect(adapter.publicVapidKey).toBe('public-key');
    await adapter.send(delivery);

    expect(webpush.setVapidDetails).toHaveBeenCalledWith(
      'mailto:test@caresaath.com',
      'public-key',
      'private-key',
    );
    expect(prisma.pushSubscription.findMany).toHaveBeenCalledWith({ where: { userId: 'u-1' } });
    expect(webpush.sendNotification).toHaveBeenCalledWith(
      { endpoint: subscription.endpoint, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } },
      expect.any(String),
      { TTL: 3600, urgency: 'normal' },
    );
    const payload = JSON.parse(webpush.sendNotification.mock.calls[0][1] as string);
    expect(payload).toEqual({
      title: 'Booking accepted',
      body: 'Your booking was accepted.',
      event: 'booking.confirmed',
      notificationId: 'n-1',
      data: { bookingId: 'b-1' },
    });
    expect(prisma.pushSubscription.update).toHaveBeenCalledWith({
      where: { id: 's-1' },
      data: expect.objectContaining({ failureCount: 0 }),
    });
  });

  it('marks SOS pushes as high urgency', async () => {
    const prisma = createPrismaMock();
    prisma.pushSubscription.findMany.mockResolvedValue([subscription]);
    prisma.pushSubscription.update.mockResolvedValue({});
    const adapter = new PushChannelAdapter(prisma as never);

    await adapter.send({ ...delivery, event: 'safety_incident.sos' });
    expect(webpush.sendNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      { TTL: 3600, urgency: 'high' },
    );
  });

  it('deletes subscriptions the push service reports as gone', async () => {
    const prisma = createPrismaMock();
    prisma.pushSubscription.findMany.mockResolvedValue([subscription]);
    prisma.pushSubscription.delete.mockResolvedValue({});
    webpush.sendNotification.mockRejectedValue(Object.assign(new Error('gone'), { statusCode: 410 }));
    const adapter = new PushChannelAdapter(prisma as never);

    await adapter.send(delivery);

    expect(prisma.pushSubscription.delete).toHaveBeenCalledWith({ where: { id: 's-1' } });
    expect(prisma.pushSubscription.update).not.toHaveBeenCalled();
  });

  it('records other delivery failures without failing the in-app notification', async () => {
    const prisma = createPrismaMock();
    prisma.pushSubscription.findMany.mockResolvedValue([subscription]);
    prisma.pushSubscription.update.mockResolvedValue({});
    webpush.sendNotification.mockRejectedValue(Object.assign(new Error('server error'), { statusCode: 500 }));
    const adapter = new PushChannelAdapter(prisma as never);

    await expect(adapter.send(delivery)).resolves.toBeUndefined();
    expect(prisma.pushSubscription.update).toHaveBeenCalledWith({
      where: { id: 's-1' },
      data: expect.objectContaining({ failureCount: { increment: 1 } }),
    });
  });

  it('does nothing when the user has no registered devices', async () => {
    const prisma = createPrismaMock();
    prisma.pushSubscription.findMany.mockResolvedValue([]);
    const adapter = new PushChannelAdapter(prisma as never);

    await adapter.send(delivery);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });
});

describe('isAllowedPushEndpoint', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('accepts endpoints from the known browser push services', () => {
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true);
    expect(isAllowedPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=abc')).toBe(true);
    expect(isAllowedPushEndpoint('https://web.push.apple.com/abc')).toBe(true);
  });

  it('rejects non-HTTPS and internal/unknown hosts', () => {
    expect(isAllowedPushEndpoint('http://fcm.googleapis.com/fcm/send/abc')).toBe(false);
    expect(isAllowedPushEndpoint('https://localhost/push')).toBe(false);
    expect(isAllowedPushEndpoint('https://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isAllowedPushEndpoint('https://attacker.example/push')).toBe(false);
    expect(isAllowedPushEndpoint('not-a-url')).toBe(false);
  });

  it('honours the operator allowlist for a self-hosted push service', () => {
    expect(isAllowedPushEndpoint('https://push.example.com/abc')).toBe(false);
    vi.stubEnv('PUSH_ENDPOINT_ALLOWED_HOSTS', 'push.example.com');
    expect(isAllowedPushEndpoint('https://push.example.com/abc')).toBe(true);
  });
});
