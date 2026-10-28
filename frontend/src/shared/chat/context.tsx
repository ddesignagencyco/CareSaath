"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useChat, type ChatScope } from "./use-chat";

type ChatApi = ReturnType<typeof useChat>;

const ChatContext = createContext<ChatApi | null>(null);

/** Holds one chat store for a role, shared by the conversation list (layout) and the open thread (page). */
export function ChatProvider({ scope, children }: { scope: ChatScope; children: ReactNode }) {
  const chat = useChat(scope);
  return <ChatContext.Provider value={chat}>{children}</ChatContext.Provider>;
}

export function useChatContext(): ChatApi {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatContext must be used within a ChatProvider");
  return ctx;
}
