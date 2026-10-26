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
  let gateway: RealtimeGateway;

  beforeEach(() => {
    prisma = createPrismaMock();
    jwt = { verifyAsync: vi.fn() };
    gateway = new RealtimeGateway(jwt as never, prisma as never, new RealtimeService());
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
