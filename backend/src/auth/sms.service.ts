import { Injectable, Logger } from '@nestjs/common';

/**
 * Dev SMS provider. TRD §2: SMS gateway vendor is TBD — in development we
 * log the OTP. Swap this for a real gateway (Twilio / local provider) later.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  async sendOtp(phone: string, code: string): Promise<void> {
    // In production this calls the SMS gateway (TBD vendor).
    this.logger.log(`[DEV-SMS] OTP for ${phone}: ${code}`);
  }

  async sendVisitAlert(phone: string, message: string): Promise<void> {
    this.logger.log(`[DEV-SMS] Visit alert for ${phone}: ${message}`);
  }
}
