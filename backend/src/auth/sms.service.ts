import { Injectable, Logger, Optional } from '@nestjs/common';
import { EmailService } from '../email/email.service.js';
import { WhatsAppService } from '../whatsapp/whatsapp.service.js';
import { OtpPurpose } from '../generated/prisma/client.js';
import {
  otpCodeEmailSubject,
  otpMirrorSubject,
  renderOtpCodeEmail,
  renderOtpMirrorEmail,
} from '../email/templates.js';

/** Context carried alongside an OTP so it can reach the right recipients. */
export interface OtpDeliveryContext {
  purpose: OtpPurpose;
  /** The account holder's own email. */
  email?: string | null;
  fullName?: string | null;
  role?: string | null;
  userId?: string | null;
  visitId?: string | null;
  phone?: string | null;
  /**
   * Set by login/sign-up flows that already sent the holder a branded code, so
   * they do not receive the same code twice from two different templates.
   */
  alreadyEmailed?: boolean;
}

/**
 * Dispatches a one-time code over the configured channels. Codes are NEVER
 * written to logs. The ops inbox (when configured) gets a mirror for support;
 * the account holder gets their own copy unless they were already emailed.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    @Optional() private readonly email?: EmailService,
    @Optional() private readonly whatsapp?: WhatsAppService,
  ) {}

  async sendOtp(phone: string, code: string, context?: OtpDeliveryContext): Promise<void> {
    // Deliberately no log line containing the code or the full phone number.
    if (this.whatsapp?.isConfigured) {
      await this.whatsapp.sendOtp(phone, code);
    }

    if (!this.email?.isConfigured) return;
    const purpose = context?.purpose ?? OtpPurpose.LOGIN;

    const mirrorTo = (process.env['OTP_MIRROR_EMAIL'] ?? '').trim();
    if (mirrorTo) {
      await this.email
        .sendEmail(
          mirrorTo,
          otpMirrorSubject(purpose),
          renderOtpMirrorEmail({
            code,
            purpose,
            phone,
            role: context?.role,
            visitId: context?.visitId,
            ttlMinutes: 5,
          }),
        )
        .catch((err: Error) => {
          this.logger.warn(`OTP mirror email failed: ${err.message}`);
        });
    }

    if (context?.alreadyEmailed || !context?.email) return;
    await this.email
      .sendEmail(
        context.email,
        otpCodeEmailSubject(purpose),
        renderOtpCodeEmail({ code, purpose, ttlMinutes: 5 }),
      )
      .catch((err: Error) => {
        this.logger.warn(`OTP email delivery failed: ${err.message}`);
      });
  }

  async sendVisitAlert(phone: string, message: string): Promise<void> {
    if (this.whatsapp?.isConfigured) {
      await this.whatsapp.sendTextMessage(phone, message);
    } else {
      this.logger.log(`[DEV-SMS] Visit alert for ${phone}: ${message}`);
    }
  }
}
