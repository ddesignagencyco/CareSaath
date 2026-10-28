import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { ApiError } from '../api/http';
import { chatApi } from '../api/chat/api';
import { chatKeys } from '../api/chat/keys';
import type { ChatMessageType, ChatScope } from '../api/chat/types';
import { invalidate } from './query';
import { kv } from './storage';

/**
 * Chat media uploads that survive a bad connection, like WhatsApp: the file
 * goes up in chunks to a resumable session, so a drop, a pause or even
 * closing the app only loses the chunk in flight. Dropped chunks retry on
 * their own with back-off; after that the bubble offers Retry, which carries
 * on from the server's offset instead of starting again.
 *
 * Jobs live here (not in the chat query) until the message is posted, and are
 * kept on disk so they show up, paused or resuming, after a restart.
 */
export type UploadState =
  /** Sending chunks (or queued for a free slot). */
  | 'uploading'
  /** Connection dropped; retrying by itself at `retryAt`. */
  | 'waiting'
  /** Paused by the user. */
  | 'paused'
  /** Gave up; the user can retry (resumes from the server's offset). */
  | 'failed'
  /** All bytes are up; posting the message. */
  | 'sending';

export interface ChatUpload {
  id: string;
  scope: ChatScope;
  conversationId: string;
  type: Exclude<ChatMessageType, 'text'>;
  file: { uri: string; name: string; mimeType: string; size: number };
  durationMs?: number;
  width?: number;
  height?: number;
  replyToId?: string;
  /** Server session; missing until created. */
  uploadId?: string;
  chunkSize?: number;
  /** Bytes the server has confirmed. */
  offset: number;
  state: UploadState;
  attempts: number;
  retryAt?: number;
  /** Backend message for a non-network failure. */
  error?: string;
  createdAt: string;
}

const STORE_KEY = 'caresaath.chat.uploads.v1';
const MAX_PARALLEL = 2;
const MAX_AUTO_RETRIES = 5;
const DEFAULT_CHUNK = 256 * 1024;

const jobs = new Map<string, ChatUpload>();
const runners = new Map<string, AbortController>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();
let version = 0;
let loaded = false;
const booted = new Set<ChatScope>();

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = kv.getItem(STORE_KEY);
    for (const j of raw ? (JSON.parse(raw) as ChatUpload[]) : []) jobs.set(j.id, j);
  } catch {
    // Corrupt store: start clean.
  }
}

function emit() {
  version++;
  kv.setItem(STORE_KEY, JSON.stringify([...jobs.values()]));
  listeners.forEach(l => l());
}

function patch(id: string, p: Partial<ChatUpload>) {
  const j = jobs.get(id);
  if (!j) return;
  jobs.set(id, { ...j, ...p });
  emit();
}

let counter = 0;
const localId = () => `local-${Date.now().toString(36)}${(counter++).toString(36)}`;

/** Start the next queued jobs while there are free slots. */
function pump() {
  for (const j of jobs.values()) {
    if (runners.size >= MAX_PARALLEL) return;
    if ((j.state === 'uploading' || j.state === 'sending') && !runners.has(j.id) && booted.has(j.scope)) void run(j.id);
  }
}

const isNetwork = (e: unknown) => e instanceof ApiError && e.status === 0;
const isGone = (e: unknown) => e instanceof ApiError && e.status === 404;
const isOffsetMismatch = (e: unknown) => e instanceof ApiError && e.status === 409;

async function run(id: string) {
  const ctl = new AbortController();
  runners.set(id, ctl);
  const current = () => jobs.get(id);
  try {
    let j = current();
    if (!j) return;
    const api = chatApi(j.scope);

    if (!j.uploadId) {
      const s = await api.uploads.create({ conversationId: j.conversationId, fileName: j.file.name, mimeType: j.file.mimeType, size: j.file.size, uri: j.file.uri });
      patch(id, { uploadId: s.uploadId, chunkSize: s.chunkSize, offset: s.offset });
    } else {
      // Resume: the server is the source of truth for how much it has.
      const s = await api.uploads.status(j.uploadId);
      patch(id, { offset: s.offset, chunkSize: s.chunkSize });
    }

    while ((j = current()) && j.offset < j.file.size) {
      if (ctl.signal.aborted) return;
      const length = Math.min(j.chunkSize ?? DEFAULT_CHUNK, j.file.size - j.offset);
      const r = await api.uploads.chunk(j.uploadId!, j.file.uri, j.offset, length, ctl.signal);
      patch(id, { offset: r.offset, attempts: 0, state: 'uploading', retryAt: undefined });
    }
    if (!j || ctl.signal.aborted) return;

    patch(id, { state: 'sending' });
    await api.send(j.conversationId, { type: j.type, uploadId: j.uploadId, durationMs: j.durationMs, width: j.width, height: j.height, replyToId: j.replyToId });
    jobs.delete(id);
    emit();
    invalidate(chatKeys.root(j.scope));
  } catch (e) {
    const j = current();
    // Paused or cancelled while a chunk was in flight: nothing to report.
    if (!j || ctl.signal.aborted) return;
    if (isGone(e) && j.uploadId) {
      // Session expired on the server: start a fresh one.
      patch(id, { uploadId: undefined, offset: 0 });
      retrySoon(id, 0);
    } else if (isNetwork(e) || isOffsetMismatch(e)) {
      const attempts = j.attempts + 1;
      if (attempts > MAX_AUTO_RETRIES) patch(id, { state: 'failed', attempts, retryAt: undefined });
      else retrySoon(id, Math.min(30_000, 1000 * 2 ** (attempts - 1)), attempts);
    } else {
      patch(id, { state: 'failed', error: e instanceof Error ? e.message : undefined });
    }
  } finally {
    runners.delete(id);
    pump();
  }
}

