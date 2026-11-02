/**
 * Chat API for both sides, wired to the real NestJS backend.
 *
 * The backend models chat as ONE thread per counterpart (spanning all of the
 * pair's CONFIRMED/COMPLETED bookings):
 *   - GET  /chat/conversations                        → one summary per person
 *   - GET  /chat/conversations/:counterpartUserId/messages  → full history
 *   - PATCH /chat/conversations/:counterpartUserId/read     → mark all read
 * New messages, reactions, deletes and media uploads are booking-scoped and go
 * to the thread's activeBookingId:
 *   - POST   /bookings/:bookingId/messages
 *   - POST   /bookings/:bookingId/messages/:id/reactions
 *   - DELETE /bookings/:bookingId/messages/:id
 *   - POST   /bookings/:bookingId/media/uploads (init) → PUT .../chunks/:index → POST .../complete
 *
 * The UI here keeps the older per-conversation shape, so this layer maps the
 * backend rows to that shape and resolves the right bookingId from a small
 * in-memory cache populated whenever conversations/messages are fetched.
 */
import { http as customerHttp } from "../customer/http";
import { http as caregiverHttp } from "../caregiver/http";
import { session as customerSession } from "../customer/session";
import { session as caregiverSession } from "../caregiver/session";
import { decodeToken } from "../session";
import { ApiError } from "../http";
import type { ChatConversation, ChatMessage, ChatMessageType, ChatPeer, ChatReaction, ChatScope, SendMessageInput, UploadSession } from "./types";

/* ---- backend wire types -------------------------------------------------- */

type BackendChatType = "TEXT" | "IMAGE" | "FILE" | "VOICE";

interface BackendReaction {
  id: string;
  userId: string;
  emoji: string;
  createdAt: string;
}

