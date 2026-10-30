import { Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';
import { NotificationChannel, UserRole } from '../generated/prisma/client.js';
import { SmsService } from '../auth/sms.service.js';
import { EmailService } from '../email/email.service.js';
import { renderNotificationEmail } from '../email/templates.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { eventDefinition } from './events.js';

/**
 * Channel adapters (TRD A6.7). Each adapter knows how to deliver one
 * notification over one transport. WhatsApp uses an operator-configured HTTP
 * gateway; push uses the browser Web Push protocol (VAPID) so no vendor account
 * is required to go live.
 */
export interface ChannelDelivery {
  userId: string;
  notificationId?: string;
  phone?: string | null;
  email?: string | null;
  title?: string;
  message?: string;
  payload?: Record<string, unknown>;
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

interface PushPayload {
  title: string;
  body: string;
  event: string;
  notificationId?: string;
  data: Record<string, unknown>;
}

/** Real browser push services. Custom/self-hosted ones can be added per deploy. */
const DEFAULT_PUSH_HOSTS = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'web.push.apple.com',
  'push.apple.com',
  'notify.windows.com',
];

/**
 * The API posts to whatever endpoint a client registers, so restrict endpoints
 * to known push services (plus an optional operator allowlist) to avoid turning
 * notifications into an SSRF primitive against internal hosts.
 */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') {
    return false;
  }
  const extraHosts = (process.env['PUSH_ENDPOINT_ALLOWED_HOSTS'] ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  const hostname = url.hostname.toLowerCase();
  return [...DEFAULT_PUSH_HOSTS, ...extraHosts].some(
    (host) => hostname === host || hostname.endsWith(`.${host}`),
  );
}

/**
 * Web Push (VAPID). The in-app feed row is persisted by NotificationsService
 * regardless of whether a provider is configured, so `enabled()` stays true:
 * a missing VAPID keypair only disables delivery to the browser's push service,
 * never the feed itself.
 */
@Injectable()
export class PushChannelAdapter implements NotificationChannelAdapter {
  readonly channel = NotificationChannel.PUSH;
  private readonly logger = new Logger(PushChannelAdapter.name);
  private readonly publicKey = process.env['VAPID_PUBLIC_KEY']?.trim();
  private readonly privateKey = process.env['VAPID_PRIVATE_KEY']?.trim();
  private readonly subject =
    process.env['VAPID_SUBJECT']?.trim() || 'mailto:info@caresaath.com';
  private readonly configured: boolean;

  constructor(private readonly prisma: PrismaService) {
    this.configured = Boolean(this.publicKey && this.privateKey);
    if (this.configured) {
      try {
        webpush.setVapidDetails(this.subject, this.publicKey!, this.privateKey!);
      } catch (error) {
        this.configured = false;
        this.logger.error(`Invalid VAPID configuration; push delivery disabled: ${(error as Error).message}`);
      }
    } else {
      this.logger.debug('VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY not set; browser push delivery disabled');
    }
  }

  /** True even when delivery is unconfigured: the PUSH row is the in-app feed. */
  enabled(): boolean {
    return true;
  }

  get publicVapidKey(): string | null {
    return this.configured ? (this.publicKey ?? null) : null;
  }

  async send(delivery: ChannelDelivery): Promise<void> {
    if (!this.configured) {
      return;
    }
    try {
      const subscriptions = await this.prisma.pushSubscription.findMany({
        where: { userId: delivery.userId },
      });
      if (subscriptions.length === 0) {
        this.logger.debug(`No push subscriptions for user ${delivery.userId}`);
        return;
      }
      const payload = JSON.stringify(this.buildPayload(delivery));
      const options = {
        TTL: 60 * 60,
        urgency: isCriticalNotificationEvent(delivery.event) ? ('high' as const) : ('normal' as const),
      };
      await Promise.all(
        subscriptions.map((subscription) => this.deliver(subscription, payload, options)),
      );
    } catch (error) {
      // The in-app feed entry is already persisted; remote push is best-effort.
      this.logger.warn(`Push dispatch failed for user ${delivery.userId}: ${(error as Error).message}`);
    }
  }

  private buildPayload(delivery: ChannelDelivery): PushPayload {
    return {
      title: (delivery.title ?? 'CareSaath').slice(0, 120),
      body: (delivery.message ?? delivery.event).slice(0, 500),
      event: delivery.event,
      notificationId: delivery.notificationId,
      data: delivery.payload ?? {},
    };
  }

  private async deliver(
    subscription: { id: string; endpoint: string; p256dh: string; auth: string },
    payload: string,
    options: { TTL: number; urgency: 'high' | 'normal' },
  ): Promise<void> {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
        options,
      );
      await this.prisma.pushSubscription
        .update({
          where: { id: subscription.id },
          data: { lastSuccessAt: new Date(), failureCount: 0 },
        })
        .catch(() => undefined);
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        // The browser/device unsubscribed or the endpoint expired.
        await this.prisma.pushSubscription
          .delete({ where: { id: subscription.id } })
          .catch(() => undefined);
        this.logger.debug(`Removed expired push subscription ${subscription.id}`);
        return;
      }
      this.logger.warn(
        `Push delivery to subscription ${subscription.id} failed${statusCode ? ` (${statusCode})` : ''}: ${(error as Error).message}`,
      );
      await this.prisma.pushSubscription
        .update({
          where: { id: subscription.id },
          data: { lastFailureAt: new Date(), failureCount: { increment: 1 } },
        })
        .catch(() => undefined);
    }
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
