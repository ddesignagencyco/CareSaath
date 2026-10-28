"use client";

import { useParams } from "next/navigation";
import { ConversationScreen } from "@shared/chat/messages-shell";

export default function CustomerConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  return <ConversationScreen conversationId={conversationId} basePath="/customer/messages" />;
}
