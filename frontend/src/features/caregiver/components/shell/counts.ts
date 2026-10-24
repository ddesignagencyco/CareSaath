"use client";

import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { bookingsApi, notificationsApi } from "@/features/caregiver/lib/api/caregiver";
import { keys } from "@/features/caregiver/lib/api/keys";
import { getSeenAt, SEEN_EVENT } from "@/features/caregiver/lib/notifications";

/** Pending booking requests (badge on Requests). */
export function useRequestCount(enabled: boolean) {
  return useQuery({
    queryKey: [...keys.bookings, "count", "REQUESTED"],
    queryFn: () => bookingsApi.list({ status: "REQUESTED", limit: 1 }),
    refetchInterval: 60_000,
    enabled,
    select: (d) => d.total,
  }).data;
}

function subscribeSeen(onChange: () => void) {
  window.addEventListener(SEEN_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SEEN_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** In-app (PUSH) notifications newer than the last time the list was opened. */
export function useUnreadCount(enabled: boolean) {
  const seenAt = useSyncExternalStore(subscribeSeen, getSeenAt, () => "");
  const list = useQuery({
    queryKey: [...keys.notifications, "list"],
    queryFn: () => notificationsApi.list({ limit: 50 }),
    refetchInterval: 60_000,
    enabled,
  });
  return (list.data?.items ?? []).filter((n) => n.channel === "PUSH" && !n.readAt && n.createdAt > seenAt).length;
}
