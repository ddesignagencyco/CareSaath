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
}
