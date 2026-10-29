import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { IceServersService } from './ice-servers.module.js';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';

const user: AuthUser = { sub: 'u-1', role: 'CUSTOMER', phone: '+923001234567' };

describe('IceServersService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env['TURN_URLS'];
    delete process.env['TURN_SHARED_SECRET'];
    delete process.env['STUN_URLS'];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('always returns a STUN server, defaulting to a public one', () => {
    const service = new IceServersService();
    const result = service.get(user);
    expect(result.iceServers).toEqual([{ urls: ['stun:stun.l.google.com:19302'] }]);
  });

  it('omits TURN when it is not configured', () => {
    const service = new IceServersService();
    const result = service.get(user);
    expect(result.iceServers).toHaveLength(1);
  });

  it('includes a time-limited TURN credential once TURN_URLS/TURN_SHARED_SECRET are set', () => {
    process.env['TURN_URLS'] = 'turn:turn.example.com:3478';
    process.env['TURN_SHARED_SECRET'] = 's3cret';
    const service = new IceServersService();

    const result = service.get(user);

    expect(result.iceServers).toHaveLength(2);
    const turn = result.iceServers[1]!;
    expect(turn.urls).toEqual(['turn:turn.example.com:3478']);
    expect(turn.username).toMatch(/^\d+:u-1$/);
    const expected = createHmac('sha1', 's3cret').update(turn.username!).digest('base64');
    expect(turn.credential).toBe(expected);
  });

  it('respects a custom STUN_URLS override', () => {
    process.env['STUN_URLS'] = 'stun:a.example.com:3478,stun:b.example.com:3478';
    const service = new IceServersService();
    const result = service.get(user);
    expect(result.iceServers[0]!.urls).toEqual(['stun:a.example.com:3478', 'stun:b.example.com:3478']);
  });
});
