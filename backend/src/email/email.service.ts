import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

/** Network-level SMTP errors that are worth exactly one retry. */
const TRANSIENT_ERROR_CODES = new Set([
  'ETIMEDOUT',
  'ECONNECTION',
  'ECONNRESET',
  'ESOCKET',
  'EAI_AGAIN',
  'EDNS',
]);

/** SMTP reply codes meaning "busy, try again" (4xx are transient by definition). */
const TRANSIENT_RESPONSE_CODES = new Set([421, 450, 451, 452]);

/** Hosts that are a local dev mail catcher (MailHog/Mailpit) rather than a real relay. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'mailhog', 'mailpit']);

function isTruthyFlag(value: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes(value);
}

/** Cheap HTML -> text fallback: a multipart message scores far better with spam filters. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter!: ReturnType<typeof nodemailer.createTransport>;
  private host = '';
  private port = 587;
  private secure = false;
  private user = '';

  constructor(private configService: ConfigService) {
    this.initializeTransporter();
  }

  /**
   * SMTP is only usable once a host is set. Callers that send best-effort mail
   * (OTP mirrors, notifications) check this instead of reading process.env, so
   * "not configured" and "configured but broken" stay distinguishable in logs.
   */
  get isConfigured(): boolean {
    return this.host.length > 0;
  }

  /** Human-readable config summary. Never includes the password. */
  get describeConfig(): string {
    const mode = this.secure ? 'implicit TLS' : 'STARTTLS/plain';
    return `${this.host || '(unset)'}:${this.port} [${mode}] as ${this.user || '(anonymous)'}`;
  }

  /**
   * Verify SMTP at boot so a bad relay/credential shows up immediately in the
   * deploy logs rather than as a silently swallowed warning on first signup.
   * Deliberately not awaited: a dead relay must not delay or fail startup.
   */
  onModuleInit(): void {
    if (!this.isConfigured) {
      this.logger.warn(
        'SMTP is not configured (SMTP_HOST is empty) — OTP and notification emails will NOT be sent.',
      );
      return;
    }
    this.logger.log(`SMTP configured: ${this.describeConfig}`);
    void this.testConnection().then((result) => {
      if (result.success) {
        this.logger.log('SMTP connection verified — email delivery is live.');
      } else {
        this.logger.error(
          `SMTP verification FAILED for ${this.describeConfig}: ${result.message} — emails will not be delivered until this is fixed.`,
        );
      }
    });
  }

  private initializeTransporter() {
    const cfg = this.configService;
    this.host = (cfg.get<string>('SMTP_HOST') ?? '').trim();
    this.port = Number.parseInt(String(cfg.get('SMTP_PORT') ?? ''), 10) || 587;
    this.user = (cfg.get<string>('SMTP_USERNAME') ?? '').trim();
    const pass = cfg.get<string>('SMTP_PASSWORD') ?? '';

    // `secure` MUST be true on an implicit-TLS port (465). Connecting to one in
    // plaintext deadlocks the handshake — the server waits for a TLS ClientHello
    // while nodemailer waits for the 220 greeting — so every send hangs until it
    // times out and no mail is ever delivered. Env vars are always strings, so a
    // `get<number>('SMTP_PORT') === 465` check is always false; parse first.
    const secureFlag = String(cfg.get('SMTP_SECURE') ?? '').trim().toLowerCase();
    this.secure = secureFlag ? isTruthyFlag(secureFlag) : this.port === 465;

    // On a non-implicit-TLS port, upgrade before AUTH so credentials never cross
    // a plaintext socket. Local catchers (MailHog) speak no TLS at all, so the
    // requirement is skipped for them; SMTP_REQUIRE_TLS overrides either way.
    const requireTlsFlag = String(cfg.get('SMTP_REQUIRE_TLS') ?? '').trim().toLowerCase();
    const requireTLS = requireTlsFlag
      ? isTruthyFlag(requireTlsFlag)
      : !this.secure && this.user.length > 0 && !LOCAL_HOSTS.has(this.host.toLowerCase());

    this.transporter = nodemailer.createTransport({
      host: this.host,
      port: this.port,
      secure: this.secure,
      requireTLS,
      // Omit `auth` entirely when there is no username: passing undefined
      // credentials makes nodemailer attempt a login the dev catcher rejects.
      ...(this.user ? { auth: { user: this.user, pass } } : {}),
      // Fail fast. Without these a misconfigured relay holds each send open for
      // ~2 minutes, which starves the socket pool and hides the real error.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      tls: { minVersion: 'TLSv1.2' },
    });
  }

  /** Flattens a nodemailer error into something actionable in a log line. */
  private describeError(error: unknown): string {
    const err = error as { message?: string; code?: string; responseCode?: number; response?: string };
    const parts = [err?.message ?? String(error)];
    if (err?.code) parts.push(`code=${err.code}`);
    if (err?.responseCode) parts.push(`responseCode=${err.responseCode}`);
    if (err?.response) parts.push(`response=${String(err.response).trim()}`);
    return parts.join(' ');
  }

  private isTransient(error: unknown): boolean {
    const err = error as { code?: string; responseCode?: number };
    if (err?.code && TRANSIENT_ERROR_CODES.has(err.code)) return true;
    return !!err?.responseCode && TRANSIENT_RESPONSE_CODES.has(err.responseCode);
  }

  async sendEmail(to: string, subject: string, html: string) {
    if (!this.isConfigured) {
      throw new Error('SMTP is not configured (SMTP_HOST is empty)');
    }

    // Relays like GoDaddy reject a From that is not the authenticated mailbox,
    // so fall back to the login address rather than sending an empty From.
    const fromEmail = (this.configService.get<string>('SMTP_FROM_EMAIL') ?? '').trim() || this.user;
    const fromName = (this.configService.get<string>('SMTP_FROM_NAME') ?? '').trim() || 'CareSaath';
    const from = fromEmail ? `${fromName} <${fromEmail}>` : fromName;

    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const result = await this.transporter.sendMail({
          from,
          to,
          subject,
          html,
          text: htmlToText(html),
        });
        if (attempt > 1) {
          this.logger.log(`Email to ${to} succeeded on retry.`);
        }
        return result;
      } catch (error) {
        lastError = error;
        if (attempt === 2 || !this.isTransient(error)) break;
        this.logger.warn(
          `Transient SMTP failure sending to ${to} (${this.describeError(error)}) — retrying once.`,
        );
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    this.logger.error(
      `Failed to send email to ${to} ("${subject}") via ${this.describeConfig}: ${this.describeError(lastError)}`,
    );
    throw lastError;
  }

  async testConnection() {
    if (!this.isConfigured) {
      return { success: false, message: 'SMTP is not configured (SMTP_HOST is empty)', config: this.describeConfig };
    }
    try {
      await this.transporter.verify();
      return { success: true, message: 'SMTP connection successful', config: this.describeConfig };
    } catch (error) {
      return { success: false, message: this.describeError(error), config: this.describeConfig };
    }
  }
}
