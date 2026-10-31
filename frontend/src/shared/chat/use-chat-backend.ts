"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useToast } from "@shared/ui/toast";
import type { BackendChatMessage, BackendChatType, ChatConversation, ChatMessage, ChatMessageType, ChatReaction, ChatTransport } from "./types";
import type { ChatScope, SendInput } from "./types";

const uid = () => Math.random().toString(36).slice(2, 10);

/** Local optimistic tombstone applied the instant you delete a message, before the
 *  DELETE round-trip (and the server's `deletedAt`) confirms it. */
type Patch = { deleted?: boolean };

const TYPE_MAP: Record<BackendChatType, ChatMessageType> = { TEXT: "text", IMAGE: "image", FILE: "file", VOICE: "voice" };

/** Collapse per-user reaction rows into one chip per emoji, flagging mine. */
function aggregateReactions(rows: BackendChatMessage["reactions"], myUserId: string | undefined): ChatReaction[] {
  const byEmoji = new Map<string, boolean>();
  for (const r of rows) byEmoji.set(r.emoji, (byEmoji.get(r.emoji) ?? false) || r.userId === myUserId);
  return [...byEmoji].map(([emoji, byMe]) => ({ emoji, byMe }));
}

/**
 * Real-backend chat, one thread per counterpart (spanning all their bookings).
 * Messages come from the conversation endpoint; each carries the bookingId it was
 * sent on. New messages/uploads go to the thread's activeBookingId; reactions and
 * deletes target the message's own bookingId. Everything is persisted via REST and
 * delivered live by the shared realtime hook. Exposes the ChatPanel surface + markRead.
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
      bookingId: m.bookingId,
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
        // Each thread is a counterpart; stamp the message's thread id (its own bookingId stays on `bookingId`).
        const backend = (results[i]?.data ?? []).map((m) => ({ ...mapBackend(m), conversationId: th.id }));
        const locals = extra[th.id] ?? [];
        const messages = [...backend, ...locals]
          .map((m) => {
            const p = patches[m.id];
            if (p?.deleted) return { ...m, deleted: true, type: "text" as const, text: undefined, mediaUrl: undefined, mediaName: undefined, durationMs: undefined, reactions: [] };
            return m;
          })
          .sort((a, b) => a.createdAt - b.createdAt);
        return { id: th.id, name: th.name, role: th.role, online: th.online, visitId: th.visitId, peerUserId: th.peerUserId, bookingIds: th.bookingIds, messages };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dataSig stands in for the per-thread query data
    [threads, dataSig, extra, patches, mapBackend],
  );

  // msgId → the booking it lives on, so reactions/deletes target the right booking.
  const bookingByMsg = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of conversations) for (const m of c.messages) if (m.bookingId) map[m.id] = m.bookingId;
    return map;
  }, [conversations]);
  const bookingByMsgRef = useRef(bookingByMsg);
  useEffect(() => {
    bookingByMsgRef.current = bookingByMsg;
  }, [bookingByMsg]);

  // The booking new messages go to for a thread (its activeBookingId; null once read-only).
  const activeBookingFor = useCallback((convId: string) => threads.find((th) => th.id === convId)?.activeBookingId ?? null, [threads]);

  const send = useCallback(
    (convId: string, input: SendInput) => {
      const type = input.type ?? "text";
      // New messages go on the thread's active booking; a read-only (all-completed) thread can't send.
      const bookingId = activeBookingFor(convId);
      if (type === "text") {
        const text = input.text?.trim();
        if (!text) return;
        if (!bookingId) {
          toast.error(t("sendFailed"));
          return;
        }
        // Optimistic bubble; the POST + refetch replaces it with the stored row.
        const tempId = `tmp-${uid()}`;
        const temp: ChatMessage = { id: tempId, conversationId: convId, bookingId, sender: "me", type: "text", text: input.text, replyToId: input.replyToId, reactions: [], createdAt: Date.now(), readByThem: false };
        setExtra((e) => ({ ...e, [convId]: [...(e[convId] ?? []), temp] }));
        transport
          .send(bookingId, text, input.replyToId)
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
      if (!bookingId) {
        toast.error(t("sendFailed"));
        return;
      }
      const tempId = `tmp-${uid()}`;
      const temp: ChatMessage = {
        id: tempId,
        conversationId: convId,
        bookingId,
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
        .uploadMedia(bookingId, input.file, { fileName: input.mediaName, caption: input.text, replyToId: input.replyToId })
        .then(() => {
          setExtra((e) => ({ ...e, [convId]: (e[convId] ?? []).filter((m) => m.id !== tempId) }));
          void qc.invalidateQueries({ queryKey: ["chat", scope, "msgs", convId] });
        })
        .catch(() => {
          setExtra((e) => ({ ...e, [convId]: (e[convId] ?? []).filter((m) => m.id !== tempId) }));
          toast.error(t("sendFailed"));
        });
    },
    [qc, scope, transport, toast, t, activeBookingFor],
  );

  const react = useCallback(
    (convId: string, msgId: string, emoji: string) => {
      const bookingId = bookingByMsgRef.current[msgId];
      if (!bookingId) return; // an unsynced optimistic bubble has no server message to react to
      transport
        .react(bookingId, msgId, emoji)
        .then(() => void qc.invalidateQueries({ queryKey: ["chat", scope, "msgs", convId] }))
        .catch(() => toast.error(t("sendFailed")));
    },
    [transport, qc, scope, toast, t],
  );

  const remove = useCallback(
    (convId: string, msgId: string) => {
      // Optimistic tombstone; the DELETE + refetch (or the realtime entity.updated) confirms it.
      setPatches((p) => ({ ...p, [msgId]: { ...p[msgId], deleted: true } }));
      // A not-yet-sent optimistic bubble just vanishes locally — there's nothing on the server.
      const bookingId = bookingByMsgRef.current[msgId];
      if (msgId.startsWith("tmp-") || !bookingId) {
        setExtra((e) => ({ ...e, [convId]: (e[convId] ?? []).filter((m) => m.id !== msgId) }));
        return;
      }
      transport
        .deleteMessage(bookingId, msgId)
        .then(() => void qc.invalidateQueries({ queryKey: ["chat", scope, "msgs", convId] }))
        .catch(() => {
          // Roll the tombstone back if the server refused.
          setPatches((p) => {
            const next = { ...p };
            delete next[msgId];
            return next;
          });
          toast.error(t("sendFailed"));
        });
    },
    [transport, qc, scope, toast, t],
  );

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
