"use client";

import { useEffect, useRef } from "react";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { io } from "socket.io-client";
import type { SessionStore } from "./session";
import { API_ACCESS_KEY, API_BASE_URL } from "./http";

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
  /** Coalesces bursts of entity.updated / reconnect events into one global refetch. */
  const refetchAllTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    refreshRef.current = refresh;
    notifKeyRef.current = notificationsKey;
  });

  useEffect(() => {
    if (!enabled || !session.get()) return;
    const socket = io(ORIGIN, {
      transports: ["websocket"],
      // Re-read the token on every (re)connect so a refreshed token is used.
      withCredentials: true,
      // API access gate: browsers cannot set headers on a WebSocket, so the key rides in the query.
      ...(API_ACCESS_KEY ? { query: { apiKey: API_ACCESS_KEY } } : {}),
    });
    const refetchAll = () => void queryClient.invalidateQueries();
    // Several entity.updated events often arrive back-to-back (e.g. a visit
    // transition emits `visit` + `booking`). Without a debounce each one
    // invalidates every cached query and the screen shows a permanent spinner.
    const scheduleRefetchAll = () => {
      if (refetchAllTimer.current) return;
      refetchAllTimer.current = setTimeout(() => {
        refetchAllTimer.current = null;
        refetchAll();
      }, 250);
    };
    const refetchNotifs = () => void queryClient.invalidateQueries({ queryKey: notifKeyRef.current });
    // Chat is the hot path (a message per keystroke-send): only refetch the chat
    // threads for those, not every query on the current screen.
    const onEntityUpdated = (payload?: { type?: string }) => {
      if (payload?.type === "chat_message") {
        // Chat threads ["chat", ...] AND the inbox lists ["chat-conversations", ...].
        void queryClient.invalidateQueries({ queryKey: ["chat"] });
        void queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
      } else {
        // booking / visit / payment / user(photo, name) / caregiver — refresh
        // every cached identity and list so no screen keeps showing stale data.
        scheduleRefetchAll();
      }
    };

    socket.on("entity.updated", onEntityUpdated);
    // Reaction toggles don't go through entity.updated — refresh the thread.
    socket.on("message.reaction", () => {
      void queryClient.invalidateQueries({ queryKey: ["chat"] });
      void queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
    });
    socket.on("notification.created", refetchNotifs);
    socket.on("notification.read", refetchNotifs);
    // Live caregiver position while a visit is EN_ROUTE — feeds the customer's visit tracker map.
    socket.on("visit.location", (p?: { visitId?: string }) => {
      if (p?.visitId) queryClient.setQueryData(["visit-location", p.visitId], p);
    });
    let disposed = false;
    let authErrorRetried = false;

    socket.on("connect", () => {
      authErrorRetried = false;
    });
    // Bad/inactive token: attempt one refresh before closing permanently
    socket.on("auth.error", async () => {
      if (authErrorRetried) {
        socket.close();
        return;
      }
      authErrorRetried = true;
      const refreshed = await refreshRef.current().catch(() => false);
      if (disposed) return;
      if (refreshed) {
        socket.connect();
      } else {
        socket.close();
      }
    });
    // Token expired: refresh first, then reconnect with the new access cookie.
    socket.on("auth.expired", async () => {
      const refreshed = await refreshRef.current().catch(() => false);
      if (disposed) return;
      if (refreshed) {
        socket.disconnect();
        socket.connect();
      } else {
        socket.close();
      }
    });
    // Events emitted while the socket was down are recovered here. `ready`
    // intentionally does NOT refetch: it fires on the initial connect too,
    // right after the page's queries have loaded, and invalidating everything
    // there made every screen reload on mount.
    socket.io.on("reconnect", scheduleRefetchAll);

    return () => {
      disposed = true;
      if (refetchAllTimer.current) clearTimeout(refetchAllTimer.current);
      refetchAllTimer.current = null;
      socket.io?.off?.("reconnect", scheduleRefetchAll);
      socket.removeAllListeners();
      socket.close();
    };
  }, [enabled, session, queryClient]);
}
