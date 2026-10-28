"use client";

import { ChatProvider } from "@shared/chat/context";
import { MessagesShell } from "@shared/chat/messages-shell";

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  return (
    <ChatProvider scope="caregiver">
      <MessagesShell basePath="/caregiver/messages">{children}</MessagesShell>
    </ChatProvider>
  );
}
