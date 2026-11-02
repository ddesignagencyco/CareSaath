/**
 * Realtime chat delivery over Socket.IO (replaces polling).
 *
 * One connection per signed-in side. The server scopes events to `user:<id>` /
 * `role:<ROLE>` and emits `entity.updated` with `{ type: 'chat_message' }` when
 * a message is sent, read, reacted to or deleted — we refetch the side's chat
 * queries so the thread and the conversation list update live. The token is
 * re-read on every (re)connect so a refreshed token is used, and an expired
 * token triggers a refresh before the auto-reconnect.
 */
import { useEffect } from "react";
import { io } from "socket.io-client";
import { API_BASE_URL } from "../api/config";
import { session as customerSession } from "../api/customer/session";
import { session as caregiverSession } from "../api/caregiver/session";
import { chatKeys } from "../api/chat/keys";
import { invalidate } from "../lib/query";
import type { ChatScope } from "../api/chat/types";

/** Socket.IO connects to the API origin, not the `/api/v1` REST base. */
const ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, "");

export function useRealtime(scope: ChatScope): void {
  useEffect(() => {
    const session = scope === "customer" ? customerSession : caregiverSession;
    if (!session.get()?.accessToken) return;

    const socket = io(ORIGIN, {
      transports: ["websocket"],
      // ngrok's free tunnel needs this to skip its browser-warning interstitial.
      extraHeaders: { "ngrok-skip-browser-warning": "1" },
      // Re-read the token on every (re)connect so a refreshed token is used.
      auth: (cb) => cb({ token: session.get()?.accessToken ?? "" }),
    });

    const refreshChat = () => invalidate(chatKeys.root(scope));
    const onEntityUpdated = (payload?: { type?: string }) => {
      if (payload?.type === "chat_message") refreshChat();
    };

    socket.on("entity.updated", onEntityUpdated);
    // Bad/inactive token: stop, don't loop.
    socket.on("auth.error", () => socket.close());
    // Expired token: the REST client refreshes the session on its next call (the
    // chat screen also polls every 5s as a fallback); the socket's auth callback
    // then picks up the fresh token on auto-reconnect.
    socket.io.on("reconnect", refreshChat);

    return () => {
      socket.removeAllListeners();
      socket.close();
    };
  }, [scope]);
}
