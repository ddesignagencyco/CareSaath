import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from '../generated/prisma/client.js';

/**
 * Channel adapters (TRD §6.7). Each adapter knows how to deliver one
 * notification over one transport. Vendors for WhatsApp/push are still TBD, so
 * the dev adapters log the payload; swap the implementation without touching
 * `NotificationsService`.
 */
export interface ChannelDelivery {
  phone?: string | null;
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
