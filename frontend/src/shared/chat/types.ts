/** In-app chat types. Backed by a local mock store today; maps 1:1 to the planned backend (see docs/requirement.md → In-app messaging). */
export type ChatMessageType = "text" | "image" | "video" | "file" | "voice";

export interface ChatReaction {
  emoji: string;
  byMe: boolean;
}

export interface ChatMessage {
  id: string;
  /** The thread this belongs to (the counterpart's user id in the relationship model). */
  conversationId: string;
  /** The booking this message was actually sent on — reactions/delete target this booking. */
  bookingId?: string;
  /** "me" = the signed-in user; "them" = the other party. */
  sender: "me" | "them";
  type: ChatMessageType;
  text?: string;
  /** Image data URL (persisted) or object URL; for files, undefined. */
  mediaUrl?: string;
  mediaName?: string;
  mediaSize?: number;
  /** Voice-note length in milliseconds. */
  durationMs?: number;
  replyToId?: string;
  reactions: ChatReaction[];
  /** Deleted (shows "This message was deleted"); content is cleared. */
  deleted?: boolean;
  /** True while a media attachment is "uploading" (simulated in the mock). */
  uploading?: boolean;
  createdAt: number;
  /** For my messages: has the other party read it (drives the read ticks). */
  readByThem: boolean;
}

export interface ChatConversation {
  id: string;
  /** The other party's display name. */
  name: string;
  /** A short subtitle, e.g. the caregiver's specialty. */
  role: string;
  online?: boolean;
  messages: ChatMessage[];
  /** Every booking in this thread — lets a bookingId deep-link (e.g. "Message" from a booking) resolve here. */
  bookingIds?: string[];
  /** For real WebRTC calls: an active visit shared with the other party. */
  visitId?: string;
  /** For real WebRTC calls: the other party's user id (the call callee). */
  peerUserId?: string;
}

/* ---- Real backend (booking-scoped, text + media) ------------------------- */

export type BackendChatType = "TEXT" | "IMAGE" | "FILE" | "VOICE";

export interface BackendChatReaction {
  id: string;
  userId: string;
  emoji: string;
  createdAt: string;
}

/** GET/POST /bookings/:bookingId/messages row (media's `mediaKey` is served as a signed `url`). */
export interface BackendChatMessage {
  id: string;
  bookingId: string;
  senderId: string;
  type: BackendChatType;
  body: string | null;
  /** Signed URL for a media message; null for text. */
  url: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  replyToId: string | null;
  reactions: BackendChatReaction[];
  readAt: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

/** One chat thread = one booking. The app resolves the other party's name/role. */
export interface ChatThreadMeta {
  /** The counterpart's user id — one thread per person (spans all their bookings). */
  id: string;
  name: string;
  role: string;
  online?: boolean;
  /** Where new messages go (newest CONFIRMED booking); null = read-only (all completed). */
  activeBookingId: string | null;
  /** Every booking in this thread, so a bookingId deep-link resolves to this thread. */
  bookingIds?: string[];
  /** An active visit shared with the other party (enables WebRTC calls). */
  visitId?: string;
  /** The other party's user id, the call callee. */
  peerUserId?: string;
}

/** GET /chat/conversations — one per counterpart, spanning all their bookings. */
export interface ChatConversationSummary {
  counterpartUserId: string;
  counterpartName: string;
  caregiverId: string;
  bookingIds: string[];
  activeBookingId: string | null;
  lastMessage: BackendChatMessage | null;
  unreadCount: number;
  lastActivityAt: string;
}

/**
 * Real-backend wiring, supplied per app (customer/caregiver) because each has
 * its own authenticated http client and its own source for the other party's
 * name. The shared hook orchestrates fetching, sending and read receipts.
 */
export interface ChatTransport {
  myUserId: string | undefined;
  threads: ChatThreadMeta[];
  threadsLoaded: boolean;
  /** Full conversation history with a counterpart (by counterpart user id), oldest first. */
  listMessages: (counterpartUserId: string) => Promise<BackendChatMessage[]>;
  /** Send on a specific booking (the thread's activeBookingId). */
  send: (bookingId: string, body: string, replyToId?: string) => Promise<BackendChatMessage>;
  /** Mark the whole conversation (every booking with the counterpart) read. */
  markRead: (counterpartUserId: string) => Promise<void>;
  /** Resumable chunked upload (init → chunks → complete); resolves to the created media message. */
  uploadMedia: (bookingId: string, file: Blob, opts?: { fileName?: string; caption?: string; replyToId?: string; onProgress?: (fraction: number) => void }) => Promise<BackendChatMessage>;
  /** Toggle a reaction emoji on a message. */
  react: (bookingId: string, messageId: string, emoji: string) => Promise<void>;
  /** Soft-delete one of your own messages (shows as a "deleted" tombstone for everyone). */
  deleteMessage: (bookingId: string, messageId: string) => Promise<void>;
}

/** Which role's chat this is (customer ↔ caregiver). */
export type ChatScope = "customer" | "caregiver";

/** What the composer hands to the transport when sending a message. */
export interface SendInput {
  text?: string;
  type?: ChatMessageType;
  mediaUrl?: string;
  mediaName?: string;
  mediaSize?: number;
  durationMs?: number;
  replyToId?: string;
  /** The raw bytes to upload for a media/voice message. */
  file?: Blob;
}
