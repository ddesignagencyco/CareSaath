import { Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';
import { PrismaService } from '../common/prisma/prisma.service.js';

export interface WebPushPayload {
  /** Notification row id, so the service worker can deep-link / dedupe. */
  id: string;
  event: string;
  title: string;
  body: string | null;
  data: unknown;
}

/**
 * Browser Web Push (VAPID) so a notification reaches a closed tab / installed
 * PWA. The in-app feed + Socket.IO path is unchanged; this is an extra delivery
 * of the same PUSH row. Disabled (no-op) until VAPID_PUBLIC_KEY and
 * VAPID_PRIVATE_KEY are set; generate a pair with `npx web-push generate-vapid-keys`.
 */
@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);
  private readonly publicKey = process.env['VAPID_PUBLIC_KEY'] ?? '';
  private readonly privateKey = process.env['VAPID_PRIVATE_KEY'] ?? '';
  private readonly subject = process.env['VAPID_SUBJECT'] ?? 'mailto:info@caresaath.com';

  constructor(private readonly prisma: PrismaService) {}

  enabled(): boolean {
    return Boolean(this.publicKey && this.privateKey);
  }

  vapidPublicKey(): string | null {
    return this.enabled() ? this.publicKey : null;
  }

  /** Best-effort fan-out to every subscription of the user; expired endpoints (404/410) are pruned. Never throws. */
  async sendToUser(userId: string, payload: WebPushPayload): Promise<void> {
    if (!this.enabled()) return;
    try {
      const subscriptions = await this.prisma.pushSubscription.findMany({ where: { userId } });
      const body = JSON.stringify(payload);
      await Promise.all(
        subscriptions.map(async (sub) => {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              body,
              {
                TTL: 24 * 3600,
                vapidDetails: { subject: this.subject, publicKey: this.publicKey, privateKey: this.privateKey },
              },
            );
            await this.prisma.pushSubscription.update({ where: { id: sub.id }, data: { lastUsedAt: new Date() } });
          } catch (err) {
            const statusCode = (err as { statusCode?: number }).statusCode;
            if (statusCode === 404 || statusCode === 410) {
              await this.prisma.pushSubscription.deleteMany({ where: { id: sub.id } });
              return;
            }
            this.logger.warn(`Web push to ${sub.id} failed: ${(err as Error).message}`);
          }
        }),
      );
    } catch (err) {
      this.logger.warn(`Web push for user ${userId} failed: ${(err as Error).message}`);
    }
  }
}
