"use client";

import { useQuery } from "@tanstack/react-query";
import { bookingsApi, notificationsApi } from "@/features/caregiver/lib/api/caregiver";
import { keys } from "@/features/caregiver/lib/api/keys";

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

/** Unread in-app (PUSH) notifications — Phase 15 `GET /notifications/unread-count`. */
export function useUnreadCount(enabled: boolean) {
  return (
    useQuery({
      queryKey: [...keys.notifications, "unread"],
      queryFn: () => notificationsApi.unreadCount(),
      refetchInterval: 60_000,
      enabled,
      select: (d) => d.unread,
    }).data ?? 0
  );
}
