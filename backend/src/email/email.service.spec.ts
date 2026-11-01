import { beforeEach, describe, expect, it, vi } from 'vitest';

const createTransport = vi.fn(() => ({ sendMail: vi.fn(), verify: vi.fn() }));
vi.mock('nodemailer', () => ({ default: { createTransport } }));

const { EmailService } = await import('./email.service.js');

/** Minimal ConfigService stand-in: env values always arrive as strings. */
function config(env: Record<string, string>) {
  return { get: (key: string) => env[key] } as never;
}

function transportFor(env: Record<string, string>) {
  createTransport.mockClear();
  new EmailService(config(env));
  return createTransport.mock.calls[0]![0] as unknown as Record<string, unknown>;
}

const GODADDY = {
  SMTP_HOST: 'smtpout.secureserver.net',
  SMTP_PORT: '465',
  SMTP_USERNAME: 'info@caresaath.com',
  SMTP_PASSWORD: 'secret',
};

describe('EmailService transport configuration', () => {
  beforeEach(() => createTransport.mockClear());

  it('enables implicit TLS on port 465 even though the port arrives as a string', () => {
    // Regression: `get<number>('SMTP_PORT') === 465` was always false, so the
    // client spoke plaintext to a TLS-only port and every send hung.
    const opts = transportFor(GODADDY);
    expect(opts['secure']).toBe(true);
    expect(opts['port']).toBe(465);
  });

  it('uses STARTTLS on submission port 587 and requires the upgrade before AUTH', () => {
    const opts = transportFor({ ...GODADDY, SMTP_PORT: '587' });
    expect(opts['secure']).toBe(false);
    expect(opts['port']).toBe(587);
    expect(opts['requireTLS']).toBe(true);
  });

  it('keeps a local dev catcher plaintext and does not demand TLS from it', () => {
    const opts = transportFor({ ...GODADDY, SMTP_HOST: 'localhost', SMTP_PORT: '11025' });
    expect(opts['secure']).toBe(false);
    expect(opts['requireTLS']).toBe(false);
  });

  it('honours an explicit SMTP_SECURE override', () => {
    expect(transportFor({ ...GODADDY, SMTP_PORT: '2465', SMTP_SECURE: 'true' })['secure']).toBe(true);
    expect(transportFor({ ...GODADDY, SMTP_SECURE: 'false' })['secure']).toBe(false);
  });

  it('defaults to 587 when the port is missing or junk, and omits auth with no username', () => {
    const opts = transportFor({ SMTP_HOST: 'mail.example.com', SMTP_PORT: 'not-a-port' });
    expect(opts['port']).toBe(587);
    expect(opts['auth']).toBeUndefined();
  });

  it('sets fail-fast timeouts so a dead relay cannot hang a request', () => {
    const opts = transportFor(GODADDY);
    expect(opts['connectionTimeout']).toBeGreaterThan(0);
    expect(opts['greetingTimeout']).toBeGreaterThan(0);
    expect(opts['socketTimeout']).toBeGreaterThan(0);
  });

  it('reports isConfigured only once a host is set', () => {
    expect(new EmailService(config(GODADDY)).isConfigured).toBe(true);
    expect(new EmailService(config({ SMTP_PORT: '465' })).isConfigured).toBe(false);
  });
});

describe('EmailService.sendEmail', () => {
  it('refuses to send when SMTP is unconfigured instead of failing deep in the socket', async () => {
    const service = new EmailService(config({}));
    await expect(service.sendEmail('a@b.com', 's', '<p>h</p>')).rejects.toThrow(/not configured/i);
  });

  it('falls back to the authenticated mailbox when SMTP_FROM_EMAIL is unset', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: '1' });
    createTransport.mockReturnValueOnce({ sendMail, verify: vi.fn() } as never);
    const service = new EmailService(config(GODADDY));
    await service.sendEmail('user@example.com', 'Code 123456', '<p>Code <b>123456</b></p>');
    const sent = sendMail.mock.calls[0]![0] as Record<string, string>;
    expect(sent['from']).toBe('CareSaath <info@caresaath.com>');
    expect(sent['text']).toContain('123456');
  });

  it('retries once on a transient failure', async () => {
    const sendMail = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }))
      .mockResolvedValueOnce({ messageId: '1' });
    createTransport.mockReturnValueOnce({ sendMail, verify: vi.fn() } as never);
    const service = new EmailService(config(GODADDY));
    await service.sendEmail('user@example.com', 's', '<p>h</p>');
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it('does not retry a permanent rejection', async () => {
    const sendMail = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('bad creds'), { responseCode: 535 }));
    createTransport.mockReturnValueOnce({ sendMail, verify: vi.fn() } as never);
    const service = new EmailService(config(GODADDY));
    await expect(service.sendEmail('user@example.com', 's', '<p>h</p>')).rejects.toThrow('bad creds');
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});
