import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Normalizes a phone number to WhatsApp international standard (E.164 without leading +).
 * Example:
 *   "+923152224435" -> "923152224435"
 *   "03152224435"   -> "923152224435"
 *   "3152224435"    -> "923152224435"
 */
export function normalizeWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('0') && digits.length === 11) {
    return `92${digits.slice(1)}`;
  }
  if (!digits.startsWith('92') && digits.length === 10) {
    return `92${digits}`;
  }
  return digits;
}

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(private readonly config: ConfigService) {}

  /** Whether WhatsApp Cloud API is configured and enabled in environment. */
  get isConfigured(): boolean {
    const enabled = this.config.get<string>('WHATSAPP_ENABLED');
    const isEnabled = enabled === 'true' || enabled === '1';
    return isEnabled && !!this.phoneNumberId && !!this.accessToken;
  }

  get phoneNumberId(): string {
    return (this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID') ?? '').trim();
  }

  get accessToken(): string {
    return (this.config.get<string>('WHATSAPP_ACCESS_TOKEN') ?? '').trim();
  }

  get apiVersion(): string {
    return (this.config.get<string>('WHATSAPP_API_VERSION') ?? 'v21.0').trim();
  }

  get otpTemplateName(): string {
    return (this.config.get<string>('WHATSAPP_OTP_TEMPLATE') ?? 'caresaath_otp').trim();
  }

  get templateLanguage(): string {
    return (this.config.get<string>('WHATSAPP_TEMPLATE_LANG') ?? 'en_US').trim();
  }

  /**
   * Sends an OTP verification code via WhatsApp.
   * If a custom Authentication template is configured, it sends that template with dynamic code.
   * If template is set to 'hello_world' (e.g. initial testing), it sends the default test template.
   */
  async sendOtp(phone: string, code: string): Promise<WhatsAppSendResult> {
    if (!this.isConfigured) {
      this.logger.debug(`[WHATSAPP-SKIPPED] WhatsApp not configured/enabled; skipping OTP to ${phone}`);
      return { success: false, error: 'WHATSAPP_NOT_CONFIGURED' };
    }

    const cleanPhone = normalizeWhatsAppNumber(phone);
    const template = this.otpTemplateName;

    // 1. First, try sending dynamic text message (works within 24h conversation window)
    const textMsg = `🔐 CareSaath: Your verification code is ${code}. It will expire in 5 minutes.`;
    const textTry = await this.sendTextMessage(cleanPhone, textMsg);
    if (textTry.success) {
      this.logger.log(`[WHATSAPP-OTP] Sent dynamic text OTP to +${cleanPhone}: ${code}`);
      return textTry;
    }

    // 2. If text message failed (e.g. 24h window closed), try custom template if configured
    if (template && template !== 'hello_world') {
      const payloadWithButton = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhone,
        type: 'template',
        template: {
          name: template,
          language: { code: this.templateLanguage },
          components: [
            {
              type: 'body',
              parameters: [{ type: 'text', text: code }],
            },
            {
              type: 'button',
              sub_type: 'url',
              index: '0',
              parameters: [{ type: 'text', text: code }],
            },
          ],
        },
      };

      const firstTry = await this.postMessagesApi(payloadWithButton);
      if (firstTry.success) {
        this.logger.log(`[WHATSAPP-OTP] Sent OTP code to +${cleanPhone} (template: ${template})`);
        return firstTry;
      }

      // If template has no button, fallback to body-only parameters
      const payloadBodyOnly = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhone,
        type: 'template',
        template: {
          name: template,
          language: { code: this.templateLanguage },
          components: [
            {
              type: 'body',
              parameters: [{ type: 'text', text: code }],
            },
          ],
        },
      };

      const secondTry = await this.postMessagesApi(payloadBodyOnly);
      if (secondTry.success) {
        this.logger.log(`[WHATSAPP-OTP] Sent OTP code to +${cleanPhone} (body-only template: ${template})`);
        return secondTry;
      }
    }

    // 3. Fallback to default test template 'hello_world' if all else fails
    return this.sendTemplate(cleanPhone, 'hello_world', this.templateLanguage);
  }

  /**
   * Sends any approved template message by name and parameters.
   */
  async sendTemplate(
    phone: string,
    templateName: string,
    languageCode = 'en_US',
    components?: Record<string, unknown>[],
  ): Promise<WhatsAppSendResult> {
    if (!this.isConfigured) {
      return { success: false, error: 'WHATSAPP_NOT_CONFIGURED' };
    }

    const cleanPhone = normalizeWhatsAppNumber(phone);
    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanPhone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
      },
    };

    if (components && components.length > 0) {
      (payload['template'] as Record<string, unknown>)['components'] = components;
    }

    return this.postMessagesApi(payload);
  }

  /**
   * Sends a plain text message. Note that Meta Cloud API allows text messages
   * only within the 24-hour customer service window (after a user has messaged the business).
   */
  async sendTextMessage(phone: string, text: string): Promise<WhatsAppSendResult> {
    if (!this.isConfigured) {
      return { success: false, error: 'WHATSAPP_NOT_CONFIGURED' };
    }

    const cleanPhone = normalizeWhatsAppNumber(phone);
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanPhone,
      type: 'text',
      text: { body: text },
    };

    return this.postMessagesApi(payload);
  }

  private async postMessagesApi(payload: Record<string, unknown>): Promise<WhatsAppSendResult> {
    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      if (response.ok) {
        const messages = data['messages'] as Array<{ id: string }> | undefined;
        const messageId = messages?.[0]?.id;
        return { success: true, messageId };
      }

      const errorObj = data['error'] as Record<string, unknown> | undefined;
      const errorMessage =
        typeof errorObj?.['message'] === 'string'
          ? errorObj['message']
          : `HTTP ${response.status} ${response.statusText}`;

      return { success: false, error: errorMessage };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }
}
