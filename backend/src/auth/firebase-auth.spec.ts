import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';
import { UserRole, UserStatus } from '../generated/prisma/client.js';

function makeService(opts: {
  firebaseConfigured?: boolean;
  existingUser?: Record<string, unknown> | null;
  verifyIdToken?: ReturnType<typeof vi.fn>;
} = {}) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(opts.existingUser ?? null),
      create: vi.fn().mockImplementation(({ data }) => ({
        id: 'new-user-id',
        status: UserStatus.ACTIVE,
        ...data,
      })),
      update: vi.fn().mockImplementation(({ where, data }) => ({
        id: where.id,
        ...opts.existingUser,
        ...data,
      })),
    },
  };
  const firebase = {
    isConfigured: opts.firebaseConfigured ?? true,
    verifyIdToken: opts.verifyIdToken ?? vi.fn().mockResolvedValue({ phone_number: '+923033288667' }),
  };
  const jwt = { signAsync: vi.fn().mockResolvedValue('signed.jwt.token') };
  const service = new AuthService(
    prisma as never,
    {} as never,
    jwt as never,
    {} as never,
    {} as never,
    undefined,
    firebase as never,
  );
  return { service, prisma, firebase };
}

describe('AuthService.firebaseAuth', () => {
  it('rejects when Firebase is not configured', async () => {
    const { service } = makeService({ firebaseConfigured: false });
    await expect(service.firebaseAuth('token', {})).rejects.toThrow(/not configured/i);
  });

  it('rejects an invalid Firebase ID token', async () => {
    const { service } = makeService({
      verifyIdToken: vi.fn().mockRejectedValue(new Error('Invalid Firebase token: bad signature')),
    });
    await expect(service.firebaseAuth('bad-token', {})).rejects.toThrow(/bad signature/);
  });

  it('rejects a token with no phone_number claim', async () => {
    const { service } = makeService({ verifyIdToken: vi.fn().mockResolvedValue({}) });
    await expect(service.firebaseAuth('token', {})).rejects.toThrow(/no verified phone number/i);
  });

  it('creates a new account when the phone is unseen and fullName+role are given', async () => {
    const { service, prisma } = makeService({ existingUser: null });
    const result = await service.firebaseAuth('token', { fullName: 'Test User', role: 'CUSTOMER' });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        phone: '+923033288667',
        fullName: 'Test User',
        role: UserRole.CUSTOMER,
      }),
    });
    expect(result.user.phone).toBe('+923033288667');
    expect(result.accessToken).toBe('signed.jwt.token');
  });

  it('refuses to create a new account without fullName/role', async () => {
    const { service } = makeService({ existingUser: null });
    await expect(service.firebaseAuth('token', {})).rejects.toThrow(/fullName and role are required/i);
  });

  it('logs in an existing account, ignoring fullName/role if passed', async () => {
    const { service, prisma } = makeService({
      existingUser: {
        id: 'u-1',
        phone: '+923033288667',
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        fullName: 'Original Name',
      },
    });
    const result = await service.firebaseAuth('token', { fullName: 'Ignored', role: 'CAREGIVER' });
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(result.user.fullName).toBe('Original Name');
  });

  it('refuses sign-in to an audience the account role does not match', async () => {
    const { service } = makeService({
      existingUser: {
        id: 'u-1',
        phone: '+923033288667',
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        fullName: 'Test',
      },
    });
    await expect(service.firebaseAuth('token', {}, 'ADMIN')).rejects.toThrow(/cannot sign in/i);
  });

  it('refuses a suspended account', async () => {
    const { service } = makeService({
      existingUser: {
        id: 'u-1',
        phone: '+923033288667',
        role: UserRole.CUSTOMER,
        status: UserStatus.SUSPENDED,
        fullName: 'Test',
      },
    });
    await expect(service.firebaseAuth('token', {})).rejects.toThrow(/not active/i);
  });
});
