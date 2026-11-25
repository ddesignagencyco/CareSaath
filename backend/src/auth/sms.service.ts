import { Injectable, Logger, Optional } from '@nestjs/common';
import { EmailService } from '../email/email.service.js';
import { sendWhatsAppOtp } from '../services/whatsappOtp.service.js';
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

  constructor(@Optional() private readonly email?: EmailService) {}

  async sendOtp(phone: string, code: string, context?: OtpDeliveryContext): Promise<void> {
    // Deliberately no log line containing the code or the full phone number.
    const purpose = context?.purpose ?? OtpPurpose.LOGIN;
    let deliveredViaBaileys = false;
    if (phone) {
      try {
        await sendWhatsAppOtp(phone, code, {
          purpose,
          fullName: context?.fullName ?? null,
          ttlMinutes: 5,
        });
        deliveredViaBaileys = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Baileys WhatsApp OTP failed (${msg}) — falling back to email delivery`);
      }
    }

    if (!this.email?.isConfigured) return;

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

    if (deliveredViaBaileys || context?.alreadyEmailed || !context?.email) return;
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
    this.logger.log(`[DEV-SMS] Visit alert for ${phone}: ${message}`);
  }
}
