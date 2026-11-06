"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";
import type { Me } from "@shared/caregiver-types";
import type { TokenPair } from "@shared/types";
import { sessionReady, subscribeBootstrap } from "@shared/api/session";
import { authApi, meApi } from "./api/customer";
import { keys } from "./api/keys";
import { session } from "./api/session";

const SESSION_EVENT = "caresaath:customer-session";

function subscribe(onChange: () => void) {
  window.addEventListener(SESSION_EVENT, onChange);
  return () => window.removeEventListener(SESSION_EVENT, onChange);
}

/** The in-memory marker's phone, or null when signed out / on the server. */
function readRaw(): string | null {
  return session.get()?.phone ?? null;
}

/** `raw` is the phone (truthy when signed in); `hydrated` waits for any reload-time rehydrate. */
export function useSessionRaw() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const hydrated = useSyncExternalStore(subscribeBootstrap, sessionReady, () => false);
  return { raw, hydrated };
}

export function storeTokens(phone: string) {
  session.set({ phone });
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function clearSession() {
  session.clear();
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function useMe() {
  const { raw, hydrated } = useSessionRaw();
  const q = useQuery<Me>({ queryKey: keys.me, queryFn: meApi.get, enabled: !!raw, staleTime: 60_000 });
  // Withhold the result until the reload-time session rehydrate finishes. `hydrated`
  // is false on both the server render and the first client render, so a query that
  // resolves during streamed hydration can't make the client paint data the server
  // rendered as a fallback (which would trip a hydration mismatch).
  return hydrated ? q : ({ ...q, data: undefined } as typeof q);
}

export function useSignOut() {
  const client = useQueryClient();
  return useCallback(async () => {
    clearSession();
    client.removeQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("c-") });
    await authApi.logout().catch(() => undefined);
    // Full navigation (not router.replace) so the client router cache can't
    // restore the previous login screen with a stale phone/OTP still filled in.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- deliberate hard reload to drop all client state on signout
    window.location.assign("/login");
  }, [client]);
}
