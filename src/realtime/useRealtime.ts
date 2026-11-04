/**
 * Realtime over Socket.IO (replaces polling), one connection per signed-in side.
 *
 * The server scopes events to `user:<id>` / `role:<ROLE>` and pushes:
 *   - `entity.updated` `{ type }` — a record changed. `chat_message` refreshes
 *     the chat queries; anything else refreshes the side's live data (bookings,
 *     visits, payments/earnings, notifications) so visit status, a booking being
 *     accepted, a payment settling, etc. show without a manual refresh.
 *   - `notification.created` / `notification.read` — refresh the in-app feed and
 *     the unread badge live.
 * The token is re-read on every (re)connect and updated on session rotation.
 */
import { useEffect } from "react";
import { io } from "socket.io-client";
import { API_BASE_URL } from "../api/config";
import { session as customerSession } from "../api/customer/session";
import { session as caregiverSession } from "../api/caregiver/session";
import { keys as customerKeys } from "../api/customer/keys";
import { keys as caregiverKeys } from "../api/caregiver/keys";
import { chatKeys } from "../api/chat/keys";
import { invalidate } from "../lib/query";
import type { QueryKey } from "../lib/query";
import type { ChatScope } from "../api/chat/types";

/** Socket.IO connects to the API origin, not the `/api/v1` REST base. */
const ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, "");

export function useRealtime(scope: ChatScope): void {
  useEffect(() => {
    const session = scope === "customer" ? customerSession : caregiverSession;
    if (!session.get()?.accessToken) return;

    const notifKey = scope === "customer" ? customerKeys.notifications : caregiverKeys.notifications;
    // Resources that change server-side and should refresh on a generic entity update.
    const liveKeys: QueryKey[] =
      scope === "customer"
        ? [customerKeys.bookings, customerKeys.visit, customerKeys.payments, customerKeys.notifications]
        : [caregiverKeys.bookings, caregiverKeys.visits, caregiverKeys.earnings, caregiverKeys.notifications];

    const socket = io(ORIGIN, {
      transports: ["websocket", "polling"],
      // ngrok's free tunnel needs this to skip its browser-warning interstitial.
      extraHeaders: { "ngrok-skip-browser-warning": "1" },
      // Re-read the token on every (re)connect so a refreshed token is used.
      auth: (cb) => cb({ token: session.get()?.accessToken ?? "" }),
    });

    const refreshChat = () => invalidate(chatKeys.root(scope));
    const refreshNotifs = () => invalidate(notifKey);
    const refreshLive = () => liveKeys.forEach((k) => invalidate(k));

    socket.on("entity.updated", (payload?: { type?: string }) => {
      if (payload?.type === "chat_message") refreshChat();
      else refreshLive();
    });
    socket.on("notification.created", refreshNotifs);
    socket.on("notification.read", refreshNotifs);
    // Bad/inactive token: pause until fresh tokens are issued.
    socket.on("auth.error", () => socket.disconnect());
    // Auto-reconnect pick-up
    socket.io.on("reconnect", () => {
      refreshChat();
      refreshLive();
    });

    // When background token refresh occurs, seamlessly reconnect socket with fresh token
    const unsub = session.subscribe(() => {
      const freshToken = session.get()?.accessToken;
      if (freshToken) {
        socket.auth = { token: freshToken };
        if (!socket.connected) {
          socket.connect();
        }
      }
    });

    return () => {
      unsub();
      socket.removeAllListeners();
      socket.close();
    };
  }, [scope]);
}
