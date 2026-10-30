"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";
import type { Me } from "@shared/caregiver-types";
import type { TokenPair } from "@shared/types";
import { authApi, meApi } from "./api/customer";
import { keys } from "./api/keys";
import { session, SESSION_KEY } from "./api/session";

const SESSION_EVENT = "caresaath:customer-session";

function subscribe(onChange: () => void) {
  window.addEventListener(SESSION_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SESSION_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

/** Raw session string; null on the server and when signed out. */
export function useSessionRaw() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  return { raw, hydrated };
}

export function storeTokens(tokens: TokenPair, phone: string) {
  session.set({ ...tokens, phone });
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function clearSession() {
  session.clear();
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function useMe() {
  const { raw } = useSessionRaw();
  return useQuery<Me>({ queryKey: keys.me, queryFn: meApi.get, enabled: !!raw, staleTime: 60_000 });
}

export function useSignOut() {
  const client = useQueryClient();
  return useCallback(async () => {
    const refresh = session.get()?.refreshToken;
    clearSession();
    client.removeQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("c-") });
    if (refresh) await authApi.logout(refresh).catch(() => undefined);
    // Full navigation (not router.replace) so the client router cache can't
    // restore the previous login screen with a stale phone/OTP still filled in.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- deliberate hard reload to drop all client state on signout
    window.location.assign("/login");
  }, [client]);
}
