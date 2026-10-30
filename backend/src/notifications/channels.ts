import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, UserRole } from '../generated/prisma/client.js';
import { SmsService } from '../auth/sms.service.js';
import { EmailService } from '../email/email.service.js';
import { renderNotificationEmail } from '../email/templates.js';
import { eventDefinition } from './events.js';

/**
 * Channel adapters (TRD §6.7). Each adapter knows how to deliver one
 * notification over one transport. Vendors for WhatsApp/push are still TBD, so
 * the dev adapters log the payload; swap the implementation without touching
 * `NotificationsService`.
 */
export interface ChannelDelivery {
  phone?: string | null;
  email?: string | null;
  title?: string;
  message?: string;
  event: string;
}

export interface NotificationChannelAdapter {
  readonly channel: NotificationChannel;
  /** Whether the adapter is configured/available. */
  enabled(): boolean;
  send(delivery: ChannelDelivery): Promise<void>;
}

@Injectable()
export class SmsChannelAdapter implements NotificationChannelAdapter {
  readonly channel = NotificationChannel.SMS;

  constructor(private readonly sms: SmsService) {}

  enabled(): boolean {
    return true;
  }

  async send(delivery: ChannelDelivery): Promise<void> {
    if (!delivery.phone) {
      return;
    }
    await this.sms.sendSms(delivery.phone, delivery.message ?? delivery.event);
  }
}

@Injectable()
export class WhatsAppChannelAdapter implements NotificationChannelAdapter {
  readonly channel = NotificationChannel.WHATSAPP;
  private readonly logger = new Logger(WhatsAppChannelAdapter.name);
  private readonly apiUrl = process.env['WHATSAPP_API_URL']?.trim();
  private readonly apiKey = process.env['WHATSAPP_API_KEY']?.trim();

  enabled(): boolean {
    // Disabled until the operator opts in and supplies a provider URL.
    return process.env['WHATSAPP_ENABLED'] === 'true' && Boolean(this.apiUrl);
  }

  async send(delivery: ChannelDelivery): Promise<void> {
    if (!delivery.phone) {
      return;
    }
    if (!this.apiUrl) {
      this.logger.warn(
        `[DEV-WHATSAPP] ${delivery.phone}: ${delivery.message ?? delivery.event} (set WHATSAPP_API_URL to deliver)`,
      );
      return;
    }
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({ to: delivery.phone, message: delivery.message ?? delivery.event }),
    });
    if (!response.ok) {
      throw new Error(`WhatsApp gateway responded ${response.status}`);
    }
  }
}

@Injectable()
export class PushChannelAdapter implements NotificationChannelAdapter {
  readonly channel = NotificationChannel.PUSH;
  private readonly logger = new Logger(PushChannelAdapter.name);

  enabled(): boolean {
    return true;
  }

  async send(delivery: ChannelDelivery): Promise<void> {
    // In-app push is persisted by NotificationsService; nothing to dispatch in dev.
    this.logger.debug(`[PUSH] ${delivery.event}`);
  }
}

/** SOS events are safety-critical regardless of which role receives them. */
const CRITICAL_EVENTS = new Set(['safety_incident.sos', 'safety_incident.sos.contact']);

/** Critical events bypass per-channel notification preferences: safety alerts are never opted out of. */
export function isCriticalNotificationEvent(event: string): boolean {
  return CRITICAL_EVENTS.has(event);
}

/** Admin-only catalogue events read as action items rather than routine updates. */
function emailVariant(event: string): 'standard' | 'admin' | 'critical' {
  if (CRITICAL_EVENTS.has(event)) {
    return 'critical';
  }
  if (eventDefinition(event)?.audience.includes(UserRole.ADMIN)) {
    return 'admin';
  }
  return 'standard';
}

@Injectable()
export class EmailChannelAdapter implements NotificationChannelAdapter {
  readonly channel = NotificationChannel.EMAIL;
  private readonly logger = new Logger(EmailChannelAdapter.name);

  constructor(private readonly emailService: EmailService) {}

  enabled(): boolean {
    return true;
  }

  async send(delivery: ChannelDelivery): Promise<void> {
    if (!delivery.email) {
      return;
    }
    const title = delivery.title ?? 'CareSaath Notification';
    const html = renderNotificationEmail({
      title,
      message: delivery.message,
      variant: emailVariant(delivery.event),
    });
    try {
      await this.emailService.sendEmail(delivery.email, title, html);
    } catch (error) {
      this.logger.warn(`Failed to email ${delivery.email} for "${delivery.event}": ${(error as Error).message}`);
      throw error;
    }
  }
}
