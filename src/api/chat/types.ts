/**
 * In-app chat between a customer and their caregiver. Same shape as the web
 * chat (CareSath/frontend/src/shared/chat/types.ts) plus video and server-side
 * media URLs, so it maps 1:1 to the planned backend routes in ./api.ts.
 */
export type ChatScope = "customer" | "caregiver";

export type ChatMessageType = "text" | "image" | "video" | "file" | "voice";

/** A message's attachment once its upload has finished. */
export interface ChatMedia {
  url: string;
  name: string;
  mimeType: string;
  size: number;
  /** Video / voice length. */
  durationMs?: number;
  width?: number;
  height?: number;
}

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
  text?: string | null;
  media?: ChatMedia | null;
  replyToId?: string | null;
  reactions: ChatReaction[];
  /** Shows "This message was deleted"; content is cleared. */
  deleted?: boolean;
  createdAt: string;
  /** For my messages: drives the read ticks. */
  readByThem: boolean;
}

export interface ChatPeer {
  id: string;
  name: string;
  /** The caregiver's Specialty enum, or "FAMILY" for the customer side. */
  role: string;
  photoUrl?: string | null;
}

/** GET …/chat/conversations item. */
export interface ChatConversation {
  id: string;
  peer: ChatPeer;
  online: boolean;
  lastMessage: ChatMessage | null;
  unread: number;
}

/** POST …/chat/conversations/:id/messages */
export interface SendMessageInput {
  type: ChatMessageType;
  text?: string;
  /** Finished resumable upload (see UploadSession) for media messages. */
  uploadId?: string;
  durationMs?: number;
  width?: number;
  height?: number;
  replyToId?: string;
}

/**
 * Resumable upload session (tus-style). The client creates a session, sends
 * the file in chunks with an Upload-Offset header, and after a drop or a pause
 * asks the server for its offset and carries on from there.
 */
export interface UploadSession {
  uploadId: string;
  /** Bytes the server already has. */
  offset: number;
  size: number;
  /** Preferred chunk size in bytes. */
  chunkSize: number;
}
