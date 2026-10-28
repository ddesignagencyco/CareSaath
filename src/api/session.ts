import type { AccessTokenPayload, TokenPair } from './types';
import { kv } from '../lib/storage';

export interface Session extends TokenPair {
  phone: string;
}

/**
 * Token store; customer and caregiver each use their own key. Subscribers are
 * told about every change (including a background token refresh).
 *
 * TODO(backend): tokens sit in AsyncStorage like the web's localStorage. Move
 * them to Keychain / EncryptedSharedPreferences before release.
 */
export function createSessionStore(key: string) {
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(l => l());
  return {
    key,
    get(): Session | null {
      try {
        const raw = kv.getItem(key);
        return raw ? (JSON.parse(raw) as Session) : null;
      } catch {
        return null;
      }
    },
    set(value: Session) {
      kv.setItem(key, JSON.stringify(value));
      notify();
    },
    clear() {
      kv.removeItem(key);
      notify();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Decode the JWT payload without verifying it (the API verifies). */
export function decodeToken(token: string): AccessTokenPayload | null {
  try {
    const part = token.split('.')[1];
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as AccessTokenPayload;
  } catch {
    return null;
  }
}

export type SessionStore = ReturnType<typeof createSessionStore>;
