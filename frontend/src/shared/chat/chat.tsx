"use client";

import clsx from "clsx";
import { ArrowLeft, Ban, CheckCheck, ChevronLeft, ChevronRight, CornerUpLeft, Download, FileText, ImageIcon, Mic, MicOff, Paperclip, Pause, Phone, PhoneOff, Play, Send, Smile, Trash2, Video, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useFmt } from "@shared/i18n/use-fmt";
import { formatBytes } from "@shared/lib/format";
import { Avatar } from "@shared/ui/misc";
import type { ChatConversation, ChatMessage } from "./types";
import type { SendInput } from "./use-chat";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
// prettier-ignore
const EMOJIS = ["😀","😁","😂","🤣","😊","😍","😘","😅","😎","🤩","🥳","🤗","🤔","😴","😇","🙂","😢","😭","😡","🙄","😬","😳","👍","👎","👏","🙏","💪","🙌","👌","🤝","✌️","🤞","❤️","🧡","💛","💚","💙","💜","🔥","✨","🎉","✅","❌","⚠️","⏰","📍","📞","💊","🩺","🚑","🏥","🧓","👶","🍵","🌙","☀️"];

function useClock() {
  const f = useFmt();
  return (ts: number) => {
    const d = new Date(ts);
    return f.time(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
  };
}
/** ms → "m:ss" */
function fmtDur(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Simulated, pausable upload progress. The real backend (chunked/resumable upload) will drive this — see requirement.md. */
function useUploadSim(onDone: () => void) {
  const [progress, setProgress] = useState(10);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });
  useEffect(() => {
    const iv = window.setInterval(() => {
      if (pausedRef.current) return;
      setProgress((p) => {
        const n = Math.min(100, p + 9);
        if (n >= 100) {
          window.clearInterval(iv);
          window.setTimeout(() => doneRef.current(), 250);
        }
        return n;
      });
    }, 130);
    return () => window.clearInterval(iv);
  }, []);
  const toggle = () => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  };
  return { progress, paused, toggle };
}

/** Upload progress ring with pause/resume, over a photo/video. */
function UploadOverlay({ onDone }: { onDone: () => void }) {
  const t = useTranslations("common.chat");
  const { progress, paused, toggle } = useUploadSim(onDone);
  return (
    <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40">
      <span className="flex size-14 items-center justify-center rounded-full" style={{ backgroundImage: `conic-gradient(#fff ${progress}%, rgba(255,255,255,0.35) ${progress}%)` }}>
        <button
          type="button"
          aria-label={paused ? t("resume") : t("pause")}
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          className="flex size-11 items-center justify-center rounded-full bg-black/70 text-white"
        >
          {paused ? <Play className="size-5" /> : <Pause className="size-5" />}
        </button>
      </span>
    </span>
  );
}

/** Compact upload progress bar with pause/resume, for files/voice notes. */
function UploadBar({ onDone, mine }: { onDone: () => void; mine: boolean }) {
  const t = useTranslations("common.chat");
  const { progress, paused, toggle } = useUploadSim(onDone);
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        aria-label={paused ? t("resume") : t("pause")}
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        className={clsx("flex size-6 items-center justify-center rounded-full", mine ? "bg-white/20 text-white" : "bg-ink-100 text-ink-600")}
      >
        {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
      </button>
      <span className={clsx("h-1 w-12 overflow-hidden rounded-full", mine ? "bg-white/25" : "bg-ink-200")}>
        <span className={clsx("block h-full rounded-full transition-[width]", mine ? "bg-white" : "bg-brand-500")} style={{ width: `${progress}%` }} />
      </span>
    </span>
  );
}

/** Short preview of a message for lists / reply quotes. */
function preview(m: ChatMessage, t: (key: "deleted" | "photo" | "video" | "file" | "voice") => string): string {
  if (m.deleted) return t("deleted");
  if (m.type === "image") return `📷 ${t("photo")}`;
  if (m.type === "video") return `🎥 ${t("video")}`;
  if (m.type === "file") return `📎 ${t("file")}`;
  if (m.type === "voice") return `🎤 ${t("voice")}`;
  return m.text ?? "";
}

