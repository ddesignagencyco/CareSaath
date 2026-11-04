import type { AccessTokenPayload } from "../types";

/**
 * Non-sensitive session marker. The access/refresh tokens live in httpOnly
 * cookies (set by the backend, unreadable by JS). Nothing is persisted on the
 * client — not even the phone: the marker lives only in memory for the page's
 * lifetime. After a reload the SPA rehydrates it from GET /auth/session, which
 * reads the httpOnly cookies server-side. This is what lets the web work when
 * the API is on a different site (Vercel ↔ Render), where JS cannot read the
 * backend's readable cookies at all.
 */
export interface Session {
  phone: string;
}

// In-memory marker per section key — never written to localStorage/cookies.
const memory = new Map<string, Session | null>();
const SESSION_EVENT = "caresaath:session";

/** In-memory session marker store; each section uses its own key. */
export function createSessionStore(key: string, event?: string) {
  const notify = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event(SESSION_EVENT));
    if (event) window.dispatchEvent(new Event(event));
  };
  return {
    key,
    get(): Session | null {
      return memory.get(key) ?? null;
    },
    set(value: Session) {
      memory.set(key, value);
      notify();
    },
    clear() {
      memory.delete(key);
      currentRole = undefined;
      notify();
    },
  };
}

/** Decode the JWT payload without verifying it (the API verifies). */
export function decodeToken(token: string): AccessTokenPayload | null {
  try {
    const part = token.split(".")[1];
    return JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as AccessTokenPayload;
  } catch {
    return null;
  }
}

export type SessionStore = ReturnType<typeof createSessionStore>;

/* ------------------------------ signed-in role ----------------------------- */
// Held in memory (the cross-site cs_session cookie is not readable by JS).
let currentRole: string | undefined;

export function setSessionRole(role: string | undefined): void {
  currentRole = role && role !== "1" ? role : undefined;
}

/** The signed-in role, set at login and on rehydrate. */
export function sessionRole(): string | undefined {
  return currentRole;
}

/* ------------------------------ bootstrap gate ----------------------------- */
// While the page is rehydrating the session from /auth/session, the shells must
// not treat "no session yet" as "logged out". `booting` is flipped on only by
// the <SessionBootstrap> module (loaded in the app root, never in unit tests),
// so tests keep the old "hydrated right after mount" behaviour.
let booting = false;
const bootListeners = new Set<() => void>();

export function beginBootstrap(): void {
  booting = true;
  bootListeners.forEach((l) => l());
}
export function finishBootstrap(): void {
  booting = false;
  bootListeners.forEach((l) => l());
}
/** True once any in-flight rehydrate has settled (always true when none runs). */
export function sessionReady(): boolean {
  return !booting;
}
export function subscribeBootstrap(cb: () => void): () => void {
  bootListeners.add(cb);
  return () => bootListeners.delete(cb);
}

/** Test-only: clear all in-memory session state between tests. */
export function __resetSessionForTests(): void {
  memory.clear();
  currentRole = undefined;
  booting = false;
}
