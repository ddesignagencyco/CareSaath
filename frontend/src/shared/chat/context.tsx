"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useChatBackend } from "./use-chat-backend";
import type { ChatScope, ChatTransport } from "./types";

type ChatApi = ReturnType<typeof useChatBackend>;

const ChatContext = createContext<ChatApi | null>(null);

/**
 * Holds one chat store for a role, shared by the conversation list (layout) and
 * the open thread (page). Wires the booking-scoped backend chat over the given
 * REST + socket transport.
 */
export function ChatProvider({ scope, transport, children }: { scope: ChatScope; transport: ChatTransport; children: ReactNode }) {
  const chat = useChatBackend(scope, transport);
  return <ChatContext.Provider value={chat}>{children}</ChatContext.Provider>;
}

export function useChatContext(): ChatApi {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatContext must be used within a ChatProvider");
  return ctx;
}
