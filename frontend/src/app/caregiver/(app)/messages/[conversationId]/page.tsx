import { ConversationScreen } from "@shared/chat/messages-shell";

// The thread depends on the client-fetched conversation list, so it can't be
// an instant navigation — opt this segment out of instant-navigation validation.
export const instant = false;

export default async function CaregiverConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  return <ConversationScreen conversationId={conversationId} basePath="/caregiver/messages" />;
}
