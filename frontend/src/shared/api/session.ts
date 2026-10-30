import type { AccessTokenPayload, TokenPair } from "../types";

export interface Session extends TokenPair {
  phone: string;
}

/**
 * localStorage-backed token store; each section uses its own key. `event` is
 * dispatched on every change (including a background token refresh) so the
 * section's useSyncExternalStore subscribers re-read it.
 */
export function createSessionStore(key: string, event?: string) {
  const notify = () => {
    if (event && typeof window !== "undefined") window.dispatchEvent(new Event(event));
  };
  return {
    key,
    get(): Session | null {
      try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as Session) : null;
      } catch {
        return null;
      }
    },
    set(value: Session) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Storage unavailable (private mode); session lasts for this page only.
      }
      notify();
    },
    clear() {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
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
