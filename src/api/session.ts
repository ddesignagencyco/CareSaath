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

function safeBase64Decode(str: string): string | null {
  try {
    let output = str.replace(/-/g, '+').replace(/_/g, '/');
    switch (output.length % 4) {
      case 0:
        break;
      case 2:
        output += '==';
        break;
      case 3:
        output += '=';
        break;
      default:
        return null;
    }
    return atob(output);
  } catch {
    return null;
  }
}

/** Decode the JWT payload without verifying it (the API verifies). */
export function decodeToken(token: string): (AccessTokenPayload & { exp?: number; iat?: number }) | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const decoded = safeBase64Decode(part);
    return decoded ? (JSON.parse(decoded) as AccessTokenPayload & { exp?: number; iat?: number }) : null;
  } catch {
    return null;
  }
}

/**
 * Checks whether a JWT is expired (or will expire within `skewSeconds`).
 * Default 30s skew window to catch near-expiry tokens before network roundtrip.
 */
export function isTokenExpired(token?: string | null, skewSeconds = 30): boolean {
  if (!token) return true;
  try {
    const payload = decodeToken(token);
    if (!payload?.exp) return false;
    return Date.now() >= (payload.exp - skewSeconds) * 1000;
  } catch {
    return false;
  }
}

export type SessionStore = ReturnType<typeof createSessionStore>;
