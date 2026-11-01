import { afterEach, describe, expect, it, vi } from 'vitest';
import { SmsService } from './sms.service.js';
import { OtpPurpose } from '../generated/prisma/client.js';

const OPS_INBOX = 'info@caresaath.com';

function makeService(opts: { smtpConfigured?: boolean } = {}) {
  const email = {
    isConfigured: opts.smtpConfigured ?? true,
    sendEmail: vi.fn().mockResolvedValue({}),
  };
  return { sms: new SmsService(email as never), email };
}

/** Addresses the mirror actually sent to, in call order. */
function recipients(email: { sendEmail: ReturnType<typeof vi.fn> }): string[] {
  return email.sendEmail.mock.calls.map((c) => c[0] as string);
}

describe('SmsService OTP mirror', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    OtpPurpose.LOGIN,
    OtpPurpose.SIGNUP,
    OtpPurpose.CHANGE_PHONE,
    OtpPurpose.VISIT_CHECKIN,
  ])('mirrors a %s code to the ops inbox even when the account has its own email', async (purpose) => {
    vi.stubEnv('OTP_MIRROR_EMAIL', OPS_INBOX);
    const { sms, email } = makeService();
    await sms.sendOtp('+923000000000', '123456', { purpose, email: 'real.user@example.com' });
    expect(recipients(email)).toContain(OPS_INBOX);
  });

  it('also sends to the account holder for flows that have no branded email of their own', async () => {
    vi.stubEnv('OTP_MIRROR_EMAIL', OPS_INBOX);
    const { sms, email } = makeService();
    await sms.sendOtp('+923000000000', '123456', {
      purpose: OtpPurpose.VISIT_CHECKIN,
      email: 'real.user@example.com',
    });
    expect(recipients(email).sort()).toEqual([OPS_INBOX, 'real.user@example.com'].sort());
  });

  it('sends only the ops copy when the holder was already emailed a branded code', async () => {
    vi.stubEnv('OTP_MIRROR_EMAIL', OPS_INBOX);
    const { sms, email } = makeService();
    await sms.sendOtp('+923000000000', '123456', {
      purpose: OtpPurpose.LOGIN,
      email: 'real.user@example.com',
      alreadyEmailed: true,
    });
    expect(recipients(email)).toEqual([OPS_INBOX]);
  });

  it('never sends the same address twice', async () => {
    vi.stubEnv('OTP_MIRROR_EMAIL', OPS_INBOX);
    const { sms, email } = makeService();
    await sms.sendOtp('+923000000000', '123456', {
      purpose: OtpPurpose.CHANGE_PHONE,
      email: OPS_INBOX,
    });
    expect(recipients(email)).toEqual([OPS_INBOX]);
  });

  it('includes the code and its purpose so the ops inbox is self-explanatory', async () => {
    vi.stubEnv('OTP_MIRROR_EMAIL', OPS_INBOX);
    const { sms, email } = makeService();
    await sms.sendOtp('+923001112233', '654321', {
      purpose: OtpPurpose.VISIT_CHECKIN,
      visitId: 'visit-1',
    });
    const [, subject, html] = email.sendEmail.mock.calls[0]!;
    expect(subject).toContain('654321');
    expect(subject).toContain('VISIT_CHECKIN');
    expect(html).toContain('654321');
    expect(html).toContain('+923001112233');
  });

  it('one recipient failing does not stop the other', async () => {
    vi.stubEnv('OTP_MIRROR_EMAIL', OPS_INBOX);
    const { sms, email } = makeService();
    email.sendEmail.mockRejectedValueOnce(new Error('relay refused'));
    await expect(
      sms.sendOtp('+923000000000', '123456', {
        purpose: OtpPurpose.VISIT_CHECKIN,
        email: 'real.user@example.com',
      }),
    ).resolves.toBeUndefined();
    expect(email.sendEmail).toHaveBeenCalledTimes(2);
  });

  it('sends nothing when SMTP is unconfigured or no mirror is set', async () => {
    vi.stubEnv('OTP_MIRROR_EMAIL', OPS_INBOX);
    const off = makeService({ smtpConfigured: false });
    await off.sms.sendOtp('+923000000000', '123456', { purpose: OtpPurpose.LOGIN });
    expect(off.email.sendEmail).not.toHaveBeenCalled();

    vi.stubEnv('OTP_MIRROR_EMAIL', '');
    const noMirror = makeService();
    await noMirror.sms.sendOtp('+923000000000', '123456', {
      purpose: OtpPurpose.LOGIN,
      alreadyEmailed: true,
    });
    expect(noMirror.email.sendEmail).not.toHaveBeenCalled();
  });
});
