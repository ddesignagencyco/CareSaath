import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
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
    expect(sms.sendOtp).toHaveBeenCalledWith(
      '+923001234567',
      expect.stringMatching(/^\d{6}$/),
      expect.objectContaining({ purpose: 'LOGIN', email: null, userId: null }),
    );
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
    expect(tokens).toMatchObject({ accessToken: 'signed-token', refreshToken: 'signed-token' });
    expect(tokens.user).toMatchObject({ id: 'u-1', role: 'CUSTOMER' });
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

  it('requires an existing account and never auto-creates one', async () => {
    const { service, redis, prisma } = makeService();
    const { createHash } = await import('node:crypto');
    redis.client.get.mockResolvedValue(createHash('sha256').update('123456').digest('hex'));
    redis.client.incr.mockResolvedValue(1);
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.verifyOtp('+923001234567', '123456')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});

describe('AuthService.signup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects an already-registered phone', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue({ id: 'u-1' });
    await expect(
      service.signup({ phone: '+923001234567', fullName: 'Test User', role: 'CUSTOMER' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('stores a SIGNUP-purpose OTP and the pending signup payload, separate from LOGIN', async () => {
    const { service, redis, prisma, sms } = makeService();
    prisma.user.findUnique.mockResolvedValue(null);
    const result = await service.signup({
      phone: '+923001234567',
      fullName: 'Test User',
      role: 'CAREGIVER',
    });
    expect(result.ttlSeconds).toBeGreaterThan(0);
    expect(redis.client.set).toHaveBeenCalledWith(
      'otp:SIGNUP:+923001234567',
      expect.any(String),
      'EX',
      expect.any(Number),
    );
    expect(redis.client.set).toHaveBeenCalledWith(
      'signup:pending:+923001234567',
      expect.stringContaining('"role":"CAREGIVER"'),
      'EX',
      expect.any(Number),
    );
    expect(sms.sendOtp).toHaveBeenCalled();
  });
});

describe('AuthService.signupVerify', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates the account with the role chosen at signup once the OTP matches', async () => {
    const { service, redis, prisma } = makeService();
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256').update('123456').digest('hex');
    redis.client.get.mockImplementation((key: string) => {
      if (key === 'otp:SIGNUP:+923001234567') return Promise.resolve(hash);
      if (key === 'signup:pending:+923001234567') {
        return Promise.resolve(JSON.stringify({ fullName: 'Test User', email: null, role: 'CAREGIVER' }));
      }
      return Promise.resolve(null);
    });
    redis.client.incr.mockResolvedValue(1);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'u-new',
      phone: '+923001234567',
      role: 'CAREGIVER',
      fullName: 'Test User',
    });

    const result = await service.signupVerify('+923001234567', '123456');

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: 'CAREGIVER', fullName: 'Test User' }),
      }),
    );
    expect(result.user).toMatchObject({ id: 'u-new', role: 'CAREGIVER' });
  });

  it('rejects once the signup session has expired', async () => {
    const { service, redis } = makeService();
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256').update('123456').digest('hex');
    redis.client.get.mockImplementation((key: string) => {
      if (key === 'otp:SIGNUP:+923001234567') return Promise.resolve(hash);
      return Promise.resolve(null);
    });
    redis.client.incr.mockResolvedValue(1);
    await expect(service.signupVerify('+923001234567', '123456')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('AuthService.requestPhoneChange / verifyPhoneChange', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a new number that is already registered', async () => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue({ id: 'other' });
    await expect(service.requestPhoneChange('u-1', '+923009990001')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('sends a CHANGE_PHONE OTP keyed by the user, not the phone', async () => {
    const { service, redis, prisma, sms } = makeService();
    prisma.user.findUnique.mockResolvedValue(null);
    const result = await service.requestPhoneChange('u-1', '+923009990001');
    expect(result.ttlSeconds).toBeGreaterThan(0);
    expect(redis.client.set).toHaveBeenCalledWith(
      'otp:CHANGE_PHONE:u-1',
      expect.stringContaining('+923009990001'),
      'EX',
      expect.any(Number),
    );
    expect(sms.sendOtp).toHaveBeenCalledWith(
      '+923009990001',
      expect.any(String),
      expect.objectContaining({ purpose: 'CHANGE_PHONE', userId: 'u-1', phone: '+923009990001' }),
    );
  });

  it('moves the account to the new number once the OTP matches', async () => {
    const { service, redis, prisma } = makeService();
    const { createHash } = await import('node:crypto');
    const codeHash = createHash('sha256').update('123456').digest('hex');
    redis.client.get.mockResolvedValue(JSON.stringify({ phone: '+923009990001', codeHash }));
    redis.client.incr.mockResolvedValue(1);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.update.mockResolvedValue({ phone: '+923009990001' });

    const result = await service.verifyPhoneChange('u-1', '123456');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: { phone: '+923009990001' },
    });
    expect(result).toEqual({ phone: '+923009990001' });
  });

  it('rejects an invalid OTP without touching the account', async () => {
    const { service, redis, prisma } = makeService();
    const { createHash } = await import('node:crypto');
    const codeHash = createHash('sha256').update('123456').digest('hex');
    redis.client.get.mockResolvedValue(JSON.stringify({ phone: '+923009990001', codeHash }));
    redis.client.incr.mockResolvedValue(1);
    await expect(service.verifyPhoneChange('u-1', '000000')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
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
