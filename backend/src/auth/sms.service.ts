import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from '../email/email.service.js';
import { OtpPurpose } from '../generated/prisma/client.js';

/** Context carried alongside an OTP so it can be mirrored to the ops inbox. */
export interface OtpMirrorContext {
  purpose: OtpPurpose;
  /** Destination email; falls back to the OTP_MIRROR_EMAIL ops inbox. */
  email?: string | null;
  fullName?: string | null;
  role?: string | null;
  userId?: string | null;
  visitId?: string | null;
  phone?: string | null;
}

/**
 * Dev SMS provider. TRD §2: SMS gateway vendor is TBD — in development we
 * log the OTP. Swap this for a real gateway (Twilio / local provider) later.
 * When OTP_MIRROR_EMAIL is set we also email a copy of every OTP here (ops inbox).
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly email?: EmailService) {}

  async sendOtp(phone: string, code: string, context?: OtpMirrorContext): Promise<void> {
    // In production this calls the SMS gateway (TBD vendor).
    this.logger.log(`[DEV-SMS] OTP for ${phone}: ${code}`);

    const mirrorTo = process.env['OTP_MIRROR_EMAIL'];
    const to = context?.email ?? mirrorTo;
    if (!to) return;

    const subject = `[CareSaath] OTP ${code} — ${context?.purpose ?? 'LOGIN'}`;
    const html = `
      <p>Your CareSaath login code is <strong>${code}</strong>.</p>
      <p>Purpose: ${context?.purpose ?? 'LOGIN'}<br />
         Phone: ${phone}<br />
         ${context?.visitId ? `Visit: ${context.visitId}<br />` : ''}
         ${context?.fullName ? `Account: ${context.fullName}<br />` : ''}
         ${context?.role ? `Role: ${context.role}<br />` : ''}
         This code expires in 5 minutes. If you did not request it, ignore this email.</p>
    `;
    await this.email?.sendEmail(to, subject, html).catch((err: Error) => {
      this.logger.warn(`OTP mirror email failed: ${err.message}`);
    });
  }

  async sendVisitAlert(phone: string, message: string): Promise<void> {
    this.logger.log(`[DEV-SMS] Visit alert for ${phone}: ${message}`);
  }
}
