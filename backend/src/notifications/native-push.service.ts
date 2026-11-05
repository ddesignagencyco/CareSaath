import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { FirebaseService } from '../firebase/firebase.service.js';
import type { WebPushPayload } from './web-push.service.js';

/** FCM error codes meaning the token will never work again, so its row is deleted. */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/** Android notification channel the app creates for these alerts (see the app's push setup). */
export const ANDROID_CHANNEL_ID = 'caresaath-default';

/**
 * Native app push (Firebase Cloud Messaging) so a notification reaches a phone
 * whose app is closed or in the background. Same role as WebPushService for
 * browsers: an extra delivery of the in-app PUSH row. Disabled (no-op) until
 * FIREBASE_ADMIN_SDK_KEY is set — the same key phone auth already uses.
 */
@Injectable()
export class NativePushService {
  private readonly logger = new Logger(NativePushService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly firebase?: FirebaseService,
  ) {}

  enabled(): boolean {
    return Boolean(this.firebase?.messaging);
  }

  /** Best-effort fan-out to every device of the user; dead tokens are pruned. Never throws. */
  async sendToUser(userId: string, payload: WebPushPayload, opts: { ttlSeconds?: number } = {}): Promise<void> {
    const messaging = this.firebase?.messaging;
    if (!messaging) return;
    try {
      const devices = await this.prisma.deviceToken.findMany({ where: { userId }, select: { id: true, token: true } });
      if (devices.length === 0) return;

      // FCM data values must be strings; the app parses `payload` back into an object.
      const data: Record<string, string> = {
        notificationId: payload.id,
        event: payload.event,
        payload: JSON.stringify(payload.data ?? null),
      };
      const result = await messaging.sendEachForMulticast({
        tokens: devices.map((d) => d.token),
        notification: { title: payload.title, ...(payload.body ? { body: payload.body } : {}) },
        data,
        android: {
          priority: 'high',
          ttl: (opts.ttlSeconds ?? 24 * 3600) * 1000,
          notification: { channelId: ANDROID_CHANNEL_ID, tag: payload.id },
        },
        apns: { payload: { aps: { sound: 'default' } } },
      });

      const dead: string[] = [];
      const delivered: string[] = [];
      result.responses.forEach((response, i) => {
        if (response.success) {
          delivered.push(devices[i].id);
        } else if (response.error && DEAD_TOKEN_CODES.has(response.error.code)) {
          dead.push(devices[i].id);
        } else {
          this.logger.warn(`FCM push to device ${devices[i].id} failed: ${response.error?.message ?? 'unknown'}`);
        }
      });
      if (dead.length) await this.prisma.deviceToken.deleteMany({ where: { id: { in: dead } } });
      if (delivered.length) {
        await this.prisma.deviceToken.updateMany({ where: { id: { in: delivered } }, data: { lastUsedAt: new Date() } });
      }
    } catch (err) {
      this.logger.warn(`FCM push for user ${userId} failed: ${(err as Error).message}`);
    }
  }
}
