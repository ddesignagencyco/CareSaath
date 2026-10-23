"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useSyncExternalStore } from "react";
import type { Me } from "@shared/caregiver-types";
import type { TokenPair } from "@shared/types";
import { authApi, meApi } from "./api/caregiver";
import { keys } from "./api/keys";
import { decodeToken, session, SESSION_KEY } from "./api/session";

const SESSION_EVENT = "caresaath:caregiver-session";

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

export function tokenRole(): string | undefined {
  const t = session.get()?.accessToken;
  return t ? decodeToken(t)?.role : undefined;
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
  const current = session.get();
  if (!current) return;
  try {
    const tokens = await authApi.refresh(current.refreshToken);
    storeTokens(tokens, current.phone);
  } catch (e) {
    // The pair was rotated meanwhile (a 401 retry or another tab): the new
    // token was issued from the database role too, so there's nothing to do.
    if (session.get()?.refreshToken !== current.refreshToken) return;
    throw e;
  }
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
  const router = useRouter();
  const client = useQueryClient();
  return useCallback(async () => {
    const refresh = session.get()?.refreshToken;
    session.clear();
    window.dispatchEvent(new Event(SESSION_EVENT));
    client.clear();
    if (refresh) await authApi.logout(refresh).catch(() => undefined);
    router.replace("/login");
  }, [client, router]);
}
