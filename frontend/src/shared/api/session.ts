import type { AccessTokenPayload } from "../types";

/**
 * Non-sensitive session marker. The access/refresh tokens now live in httpOnly
 * cookies (set by the backend, unreadable by JS), so this only remembers the
 * phone number for display and acts as the "signed in" flag the UI reads
 * synchronously. The real auth state is the cookies; this is kept in sync by
 * login (set) and logout / failed-refresh (clear).
 */
export interface Session {
  phone: string;
}

/**
 * localStorage-backed session marker; each section uses its own key. `event` is
 * dispatched on every change so the section's useSyncExternalStore subscribers
 * re-read it.
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

/**
 * The signed-in role, read from the JS-readable `cs_session` cookie the backend
 * sets alongside the httpOnly token cookies. Used where the UI previously decoded
 * the access token's role (which is no longer readable from JS). "1" is the
 * roleless signed-in flag; anything else is the actual role.
 */
export function sessionRole(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const m = document.cookie.match(/(?:^|;\s*)cs_session=([^;]+)/);
  const value = m ? decodeURIComponent(m[1]) : undefined;
  return value && value !== "1" ? value : undefined;
}
