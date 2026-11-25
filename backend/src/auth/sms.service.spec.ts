import { afterEach, describe, expect, it, vi } from 'vitest';
import { SmsService } from './sms.service.js';
import { OtpPurpose } from '../generated/prisma/client.js';

const OPS_INBOX = 'ops@caresaath.com';
const OWNER = 'real.user@example.com';

function makeService(opts: { smtpConfigured?: boolean } = {}) {
  const email = {
    isConfigured: opts.smtpConfigured ?? true,
    sendEmail: vi.fn().mockResolvedValue({}),
  };
  return { sms: new SmsService(email as never), email };
}

/** Every address the service tried to send a code to. */
function recipients(email: { sendEmail: ReturnType<typeof vi.fn> }): string[] {
  return email.sendEmail.mock.calls.map((c) => c[0] as string);
}

describe('SmsService OTP delivery', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    OtpPurpose.LOGIN,
    OtpPurpose.SIGNUP,
    OtpPurpose.CHANGE_PHONE,
    OtpPurpose.VISIT_CHECKIN,
  ])('mirrors a %s code to ops and emails the holder', async (purpose) => {
    vi.stubEnv('OTP_MIRROR_EMAIL', OPS_INBOX);
    const { sms, email } = makeService();
    await sms.sendOtp('+923000000000', '123456', { purpose, email: OWNER });
    expect(recipients(email).sort()).toEqual([OPS_INBOX, OWNER].sort());
  });

  it('skips the holder copy when they were already emailed a branded code', async () => {
    vi.stubEnv('OTP_MIRROR_EMAIL', OPS_INBOX);
    const { sms, email } = makeService();
    await sms.sendOtp('+923000000000', '123456', {
      purpose: OtpPurpose.LOGIN,
      email: OWNER,
      alreadyEmailed: true,
    });
    expect(recipients(email)).toEqual([OPS_INBOX]);
  });

  it('never puts the code in a subject and masks the phone in the mirror', async () => {
    vi.stubEnv('OTP_MIRROR_EMAIL', OPS_INBOX);
    const { sms, email } = makeService();
    await sms.sendOtp('+923001112233', '654321', {
      purpose: OtpPurpose.VISIT_CHECKIN,
      email: OWNER,
      role: 'CUSTOMER',
      visitId: 'v-1',
    });
    const calls = email.sendEmail.mock.calls;
    const mirror = calls.find((c) => c[0] === OPS_INBOX)!;
    const holder = calls.find((c) => c[0] === OWNER)!;
    expect(mirror[1]).toContain('Visit check-in');
    expect(mirror[1]).not.toContain('654321');
    expect(mirror[2]).toContain('654321');
    expect(mirror[2]).toContain('•••• 2233');
    expect(mirror[2]).not.toContain('+923001112233');
    expect(holder[1]).toContain('visit check-in');
    expect(holder[1]).not.toContain('654321');
    expect(holder[2]).toContain('654321');
  });

  it('one recipient failing does not stop the other', async () => {
    vi.stubEnv('OTP_MIRROR_EMAIL', OPS_INBOX);
    const { sms, email } = makeService();
    email.sendEmail.mockRejectedValueOnce(new Error('relay refused'));
    await expect(
      sms.sendOtp('+923000000000', '123456', {
        purpose: OtpPurpose.VISIT_CHECKIN,
        email: OWNER,
      }),
    ).resolves.toBeUndefined();
    expect(email.sendEmail).toHaveBeenCalledTimes(2);
  });

  it('sends nothing when SMTP is off or there is no recipient', async () => {
    vi.stubEnv('OTP_MIRROR_EMAIL', OPS_INBOX);
    const off = makeService({ smtpConfigured: false });
    await off.sms.sendOtp('+923000000000', '123456', { purpose: OtpPurpose.LOGIN, email: OWNER });
    expect(off.email.sendEmail).not.toHaveBeenCalled();

    vi.stubEnv('OTP_MIRROR_EMAIL', '');
    const none = makeService();
    await none.sms.sendOtp('+923000000000', '123456', { purpose: OtpPurpose.LOGIN });
    expect(none.email.sendEmail).not.toHaveBeenCalled();
  });
});
