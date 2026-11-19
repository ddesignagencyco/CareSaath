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

const TYPE_MAP: Record<BackendChatType, ChatMessageType> = { TEXT: "text", IMAGE: "image", FILE: "file", VOICE: "voice", CALL: "call" };

/** Collapse per-user reaction rows into one chip per emoji, flagging mine. */
function aggregateReactions(rows: BackendChatMessage["reactions"], myUserId: string | undefined): ChatReaction[] {
  const byEmoji = new Map<string, boolean>();
  for (const r of rows) byEmoji.set(r.emoji, (byEmoji.get(r.emoji) ?? false) || r.userId === myUserId);
  return [...byEmoji].map(([emoji, byMe]) => ({ emoji, byMe }));
}

/**
 * Map one wire row to a timeline item. CALL rows are virtual items synthesized
 * by the backend from CallLog (never ChatMessage) — all their data comes from
 * the API; nothing is invented here. `senderId` is the caller, so the caller
 * sees an outgoing row and the callee an incoming/missed/declined one.
 */
/** Extract a readable filename from a backend row or signed media URL. */
function extractMediaName(m: BackendChatMessage): string | undefined {
  const explicit = (m as BackendChatMessage & { fileName?: string | null; mediaName?: string | null }).fileName ?? (m as BackendChatMessage & { mediaName?: string | null }).mediaName;
  if (explicit) return explicit;
  if (!m.url) return undefined;
  try {
    const pathname = new URL(m.url, "http://localhost").pathname;
    const raw = pathname.split("/").pop();
    return raw ? decodeURIComponent(raw) : undefined;
  } catch {
    return undefined;
  }
}

export function toChatMessage(m: BackendChatMessage, myUserId: string | undefined): ChatMessage {
  return {
    id: m.id,
    conversationId: m.bookingId,
    bookingId: m.bookingId,
    sender: m.senderId === myUserId ? "me" : "them",
    type: m.deletedAt ? "text" : TYPE_MAP[m.type],
    text: m.deletedAt ? undefined : (m.body ?? undefined),
    mediaUrl: m.deletedAt ? undefined : (m.url ?? undefined),
    mediaName: m.deletedAt ? undefined : extractMediaName(m),
    mediaSize: m.sizeBytes ?? undefined,
    replyToId: m.replyToId ?? undefined,
    reactions: m.deletedAt ? [] : aggregateReactions(m.reactions, myUserId),
    deleted: m.deletedAt != null,
    createdAt: new Date(m.createdAt).getTime(),
    readByThem: m.senderId === myUserId ? m.readAt != null : true,
    ...(m.type === "CALL"
      ? { call: { callId: m.callId ?? "", status: m.callStatus ?? "INITIATED", durationSec: m.durationSec } }
      : {}),
  };
}

/** De-duplicate by row id, then order oldest-first (stable for equal timestamps). */
export function finalizeChatItems(items: ChatMessage[]): ChatMessage[] {
  const seen = new Set<string>();
  const unique: ChatMessage[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }
  return unique.sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Backend rows arrive newest-first across every booking of the pair; the chat
 * timeline is oldest-first. De-duplicate by row id first (the same CallLog row
 * can be returned by more than one page/subscription) so a call never renders
 * twice, then order by timestamp.
 */
export function mergeChatItems(rows: BackendChatMessage[], myUserId: string | undefined, conversationId: string): ChatMessage[] {
  return finalizeChatItems(rows.map((row) => ({ ...toChatMessage(row, myUserId), conversationId })));
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


  const conversations = useMemo<ChatConversation[]>(
    () =>
      threads.map((th, i) => {
        // Each thread is a counterpart; CALL virtual items from CallLog are part of this timeline.
        const backend = mergeChatItems(results[i]?.data ?? [], myUserId, th.id);
        // Hide an optimistic bubble once its real (server) copy has arrived in `backend`, so a sent
        // message doesn't flicker (show → vanish → reappear) around the send+refetch.
        const locals = (extra[th.id] ?? []).filter(
          (loc) =>
            loc.uploading ||
            !backend.some(
              (b) =>
                b.sender === "me" &&
                b.type === loc.type &&
                (b.text ?? "") === (loc.text ?? "") &&
                Math.abs(b.createdAt - loc.createdAt) < 30_000,
            ),
        );
        const messages = finalizeChatItems(
          [...backend, ...locals].map((m) => {
            // A virtual CALL item is an immutable audit row — it can never be deleted.
            const p = patches[m.id];
            if (p?.deleted && m.type !== "call") return { ...m, deleted: true, type: "text" as const, text: undefined, mediaUrl: undefined, mediaName: undefined, durationMs: undefined, reactions: [] };
            return m;
          }),
        );
        return { id: th.id, name: th.name, role: th.role, online: th.online, visitId: th.visitId, peerUserId: th.peerUserId, photoUrl: th.photoUrl, bookingIds: th.bookingIds, messages };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dataSig stands in for the per-thread query data
    [threads, dataSig, extra, patches, myUserId],
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
          .then(async () => {
            // Refetch first (so the stored message is already on screen), then drop the optimistic
            // bubble — removing it BEFORE the refetch is what made the message blink out and come back.
            await qc.invalidateQueries({ queryKey: ["chat", scope, "msgs", convId] });
            setExtra((e) => ({ ...e, [convId]: (e[convId] ?? []).filter((m) => m.id !== tempId) }));
          })
          .catch(() => {
            setExtra((e) => ({ ...e, [convId]: (e[convId] ?? []).filter((m) => m.id !== tempId) }));
            toast.error(t("sendFailed"));
          });
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
        .then(async () => {
          // Refetch first (stored message on screen), then drop the optimistic bubble — avoids the blink-out.
          await qc.invalidateQueries({ queryKey: ["chat", scope, "msgs", convId] });
          setExtra((e) => ({ ...e, [convId]: (e[convId] ?? []).filter((m) => m.id !== tempId) }));
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
