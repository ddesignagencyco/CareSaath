"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChatProvider } from "@shared/chat/context";
import { MessagesShell } from "@shared/chat/messages-shell";
import type { ChatThreadMeta, ChatTransport } from "@shared/chat/types";
import { useLabels } from "@shared/i18n/use-labels";
import { USE_MOCKS } from "@/features/caregiver/lib/api/http";
import { useMe } from "@/features/caregiver/lib/auth";
import { bookingsApi, chatApi } from "@/features/caregiver/lib/api/caregiver";
import { keys } from "@/features/caregiver/lib/api/keys";

/** One chat thread per booking; the other party is the family (shown by patient name). */
function useCaregiverChatTransport(): ChatTransport {
  const L = useLabels();
  const me = useMe();
  const bookings = useQuery({ queryKey: [...keys.bookings, "chat"], queryFn: () => bookingsApi.list({}), enabled: !USE_MOCKS });
  // Only accepted/active (CONFIRMED) or past (COMPLETED) bookings get a chat thread — not pending
  // requests, declines or cancellations.
  const items = (bookings.data?.items ?? []).filter((b) => b.status === "CONFIRMED" || b.status === "COMPLETED");
  const activeVisitId = (visits: { id: string; status: string }[]) =>
    (visits.find((v) => !["COMPLETED", "CANCELLED", "DECLINED"].includes(v.status)) ?? visits[0])?.id;

  const sig = items.map((b) => `${b.id}:${b.patient.name}:${b.serviceType}:${activeVisitId(b.visits) ?? ""}:${b.customerId}`).join("|");
  const threads = useMemo<ChatThreadMeta[]>(
    () => items.map((b) => ({ id: b.id, name: b.patient.name, role: L.specialty(b.serviceType), visitId: activeVisitId(b.visits), peerUserId: b.customerId })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sig` captures every field the threads depend on, stably
    [sig],
  );

  return useMemo<ChatTransport>(
    () => ({
      myUserId: me.data?.id,
      threads,
      threadsLoaded: USE_MOCKS || bookings.isSuccess,
      listMessages: async (id) => (await chatApi.list(id)).items.slice().reverse(),
      send: (id, body, replyToId) => chatApi.send(id, body, replyToId),
      markRead: async (id) => {
        await chatApi.markRead(id);
      },
      uploadMedia: (id, file, opts) => chatApi.uploadMedia(id, file, opts),
      react: (id, msgId, emoji) => chatApi.react(id, msgId, emoji),
    }),
    [me.data?.id, threads, bookings.isSuccess],
  );
}

export function CaregiverMessages({ children }: { children: React.ReactNode }) {
  const transport = useCaregiverChatTransport();
  return (
    <ChatProvider scope="caregiver" transport={transport}>
      <MessagesShell basePath="/caregiver/messages">{children}</MessagesShell>
    </ChatProvider>
  );
}
