import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

/**
 * SMS transport. Uses a generic HTTP JSON gateway so the vendor can be swapped
 * without code changes:
 *
 *   POST SMS_API_URL
 *   Authorization: Bearer SMS_API_KEY
 *   { "to": "+923...", "message": "...", "senderId": "CareSaath" }
 *
 * Set SMS_DEV_LOG=true for local development (logs the message instead of
 * sending). Production startup refuses to boot without a provider unless that
 * flag is explicitly set (see config/validate-env.ts).
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly apiUrl = process.env['SMS_API_URL']?.trim();
  private readonly apiKey = process.env['SMS_API_KEY']?.trim();
  private readonly senderId = process.env['SMS_SENDER_ID']?.trim() || 'CareSaath';
  private readonly timeoutMs = Number(process.env['SMS_TIMEOUT_MS'] ?? 10_000);
  private readonly devLog =
    process.env['SMS_DEV_LOG'] === 'true' || process.env['NODE_ENV'] !== 'production';

  async sendOtp(phone: string, code: string): Promise<void> {
    const ttlMinutes = Math.max(1, Math.round(Number(process.env['OTP_TTL_SECONDS'] ?? 300) / 60));
    await this.send(
      phone,
      `Your CareSaath verification code is ${code}. It expires in ${ttlMinutes} minutes. Never share it.`,
    );
  }

  async sendVisitAlert(phone: string, message: string): Promise<void> {
    await this.send(phone, message);
  }

  async sendSms(phone: string, message: string): Promise<void> {
    await this.send(phone, message);
  }

  private async send(phone: string, message: string): Promise<void> {
    if (!this.apiUrl) {
      if (!this.devLog) {
        throw new ServiceUnavailableException('SMS provider is not configured');
      }
      // Local/dev only. Never enable SMS_DEV_LOG in production: OTPs would end up in logs.
      this.logger.warn(`[DEV-SMS] ${phone}: ${message}`);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({ to: phone, message, senderId: this.senderId }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(
          `SMS gateway responded ${response.status}${body ? `: ${body.slice(0, 200)}` : ''}`,
        );
      }
    } catch (error) {
      this.logger.error(`SMS delivery to ${phone} failed: ${(error as Error).message}`);
      throw new ServiceUnavailableException('Could not send SMS, please try again');
    } finally {
      clearTimeout(timer);
    }
  }
}
