"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChatConversation, ChatMessage, ChatMessageType } from "./types";

export type ChatScope = "customer" | "caregiver";

const keyFor = (scope: ChatScope) => `caresaath.chat.${scope}.v2`;
const uid = () => Math.random().toString(36).slice(2, 10);

/** A tiny valid PDF so a shared document previews inline out of the box. */
const SAMPLE_PDF =
  "data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA0NDAgMjAwXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCAxMzUgPj4Kc3RyZWFtCkJUIC9GMSAyMiBUZiA0MCAxMzAgVGQgKENhcmVTYWF0aCkgVGogMCAtMzQgVGQgL0YxIDEzIFRmIChTYW1wbGUgc2hhcmVkIGRvY3VtZW50KSBUaiAwIC0yMiBUZCAoVGhpcyBQREYgcHJldmlld3MgaW5saW5lIGluIGNoYXQuKSBUaiBFVAplbmRzdHJlYW0KZW5kb2JqCjUgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyNDEgMDAwMDAgbiAKMDAwMDAwMDQyNyAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDYgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjQ5NwolJUVPRg==";

/** Seed a couple of conversations so the UI is alive before the backend exists. */
function seed(scope: ChatScope): ChatConversation[] {
  const base = Date.now();
  const h = (n: number) => base - n * 3_600_000;
  if (scope === "caregiver") {
    // The caregiver chats with the families (customers).
    return [
      {
        id: "cg-ayesha",
        name: "Ayesha Khan",
        role: "Family · Rukhsana Khan",
        online: true,
        messages: [
          { id: uid(), conversationId: "cg-ayesha", sender: "them", type: "text", text: "Assalam o Alaikum. Will you be on time for today's 8 PM visit?", reactions: [], createdAt: h(3), readByThem: true },
          { id: uid(), conversationId: "cg-ayesha", sender: "me", type: "text", text: "Walaikum Assalam. Yes, I'll be there by 8, in sha Allah.", reactions: [], createdAt: h(2.9), readByThem: true },
          { id: uid(), conversationId: "cg-ayesha", sender: "them", type: "text", text: "JazakAllah. The gate code is 1234. 🙏", reactions: [{ emoji: "👍", byMe: true }], createdAt: h(2.8), readByThem: true },
          { id: uid(), conversationId: "cg-ayesha", sender: "me", type: "file", mediaUrl: SAMPLE_PDF, mediaName: "care-plan.pdf", mediaSize: 679, reactions: [], createdAt: h(2.7), readByThem: true },
        ],
      },
      {
        id: "cg-bilal",
        name: "Bilal Ahmed",
        role: "Family",
        online: false,
        messages: [
          { id: uid(), conversationId: "cg-bilal", sender: "them", type: "text", text: "Thank you for yesterday's session — Baba is feeling much better.", reactions: [], createdAt: h(27), readByThem: true },
        ],
      },
    ];
  }
  // Customer chats with their caregivers.
  return [
    {
      id: "c-fatima",
      name: "Fatima Noor",
      role: "Nursing",
      online: true,
      messages: [
        { id: uid(), conversationId: "c-fatima", sender: "them", type: "text", text: "Assalam o Alaikum! I'll arrive for Rukhsana's visit at 8 PM.", reactions: [], createdAt: h(3), readByThem: true },
        { id: uid(), conversationId: "c-fatima", sender: "me", type: "text", text: "Walaikum Assalam — thank you! The gate code is 1234.", reactions: [], createdAt: h(2.9), readByThem: true },
        { id: uid(), conversationId: "c-fatima", sender: "them", type: "text", text: "Noted. Please keep her medication list ready. 🙏", reactions: [{ emoji: "👍", byMe: true }], createdAt: h(2.8), readByThem: true },
      ],
    },
    {
      id: "c-ali",
      name: "Ali Raza",
      role: "Physiotherapy",
      online: false,
      messages: [
        { id: uid(), conversationId: "c-ali", sender: "them", type: "text", text: "Hello! Sharing the exercises from today's session.", reactions: [], createdAt: h(26), readByThem: true },
        { id: uid(), conversationId: "c-ali", sender: "them", type: "file", mediaUrl: SAMPLE_PDF, mediaName: "exercise-plan.pdf", mediaSize: 679, reactions: [], createdAt: h(25.9), readByThem: true },
      ],
    },
  ];
}

