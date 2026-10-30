"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useChat, type ChatScope } from "./use-chat";
import { useChatBackend } from "./use-chat-backend";
import type { ChatTransport } from "./types";

type ChatApi = ReturnType<typeof useChat>;

const ChatContext = createContext<ChatApi | null>(null);

function MockChatProvider({ scope, children }: { scope: ChatScope; children: ReactNode }) {
  const chat = useChat(scope);
  return <ChatContext.Provider value={chat}>{children}</ChatContext.Provider>;
}

function BackendChatProvider({ scope, transport, children }: { scope: ChatScope; transport: ChatTransport; children: ReactNode }) {
  const chat = useChatBackend(scope, transport);
  return <ChatContext.Provider value={chat}>{children}</ChatContext.Provider>;
}

/**
 * Holds one chat store for a role, shared by the conversation list (layout) and
 * the open thread (page). With a `transport` and real APIs it wires the
 * booking-scoped backend chat; otherwise (mocks, or no transport) the local
 * demo store with the full rich feature set.
 */
export function ChatProvider({ scope, transport, children }: { scope: ChatScope; transport?: ChatTransport; children: ReactNode }) {
  if (transport) {
    return (
      <BackendChatProvider scope={scope} transport={transport}>
        {children}
      </BackendChatProvider>
    );
  }
  return <MockChatProvider scope={scope}>{children}</MockChatProvider>;
}

export function useChatContext(): ChatApi {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatContext must be used within a ChatProvider");
  return ctx;
}
