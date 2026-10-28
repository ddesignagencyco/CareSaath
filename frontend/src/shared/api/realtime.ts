"use client";

import { useEffect, useRef } from "react";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { io } from "socket.io-client";
import type { SessionStore } from "./session";
import { API_BASE_URL } from "./http";

/** Socket.IO connects to the API origin, not the `/api/v1` REST base. */
const ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, "");

/**
 * Phase 15 realtime: one Socket.IO connection per signed-in session (the server
 * scopes events to `user:<id>` and `role:<ROLE>`). On an entity change it refetches
 * the on-screen queries; on a notification it refreshes the feed + unread badge.
 * It reconnects on token expiry (refreshing first via the `auth` callback, which
 * re-reads the token) and on network drops.
 */
export function useRealtime(opts: {
  session: SessionStore;
  queryClient: QueryClient;
  notificationsKey: QueryKey;
  refresh: () => Promise<boolean>;
  enabled: boolean;
}): void {
  const { session, queryClient, notificationsKey, refresh, enabled } = opts;
  const refreshRef = useRef(refresh);
  const notifKeyRef = useRef(notificationsKey);
  useEffect(() => {
    refreshRef.current = refresh;
    notifKeyRef.current = notificationsKey;
  });

  useEffect(() => {
    if (!enabled || !session.get()?.accessToken) return;
    const socket = io(ORIGIN, {
      transports: ["websocket"],
      // Re-read the token on every (re)connect so a refreshed token is used.
      auth: (cb) => cb({ token: session.get()?.accessToken ?? "" }),
    });
    const refetchAll = () => void queryClient.invalidateQueries();
    const refetchNotifs = () => void queryClient.invalidateQueries({ queryKey: notifKeyRef.current });

    socket.on("entity.updated", refetchAll);
    socket.on("notification.created", refetchNotifs);
    socket.on("notification.read", refetchNotifs);
    // Bad/inactive token: don't loop — stop here.
    socket.on("auth.error", () => socket.close());
    // Token expired: refresh; the auto-reconnect's auth callback picks up the new one.
    socket.on("auth.expired", () => void refreshRef.current());
    socket.io.on("reconnect", refetchAll);

    return () => {
      socket.removeAllListeners();
      socket.close();
    };
  }, [enabled, session, queryClient]);
}
