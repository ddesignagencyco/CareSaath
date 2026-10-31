import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';

function makeService(user: { id: string; email: string | null } | null) {
  const redis = { client: { incr: vi.fn().mockResolvedValue(1), expire: vi.fn(), set: vi.fn() } };
  const prisma = { user: { findUnique: vi.fn().mockResolvedValue(user) }, otpCode: { create: vi.fn() } };
  const sms = { sendOtp: vi.fn() };
  const email = { sendEmail: vi.fn().mockResolvedValue({}) };
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
  afterEach(() => vi.unstubAllEnvs());

  it('also emails the code when the account has an email and SMTP is configured', async () => {
    vi.stubEnv('SMTP_HOST', 'smtp.test');
    const { service, email, sms } = makeService({ id: 'u-1', email: 'info@caresaath.com' });
    await service.requestOtp('+923000000000');
    expect(sms.sendOtp).toHaveBeenCalled();
    const code = sms.sendOtp.mock.calls[0]![1] as string;
    expect(email.sendEmail).toHaveBeenCalledWith('info@caresaath.com', `CareSaath login code: ${code}`, expect.stringContaining(code));
  });

  it('does not email without an address or without SMTP', async () => {
    vi.stubEnv('SMTP_HOST', 'smtp.test');
    const noEmail = makeService({ id: 'u-1', email: null });
    await noEmail.service.requestOtp('+923000000000');
    expect(noEmail.email.sendEmail).not.toHaveBeenCalled();

    vi.stubEnv('SMTP_HOST', '');
    const noSmtp = makeService({ id: 'u-1', email: 'info@caresaath.com' });
    await noSmtp.service.requestOtp('+923000000000');
    expect(noSmtp.email.sendEmail).not.toHaveBeenCalled();
  });
});
