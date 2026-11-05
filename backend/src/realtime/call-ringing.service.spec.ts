import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CallRingingService, RING_SECONDS } from './call-ringing.service.js';
import { createPrismaMock, createRedisMock } from '../../test/test-helpers.js';

const pending = { callId: 'call-1', visitId: 'v-1', callerId: 'u-caller', callerName: 'Ayesha', sdp: { x: 1 } };

describe('CallRingingService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let redis: ReturnType<typeof createRedisMock>;
  let realtime: { emit: ReturnType<typeof vi.fn> };
  let calls: { markMissed: ReturnType<typeof vi.fn> };
  let notifications: { notify: ReturnType<typeof vi.fn> };
  let webPush: { sendToUser: ReturnType<typeof vi.fn> };
  let nativePush: { sendToUser: ReturnType<typeof vi.fn> };
  let service: CallRingingService;

  beforeEach(() => {
    vi.useFakeTimers();
    prisma = createPrismaMock();
    redis = createRedisMock();
    realtime = { emit: vi.fn() };
    calls = { markMissed: vi.fn().mockResolvedValue(undefined) };
    notifications = { notify: vi.fn().mockResolvedValue(undefined) };
    webPush = { sendToUser: vi.fn().mockResolvedValue(undefined) };
    nativePush = { sendToUser: vi.fn().mockResolvedValue(undefined) };
    service = new CallRingingService(
      prisma as never,
      redis as never,
      realtime as never,
      calls as never,
      notifications as never,
      webPush as never,
      nativePush as never,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
    vi.useRealTimers();
  });

  it('parks the invite for the ring window and pushes every device with a short expiry', async () => {
    prisma.user.findUnique.mockResolvedValue({ role: 'CAREGIVER' });
    await service.ring('u-callee', pending);
    await vi.advanceTimersByTimeAsync(0);

    expect(redis.client.set).toHaveBeenCalledWith('call:pending:u-callee', JSON.stringify(pending), 'EX', RING_SECONDS);
    const payload = webPush.sendToUser.mock.calls[0][1];
    expect(payload).toMatchObject({ event: 'call.incoming', body: 'Ayesha is calling you' });
    expect(payload.data).toMatchObject({ url: '/caregiver/visits/v-1', call: true });
    expect(webPush.sendToUser.mock.calls[0][2]).toEqual({ ttlSeconds: RING_SECONDS, urgency: 'high' });
    expect(nativePush.sendToUser.mock.calls[0][2]).toEqual({ ttlSeconds: RING_SECONDS });
  });

  it('marks an unanswered call missed after the ring window and tells both sides', async () => {
    prisma.user.findUnique.mockResolvedValue({ role: 'CUSTOMER', fullName: 'Ayesha' });
    prisma.callLog.findUnique.mockResolvedValue({ id: 'call-1', status: 'INITIATED', callerId: 'u-caller', calleeId: 'u-callee', visitId: 'v-1' });
    await service.ring('u-callee', pending);

    await vi.advanceTimersByTimeAsync(RING_SECONDS * 1000);

    expect(calls.markMissed).toHaveBeenCalledWith('call-1');
    expect(realtime.emit).toHaveBeenCalledWith({ users: ['u-caller', 'u-callee'] }, 'call:missed', { callId: 'call-1' });
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-callee', event: 'call.missed', message: 'Ayesha tried to call you.' }),
    );
  });

  it('does nothing at the deadline once the call was answered', async () => {
    prisma.user.findUnique.mockResolvedValue({ role: 'CUSTOMER' });
    await service.ring('u-callee', pending);
    redis.client.get.mockResolvedValue(JSON.stringify(pending));

    await service.settle('call-1', 'u-callee');
    await vi.advanceTimersByTimeAsync(RING_SECONDS * 1000);

    expect(redis.client.del).toHaveBeenCalledWith('call:pending:u-callee');
    expect(calls.markMissed).not.toHaveBeenCalled();
    expect(realtime.emit).not.toHaveBeenCalled();
  });

  it('only hands out an invite that is still ringing', async () => {
    redis.client.get.mockResolvedValue(JSON.stringify(pending));
    prisma.callLog.findUnique.mockResolvedValue({ status: 'INITIATED' });
    await expect(service.pendingFor('u-callee')).resolves.toEqual(pending);

    prisma.callLog.findUnique.mockResolvedValue({ status: 'REJECTED' });
    await expect(service.pendingFor('u-callee')).resolves.toBeNull();
  });
});
