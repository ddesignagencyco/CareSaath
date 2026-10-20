import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';

function makeService() {
  const redis = {
    client: {
      incr: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
      set: vi.fn().mockResolvedValue('OK'),
      get: vi.fn(),
      del: vi.fn().mockResolvedValue(1),
    },
  };
  const prisma = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    otpCode: {
      create: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const jwt = {
    signAsync: vi.fn().mockResolvedValue('signed-token'),
    verifyAsync: vi.fn(),
  };
  const sms = { sendOtp: vi.fn().mockResolvedValue(undefined) };
  const config = { getNumber: vi.fn().mockResolvedValue(300) };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    redis as never,
    jwt as never,
    sms as never,
    config as never,
  );
  return { service, redis, prisma, jwt, sms };
}

describe('AuthService.requestOtp', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stores a hashed OTP in Redis and sends via SMS', async () => {
    const { service, redis, sms } = makeService();
    const result = await service.requestOtp('+923001234567');
    expect(result.ttlSeconds).toBeGreaterThan(0);
    expect(redis.client.set).toHaveBeenCalledWith(
      'otp:LOGIN:+923001234567',
      expect.any(String),
      'EX',
      expect.any(Number),
    );
    expect(sms.sendOtp).toHaveBeenCalledWith('+923001234567', expect.stringMatching(/^\d{6}$/));
  });

  it('enforces the request rate limit', async () => {
    const { service, redis } = makeService();
    redis.client.incr.mockResolvedValue(4);
    await expect(service.requestOtp('+923001234567')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('AuthService.verifyOtp', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects when no OTP was requested', async () => {
    const { service, redis } = makeService();
    redis.client.get.mockResolvedValue(null);
    await expect(service.verifyOtp('+923001234567', '123456')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an OTP that exceeds the attempt limit', async () => {
    const { service, redis } = makeService();
    redis.client.get.mockResolvedValue('some-hash');
    redis.client.incr.mockResolvedValue(6);
    await expect(service.verifyOtp('+923001234567', '123456')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('issues tokens for a matching OTP and active user', async () => {
    const { service, redis, prisma } = makeService();
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256').update('123456').digest('hex');
    redis.client.get.mockResolvedValue(hash);
    redis.client.incr.mockResolvedValue(1);
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-1',
      role: 'CUSTOMER',
      phone: '+923001234567',
      status: 'ACTIVE',
    });
    const tokens = await service.verifyOtp('+923001234567', '123456');
    expect(tokens).toEqual({ accessToken: 'signed-token', refreshToken: 'signed-token' });
    expect(redis.client.del).toHaveBeenCalled();
  });

  it('blocks deactivated accounts even with a valid OTP', async () => {
    const { service, redis, prisma } = makeService();
    const { createHash } = await import('node:crypto');
    redis.client.get.mockResolvedValue(createHash('sha256').update('123456').digest('hex'));
    redis.client.incr.mockResolvedValue(1);
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-1',
      role: 'CUSTOMER',
      phone: '+923001234567',
      status: 'DEACTIVATED',
    });
    await expect(service.verifyOtp('+923001234567', '123456')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('AuthService.refresh', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a refresh token that was already used', async () => {
    const { service, redis } = makeService();
    redis.client.get.mockResolvedValue('1');
    await expect(service.refresh('token')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an access token passed as a refresh token', async () => {
    const { service, redis, jwt } = makeService();
    redis.client.get.mockResolvedValue(null);
    jwt.verifyAsync.mockResolvedValue({ sub: 'u-1', role: 'CUSTOMER', type: 'access' });
    await expect(service.refresh('token')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
