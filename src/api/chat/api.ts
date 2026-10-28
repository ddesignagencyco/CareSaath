/**
 * Chat API for both sides. Each function maps to a backend route (in the
 * comment) under /customer/chat or /caregiver/chat, using that side's session.
 * With CHAT_USE_MOCKS on, calls go to the in-app mock instead.
 *
 * TODO(backend): the NestJS API has no chat module yet; these routes are the
 * proposed contract (the web chat is also mock-only). New messages arrive by
 * polling today; switch to the realtime gateway when it carries chat events.
 */
import { CHAT_USE_MOCKS } from "../config";
import { http as customerHttp } from "../customer/http";
import { http as caregiverHttp } from "../caregiver/http";
import * as mock from "./mock";
import type { ChatConversation, ChatMessage, ChatPeer, ChatScope, SendMessageInput, UploadSession } from "./types";

const M = CHAT_USE_MOCKS;

export function chatApi(scope: ChatScope) {
  const http = scope === "customer" ? customerHttp : caregiverHttp;
  const base = `/${scope}/chat`;
  return {
    /** GET /:scope/chat/conversations */
    conversations: () => (M ? mock.listConversations(scope) : http.get<ChatConversation[]>(`${base}/conversations`)),
    /** POST /:scope/chat/conversations — idempotent per peer (customer ↔ caregiver with a booking). */
    open: (peer: ChatPeer) => (M ? mock.openConversation(scope, peer) : http.post<ChatConversation>(`${base}/conversations`, { peerId: peer.id })),
    /** GET /:scope/chat/conversations/:id */
    conversation: (id: string) => (M ? mock.getConversation(scope, id) : http.get<ChatConversation>(`${base}/conversations/${id}`)),
    /** GET /:scope/chat/conversations/:id/messages */
    messages: (id: string) => (M ? mock.listMessages(scope, id) : http.get<ChatMessage[]>(`${base}/conversations/${id}/messages`)),
    /** POST /:scope/chat/conversations/:id/read */
    markRead: (id: string) => (M ? mock.markRead(scope, id) : http.post<{ ok: true }>(`${base}/conversations/${id}/read`)),
    /** POST /:scope/chat/conversations/:id/messages */
    send: (id: string, input: SendMessageInput) => (M ? mock.sendMessage(scope, id, input) : http.post<ChatMessage>(`${base}/conversations/${id}/messages`, input)),
    /** DELETE /:scope/chat/messages/:id (own messages only) */
    remove: (messageId: string) => (M ? mock.deleteMessage(scope, messageId) : http.delete<{ ok: true }>(`${base}/messages/${messageId}`)),
    /** POST /:scope/chat/messages/:id/reactions — same emoji again removes it. */
    react: (messageId: string, emoji: string) => (M ? mock.react(scope, messageId, emoji) : http.post<ChatMessage>(`${base}/messages/${messageId}/reactions`, { emoji })),

    uploads: {
      /** POST /:scope/chat/uploads — opens a resumable upload session. */
      create: (input: { conversationId: string; fileName: string; mimeType: string; size: number; uri: string }) =>
        M
          ? mock.createUpload(scope, input)
          : http.post<UploadSession>(`${base}/uploads`, { conversationId: input.conversationId, fileName: input.fileName, mimeType: input.mimeType, size: input.size }),
      /** GET /:scope/chat/uploads/:id — how many bytes the server already has. */
      status: (uploadId: string) => (M ? mock.getUpload(scope, uploadId) : http.get<UploadSession>(`${base}/uploads/${uploadId}`)),
      /**
       * PATCH /:scope/chat/uploads/:id with `Upload-Offset` and the next chunk
       * as application/offset+octet-stream; the server answers its new offset
       * and rejects a wrong offset with 409.
       */
      chunk: async (uploadId: string, uri: string, offset: number, length: number, signal: AbortSignal): Promise<{ offset: number }> => {
        if (M) return mock.sendChunk(scope, uploadId, offset, length, signal);
        // TODO(backend): RN has no ranged file read; this loads the file into
        // the native blob store once per chunk. Fine for chat-sized media, swap
        // for a native streaming read if files get much larger.
        const file = await (await fetch(uri)).blob();
        const part = file.slice(offset, offset + length);
        return http.raw<{ offset: number }>(
          "PATCH",
          `${base}/uploads/${uploadId}`,
          part,
          { "Upload-Offset": String(offset), "Content-Type": "application/offset+octet-stream" },
          signal,
        );
      },
      /** DELETE /:scope/chat/uploads/:id */
      cancel: (uploadId: string) => (M ? mock.cancelUpload(scope, uploadId) : http.delete<{ ok: true }>(`${base}/uploads/${uploadId}`)),
    },
  };
}

export type ChatApi = ReturnType<typeof chatApi>;