/* ---------------------------------- list ---------------------------------- */

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: {
  conversations: ChatConversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("common.chat");
  const f = useFmt();
  if (conversations.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <p className="font-semibold text-ink-900">{t("empty")}</p>
        <p className="mt-1 text-sm text-ink-500">{t("emptyHint")}</p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-ink-100">
      {conversations.map((c) => {
        const last = c.messages[c.messages.length - 1];
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              className={clsx("flex w-full items-center gap-3 px-4 py-3 text-start transition-colors", c.id === selectedId ? "bg-brand-50" : "hover:bg-ink-50")}
            >
              <span className="relative shrink-0">
                <Avatar name={c.name} />
                {c.online && <span className="absolute end-0 bottom-0 size-3 rounded-full bg-success-600 ring-2 ring-white" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-bold text-ink-900">{c.name}</span>
                  {last && <span className="shrink-0 text-xs text-ink-400">{f.relativeTime(new Date(last.createdAt).toISOString())}</span>}
                </span>
                <span className="mt-0.5 flex items-center gap-1 text-sm text-ink-500">
                  {last?.sender === "me" && !last.deleted && <span className="text-ink-400">{t("you")}:</span>}
                  <span dir="auto" className="truncate">
                    {last ? preview(last, t) : ""}
                  </span>
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* --------------------------------- bubble --------------------------------- */

function Ticks({ read }: { read: boolean }) {
  // On the green "sent" bubble: delivered = dim white double-check, read = bright blue double-check.
  return <CheckCheck className="size-3.5" style={{ color: read ? "#7dd3fc" : "rgba(255,255,255,0.65)" }} />;
}

function MessageBubble({
  message,
  replyTo,
  active,
  below,
  scrollRef,
  onOpenActions,
  onReply,
  onReact,
  onDelete,
  onUploadComplete,
  onOpenMedia,
  onOpenDoc,
}: {
  message: ChatMessage;
  replyTo?: ChatMessage;
  active: boolean;
  below: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  onOpenActions: (id: string | null, below?: boolean) => void;
  onReply: (m: ChatMessage) => void;
  onReact: (id: string, emoji: string) => void;
  onDelete: (id: string) => void;
  onUploadComplete: (id: string) => void;
  onOpenMedia: (id: string) => void;
  onOpenDoc: (id: string) => void;
}) {
  const t = useTranslations("common.chat");
  const clock = useClock();
  const mine = message.sender === "me";
  const wrapRef = useRef<HTMLDivElement>(null);
  // Flip the action menu below the bubble when it's near the top of the scroll area (so it isn't clipped).
  const toggle = () => {
    const cTop = scrollRef.current?.getBoundingClientRect().top ?? 0;
    const bTop = wrapRef.current?.getBoundingClientRect().top ?? 9999;
    onOpenActions(active ? null : message.id, bTop - cTop < 56);
  };

  if (message.deleted) {
    return (
      <div className={clsx("flex", mine ? "justify-end" : "justify-start")}>
        <span
          className={clsx(
            "inline-flex max-w-[78%] items-center gap-1.5 rounded-2xl px-3 py-2 text-sm italic shadow-card",
            mine ? "rounded-br-md bg-brand-600/60 text-white/90" : "rounded-bl-md bg-white text-ink-400 ring-1 ring-ink-100",
          )}
        >
          <Ban className="size-3.5 shrink-0" /> {t("deleted")}
        </span>
      </div>
    );
  }

  return (
    <div className={clsx("group flex items-end gap-1", mine && "flex-row-reverse")}>
      <div ref={wrapRef} className="relative max-w-[78%] sm:max-w-[65%]">
        <div className={clsx("rounded-2xl px-3 py-2 text-sm shadow-card", mine ? "rounded-br-md bg-brand-600 text-white" : "rounded-bl-md bg-white text-ink-900 ring-1 ring-ink-100")}>
          {replyTo && (
            <span className={clsx("mb-1 block rounded-lg border-s-2 px-2 py-1 text-xs", mine ? "border-white/70 bg-white/15 text-white/90" : "border-brand-400 bg-brand-50 text-ink-600")}>
              <b className="block">{replyTo.sender === "me" ? t("you") : ""}</b>
              <span dir="auto" className="line-clamp-2">
                {preview(replyTo, t)}
              </span>
            </span>
          )}

          {message.type === "image" && message.mediaUrl && (
            <span className="relative mb-1 block">
              <button type="button" onClick={() => !message.uploading && onOpenMedia(message.id)} className="block w-full">
                {/* eslint-disable-next-line @next/next/no-img-element -- local data/object URL preview, not a remote asset */}
                <img src={message.mediaUrl} alt={message.mediaName ?? t("photo")} className="max-h-64 w-full rounded-lg object-cover" />
              </button>
              {message.uploading && <UploadOverlay onDone={() => onUploadComplete(message.id)} />}
            </span>
          )}
          {message.type === "video" && message.mediaUrl && (
            <span className="relative mb-1 block">
              <video controls src={message.mediaUrl} className="max-h-64 w-full rounded-lg" />
              {message.uploading && <UploadOverlay onDone={() => onUploadComplete(message.id)} />}
            </span>
          )}
          {message.type === "file" &&
            (message.uploading ? (
              <span className={clsx("mb-1 flex items-center gap-2 rounded-lg p-2", mine ? "bg-white/15" : "bg-ink-50")}>
                <FileText className="size-5 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{message.mediaName}</span>
                  {message.mediaSize ? <span className="block text-xs opacity-80">{formatBytes(message.mediaSize)}</span> : null}
                </span>
                <UploadBar onDone={() => onUploadComplete(message.id)} mine={mine} />
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onOpenDoc(message.id)}
                className={clsx("mb-1 flex w-full items-center gap-2 rounded-lg p-2 text-start", mine ? "bg-white/15 hover:bg-white/25" : "bg-ink-50 hover:bg-ink-100")}
              >
                <FileText className="size-5 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{message.mediaName}</span>
                  {message.mediaSize ? <span className="block text-xs opacity-80">{formatBytes(message.mediaSize)}</span> : null}
                </span>
              </button>
            ))}
          {message.type === "voice" && message.mediaUrl && (
            <span className="mb-1 flex items-center gap-2">
              <audio controls src={message.mediaUrl} className="h-9 w-44 max-w-full" />
              {message.uploading ? (
                <UploadBar onDone={() => onUploadComplete(message.id)} mine={mine} />
              ) : message.durationMs ? (
                <span className="shrink-0 text-xs opacity-80">{fmtDur(message.durationMs)}</span>
              ) : null}
            </span>
          )}
          {message.text && (
            <span dir="auto" className="whitespace-pre-wrap break-words">
              {message.text}
            </span>
          )}
          <span className={clsx("mt-0.5 flex items-center justify-end gap-1 text-[10px]", mine ? "text-white/80" : "text-ink-400")}>
            {clock(message.createdAt)}
            {mine && <Ticks read={message.readByThem} />}
          </span>
        </div>

        {message.reactions.length > 0 && (
          <div className={clsx("mt-0.5 flex", mine ? "justify-end" : "justify-start")}>
            <span className="inline-flex items-center gap-0.5 rounded-full bg-white px-1.5 py-0.5 text-xs shadow-card ring-1 ring-ink-100">
              {message.reactions.map((r, i) => (
                <span key={i}>{r.emoji}</span>
              ))}
            </span>
          </div>
        )}

        {active && (
          <div className={clsx("absolute z-10 flex items-center gap-1 rounded-full bg-white p-1 shadow-pop ring-1 ring-ink-100", below ? "top-full mt-2" : "-top-11", mine ? "end-0" : "start-0")}>
            {QUICK_REACTIONS.map((e) => (
              <button
                key={e}
                type="button"
                className="rounded-full px-1 text-lg leading-none transition-transform hover:scale-125"
                onClick={() => {
                  onReact(message.id, e);
                  onOpenActions(null);
                }}
              >
                {e}
              </button>
            ))}
            <span className="mx-0.5 h-5 w-px bg-ink-100" />
            <button
              type="button"
              aria-label={t("reply")}
              className="flex size-7 items-center justify-center rounded-full text-ink-500 hover:bg-ink-50"
              onClick={() => {
                onReply(message);
                onOpenActions(null);
              }}
            >
              <CornerUpLeft className="size-4" />
            </button>
            {mine && (
              <button
                type="button"
                aria-label={t("delete")}
                className="flex size-7 items-center justify-center rounded-full text-danger-600 hover:bg-danger-50"
                onClick={() => {
                  onDelete(message.id);
                  onOpenActions(null);
                }}
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Actions trigger (hover on desktop, faint-but-tappable on touch) */}
      <button
        type="button"
        aria-label={t("messageActions")}
        onClick={toggle}
        className="mb-1 flex size-7 shrink-0 items-center justify-center rounded-full text-ink-400 opacity-40 transition hover:bg-ink-100 hover:opacity-100 group-hover:opacity-100"
      >
        <Smile className="size-4" />
      </button>
    </div>
  );
}

/* -------------------------------- composer -------------------------------- */

function Composer({ onSend, replyTo, onCancelReply }: { onSend: (input: SendInput) => void; replyTo: ChatMessage | null; onCancelReply: () => void }) {
  const t = useTranslations("common.chat");
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const baseElapsedRef = useRef(0);
  const resumedAtRef = useRef(0);
  const pausedRef = useRef(false);
  const cancelledRef = useRef(false);

  // Clean up an in-flight recording if the component unmounts.
  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    onSend({ text: value, replyToId: replyTo?.id });
    setText("");
    onCancelReply();
  };

  const openPicker = (accept: string) => {
    setShowAttach(false);
    if (fileRef.current) {
      fileRef.current.accept = accept;
      fileRef.current.click();
    }
  };
  const onPickFile = (file: File) => {
    const reader = new FileReader();
    if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
      const type = file.type.startsWith("video/") ? "video" : "image";
      reader.onload = () => onSend({ type, mediaUrl: String(reader.result), mediaName: file.name, mediaSize: file.size, replyToId: replyTo?.id });
    } else {
      reader.onload = () => onSend({ type: "file", mediaUrl: String(reader.result), mediaName: file.name, mediaSize: file.size, replyToId: replyTo?.id });
    }
    reader.readAsDataURL(file);
    onCancelReply();
  };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      cancelledRef.current = false;
      pausedRef.current = false;
      baseElapsedRef.current = 0;
      resumedAtRef.current = Date.now();
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        streamRef.current = null;
        if (timerRef.current) window.clearInterval(timerRef.current);
        const dur = baseElapsedRef.current + (pausedRef.current ? 0 : Date.now() - resumedAtRef.current);
        setRecording(false);
        setPaused(false);
        setElapsed(0);
        if (cancelledRef.current || dur < 600) return;
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        const reader = new FileReader();
        reader.onload = () => onSend({ type: "voice", mediaUrl: String(reader.result), durationMs: dur, replyToId: replyTo?.id });
        reader.readAsDataURL(blob);
        onCancelReply();
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
      setPaused(false);
      setElapsed(0);
      timerRef.current = window.setInterval(() => setElapsed(baseElapsedRef.current + (Date.now() - resumedAtRef.current)), 200);
    } catch {
      // Mic denied or unavailable — stay in text mode.
      setRecording(false);
    }
  };
  const togglePause = () => {
    const rec = recRef.current;
    if (!rec) return;
    if (rec.state === "recording") {
      rec.pause();
      baseElapsedRef.current += Date.now() - resumedAtRef.current;
      pausedRef.current = true;
      if (timerRef.current) window.clearInterval(timerRef.current);
      setPaused(true);
      setElapsed(baseElapsedRef.current);
    } else if (rec.state === "paused") {
      rec.resume();
      resumedAtRef.current = Date.now();
      pausedRef.current = false;
      timerRef.current = window.setInterval(() => setElapsed(baseElapsedRef.current + (Date.now() - resumedAtRef.current)), 200);
      setPaused(false);
    }
  };
  const stopRec = (cancel: boolean) => {
    cancelledRef.current = cancel;
    recRef.current?.stop();
  };

  return (
    <div className="border-t border-ink-100 bg-white p-2 sm:p-3">
      {replyTo && !recording && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border-s-2 border-brand-400 bg-brand-50 px-3 py-1.5 text-xs">
          <div className="min-w-0 flex-1">
            <b className="block text-brand-700">{t("replyingTo", { name: replyTo.sender === "me" ? t("you") : "" })}</b>
            <span dir="auto" className="line-clamp-1 text-ink-600">
              {preview(replyTo, t)}
            </span>
          </div>
          <button type="button" aria-label={t("cancel")} onClick={onCancelReply} className="text-ink-400 hover:text-ink-700">
            <X className="size-4" />
          </button>
        </div>
      )}

      {recording ? (
        <div className="flex items-center gap-2 px-1 sm:gap-3">
          <span className={clsx("size-2.5 shrink-0 rounded-full", paused ? "bg-ink-300" : "bg-danger-600")} aria-hidden />
          <span className="tabular shrink-0 text-sm font-semibold text-danger-700">{fmtDur(elapsed)}</span>
          <span className="flex-1 truncate text-sm text-ink-500">{paused ? t("paused") : t("recording")}</span>
          <button type="button" aria-label={t("cancel")} onClick={() => stopRec(true)} className="flex size-10 items-center justify-center rounded-full text-ink-500 hover:bg-ink-50">
            <Trash2 className="size-5" />
          </button>
          <button type="button" aria-label={paused ? t("resume") : t("pause")} onClick={togglePause} className="flex size-10 items-center justify-center rounded-full text-ink-600 hover:bg-ink-50">
            {paused ? <Play className="size-5" /> : <Pause className="size-5" />}
          </button>
          <button type="button" aria-label={t("send")} onClick={() => stopRec(false)} className="flex size-10 items-center justify-center rounded-full bg-brand-600 text-white hover:bg-brand-700">
            <Send className="size-5 rtl:-scale-x-100" />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-1.5">
          <div className="relative">
            <button type="button" aria-label={t("emoji")} onClick={() => setShowEmoji((s) => !s)} className="flex size-10 items-center justify-center rounded-full text-ink-500 hover:bg-ink-50">
              <Smile className="size-5" />
            </button>
            {showEmoji && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowEmoji(false)} aria-hidden />
                <div className="absolute bottom-12 start-0 z-20 grid w-72 grid-cols-8 gap-1 rounded-xl border border-ink-100 bg-white p-2 shadow-pop">
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      className="rounded-lg py-1 text-xl leading-none hover:bg-ink-50"
                      onClick={() => {
                        setText((v) => v + e);
                        taRef.current?.focus();
                      }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="relative">
            <button type="button" aria-label={t("attach")} onClick={() => setShowAttach((s) => !s)} className="flex size-10 items-center justify-center rounded-full text-ink-500 hover:bg-ink-50">
              <Paperclip className="size-5" />
            </button>
            {showAttach && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowAttach(false)} aria-hidden />
                <div className="absolute bottom-12 start-0 z-20 w-44 rounded-xl border border-ink-100 bg-white p-1 shadow-pop">
                  <button type="button" onClick={() => openPicker("image/*")} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50">
                    <ImageIcon className="size-4 text-brand-600" /> {t("photo")}
                  </button>
                  <button type="button" onClick={() => openPicker("video/*")} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50">
                    <Video className="size-4 text-brand-600" /> {t("video")}
                  </button>
                  <button type="button" onClick={() => openPicker("application/pdf,.doc,.docx,.txt")} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50">
                    <FileText className="size-4 text-brand-600" /> {t("document")}
                  </button>
                </div>
              </>
            )}
          </div>

          <input
            ref={fileRef}
            type="file"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onPickFile(file);
              e.target.value = "";
            }}
          />

          <textarea
            ref={taRef}
            rows={1}
            value={text}
            dir="auto"
            placeholder={t("placeholder")}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
          />

          {text.trim() ? (
            <button type="button" aria-label={t("send")} onClick={submit} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition-colors hover:bg-brand-700">
              <Send className="size-5 rtl:-scale-x-100" />
            </button>
          ) : (
            <button type="button" aria-label={t("recordVoice")} onClick={startRec} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition-colors hover:bg-brand-700">
              <Mic className="size-5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* --------------------------- media viewer + calls ------------------------- */

/** Fullscreen image/video viewer with prev/next through the conversation's media. */
function Lightbox({ items, index, onClose, onIndex }: { items: ChatMessage[]; index: number; onClose: () => void; onIndex: (i: number) => void }) {
  const t = useTranslations("common.chat");
  const m = items[index];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && index < items.length - 1) onIndex(index + 1);
      else if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, items.length, onClose, onIndex]);
  if (!m) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={onClose}>
      <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 p-3" onClick={(e) => e.stopPropagation()}>
        <button type="button" aria-label={t("close")} onClick={onClose} className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
          <X className="size-5" />
        </button>
        <span className="flex-1 text-center text-sm text-white/70">{items.length > 1 ? `${index + 1} / ${items.length}` : ""}</span>
        {m.mediaUrl && (
          <a
            href={m.mediaUrl}
            download={m.mediaName ?? (m.type === "video" ? "video" : "photo")}
            aria-label={t("download")}
            className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <Download className="size-5" />
          </a>
        )}
      </div>
      {index > 0 && (
        <button type="button" aria-label={t("previous")} onClick={(e) => { e.stopPropagation(); onIndex(index - 1); }} className="absolute start-2 flex size-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:start-4">
          <ChevronLeft className="rtl:-scale-x-100 size-6" />
        </button>
      )}
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-full max-w-3xl items-center justify-center">
        {m.type === "video" ? (
          <video controls autoPlay src={m.mediaUrl} className="max-h-[85vh] max-w-full rounded-lg" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- local data/object URL preview
          <img src={m.mediaUrl} alt="" className="max-h-[85vh] max-w-full rounded-lg object-contain" />
        )}
      </div>
      {index < items.length - 1 && (
        <button type="button" aria-label={t("next")} onClick={(e) => { e.stopPropagation(); onIndex(index + 1); }} className="absolute end-2 flex size-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:end-4">
          <ChevronRight className="rtl:-scale-x-100 size-6" />
        </button>
      )}
    </div>
  );
}

/** "Media & docs" panel for a conversation — media grid + documents list. */
function MediaGallery({ conversation, onClose, onOpenMedia, onOpenDoc }: { conversation: ChatConversation; onClose: () => void; onOpenMedia: (msgId: string) => void; onOpenDoc: (msgId: string) => void }) {
  const t = useTranslations("common.chat");
  const media = conversation.messages.filter((m) => (m.type === "image" || m.type === "video") && m.mediaUrl && !m.deleted);
  const docs = conversation.messages.filter((m) => m.type === "file" && !m.deleted);
  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-white">
      <header className="flex items-center gap-3 border-b border-ink-100 px-3 py-2.5">
        <button type="button" aria-label={t("back")} onClick={onClose} className="flex size-9 items-center justify-center rounded-full text-ink-500 hover:bg-ink-50">
          <ArrowLeft className="rtl:-scale-x-100 size-5" />
        </button>
        <p className="font-bold text-ink-900">{t("mediaTitle")}</p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {media.length === 0 && docs.length === 0 && <p className="py-10 text-center text-sm text-ink-500">{t("noMedia")}</p>}
        {media.length > 0 && (
          <>
            <h3 className="mb-2 text-xs font-bold tracking-wide text-ink-400 uppercase">{t("mediaSection")}</h3>
            <div className="grid grid-cols-3 gap-1 sm:grid-cols-4">
              {media.map((m) => (
                <button key={m.id} type="button" onClick={() => onOpenMedia(m.id)} className="relative aspect-square overflow-hidden rounded-lg bg-ink-100">
                  {m.type === "video" ? (
                    <>
                      <video src={m.mediaUrl} className="size-full object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                        <Play className="size-6 text-white" />
                      </span>
                    </>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- local data/object URL preview
                    <img src={m.mediaUrl} alt="" className="size-full object-cover" />
                  )}
                </button>
              ))}
            </div>
          </>
        )}
        {docs.length > 0 && (
          <>
            <h3 className="mt-5 mb-2 text-xs font-bold tracking-wide text-ink-400 uppercase">{t("documentsSection")}</h3>
            <ul className="space-y-2">
              {docs.map((d) => (
                <li key={d.id}>
                  <button type="button" onClick={() => onOpenDoc(d.id)} className="flex w-full items-center gap-3 rounded-xl border border-ink-100 p-3 text-start hover:border-brand-300 hover:bg-brand-50/40">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                      <FileText className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink-900">{d.mediaName}</span>
                      {d.mediaSize ? <span className="block text-xs text-ink-500">{formatBytes(d.mediaSize)}</span> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

/** Fullscreen document viewer — previews PDFs inline, offers download otherwise. */
function DocViewer({ message, onClose }: { message: ChatMessage; onClose: () => void }) {
  const t = useTranslations("common.chat");
  const isPdf = (message.mediaName ?? "").toLowerCase().endsWith(".pdf");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink-900/95">
      <header className="flex items-center gap-3 p-3 text-white">
        <button type="button" aria-label={t("close")} onClick={onClose} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
          <X className="size-5" />
        </button>
        <span dir="auto" className="min-w-0 flex-1 truncate font-semibold">
          {message.mediaName}
        </span>
        {message.mediaUrl && (
          <a href={message.mediaUrl} download={message.mediaName} aria-label={t("download")} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
            <Download className="size-5" />
          </a>
        )}
      </header>
      <div className="min-h-0 flex-1 p-2 sm:p-4">
        {isPdf && message.mediaUrl ? (
          <object data={message.mediaUrl} type="application/pdf" className="size-full rounded-lg bg-white">
            {/* Shown only if the browser can't render the PDF inline. */}
            <div className="flex h-full flex-col items-center justify-center gap-3 text-ink-500">
              <FileText className="size-16" />
              <p dir="auto" className="font-semibold text-ink-800">{message.mediaName}</p>
              <a href={message.mediaUrl} download={message.mediaName} className="rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
                {t("download")}
              </a>
            </div>
          </object>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-white/80">
            <FileText className="size-16" />
            <p dir="auto" className="font-semibold">{message.mediaName}</p>
            {message.mediaSize ? <p className="text-sm text-white/60">{formatBytes(message.mediaSize)}</p> : null}
            {message.mediaUrl ? (
              <>
                <p className="text-sm text-white/50">{t("noInlinePreview")}</p>
                <a href={message.mediaUrl} download={message.mediaName} className="mt-1 inline-flex items-center gap-2 rounded-full bg-white/15 px-5 py-2.5 text-sm font-semibold hover:bg-white/25">
                  <Download className="size-4" /> {t("download")}
                </a>
              </>
            ) : (
              <p className="text-sm text-white/50">{t("noPreview")}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Simulated call screen (real voice/video calling needs a WebRTC backend — see requirement.md). */
function CallOverlay({ name, video, onEnd }: { name: string; video: boolean; onEnd: () => void }) {
  const t = useTranslations("common.chat");
  const [secs, setSecs] = useState(0);
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    const iv = window.setInterval(() => setSecs((s) => s + 1), 1000);
    return () => window.clearInterval(iv);
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-gradient-to-b from-brand-700 to-ink-900 p-8 text-white">
      <div className="mt-16 flex flex-col items-center gap-4">
        <span className="flex size-28 items-center justify-center rounded-full bg-white/15 text-4xl font-bold">{name.slice(0, 1)}</span>
        <p className="text-2xl font-bold">{name}</p>
        <p className="text-sm text-white/70">
          {video ? t("videoCall") : t("voiceCall")} · {fmtDur(secs * 1000)}
        </p>
      </div>
      <p className="text-center text-xs text-white/60">{t("callSimNote")}</p>
      <div className="mb-10 flex items-center gap-5">
        <button type="button" aria-label={muted ? t("unmute") : t("mute")} onClick={() => setMuted((v) => !v)} className="flex size-14 items-center justify-center rounded-full bg-white/15 hover:bg-white/25">
          {muted ? <MicOff className="size-6" /> : <Mic className="size-6" />}
        </button>
        <button type="button" aria-label={t("endCall")} onClick={onEnd} className="flex size-16 items-center justify-center rounded-full bg-danger-600 hover:bg-danger-700">
          <PhoneOff className="size-7" />
        </button>
        {video && (
          <span className="flex size-14 items-center justify-center rounded-full bg-white/15">
            <Video className="size-6" />
          </span>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- thread --------------------------------- */

export function ChatThread({
  conversation,
  onSend,
  onReact,
  onDelete,
  onUploadComplete,
  onBack,
}: {
  conversation: ChatConversation;
  onSend: (convId: string, input: SendInput) => void;
  onReact: (convId: string, msgId: string, emoji: string) => void;
  onDelete: (convId: string, msgId: string) => void;
  onUploadComplete: (convId: string, msgId: string) => void;
  onBack?: () => void;
}) {
  const t = useTranslations("common.chat");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  const [actionsBelow, setActionsBelow] = useState(false);
  const openActions = (id: string | null, below?: boolean) => {
    setActionsFor(id);
    setActionsBelow(!!below);
  };
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const byId = useMemo(() => new Map(conversation.messages.map((m) => [m.id, m])), [conversation.messages]);
  const [call, setCall] = useState<{ video: boolean } | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [docMsg, setDocMsg] = useState<ChatMessage | null>(null);
  const mediaList = useMemo(() => conversation.messages.filter((m) => (m.type === "image" || m.type === "video") && m.mediaUrl && !m.deleted), [conversation.messages]);
  const openMedia = (msgId: string) => {
    const i = mediaList.findIndex((m) => m.id === msgId);
    if (i >= 0) {
      setGalleryOpen(false);
      setViewerIndex(i);
    }
  };
  const openDoc = (msgId: string) => {
    const m = conversation.messages.find((x) => x.id === msgId);
    if (m) {
      setGalleryOpen(false);
      setDocMsg(m);
    }
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [conversation.messages.length]);

  return (
    <div className="relative flex h-full flex-col">
      <header className="flex items-center gap-1 border-b border-ink-100 bg-white px-2 py-2 sm:gap-2 sm:px-3">
        {onBack && (
          <button type="button" aria-label={t("back")} onClick={onBack} className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-500 hover:bg-ink-50 lg:hidden">
            <ArrowLeft className="rtl:-scale-x-100 size-5" />
          </button>
        )}
        <button type="button" onClick={() => setGalleryOpen(true)} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1 text-start hover:bg-ink-50">
          <span className="relative shrink-0">
            <Avatar name={conversation.name} />
            {conversation.online && <span className="absolute end-0 bottom-0 size-3 rounded-full bg-success-600 ring-2 ring-white" />}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-bold text-ink-900">{conversation.name}</span>
            <span className="block text-xs text-ink-500">{conversation.online ? t("online") : conversation.role}</span>
          </span>
        </button>
        <button type="button" aria-label={t("videoCall")} onClick={() => setCall({ video: true })} className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink-500 hover:bg-ink-50 hover:text-brand-600">
          <Video className="size-5" />
        </button>
        <button type="button" aria-label={t("voiceCall")} onClick={() => setCall({ video: false })} className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink-500 hover:bg-ink-50 hover:text-brand-600">
          <Phone className="size-5" />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-ink-25 p-3 sm:p-4" onClick={() => actionsFor && setActionsFor(null)}>
        {conversation.messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            replyTo={m.replyToId ? byId.get(m.replyToId) : undefined}
            active={actionsFor === m.id}
            below={actionsBelow}
            scrollRef={scrollRef}
            onOpenActions={openActions}
            onReply={setReplyTo}
            onReact={(id, e) => onReact(conversation.id, id, e)}
            onDelete={(id) => onDelete(conversation.id, id)}
            onUploadComplete={(id) => onUploadComplete(conversation.id, id)}
            onOpenMedia={openMedia}
            onOpenDoc={openDoc}
          />
        ))}
        <div ref={endRef} />
      </div>

      <Composer onSend={(input) => onSend(conversation.id, input)} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} />

      {galleryOpen && <MediaGallery conversation={conversation} onClose={() => setGalleryOpen(false)} onOpenMedia={openMedia} onOpenDoc={openDoc} />}
      {call && <CallOverlay name={conversation.name} video={call.video} onEnd={() => setCall(null)} />}
      {viewerIndex !== null && <Lightbox items={mediaList} index={viewerIndex} onClose={() => setViewerIndex(null)} onIndex={setViewerIndex} />}
      {docMsg && <DocViewer message={docMsg} onClose={() => setDocMsg(null)} />}
    </div>
  );
}
