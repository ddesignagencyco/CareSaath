/** In-app chat types. Backed by a local mock store today; maps 1:1 to the planned backend (see docs/requirement.md → In-app messaging). */
export type ChatMessageType = "text" | "image" | "video" | "file" | "voice";

export interface ChatReaction {
  emoji: string;
  byMe: boolean;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
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
  /** bookingId */
  id: string;
  name: string;
  role: string;
  online?: boolean;
  /** An active visit shared with the other party (enables WebRTC calls). */
  visitId?: string;
  /** The other party's user id, the call callee (available to the caregiver, not the customer). */
  peerUserId?: string;
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
  /** Chronological (oldest first). */
  listMessages: (bookingId: string) => Promise<BackendChatMessage[]>;
  send: (bookingId: string, body: string, replyToId?: string) => Promise<BackendChatMessage>;
  markRead: (bookingId: string) => Promise<void>;
  /** Resumable chunked upload (init → chunks → complete); resolves to the created media message. */
  uploadMedia: (bookingId: string, file: Blob, opts?: { fileName?: string; caption?: string; replyToId?: string; onProgress?: (fraction: number) => void }) => Promise<BackendChatMessage>;
  /** Toggle a reaction emoji on a message. */
  react: (bookingId: string, messageId: string, emoji: string) => Promise<void>;
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
