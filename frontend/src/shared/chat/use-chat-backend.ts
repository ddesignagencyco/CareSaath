"use client";

import { useCallback, useMemo, useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useToast } from "@shared/ui/toast";
import type { BackendChatMessage, ChatConversation, ChatMessage, ChatReaction, ChatTransport } from "./types";
import type { ChatScope, SendInput } from "./use-chat";

const uid = () => Math.random().toString(36).slice(2, 10);

/** Local-only embellishments that the text backend can't store (demo in real mode). */
type Patch = { reactions?: ChatReaction[]; deleted?: boolean };

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
      type: "text",
      text: m.body,
      reactions: [],
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
            if (!p) return m;
            if (p.deleted) return { ...m, deleted: true, type: "text" as const, text: undefined, mediaUrl: undefined, mediaName: undefined, durationMs: undefined, reactions: [] };
            return p.reactions ? { ...m, reactions: p.reactions } : m;
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
          .send(convId, text)
          .then(() => {
            setExtra((e) => ({ ...e, [convId]: (e[convId] ?? []).filter((m) => m.id !== tempId) }));
            void qc.invalidateQueries({ queryKey: ["chat", scope, "msgs", convId] });
          })
          .catch(() => toast.error(t("sendFailed"))); // keep the bubble, but surface the failure
        return;
      }
      // Media / voice: local-only demo (no backend persistence).
      const msg: ChatMessage = {
        id: uid(),
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
      setExtra((e) => ({ ...e, [convId]: [...(e[convId] ?? []), msg] }));
    },
    [qc, scope, transport, toast, t],
  );

  const react = useCallback((_convId: string, msgId: string, emoji: string) => {
    setPatches((p) => {
      const cur = p[msgId]?.reactions ?? [];
      const mine = cur.find((r) => r.byMe);
      const rest = cur.filter((r) => !r.byMe);
      const reactions = mine && mine.emoji === emoji ? rest : [...rest, { emoji, byMe: true }];
      return { ...p, [msgId]: { ...p[msgId], reactions } };
    });
  }, []);

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
