import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { UserStatus } from '../generated/prisma/client.js';
import type { UserRole } from '../generated/prisma/client.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { RealtimeService, roleRoom, userRoom } from './realtime.service.js';
import { CallSignalingService } from './call-signaling.service.js';
import { CallRingingService, RING_SECONDS } from './call-ringing.service.js';

interface AccessPayload {
  sub: string;
  type?: string;
  exp?: number;
}

interface SocketData {
  userId?: string;
  role?: UserRole;
  expiryTimer?: NodeJS.Timeout;
}

/**
 * WebSocket entry point (Socket.IO). A client connects with its access token:
 *
 *   io(url, { auth: { token: accessToken } })
 *
 * The server verifies the token, checks the account is ACTIVE, and joins the
 * socket to `user:<id>` and `role:<ROLE>` only. The socket is closed when the
 * access token expires (event `auth.expired`), so the client refreshes its token
 * and reconnects; a revoked or deactivated account cannot stay subscribed.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly calls: CallSignalingService,
    private readonly ringing: CallRingingService,
  ) {}

  afterInit(server: Server): void {
    this.realtime.attach(server);
    this.logger.log('Realtime gateway ready');
  }

  async handleConnection(client: Socket): Promise<void> {
    const data = client.data as SocketData;
    try {
      const token = this.extractToken(client);
      if (!token) {
        throw new Error('Missing access token');
      }
      const payload = await this.jwt.verifyAsync<AccessPayload>(token, {
        secret: process.env['JWT_ACCESS_SECRET'],
      });
      if (payload.type !== 'access') {
        throw new Error('Not an access token');
      }
      // The role is read from the database, not the token, so a role change takes effect on reconnect.
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, role: true, status: true },
      });
      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new Error('Account is not active');
      }

      data.userId = user.id;
      data.role = user.role;
      await client.join([userRoom(user.id), roleRoom(user.role)]);

      const expiresInMs = payload.exp ? payload.exp * 1000 - Date.now() : null;
      if (expiresInMs !== null) {
        if (expiresInMs <= 0) {
          throw new Error('Access token expired');
        }
        data.expiryTimer = setTimeout(() => {
          client.emit('auth.expired', { message: 'Access token expired, refresh it and reconnect' });
          client.disconnect(true);
        }, expiresInMs);
        data.expiryTimer.unref();
      }
      client.emit('ready', {
        userId: user.id,
        role: user.role,
        expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
      });
    } catch (err) {
      client.emit('auth.error', { message: (err as Error).message });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const data = client.data as SocketData;
    if (data.expiryTimer) {
      clearTimeout(data.expiryTimer);
    }
  }

  /**
   * In-app call signaling (offer/answer/ICE relay only; audio/video is
   * peer-to-peer WebRTC between the two client apps). Every message is
   * authorized against a shared, still-active visit and logged to CallLog.
   * Client events: call:invite, call:answer, call:ice-candidate, call:end,
   * call:reject. Server events it may receive: call:incoming, call:answered,
   * call:ice-candidate, call:ended, call:rejected, call:error, call:outgoing.
   */
  @SubscribeMessage('call:invite')
  async handleCallInvite(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { visitId: string; calleeId?: string; callerName?: string; sdp: unknown },
  ): Promise<void> {
    const callerId = (client.data as SocketData).userId;
    if (!callerId) return;
    try {
      // calleeId is optional: the customer has no public way to learn the
      // caregiver's user id, so when it's omitted the callee is derived from
      // the visit's other participant instead.
      const calleeId = body.calleeId ?? (await this.calls.resolveCallee(body.visitId, callerId));
      const call = await this.calls.startCall(body.visitId, callerId, calleeId);
      const caller = await this.prisma.user.findUnique({
        where: { id: callerId },
        select: { fullName: true },
      });
      const incoming = {
        callId: call.id,
        visitId: body.visitId,
        callerId,
        callerName: body.callerName ?? caller?.fullName ?? '',
        sdp: body.sdp,
      };
      // Ring like a phone call even when the other person is offline: their
      // devices get a push, and opening the app in time picks the call up.
      const calleeOnline = this.realtime.isUserConnected(calleeId);
      if (calleeOnline) {
        this.realtime.emit({ users: [calleeId] }, 'call:incoming', incoming);
      }
      await this.ringing.ring(calleeId, incoming);
      client.emit('call:outgoing', { callId: call.id, calleeOnline, ringSeconds: RING_SECONDS });
    } catch (err) {
      client.emit('call:error', { message: (err as Error).message });
    }
  }

  /**
   * A device that just connected (e.g. opened from an "incoming call" push)
   * asks for any call still ringing for this user, so it can show it.
   */
  @SubscribeMessage('call:sync')
  async handleCallSync(@ConnectedSocket() client: Socket): Promise<void> {
    const userId = (client.data as SocketData).userId;
    if (!userId) return;
    try {
      const pending = await this.ringing.pendingFor(userId);
      if (pending) client.emit('call:incoming', pending);
    } catch (err) {
      this.logger.warn(`call:sync failed: ${(err as Error).message}`);
    }
  }

  @SubscribeMessage('call:answer')
  async handleCallAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { callId: string; sdp: unknown },
  ): Promise<void> {
    const userId = (client.data as SocketData).userId;
    if (!userId) return;
    try {
      const call = await this.calls.loadForRouting(body.callId, userId);
      await this.ringing.settle(call.id, call.calleeId);
      await this.calls.markConnected(call.id);
      const otherUserId = call.callerId === userId ? call.calleeId : call.callerId;
      this.realtime.emit({ users: [otherUserId] }, 'call:answered', { callId: call.id, sdp: body.sdp });
    } catch (err) {
      client.emit('call:error', { message: (err as Error).message });
    }
  }

  @SubscribeMessage('call:ice-candidate')
  async handleIceCandidate(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { callId: string; candidate: unknown },
  ): Promise<void> {
    const userId = (client.data as SocketData).userId;
    if (!userId) return;
    try {
      const call = await this.calls.loadForRouting(body.callId, userId);
      const otherUserId = call.callerId === userId ? call.calleeId : call.callerId;
      this.realtime.emit({ users: [otherUserId] }, 'call:ice-candidate', {
        callId: call.id,
        candidate: body.candidate,
      });
    } catch (err) {
      client.emit('call:error', { message: (err as Error).message });
    }
  }

  @SubscribeMessage('call:end')
  async handleCallEnd(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { callId: string },
  ): Promise<void> {
    const userId = (client.data as SocketData).userId;
    if (!userId) return;
    try {
      const call = await this.calls.loadForRouting(body.callId, userId);
      await this.ringing.settle(call.id, call.calleeId);
      // Hanging up before it was answered is a missed call for the callee, not a call.
      if (call.status === 'INITIATED' && call.callerId === userId) {
        await this.calls.markMissed(call.id);
      } else {
        await this.calls.markEnded(call.id);
      }
      const otherUserId = call.callerId === userId ? call.calleeId : call.callerId;
      this.realtime.emit({ users: [otherUserId] }, 'call:ended', { callId: call.id });
    } catch (err) {
      client.emit('call:error', { message: (err as Error).message });
    }
  }

  @SubscribeMessage('call:reject')
  async handleCallReject(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { callId: string },
  ): Promise<void> {
    const userId = (client.data as SocketData).userId;
    if (!userId) return;
    try {
      const call = await this.calls.loadForRouting(body.callId, userId);
      await this.ringing.settle(call.id, call.calleeId);
      await this.calls.markRejected(call.id);
      const otherUserId = call.callerId === userId ? call.calleeId : call.callerId;
      this.realtime.emit({ users: [otherUserId] }, 'call:rejected', { callId: call.id });
    } catch (err) {
      client.emit('call:error', { message: (err as Error).message });
    }
  }

  /**
   * Chat typing indicator (ephemeral, never persisted). Client event:
   * chat:typing { bookingId, isTyping }. Server relays it as chat:typing
   * { bookingId, userId, isTyping } to the booking's other participant only.
   */
  @SubscribeMessage('chat:typing')
  async handleChatTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { bookingId: string; isTyping: boolean },
  ): Promise<void> {
    const userId = (client.data as SocketData).userId;
    if (!userId) return;
    const otherUserId = await this.otherBookingParticipant(body.bookingId, userId);
    if (!otherUserId) return;
    this.realtime.emit({ users: [otherUserId] }, 'chat:typing', {
      bookingId: body.bookingId,
      userId,
      isTyping: body.isTyping,
    });
  }

  /** The booking's other participant (customer<->caregiver), or null if the caller isn't on it. */
  private async otherBookingParticipant(bookingId: string, userId: string): Promise<string | null> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, OR: [{ customerId: userId }, { caregiver: { userId } }] },
      select: { customerId: true, caregiver: { select: { userId: true } } },
    });
    if (!booking) return null;
    return booking.customerId === userId ? booking.caregiver.userId : booking.customerId;
  }

  private extractToken(client: Socket): string | null {
    const auth = client.handshake.auth as { token?: unknown } | undefined;
    if (typeof auth?.token === 'string' && auth.token) {
      return auth.token.replace(/^Bearer\s+/i, '');
    }
    const header = client.handshake.headers['authorization'];
    if (typeof header === 'string' && /^Bearer\s+/i.test(header)) {
      return header.replace(/^Bearer\s+/i, '');
    }
    // Web client authenticates the socket via the httpOnly cs_access cookie,
    // sent in the WS handshake when the client connects with withCredentials.
    const cookie = client.handshake.headers['cookie'];
    if (typeof cookie === 'string') {
      const m = cookie.match(/(?:^|;\s*)cs_access=([^;]+)/);
      if (m) return decodeURIComponent(m[1]);
    }
    const query = client.handshake.query['token'];
    return typeof query === 'string' && query ? query : null;
  }
}
