"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChatProvider } from "@shared/chat/context";
import { MessagesShell } from "@shared/chat/messages-shell";
import type { ChatThreadMeta, ChatTransport } from "@shared/chat/types";
import { useLabels } from "@shared/i18n/use-labels";
import { useMe } from "@/features/caregiver/lib/auth";
import { bookingsApi, chatApi } from "@/features/caregiver/lib/api/caregiver";
import { keys } from "@/features/caregiver/lib/api/keys";

/** One chat thread per booking; the other party is the family (shown by patient name). */
function useCaregiverChatTransport(): ChatTransport {
  const L = useLabels();
  const me = useMe();
  const bookings = useQuery({ queryKey: [...keys.bookings, "chat"], queryFn: () => bookingsApi.list({}), enabled: true });
  // Only accepted/active (CONFIRMED) or past (COMPLETED) bookings get a chat thread — not pending
  // requests, declines or cancellations.
  const booked = (bookings.data?.items ?? []).filter((b) => b.status === "CONFIRMED" || b.status === "COMPLETED");
  // One thread per customer (the chat is with the family, not a single booking): keep the
  // most relevant booking — an active (CONFIRMED) one over a past (COMPLETED) one, latest
  // within the same status. Full cross-booking history needs a relationship-scoped chat on
  // the backend (see docs/requirement.md).
  const rank = (b: (typeof booked)[number]) => (b.status === "CONFIRMED" ? 1 : 0);
  const byCustomer = new Map<string, (typeof booked)[number]>();
  for (const b of booked) {
    const cur = byCustomer.get(b.customerId);
    if (!cur || rank(b) > rank(cur) || (rank(b) === rank(cur) && b.startDate.localeCompare(cur.startDate) > 0)) byCustomer.set(b.customerId, b);
  }
  const items = [...byCustomer.values()].sort((a, b) => b.startDate.localeCompare(a.startDate));
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
      threadsLoaded: bookings.isSuccess,
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
