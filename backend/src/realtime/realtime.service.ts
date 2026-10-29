import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';
import type { UserRole } from '../generated/prisma/client.js';

/** The kinds of records clients keep on screen and want refreshed live. */
export type RealtimeEntityType =
  | 'booking'
  | 'visit'
  | 'payment'
  | 'payout'
  | 'dispute'
  | 'incident'
  | 'caregiver'
  | 'review'
  | 'chat_message';

/** Who receives an event: specific users and/or everyone holding a role. */
export interface Audience {
  users?: Array<string | null | undefined>;
  roles?: UserRole[];
}

export interface EntityUpdate {
  type: RealtimeEntityType;
  id: string;
  /** What happened, e.g. `created`, `accepted`, `paid`, `cancelled`. */
  action: string;
  status?: string;
  /** Extra, non-sensitive fields clients can use without a refetch. */
  data?: Record<string, unknown>;
}

export const userRoom = (userId: string) => `user:${userId}`;
export const roleRoom = (role: UserRole) => `role:${role}`;

/** Names of the events pushed to clients; documented in docs/realtime.md. */
export const RealtimeEvents = {
  entityUpdated: 'entity.updated',
  notificationCreated: 'notification.created',
  notificationRead: 'notification.read',
  /** A caregiver's live GPS fix while EN_ROUTE, pushed to the visit's customer only. */
  visitLocation: 'visit.location',
} as const;

/**
 * Single entry point for pushing events to connected clients. Every event goes
 * to explicit rooms (`user:<id>` / `role:<ROLE>`), never broadcast, so a client
 * only ever hears about records it is entitled to see.
 */
@Injectable()
export class RealtimeService {
  private server: Server | null = null;

  attach(server: Server): void {
    this.server = server;
  }

  /** Emit to the audience. A socket in several matching rooms still gets it once. */
  emit(audience: Audience, event: string, data: unknown): void {
    if (!this.server) return;
    const rooms = new Set<string>();
    for (const id of audience.users ?? []) {
      if (id) rooms.add(userRoom(id));
    }
    for (const role of audience.roles ?? []) {
      rooms.add(roleRoom(role));
    }
    if (rooms.size === 0) return;
    this.server.to([...rooms]).emit(event, data);
  }

  /** A record changed: tell the parties involved so their screens update without a reload. */
  entityUpdated(audience: Audience, update: EntityUpdate): void {
    this.emit(audience, RealtimeEvents.entityUpdated, { ...update, at: new Date().toISOString() });
  }
}
