import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { UserRole } from '../generated/prisma/client.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { RedisService } from '../common/redis/redis.module.js';
import { NotificationsService } from '../notifications/notifications.module.js';
import { WebPushService } from '../notifications/web-push.service.js';
import { NativePushService } from '../notifications/native-push.service.js';
import { RealtimeService } from './realtime.service.js';
import { CallSignalingService } from './call-signaling.service.js';

/** How long a call rings before it counts as missed. */
export const RING_SECONDS = 30;

export interface PendingCall {
  callId: string;
  visitId: string;
  callerId: string;
  callerName: string;
  sdp: unknown;
}

const pendingKey = (calleeId: string) => `call:pending:${calleeId}`;

/**
 * Ringing for in-app calls, like a phone call: the call rings for RING_SECONDS
 * whether or not the other person is online. Their devices get an "incoming
 * call" push (browser and phone), and the invite waits in Redis so a device
 * that opens the app within the window receives it on `call:sync`. Unanswered
 * calls become MISSED: the caller hears "no answer" and the callee gets a
 * missed-call notification.
 */
@Injectable()
export class CallRingingService implements OnModuleDestroy {
  private readonly logger = new Logger(CallRingingService.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly realtime: RealtimeService,
    private readonly calls: CallSignalingService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly webPush?: WebPushService,
    @Optional() private readonly nativePush?: NativePushService,
  ) {}

  onModuleDestroy(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  /** Start ringing the callee: park the invite, push their devices, arm the missed-call timer. */
  async ring(calleeId: string, pending: PendingCall): Promise<void> {
    await this.redis.client.set(pendingKey(calleeId), JSON.stringify(pending), 'EX', RING_SECONDS);

    const timer = setTimeout(() => void this.expire(pending.callId, calleeId), RING_SECONDS * 1000);
    timer.unref();
    this.timers.set(pending.callId, timer);

    void this.pushIncoming(calleeId, pending);
  }

  /** The invite still ringing for this user, if any (for a device that just connected). */
  async pendingFor(userId: string): Promise<PendingCall | null> {
    const raw = await this.redis.client.get(pendingKey(userId));
    if (!raw) return null;
    const pending = JSON.parse(raw) as PendingCall;
    const call = await this.prisma.callLog.findUnique({ where: { id: pending.callId }, select: { status: true } });
    return call?.status === 'INITIATED' ? pending : null;
  }

  /** Stop ringing: the call was answered, declined or hung up. */
  async settle(callId: string, calleeId: string): Promise<void> {
    const timer = this.timers.get(callId);
    if (timer) clearTimeout(timer);
    this.timers.delete(callId);
    const raw = await this.redis.client.get(pendingKey(calleeId));
    if (raw && (JSON.parse(raw) as PendingCall).callId === callId) {
      await this.redis.client.del(pendingKey(calleeId));
    }
  }

  private async expire(callId: string, calleeId: string): Promise<void> {
    this.timers.delete(callId);
    try {
      const call = await this.prisma.callLog.findUnique({ where: { id: callId } });
      if (!call || call.status !== 'INITIATED') return;
      await this.calls.markMissed(callId);
      await this.redis.client.del(pendingKey(calleeId));
      this.realtime.emit({ users: [call.callerId, call.calleeId] }, 'call:missed', { callId });

      const caller = await this.prisma.user.findUnique({ where: { id: call.callerId }, select: { fullName: true } });
      await this.notifications?.notify({
        userId: call.calleeId,
        event: 'call.missed',
        payload: { callId, visitId: call.visitId },
        message: `${caller?.fullName || 'Someone'} tried to call you.`,
      });
    } catch (err) {
      this.logger.warn(`Missed-call handling for ${callId} failed: ${(err as Error).message}`);
    }
  }

  /** Short-lived, high-priority "incoming call" push to every browser and phone of the callee. */
  private async pushIncoming(calleeId: string, pending: PendingCall): Promise<void> {
    try {
      const callee = await this.prisma.user.findUnique({ where: { id: calleeId }, select: { role: true } });
      const section = callee?.role === UserRole.CAREGIVER ? 'caregiver' : 'customer';
      const payload = {
        id: pending.callId,
        event: 'call.incoming',
        title: 'Incoming call',
        body: `${pending.callerName || 'Someone'} is calling you`,
        data: {
          callId: pending.callId,
          visitId: pending.visitId,
          url: `/${section}/visits/${pending.visitId}`,
          tag: `call-${pending.callId}`,
          call: true,
        },
      };
      // A ringing push delivered after the call stopped ringing is worse than none.
      await Promise.all([
        this.webPush?.sendToUser(calleeId, payload, { ttlSeconds: RING_SECONDS, urgency: 'high' }),
        this.nativePush?.sendToUser(calleeId, payload, { ttlSeconds: RING_SECONDS }),
      ]);
    } catch (err) {
      this.logger.warn(`Incoming-call push for ${pending.callId} failed: ${(err as Error).message}`);
    }
  }
}
