"use client";

import { useCallback, useMemo, useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useToast } from "@shared/ui/toast";
import type { BackendChatMessage, BackendChatType, ChatConversation, ChatMessage, ChatMessageType, ChatReaction, ChatTransport } from "./types";
import type { ChatScope, SendInput } from "./types";

const uid = () => Math.random().toString(36).slice(2, 10);

/** Local-only delete (no backend delete endpoint yet); reactions are now real. */
type Patch = { deleted?: boolean };

const TYPE_MAP: Record<BackendChatType, ChatMessageType> = { TEXT: "text", IMAGE: "image", FILE: "file", VOICE: "voice" };

/** Collapse per-user reaction rows into one chip per emoji, flagging mine. */
function aggregateReactions(rows: BackendChatMessage["reactions"], myUserId: string | undefined): ChatReaction[] {
  const byEmoji = new Map<string, boolean>();
  for (const r of rows) byEmoji.set(r.emoji, (byEmoji.get(r.emoji) ?? false) || r.userId === myUserId);
  return [...byEmoji].map(([emoji, byMe]) => ({ emoji, byMe }));
}

/**
 * Real-backend chat: one thread per booking, text persisted via the REST API and
 * delivered live by the shared realtime hook (it invalidates queries on
 * `entity.updated`). Media, voice, reactions and replies live only in memory here
 * — they show for the sender but are never sent to the backend or other devices.
 * Returns the same surface as the mock `useChat`, plus `markRead`.
 */
export function useChatBackend(scope: ChatScope, transport: ChatTransport) {
  const qc = useQueryClient();
  const toast = useToast();
  const t = useTranslations("common.chat");
  const { threads, threadsLoaded, myUserId } = transport;

  const results = useQueries({
    queries: threads.map((th) => ({
      queryKey: ["chat", scope, "msgs", th.id],
      queryFn: () => transport.listMessages(th.id),
      enabled: threadsLoaded,
    })),
  });
  // Stable-ish signature so the merge memo only recomputes when data actually changes.
  const dataSig = results.map((r) => r.dataUpdatedAt).join(",");

  const [extra, setExtra] = useState<Record<string, ChatMessage[]>>({});
  const [patches, setPatches] = useState<Record<string, Patch>>({});

  const mapBackend = useCallback(
    (m: BackendChatMessage): ChatMessage => ({
      id: m.id,
      conversationId: m.bookingId,
      sender: m.senderId === myUserId ? "me" : "them",
      type: m.deletedAt ? "text" : TYPE_MAP[m.type],
      text: m.deletedAt ? undefined : (m.body ?? undefined),
      mediaUrl: m.deletedAt ? undefined : (m.url ?? undefined),
      mediaSize: m.sizeBytes ?? undefined,
      replyToId: m.replyToId ?? undefined,
      reactions: m.deletedAt ? [] : aggregateReactions(m.reactions, myUserId),
      deleted: m.deletedAt != null,
      createdAt: new Date(m.createdAt).getTime(),
      readByThem: m.senderId === myUserId ? m.readAt != null : true,
    }),
    [myUserId],
  );

  const conversations = useMemo<ChatConversation[]>(
    () =>
      threads.map((th, i) => {
        const backend = (results[i]?.data ?? []).map(mapBackend);
        const locals = extra[th.id] ?? [];
        const messages = [...backend, ...locals]
          .map((m) => {
            const p = patches[m.id];
            if (p?.deleted) return { ...m, deleted: true, type: "text" as const, text: undefined, mediaUrl: undefined, mediaName: undefined, durationMs: undefined, reactions: [] };
            return m;
          })
          .sort((a, b) => a.createdAt - b.createdAt);
        return { id: th.id, name: th.name, role: th.role, online: th.online, visitId: th.visitId, peerUserId: th.peerUserId, messages };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dataSig stands in for the per-thread query data
    [threads, dataSig, extra, patches, mapBackend],
  );

  const send = useCallback(
    (convId: string, input: SendInput) => {
      const type = input.type ?? "text";
      if (type === "text") {
        const text = input.text?.trim();
        if (!text) return;
        // Optimistic bubble; the POST + refetch replaces it with the stored row.
        const tempId = `tmp-${uid()}`;
        const temp: ChatMessage = { id: tempId, conversationId: convId, sender: "me", type: "text", text: input.text, replyToId: input.replyToId, reactions: [], createdAt: Date.now(), readByThem: false };
        setExtra((e) => ({ ...e, [convId]: [...(e[convId] ?? []), temp] }));
        transport
          .send(convId, text, input.replyToId)
          .then(() => {
            setExtra((e) => ({ ...e, [convId]: (e[convId] ?? []).filter((m) => m.id !== tempId) }));
            void qc.invalidateQueries({ queryKey: ["chat", scope, "msgs", convId] });
          })
          .catch(() => toast.error(t("sendFailed"))); // keep the bubble, but surface the failure
        return;
      }
      // Media / voice → resumable upload to the backend; an optimistic bubble shows the local
      // preview while it uploads, then the stored (signed-URL) message replaces it on refetch.
      if (!input.file) return;
      const tempId = `tmp-${uid()}`;
      const temp: ChatMessage = {
        id: tempId,
        conversationId: convId,
        sender: "me",
        type,
        text: input.text,
        mediaUrl: input.mediaUrl,
        mediaName: input.mediaName,
        mediaSize: input.mediaSize,
        durationMs: input.durationMs,
        replyToId: input.replyToId,
        reactions: [],
        uploading: true,
        createdAt: Date.now(),
        readByThem: false,
      };
      setExtra((e) => ({ ...e, [convId]: [...(e[convId] ?? []), temp] }));
      transport
        .uploadMedia(convId, input.file, { fileName: input.mediaName, caption: input.text, replyToId: input.replyToId })
        .then(() => {
          setExtra((e) => ({ ...e, [convId]: (e[convId] ?? []).filter((m) => m.id !== tempId) }));
          void qc.invalidateQueries({ queryKey: ["chat", scope, "msgs", convId] });
        })
        .catch(() => {
          setExtra((e) => ({ ...e, [convId]: (e[convId] ?? []).filter((m) => m.id !== tempId) }));
          toast.error(t("sendFailed"));
        });
    },
    [qc, scope, transport, toast, t],
  );

  const react = useCallback(
    (convId: string, msgId: string, emoji: string) => {
      transport
        .react(convId, msgId, emoji)
        .then(() => void qc.invalidateQueries({ queryKey: ["chat", scope, "msgs", convId] }))
        .catch(() => toast.error(t("sendFailed")));
    },
    [transport, qc, scope, toast, t],
  );

  const remove = useCallback((_convId: string, msgId: string) => {
    setPatches((p) => ({ ...p, [msgId]: { ...p[msgId], deleted: true } }));
  }, []);

  const markUploaded = useCallback((convId: string, msgId: string) => {
    setExtra((e) => ({ ...e, [convId]: (e[convId] ?? []).map((m) => (m.id === msgId ? { ...m, uploading: false } : m)) }));
  }, []);

  const markRead = useCallback(
    (convId: string) => {
      transport
        .markRead(convId)
        .then(() => void qc.invalidateQueries({ queryKey: ["chat", scope, "msgs", convId] }))
        .catch(() => undefined);
    },
    [qc, scope, transport],
  );

  return { conversations, loaded: threadsLoaded, send, react, remove, markUploaded, markRead };
}
