import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RealtimeGateway } from './realtime.gateway.js';
import { RealtimeService } from './realtime.service.js';
import { createPrismaMock } from '../../test/test-helpers.js';

function fakeSocket(handshake: Record<string, unknown> = {}) {
  return {
    handshake: { auth: {}, headers: {}, query: {}, ...handshake },
    data: {} as Record<string, unknown>,
    join: vi.fn().mockResolvedValue(undefined),
    emit: vi.fn(),
    disconnect: vi.fn(),
  };
}

describe('RealtimeGateway', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let jwt: { verifyAsync: ReturnType<typeof vi.fn> };
  let realtime: RealtimeService;
  let realtimeEmit: ReturnType<typeof vi.fn>;
  let calls: {
    startCall: ReturnType<typeof vi.fn>;
    loadForRouting: ReturnType<typeof vi.fn>;
    markConnected: ReturnType<typeof vi.fn>;
    markEnded: ReturnType<typeof vi.fn>;
    markRejected: ReturnType<typeof vi.fn>;
  };
  let gateway: RealtimeGateway;

  beforeEach(() => {
    prisma = createPrismaMock();
    jwt = { verifyAsync: vi.fn() };
    realtime = new RealtimeService();
    realtimeEmit = vi.fn();
    realtime.emit = realtimeEmit as never;
    calls = {
      startCall: vi.fn(),
      loadForRouting: vi.fn(),
      markConnected: vi.fn().mockResolvedValue(undefined),
      markEnded: vi.fn().mockResolvedValue(undefined),
      markRejected: vi.fn().mockResolvedValue(undefined),
    };
    gateway = new RealtimeGateway(jwt as never, prisma as never, realtime, calls as never);
  });

  it('joins only the user room and the role room for a valid token', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'u-1', type: 'access', exp: Math.floor(Date.now() / 1000) + 900 });
    prisma.user.findUnique.mockResolvedValue({ id: 'u-1', role: 'CAREGIVER', status: 'ACTIVE' });
    const socket = fakeSocket({ auth: { token: 'tok' } });

    await gateway.handleConnection(socket as never);

    expect(socket.join).toHaveBeenCalledWith(['user:u-1', 'role:CAREGIVER']);
    expect(socket.emit).toHaveBeenCalledWith('ready', expect.objectContaining({ userId: 'u-1', role: 'CAREGIVER' }));
    expect(socket.disconnect).not.toHaveBeenCalled();
    gateway.handleDisconnect(socket as never);
  });

  it('accepts the token from the Authorization header too', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'u-1', type: 'access' });
    prisma.user.findUnique.mockResolvedValue({ id: 'u-1', role: 'ADMIN', status: 'ACTIVE' });
    const socket = fakeSocket({ headers: { authorization: 'Bearer abc' } });
    await gateway.handleConnection(socket as never);
    expect(jwt.verifyAsync).toHaveBeenCalledWith('abc', expect.anything());
    expect(socket.join).toHaveBeenCalledWith(['user:u-1', 'role:ADMIN']);
  });

  it('rejects a connection with no token', async () => {
    const socket = fakeSocket();
    await gateway.handleConnection(socket as never);
    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('auth.error', expect.any(Object));
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('rejects an invalid token', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('jwt malformed'));
    const socket = fakeSocket({ auth: { token: 'bad' } });
    await gateway.handleConnection(socket as never);
    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('rejects a refresh token', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'u-1', type: 'refresh' });
    const socket = fakeSocket({ auth: { token: 'tok' } });
    await gateway.handleConnection(socket as never);
    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('rejects a deactivated account', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'u-1', type: 'access' });
    prisma.user.findUnique.mockResolvedValue({ id: 'u-1', role: 'CUSTOMER', status: 'DEACTIVATED' });
    const socket = fakeSocket({ auth: { token: 'tok' } });
    await gateway.handleConnection(socket as never);
    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('closes the socket when the access token expires', async () => {
    vi.useFakeTimers();
    try {
      jwt.verifyAsync.mockResolvedValue({ sub: 'u-1', type: 'access', exp: Math.floor(Date.now() / 1000) + 60 });
      prisma.user.findUnique.mockResolvedValue({ id: 'u-1', role: 'CUSTOMER', status: 'ACTIVE' });
      const socket = fakeSocket({ auth: { token: 'tok' } });
      await gateway.handleConnection(socket as never);
      expect(socket.disconnect).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(61_000);
      expect(socket.emit).toHaveBeenCalledWith('auth.expired', expect.any(Object));
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('RealtimeGateway call signaling', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let realtime: RealtimeService;
  let realtimeEmit: ReturnType<typeof vi.fn>;
  let calls: {
    startCall: ReturnType<typeof vi.fn>;
    loadForRouting: ReturnType<typeof vi.fn>;
    markConnected: ReturnType<typeof vi.fn>;
    markEnded: ReturnType<typeof vi.fn>;
    markRejected: ReturnType<typeof vi.fn>;
  };
  let gateway: RealtimeGateway;

  beforeEach(() => {
    prisma = createPrismaMock();
    realtime = new RealtimeService();
    realtimeEmit = vi.fn();
    realtime.emit = realtimeEmit as never;
    calls = {
      startCall: vi.fn(),
      loadForRouting: vi.fn(),
      markConnected: vi.fn().mockResolvedValue(undefined),
      markEnded: vi.fn().mockResolvedValue(undefined),
      markRejected: vi.fn().mockResolvedValue(undefined),
    };
    gateway = new RealtimeGateway({ verifyAsync: vi.fn() } as never, prisma as never, realtime, calls as never);
  });

  function fakeAuthedSocket(userId: string) {
    return { ...fakeSocket(), data: { userId } };
  }

  it('relays an invite to the callee and persists a CallLog', async () => {
    calls.startCall.mockResolvedValue({ id: 'call-1' });
    const socket = fakeAuthedSocket('u-caller');
    await gateway.handleCallInvite(socket as never, { visitId: 'v-1', calleeId: 'u-callee', sdp: { x: 1 } });
    expect(calls.startCall).toHaveBeenCalledWith('v-1', 'u-caller', 'u-callee');
    expect(realtimeEmit).toHaveBeenCalledWith(
      { users: ['u-callee'] },
      'call:incoming',
      expect.objectContaining({ callId: 'call-1', callerId: 'u-caller' }),
    );
  });

  it('emits call:error to the inviter when there is no shared active visit', async () => {
    calls.startCall.mockRejectedValue(new Error('No active visit shared with that user'));
    const socket = fakeAuthedSocket('u-caller');
    await gateway.handleCallInvite(socket as never, { visitId: 'v-1', calleeId: 'u-callee', sdp: {} });
    expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ message: expect.any(String) }));
  });

  it('relays an answer to the original caller and marks the call connected', async () => {
    calls.loadForRouting.mockResolvedValue({ id: 'call-1', callerId: 'u-caller', calleeId: 'u-callee' });
    const socket = fakeAuthedSocket('u-callee');
    await gateway.handleCallAnswer(socket as never, { callId: 'call-1', sdp: { y: 2 } });
    expect(calls.markConnected).toHaveBeenCalledWith('call-1');
    expect(realtimeEmit).toHaveBeenCalledWith(
      { users: ['u-caller'] },
      'call:answered',
      expect.objectContaining({ callId: 'call-1' }),
    );
  });

  it('relays ICE candidates to the other participant only', async () => {
    calls.loadForRouting.mockResolvedValue({ id: 'call-1', callerId: 'u-caller', calleeId: 'u-callee' });
    const socket = fakeAuthedSocket('u-caller');
    await gateway.handleIceCandidate(socket as never, { callId: 'call-1', candidate: { c: 1 } });
    expect(realtimeEmit).toHaveBeenCalledWith(
      { users: ['u-callee'] },
      'call:ice-candidate',
      expect.objectContaining({ callId: 'call-1' }),
    );
  });

  it('ends a call and notifies the other participant', async () => {
    calls.loadForRouting.mockResolvedValue({ id: 'call-1', callerId: 'u-caller', calleeId: 'u-callee' });
    const socket = fakeAuthedSocket('u-caller');
    await gateway.handleCallEnd(socket as never, { callId: 'call-1' });
    expect(calls.markEnded).toHaveBeenCalledWith('call-1');
    expect(realtimeEmit).toHaveBeenCalledWith({ users: ['u-callee'] }, 'call:ended', { callId: 'call-1' });
  });

  it('rejects a call and notifies the caller', async () => {
    calls.loadForRouting.mockResolvedValue({ id: 'call-1', callerId: 'u-caller', calleeId: 'u-callee' });
    const socket = fakeAuthedSocket('u-callee');
    await gateway.handleCallReject(socket as never, { callId: 'call-1' });
    expect(calls.markRejected).toHaveBeenCalledWith('call-1');
    expect(realtimeEmit).toHaveBeenCalledWith({ users: ['u-caller'] }, 'call:rejected', { callId: 'call-1' });
  });

  it('does nothing for an unauthenticated socket', async () => {
    const socket = { ...fakeSocket(), data: {} };
    await gateway.handleCallInvite(socket as never, { visitId: 'v-1', calleeId: 'u-callee', sdp: {} });
    expect(calls.startCall).not.toHaveBeenCalled();
  });
});

describe('RealtimeService', () => {
  it('emits once to the union of user and role rooms and never broadcasts', () => {
    const emit = vi.fn();
    const to = vi.fn().mockReturnValue({ emit });
    const service = new RealtimeService();
    service.attach({ to } as never);

    service.entityUpdated(
      { users: ['u-1', 'u-1', null, undefined, 'u-2'], roles: ['ADMIN'] },
      { type: 'payout', id: 'p-1', action: 'requested' },
    );

    expect(to).toHaveBeenCalledWith(['user:u-1', 'user:u-2', 'role:ADMIN']);
    expect(emit).toHaveBeenCalledWith(
      'entity.updated',
      expect.objectContaining({ type: 'payout', id: 'p-1', action: 'requested' }),
    );
  });

  it('does nothing with an empty audience or before the server is attached', () => {
    const service = new RealtimeService();
    expect(() => service.emit({ users: ['u-1'] }, 'x', {})).not.toThrow();
    const to = vi.fn();
    service.attach({ to } as never);
    service.emit({ users: [null], roles: [] }, 'x', {});
    expect(to).not.toHaveBeenCalled();
  });
});
