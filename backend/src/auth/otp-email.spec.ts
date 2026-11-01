import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';

function makeService(
  user: { id: string; email: string | null } | null,
  opts: { smtpConfigured?: boolean } = {},
) {
  const redis = {
    client: { incr: vi.fn().mockResolvedValue(1), expire: vi.fn(), set: vi.fn(), get: vi.fn() },
  };
  const prisma = { user: { findUnique: vi.fn().mockResolvedValue(user) }, otpCode: { create: vi.fn() } };
  const sms = { sendOtp: vi.fn() };
  const email = {
    isConfigured: opts.smtpConfigured ?? true,
    sendEmail: vi.fn().mockResolvedValue({}),
  };
  const service = new AuthService(
    prisma as never,
    redis as never,
    {} as never,
    sms as never,
    { getNumber: vi.fn().mockResolvedValue(300) } as never,
    email as never,
  );
  return { service, email, sms };
}

describe('AuthService.requestOtp — email delivery', () => {
  it('also emails the code when the account has an email and SMTP is configured', async () => {
    const { service, email, sms } = makeService({ id: 'u-1', email: 'info@caresaath.com' });
    await service.requestOtp('+923000000000');
    expect(sms.sendOtp).toHaveBeenCalled();
    const code = sms.sendOtp.mock.calls[0]![1] as string;
    expect(email.sendEmail).toHaveBeenCalledWith(
      'info@caresaath.com',
      `CareSaath login code: ${code}`,
      expect.stringContaining(code),
    );
  });

  it('tells the mirror the user was already emailed, so the code is not sent twice', async () => {
    const { service, sms } = makeService({ id: 'u-1', email: 'info@caresaath.com' });
    await service.requestOtp('+923000000000');
    expect(sms.sendOtp.mock.calls[0]![2]).toMatchObject({ alreadyEmailed: true });
  });

  it('does not email without an address or without SMTP', async () => {
    const noEmail = makeService({ id: 'u-1', email: null });
    await noEmail.service.requestOtp('+923000000000');
    expect(noEmail.email.sendEmail).not.toHaveBeenCalled();

    const noSmtp = makeService({ id: 'u-1', email: 'info@caresaath.com' }, { smtpConfigured: false });
    await noSmtp.service.requestOtp('+923000000000');
    expect(noSmtp.email.sendEmail).not.toHaveBeenCalled();
  });
});

describe('AuthService.signup — email delivery', () => {
  it('emails the registrant a sign-up code', async () => {
    const { service, email, sms } = makeService(null);
    await service.signup({
      phone: '+923001112233',
      fullName: 'New User',
      email: 'new.user@example.com',
      role: 'CUSTOMER' as never,
    });
    const code = sms.sendOtp.mock.calls[0]![1] as string;
    expect(email.sendEmail).toHaveBeenCalledWith(
      'new.user@example.com',
      `CareSaath sign-up code: ${code}`,
      expect.stringContaining(code),
    );
  });

  it('skips the email when the registrant gave no address', async () => {
    const { service, email } = makeService(null);
    await service.signup({ phone: '+923001112233', fullName: 'New User', role: 'CUSTOMER' as never });
    expect(email.sendEmail).not.toHaveBeenCalled();
  });
});