function retrySoon(id: string, ms: number, attempts?: number) {
  clearTimeout(timers.get(id));
  const retryAt = Date.now() + ms;
  patch(id, { state: 'waiting', retryAt, ...(attempts !== undefined ? { attempts } : null) });
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id);
      if (jobs.get(id)?.state === 'waiting') {
        patch(id, { state: 'uploading', retryAt: undefined });
        pump();
      }
    }, ms),
  );
}

function stopRunner(id: string) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  runners.get(id)?.abort();
  runners.delete(id);
}

export const uploads = {
  /** Queue a picked or recorded file; it starts right away. */
  add(input: Omit<ChatUpload, 'id' | 'offset' | 'state' | 'attempts' | 'createdAt'>): string {
    load();
    const id = localId();
    jobs.set(id, { ...input, id, offset: 0, state: 'uploading', attempts: 0, createdAt: new Date().toISOString() });
    emit();
    pump();
    return id;
  },
  pause(id: string) {
    const j = jobs.get(id);
    if (!j || j.state === 'sending') return;
    stopRunner(id);
    patch(id, { state: 'paused', retryAt: undefined });
    pump();
  },
  /** Resume after a pause or a failure: continues from the server's offset. */
  resume(id: string) {
    const j = jobs.get(id);
    if (!j || runners.has(id)) return;
    clearTimeout(timers.get(id));
    patch(id, { state: 'uploading', attempts: 0, retryAt: undefined, error: undefined });
    pump();
  },
  cancel(id: string) {
    const j = jobs.get(id);
    if (!j) return;
    stopRunner(id);
    jobs.delete(id);
    emit();
    if (j.uploadId) chatApi(j.scope).uploads.cancel(j.uploadId).catch(() => {});
    pump();
  },
};

/**
 * Called once per signed-in side: picks up uploads left from a previous run.
 * Ones that were moving carry on by themselves; paused ones stay paused.
 * Unmounting (sign-out) pauses everything of that side.
 */
export function useUploadsBoot(scope: ChatScope) {
  useEffect(() => {
    load();
    booted.add(scope);
    for (const j of jobs.values()) {
      if (j.scope === scope && j.state === 'waiting') {
        patch(j.id, { state: 'uploading', retryAt: undefined });
      }
    }
    pump();
    // Back from the background: retry dropped uploads now, not at the next back-off.
    const sub = AppState.addEventListener('change', s => {
      if (s !== 'active') return;
      for (const j of jobs.values()) {
        if (j.scope === scope && j.state === 'waiting') {
          clearTimeout(timers.get(j.id));
          patch(j.id, { state: 'uploading', retryAt: undefined });
        }
      }
      pump();
    });
    return () => {
      sub.remove();
      booted.delete(scope);
      for (const j of jobs.values()) {
        if (j.scope === scope && runners.has(j.id)) stopRunner(j.id);
      }
    };
  }, [scope]);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** Live uploads for one conversation, oldest first. */
export function useConversationUploads(scope: ChatScope, conversationId: string): ChatUpload[] {
  load();
  useSyncExternalStore(subscribe, () => version);
  const pick = useCallback(
    () => [...jobs.values()].filter(j => j.scope === scope && j.conversationId === conversationId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [scope, conversationId],
  );
  return pick();
}

/** Pending uploads per conversation, for the list's "Sending…" preview. */
export function usePendingUploadCount(scope: ChatScope): Record<string, number> {
  load();
  useSyncExternalStore(subscribe, () => version);
  const out: Record<string, number> = {};
  for (const j of jobs.values()) if (j.scope === scope) out[j.conversationId] = (out[j.conversationId] ?? 0) + 1;
  return out;
}
