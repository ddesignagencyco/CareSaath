/**
 * In-app mock of the chat routes, persisted like the other mock DBs. The other
 * party "reads" and replies a moment after you send, so ticks and replies can
 * be tried. Upload sessions keep their offset on disk, so a resumable upload
 * survives the app being closed mid-transfer.
 */
import { ApiError } from "../http";
import { kv } from "../../lib/storage";
import { invalidate } from "../../lib/query";
import type { ChatConversation, ChatMessage, ChatPeer, ChatScope, SendMessageInput, UploadSession } from "./types";
import { chatKeys } from "./keys";

interface MockConversation {
  id: string;
  peer: ChatPeer;
  online: boolean;
  messages: ChatMessage[];
  /** My last read time (ms) for the unread count. */
  readAt: number;
}

interface MockUpload {
  uploadId: string;
  offset: number;
  size: number;
  name: string;
  mimeType: string;
  /** The mock "stores" the file by keeping the device URI. */
  uri: string;
  conversationId: string;
}

interface MockChatDb {
  conversations: MockConversation[];
  uploads: Record<string, MockUpload>;
}

const CHUNK = 256 * 1024;
/** ~3G upload speed, so a large video takes long enough to pause and resume. */
const BYTES_PER_SEC = 420 * 1024;

const key = (scope: ChatScope) => `caresaath.chat.${scope}.v1`;
let counter = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}${(counter++).toString(36)}`;
const delay = (ms = 200) => new Promise<void>((r) => setTimeout(r, ms + Math.random() * 150));
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const H = 3_600_000;

function text(conversationId: string, sender: "me" | "them", body: string, msAgo: number): ChatMessage {
  return { id: uid("msg"), conversationId, sender, type: "text", text: body, reactions: [], createdAt: iso(msAgo), readByThem: true };
}

function seed(scope: ChatScope): MockChatDb {
  if (scope === "caregiver") {
    const a = "conv-cust-ahmed";
    const s = "conv-cust-saima";
    return {
      uploads: {},
      conversations: [
        {
          id: a,
          peer: { id: "cust-ahmed", name: "Ahmed Raza", role: "FAMILY" },
          online: true,
          readAt: Date.now() - 2.8 * H,
          messages: [
            text(a, "them", "Assalam o Alaikum. Will you be on time for today's visit?", 3 * H),
            text(a, "me", "Walaikum Assalam. Yes, I'll be there on time, in sha Allah.", 2.9 * H),
            text(a, "them", "JazakAllah. The gate code is 1234. 🙏", 2.8 * H),
          ],
        },
        {
          id: s,
          peer: { id: "cust-saima", name: "Saima Khalid", role: "FAMILY" },
          online: false,
          readAt: 0,
          messages: [text(s, "them", "Thank you for yesterday's session, Ammi is feeling much better.", 27 * H)],
        },
      ],
    };
  }
  const f = "conv-cg-fatima";
  const u = "conv-cg-usman";
  return {
    uploads: {},
    conversations: [
      {
        id: f,
        peer: { id: "cg-fatima", name: "Fatima Noor", role: "NURSING" },
        online: true,
        readAt: Date.now() - 2.8 * H,
        messages: [
          text(f, "them", "Assalam o Alaikum! I'll arrive for Rashida Begum's visit on time.", 3 * H),
          text(f, "me", "Walaikum Assalam, thank you! The gate code is 1234.", 2.9 * H),
          text(f, "them", "Noted. Please keep her medication list ready. 🙏", 2.8 * H),
        ],
      },
      {
        id: u,
        peer: { id: "cg-usman", name: "Usman Tariq", role: "PHYSIOTHERAPY" },
        online: false,
        readAt: 0,
        messages: [text(u, "them", "Hello! I'll share the exercises from today's session here.", 26 * H)],
      },
    ],
  };
}

const dbs: Partial<Record<ChatScope, MockChatDb>> = {};

function db(scope: ChatScope): MockChatDb {
  if (!dbs[scope]) {
    try {
      const raw = kv.getItem(key(scope));
      dbs[scope] = raw ? (JSON.parse(raw) as MockChatDb) : seed(scope);
    } catch {
      dbs[scope] = seed(scope);
    }
  }
  return dbs[scope]!;
}

function persist(scope: ChatScope) {
  kv.setItem(key(scope), JSON.stringify(db(scope)));
}

function conv(scope: ChatScope, id: string): MockConversation {
  const c = db(scope).conversations.find((x) => x.id === id);
  if (!c) throw new ApiError(404, "Conversation not found");
  return c;
}

function summary(c: MockConversation): ChatConversation {
  const last = c.messages[c.messages.length - 1] ?? null;
  const unread = c.messages.filter((m) => m.sender === "them" && new Date(m.createdAt).getTime() > c.readAt).length;
  return { id: c.id, peer: c.peer, online: c.online, lastMessage: last, unread };
}

function autoReply(m: ChatMessage): string {
  if (m.type !== "text") return m.type === "voice" ? "Listened, thank you! 👍" : "Got it, thank you! 👍";
  const t = (m.text ?? "").toLowerCase();
  if (t.includes("thank") || t.includes("shukriya")) return "You're most welcome! 😊";
  if (t.includes("time") || t.includes("when") || t.includes("late")) return "I'll be there on schedule, in sha Allah.";
  if (t.includes("address") || t.includes("location") || t.includes("gate")) return "Got it, I have the details. See you soon.";
  if (t.endsWith("?")) return "Sure, I'll take care of that.";
  return "Noted, thank you! 👍";
}

/** The other side reads, then replies, like the web mock. */
function simulateReply(scope: ChatScope, c: MockConversation, sent: ChatMessage) {
  setTimeout(() => {
    const m = c.messages.find((x) => x.id === sent.id);
    if (m) m.readByThem = true;
    persist(scope);
    invalidate(chatKeys.root(scope));
  }, 1400);
  setTimeout(() => {
    c.messages.push(text(c.id, "them", autoReply(sent), 0));
    persist(scope);
    invalidate(chatKeys.root(scope));
  }, 2800);
}

export async function listConversations(scope: ChatScope): Promise<ChatConversation[]> {
  await delay();
  return db(scope)
    .conversations.map(summary)
    .sort((a, b) => (b.lastMessage?.createdAt ?? "").localeCompare(a.lastMessage?.createdAt ?? ""));
}

/** Opens (or creates) the conversation with the other party of a booking. */
export async function openConversation(scope: ChatScope, peer: ChatPeer): Promise<ChatConversation> {
  await delay();
  const d = db(scope);
  let c = d.conversations.find((x) => x.peer.id === peer.id);
  if (!c) {
    c = { id: `conv-${peer.id}`, peer, online: Math.random() > 0.4, messages: [], readAt: Date.now() };
    d.conversations.push(c);
    persist(scope);
  }
  return summary(c);
}

export async function getConversation(scope: ChatScope, id: string): Promise<ChatConversation> {
  await delay(100);
  return summary(conv(scope, id));
}

export async function listMessages(scope: ChatScope, id: string): Promise<ChatMessage[]> {
  await delay(120);
  return [...conv(scope, id).messages];
}

export async function markRead(scope: ChatScope, id: string): Promise<{ ok: true }> {
  const c = conv(scope, id);
  c.readAt = Date.now();
  persist(scope);
  return { ok: true };
}

export async function sendMessage(scope: ChatScope, id: string, input: SendMessageInput): Promise<ChatMessage> {
  await delay(150);
  const c = conv(scope, id);
  const d = db(scope);
  let media: ChatMessage["media"] = null;
  if (input.type !== "text") {
    const up = input.uploadId ? d.uploads[input.uploadId] : undefined;
    if (!up || up.offset < up.size) throw new ApiError(400, "Upload is not complete");
    media = { url: up.uri, name: up.name, mimeType: up.mimeType, size: up.size, durationMs: input.durationMs, width: input.width, height: input.height };
    delete d.uploads[up.uploadId];
  } else if (!input.text?.trim()) {
    throw new ApiError(400, "Message is empty");
  }
  const m: ChatMessage = {
    id: uid("msg"),
    conversationId: id,
    sender: "me",
    type: input.type,
    text: input.text?.trim() || null,
    media,
    replyToId: input.replyToId ?? null,
    reactions: [],
    createdAt: new Date().toISOString(),
    readByThem: false,
  };
  c.messages.push(m);
  c.readAt = Date.now();
  persist(scope);
  simulateReply(scope, c, m);
  return m;
}

export async function deleteMessage(scope: ChatScope, messageId: string): Promise<{ ok: true }> {
  await delay(120);
  for (const c of db(scope).conversations) {
    const m = c.messages.find((x) => x.id === messageId);
    if (!m) continue;
    if (m.sender !== "me") throw new ApiError(403, "You can only delete your own messages");
    Object.assign(m, { deleted: true, text: null, media: null, reactions: [] });
    persist(scope);
    return { ok: true };
  }
  throw new ApiError(404, "Message not found");
}

export async function react(scope: ChatScope, messageId: string, emoji: string): Promise<ChatMessage> {
  await delay(80);
  for (const c of db(scope).conversations) {
    const m = c.messages.find((x) => x.id === messageId);
    if (!m) continue;
    const mine = m.reactions.find((r) => r.byMe);
    const rest = m.reactions.filter((r) => !r.byMe);
    // Same emoji again toggles it off.
    m.reactions = mine?.emoji === emoji ? rest : [...rest, { emoji, byMe: true }];
    persist(scope);
    return m;
  }
  throw new ApiError(404, "Message not found");
}

/* ---- Resumable uploads ----------------------------------------------------- */

export async function createUpload(
  scope: ChatScope,
  input: { conversationId: string; fileName: string; mimeType: string; size: number; uri: string },
): Promise<UploadSession> {
  await delay();
  const up: MockUpload = { uploadId: uid("up"), offset: 0, size: input.size, name: input.fileName, mimeType: input.mimeType, uri: input.uri, conversationId: input.conversationId };
  db(scope).uploads[up.uploadId] = up;
  persist(scope);
  return { uploadId: up.uploadId, offset: 0, size: up.size, chunkSize: CHUNK };
}

function upload(scope: ChatScope, uploadId: string): MockUpload {
  const up = db(scope).uploads[uploadId];
  // Same as an expired session on the server: the client starts over.
  if (!up) throw new ApiError(404, "Upload not found");
  return up;
}

export async function getUpload(scope: ChatScope, uploadId: string): Promise<UploadSession> {
  await delay(120);
  const up = upload(scope, uploadId);
  return { uploadId, offset: up.offset, size: up.size, chunkSize: CHUNK };
}

/**
 * Takes one chunk at ~3G speed. Occasionally "drops" mid-chunk (the bytes of
 * that chunk are lost, earlier chunks are kept), so the retry path is easy to
 * see. Aborting the signal (pause) behaves like a dropped connection.
 */
export function sendChunk(scope: ChatScope, uploadId: string, offset: number, length: number, signal: AbortSignal): Promise<{ offset: number }> {
  return new Promise((resolve, reject) => {
    let up: MockUpload;
    try {
      up = upload(scope, uploadId);
    } catch (e) {
      reject(e);
      return;
    }
    if (offset !== up.offset) {
      reject(new ApiError(409, "Upload offset mismatch"));
      return;
    }
    const drop = Math.random() < 0.03;
    const timer = setTimeout(
      () => {
        signal.removeEventListener("abort", onAbort);
        if (drop) {
          reject(new ApiError(0, "Cannot reach the server. Check your connection."));
          return;
        }
        up.offset = Math.min(up.size, offset + length);
        persist(scope);
        resolve({ offset: up.offset });
      },
      Math.max(120, (length / BYTES_PER_SEC) * 1000) * (drop ? 0.5 : 1),
    );
    const onAbort = () => {
      clearTimeout(timer);
      reject(new ApiError(0, "Cannot reach the server. Check your connection."));
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort);
  });
}

export async function cancelUpload(scope: ChatScope, uploadId: string): Promise<{ ok: true }> {
  delete db(scope).uploads[uploadId];
  persist(scope);
  return { ok: true };
}

/** Sign-out / demo reset. */
export function resetChatMock() {
  for (const s of ["customer", "caregiver"] as const) {
    delete dbs[s];
    kv.removeItem(key(s));
  }
}