function load(scope: ChatScope): ChatConversation[] {
  try {
    const raw = localStorage.getItem(keyFor(scope));
    if (raw) return JSON.parse(raw) as ChatConversation[];
  } catch {
    // ignore
  }
  return seed(scope);
}
function save(scope: ChatScope, convs: ChatConversation[]) {
  try {
    localStorage.setItem(keyFor(scope), JSON.stringify(convs));
  } catch {
    // ignore (quota / private mode)
  }
}

function autoReply(text?: string): string {
  const t = (text ?? "").toLowerCase();
  if (!t) return "Got it, thank you! 👍";
  if (t.includes("thank")) return "You're most welcome! 😊";
  if (t.includes("time") || t.includes("when") || t.includes("late")) return "I'll be there on schedule, in sha Allah.";
  if (t.includes("address") || t.includes("location") || t.includes("gate")) return "Got it, I have the details. See you soon.";
  if (t.endsWith("?")) return "Sure — I'll take care of that.";
  return "Noted, thank you! 👍";
}

export interface SendInput {
  text?: string;
  type?: ChatMessageType;
  mediaUrl?: string;
  mediaName?: string;
  mediaSize?: number;
  durationMs?: number;
  replyToId?: string;
  /** The raw bytes to upload for a media/voice message (real backend). The mock uses `mediaUrl` instead. */
  file?: Blob;
}

/** Local, mock-backed chat state. Swap `load`/`save`/`send` for the real API + socket later. */
export function useChat(scope: ChatScope = "customer") {
  // null until hydrated from localStorage on mount (keeps SSR output empty, avoids a mismatch).
  const [state, setState] = useState<ChatConversation[] | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only hydrate from localStorage
    setState(load(scope));
  }, [scope]);

  const apply = useCallback(
    (fn: (c: ChatConversation[]) => ChatConversation[]) => {
      setState((prev) => {
        const next = fn(prev ?? []);
        save(scope, next);
        return next;
      });
    },
    [scope],
  );

  const send = useCallback(
    (convId: string, input: SendInput) => {
      const type = input.type ?? "text";
      const isMedia = type !== "text";
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
        uploading: isMedia,
        createdAt: Date.now(),
        readByThem: false,
      };
      apply((prev) => prev.map((c) => (c.id === convId ? { ...c, messages: [...c.messages, msg] } : c)));
      // Media "upload" completion is driven by the UI (pausable); see markUploaded.
      // Simulate the other side reading, then replying.
      setTimeout(() => {
        apply((prev) => prev.map((c) => (c.id === convId ? { ...c, messages: c.messages.map((m) => (m.id === msg.id ? { ...m, readByThem: true } : m)) } : c)));
      }, 1400);
      setTimeout(() => {
        const reply: ChatMessage = { id: uid(), conversationId: convId, sender: "them", type: "text", text: autoReply(input.text), reactions: [], createdAt: Date.now(), readByThem: true };
        apply((prev) => prev.map((c) => (c.id === convId ? { ...c, messages: [...c.messages, reply] } : c)));
      }, 2600);
    },
    [apply],
  );

  const react = useCallback(
    (convId: string, msgId: string, emoji: string) => {
      apply((prev) =>
        prev.map((c) =>
          c.id !== convId
            ? c
            : {
                ...c,
                messages: c.messages.map((m) => {
                  if (m.id !== msgId) return m;
                  const mine = m.reactions.find((r) => r.byMe);
                  const rest = m.reactions.filter((r) => !r.byMe);
                  // Toggle off if same emoji, else set my reaction.
                  return { ...m, reactions: mine && mine.emoji === emoji ? rest : [...rest, { emoji, byMe: true }] };
                }),
              },
        ),
      );
    },
    [apply],
  );

  const remove = useCallback(
    (convId: string, msgId: string) => {
      apply((prev) =>
        prev.map((c) =>
          c.id !== convId
            ? c
            : {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === msgId ? { ...m, deleted: true, type: "text" as const, text: undefined, mediaUrl: undefined, mediaName: undefined, durationMs: undefined, reactions: [] } : m,
                ),
              },
        ),
      );
    },
    [apply],
  );

  const markUploaded = useCallback(
    (convId: string, msgId: string) => {
      apply((prev) => prev.map((c) => (c.id !== convId ? c : { ...c, messages: c.messages.map((m) => (m.id === msgId ? { ...m, uploading: false } : m)) })));
    },
    [apply],
  );

  // The mock has no unread concept (incoming messages seed as read); the real
  // backend overrides this with a PATCH. Kept so both hooks share one surface.
  const markRead = useCallback((_convId: string) => {}, []);

  return { conversations: state ?? [], loaded: state !== null, send, react, remove, markUploaded, markRead };
}
