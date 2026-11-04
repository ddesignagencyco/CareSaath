"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";
import type { Me } from "@shared/caregiver-types";
import { sessionReady, sessionRole, subscribeBootstrap } from "@shared/api/session";
import { authApi, meApi } from "./api/caregiver";
import { keys } from "./api/keys";
import { session } from "./api/session";

const SESSION_EVENT = "caresaath:caregiver-session";

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
  // Tokens now live in httpOnly cookies set by the backend; only the phone is kept.
  session.set({ phone });
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function tokenRole(): string | undefined {
  return sessionRole();
}

/**
 * After POST /caregiver/register the DB role is CAREGIVER but the token still
 * says CUSTOMER; @Roles(CAREGIVER) routes (bookings, visits, payouts…) answer
 * 403 "Insufficient role" until the token is refreshed. POST /auth/refresh
 * re-reads the role from the database (AuthService.refresh), so one refresh
 * is enough. (The /caregiver/profile, documents, photo and availability
 * routes have no role guard and already work with the CUSTOMER token.)
 */
export async function refreshTokens() {
  if (!session.get()) return;
  // Rotates the cookie pair and re-reads the DB role into the new access cookie.
  await authApi.refresh();
}

export function useMe() {
  const { raw } = useSessionRaw();
  return useQuery<Me>({ queryKey: keys.me, queryFn: meApi.get, enabled: !!raw, staleTime: 60_000 });
}

/** Where a signed-in user belongs, based on GET /customer/me. */
export function homeFor(me: Me): "/caregiver/onboarding" | "/caregiver/status" | "/caregiver" {
  if (!me.caregiverProfile) return "/caregiver/onboarding";
  if (me.caregiverProfile.verificationStatus !== "APPROVED") return "/caregiver/status";
  return "/caregiver";
}

export function useSignOut() {
  const client = useQueryClient();
  return useCallback(async () => {
    session.clear();
    window.dispatchEvent(new Event(SESSION_EVENT));
    client.clear();
    await authApi.logout().catch(() => undefined);
    // Full navigation (not router.replace) so the client router cache can't
    // restore the previous login screen with a stale phone/OTP still filled in.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- deliberate hard reload to drop all client state on signout
    window.location.assign("/login");
  }, [client]);
}
