import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, UserRole } from '../generated/prisma/client.js';
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
  private readonly logger = new Logger(SmsChannelAdapter.name);

  enabled(): boolean {
    return true;
  }

  async send(delivery: ChannelDelivery): Promise<void> {
    if (!delivery.phone) {
      return;
    }
    this.logger.log(`[DEV-SMS] ${delivery.phone}: ${delivery.message ?? delivery.event}`);
  }
}

@Injectable()
export class WhatsAppChannelAdapter implements NotificationChannelAdapter {
  readonly channel = NotificationChannel.WHATSAPP;
  private readonly logger = new Logger(WhatsAppChannelAdapter.name);

  enabled(): boolean {
    // WhatsApp Business vendor TBD (TRD §2); disabled until configured.
    return process.env['WHATSAPP_ENABLED'] === 'true';
  }

  async send(delivery: ChannelDelivery): Promise<void> {
    if (!delivery.phone) {
      return;
    }
    this.logger.log(`[DEV-WHATSAPP] ${delivery.phone}: ${delivery.message ?? delivery.event}`);
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
