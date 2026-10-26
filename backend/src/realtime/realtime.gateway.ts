import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { UserStatus } from '../generated/prisma/client.js';
import type { UserRole } from '../generated/prisma/client.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { RealtimeService, roleRoom, userRoom } from './realtime.service.js';

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

  private extractToken(client: Socket): string | null {
    const auth = client.handshake.auth as { token?: unknown } | undefined;
    if (typeof auth?.token === 'string' && auth.token) {
      return auth.token.replace(/^Bearer\s+/i, '');
    }
    const header = client.handshake.headers['authorization'];
    if (typeof header === 'string' && /^Bearer\s+/i.test(header)) {
      return header.replace(/^Bearer\s+/i, '');
    }
    const query = client.handshake.query['token'];
    return typeof query === 'string' && query ? query : null;
  }
}