interface BackendMessage {
  id: string;
  bookingId: string;
  senderId: string;
  type: BackendChatType;
  body: string | null;
  url: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  replyToId: string | null;
  reactions: BackendReaction[];
  readAt: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

interface ConversationSummary {
  counterpartUserId: string;
  counterpartName: string;
  caregiverId: string;
  bookingIds: string[];
  activeBookingId: string | null;
  lastMessage: BackendMessage | null;
  unreadCount: number;
  lastActivityAt: string;
}

interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

const CHUNK = 2 * 1024 * 1024; // 2 MB, matches the backend's per-chunk limit.

/* ---- per-scope helpers --------------------------------------------------- */

function httpFor(scope: ChatScope) {
  return scope === "customer" ? customerHttp : caregiverHttp;
}
function sessionFor(scope: ChatScope) {
  return scope === "customer" ? customerSession : caregiverSession;
}
/** The signed-in user's id (JWT `sub`), to tell "me" from "them". */
function myUserId(scope: ChatScope): string | undefined {
  const token = sessionFor(scope).get()?.accessToken;
  return token ? decodeToken(token)?.sub : undefined;
}

/** counterpartUserId → where to send on this thread + how to match it from a booking. */
interface ConvMeta {
  activeBookingId: string | null;
  bookingIds: string[];
  caregiverId: string;
  name: string;
}
const convCache = new Map<string, ConvMeta>();
/** uploadId → the booking it is attached to (for status/chunk/complete after create). */
const uploadBooking = new Map<string, string>();
const metaKey = (scope: ChatScope, convId: string) => `${scope}:${convId}`;

/* ---- mapping ------------------------------------------------------------- */

function aggregate(rows: BackendReaction[], myId: string | undefined): ChatReaction[] {
  const byEmoji = new Map<string, boolean>();
  for (const r of rows) byEmoji.set(r.emoji, (byEmoji.get(r.emoji) ?? false) || r.userId === myId);
  return [...byEmoji].map(([emoji, byMe]) => ({ emoji, byMe }));
}

const TYPE: Record<BackendChatType, ChatMessageType> = { TEXT: "text", IMAGE: "image", FILE: "file", VOICE: "voice" };

/** Best-effort file name from a signed URL (the backend row carries no name). */
function nameFromUrl(url: string | null): string {
  if (!url) return "attachment";
  try {
    const path = url.split("?")[0];
    const base = path.substring(path.lastIndexOf("/") + 1);
    return decodeURIComponent(base) || "attachment";
  } catch {
    return "attachment";
  }
}

function mapMessage(m: BackendMessage, myId: string | undefined, conversationId: string): ChatMessage {
  const deleted = m.deletedAt != null;
  const mine = m.senderId === myId;
  const type: ChatMessageType = deleted ? "text" : TYPE[m.type];
  return {
    id: m.id,
    conversationId,
    bookingId: m.bookingId,
    sender: mine ? "me" : "them",
    type,
    text: deleted ? null : m.body,
    media:
      deleted || !m.url
        ? null
        : { url: m.url, name: nameFromUrl(m.url), mimeType: m.mimeType ?? "application/octet-stream", size: m.sizeBytes ?? 0 },
    replyToId: m.replyToId,
    reactions: deleted ? [] : aggregate(m.reactions, myId),
    deleted,
    createdAt: m.createdAt,
    readByThem: mine ? m.readAt != null : true,
  };
}

/* ---- conversation fetch + booking resolution ----------------------------- */

async function fetchConversations(scope: ChatScope): Promise<ChatConversation[]> {
  const http = httpFor(scope);
  const myId = myUserId(scope);
  const summaries = await http.get<ConversationSummary[]>("/chat/conversations");
  return summaries.map((s) => {
    convCache.set(metaKey(scope, s.counterpartUserId), {
      activeBookingId: s.activeBookingId,
      bookingIds: s.bookingIds,
      caregiverId: s.caregiverId,
      name: s.counterpartName,
    });
    return {
      id: s.counterpartUserId,
      // The caregiver's specialty isn't in the summary; the caregiver side's peer is "FAMILY".
      peer: { id: s.counterpartUserId, name: s.counterpartName, role: scope === "caregiver" ? "FAMILY" : "", photoUrl: null },
      online: false,
      lastMessage: s.lastMessage ? mapMessage(s.lastMessage, myId, s.counterpartUserId) : null,
      unread: s.unreadCount,
      peerUserId: s.counterpartUserId,
      activeBookingId: s.activeBookingId,
    };
  });
}

/** The booking new messages/uploads go on for a thread (its activeBookingId). */
async function resolveActiveBooking(scope: ChatScope, convId: string): Promise<string> {
  let meta = convCache.get(metaKey(scope, convId));
  if (!meta) {
    await fetchConversations(scope);
    meta = convCache.get(metaKey(scope, convId));
  }
  if (!meta?.activeBookingId) throw new ApiError(409, "This conversation is read-only.");
  return meta.activeBookingId;
}

/* ---- public API ---------------------------------------------------------- */

export function chatApi(scope: ChatScope) {
  const http = httpFor(scope);
  return {
    /** GET /chat/conversations — one thread per counterpart. */
    conversations: () => fetchConversations(scope),

    /**
     * Finds the thread with a booking's other party. There is no "create"
     * endpoint — a thread exists only once the pair has a CONFIRMED/COMPLETED
     * booking, so we match it among the conversations (by counterpart user id,
     * or by the caregiver profile id the customer side passes). Returns null
     * when there is no thread yet (e.g. a request the caregiver hasn't accepted),
     * so the caller can say so instead of opening a chat that can't load.
     */
    open: async (peer: ChatPeer): Promise<ChatConversation | null> => {
      const list = await fetchConversations(scope);
      return (
        list.find((c) => c.id === peer.id) ??
        list.find((c) => convCache.get(metaKey(scope, c.id))?.caregiverId === peer.id) ??
        null
      );
    },

    /** The thread's metadata (peer name/role), resolved from the conversation list. */
    conversation: async (id: string): Promise<ChatConversation> => {
      const list = await fetchConversations(scope);
      return (
        list.find((c) => c.id === id) ?? {
          id,
          peer: { id, name: convCache.get(metaKey(scope, id))?.name ?? "", role: scope === "caregiver" ? "FAMILY" : "", photoUrl: null },
          online: false,
          lastMessage: null,
          unread: 0,
        }
      );
    },

    /** GET /chat/conversations/:id/messages — oldest first (the list inverts it). */
    messages: async (id: string): Promise<ChatMessage[]> => {
      const myId = myUserId(scope);
      const page = await http.get<Paginated<BackendMessage>>(`/chat/conversations/${id}/messages`, { limit: 100 });
      const rows = Array.isArray(page) ? (page as BackendMessage[]) : page.items;
      return [...rows].reverse().map((m) => mapMessage(m, myId, id));
    },

    /** PATCH /chat/conversations/:id/read */
    markRead: (id: string) => http.patch<{ updated: number }>(`/chat/conversations/${id}/read`).then(() => ({ ok: true as const })),

    /**
     * Resolves a call target for a thread: the counterpart's user id plus an
     * active visit id (calls go over a shared visit; null means there isn't one
     * right now). The customer may omit the callee — the backend derives it.
     */
    callTargetFor: async (convId: string): Promise<{ peerUserId: string; visitId: string | null }> => {
      let meta = convCache.get(metaKey(scope, convId));
      if (!meta) {
        await fetchConversations(scope);
        meta = convCache.get(metaKey(scope, convId));
      }
      const bookingId = meta?.activeBookingId;
      if (!bookingId) return { peerUserId: convId, visitId: null };
      const ACTIVE = ["EN_ROUTE", "CHECKED_IN", "IN_PROGRESS", "CHECKED_OUT", "CONFIRMED"];
      try {
        let visits: { id: string; status: string }[] = [];
        if (scope === "customer") {
          const b = await http.get<{ visits: { id: string; status: string }[] }>(`/customer/bookings/${bookingId}`);
          visits = b.visits ?? [];
        } else {
          const page = await http.get<{ items: { id: string; status: string; bookingId: string }[] }>("/caregiver/visits", { limit: 50 });
          visits = (page.items ?? []).filter((v) => v.bookingId === bookingId);
        }
        const pick = visits.find((v) => ACTIVE.includes(v.status)) ?? visits[0];
        return { peerUserId: convId, visitId: pick?.id ?? null };
      } catch {
        return { peerUserId: convId, visitId: null };
      }
    },

    /**
     * Send on the thread's active booking. A text message posts directly; a
     * media message (carries uploadId) is finished via the upload's complete
     * endpoint, which creates the message.
     */
    send: async (id: string, input: SendMessageInput): Promise<ChatMessage> => {
      const bookingId = await resolveActiveBooking(scope, id);
      const myId = myUserId(scope);
      if (input.type === "text") {
        const m = await http.post<BackendMessage>(`/bookings/${bookingId}/messages`, {
          body: input.text ?? "",
          ...(input.replyToId ? { replyToId: input.replyToId } : {}),
        });
        return mapMessage(m, myId, id);
      }
      const m = await http.post<BackendMessage>(`/bookings/${bookingId}/media/uploads/${input.uploadId}/complete`, {
        ...(input.text ? { body: input.text } : {}),
        ...(input.replyToId ? { replyToId: input.replyToId } : {}),
      });
      return mapMessage(m, myId, id);
    },

    /** DELETE /bookings/:bookingId/messages/:id (own messages only). */
    remove: (bookingId: string, messageId: string) =>
      http.delete<{ ok: true }>(`/bookings/${bookingId}/messages/${messageId}`),

    /** POST /bookings/:bookingId/messages/:id/reactions — same emoji again removes it. */
    react: (bookingId: string, messageId: string, emoji: string) =>
      http.post<unknown>(`/bookings/${bookingId}/messages/${messageId}/reactions`, { emoji }),

    uploads: {
      /** POST /bookings/:bookingId/media/uploads — opens a chunked upload session. */
      create: async (input: { conversationId: string; fileName: string; mimeType: string; size: number; uri: string }): Promise<UploadSession> => {
        const bookingId = await resolveActiveBooking(scope, input.conversationId);
        const r = await http.post<{ uploadId: string; totalBytes: number }>(`/bookings/${bookingId}/media/uploads`, {
          mimeType: input.mimeType || "application/octet-stream",
          totalBytes: input.size,
          filename: (input.fileName || "attachment").slice(0, 200),
        });
        uploadBooking.set(r.uploadId, bookingId);
        return { uploadId: r.uploadId, offset: 0, size: input.size, chunkSize: CHUNK };
      },
      /**
       * GET /bookings/:bookingId/media/uploads/:id — progress. Chunks are
       * idempotent by index, so after a drop/restart we simply resend from 0
       * (offset 0); the server overwrites the chunks it already had.
       */
      status: (uploadId: string): Promise<UploadSession> =>
        Promise.resolve({ uploadId, offset: 0, size: 0, chunkSize: CHUNK }),
      /**
       * PUT /bookings/:bookingId/media/uploads/:id/chunks/:index with the next
       * 2 MB slice as multipart `chunk`. Returns the new offset.
       */
      chunk: async (uploadId: string, uri: string, offset: number, length: number, signal: AbortSignal): Promise<{ offset: number }> => {
        const bookingId = uploadBooking.get(uploadId);
        if (!bookingId) throw new ApiError(404, "Upload session not found.");
        const index = Math.floor(offset / CHUNK);
        const whole = await (await fetch(uri)).blob();
        const part = whole.slice(offset, offset + length);
        const form = new FormData();
        // RN FormData accepts a Blob part with a filename (needed so the backend's
        // multer FileInterceptor treats `chunk` as a file, not a text field).
        (form as unknown as { append: (k: string, v: unknown, f?: string) => void }).append("chunk", part, "chunk");
        await http.raw<unknown>("PUT", `/bookings/${bookingId}/media/uploads/${uploadId}/chunks/${index}`, form as unknown as Blob, {}, signal);
        return { offset: offset + length };
      },
      /** DELETE /bookings/:bookingId/media/uploads/:id */
      cancel: (uploadId: string) => {
        const bookingId = uploadBooking.get(uploadId);
        uploadBooking.delete(uploadId);
        if (!bookingId) return Promise.resolve({ ok: true as const });
        return http.delete<{ ok: true }>(`/bookings/${bookingId}/media/uploads/${uploadId}`);
      },
    },
  };
}

export type ChatApi = ReturnType<typeof chatApi>;
