"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChatProvider } from "@shared/chat/context";
import { MessagesShell } from "@shared/chat/messages-shell";
import type { ChatThreadMeta, ChatTransport } from "@shared/chat/types";
import type { Specialty } from "@shared/types";
import { useLabels } from "@shared/i18n/use-labels";
import { useMe } from "@/features/caregiver/lib/auth";
import { bookingsApi, chatApi } from "@/features/caregiver/lib/api/caregiver";
import { keys } from "@/features/caregiver/lib/api/keys";

/** One thread per customer (spanning all their bookings), from GET /chat/conversations. */
function useCaregiverChatTransport(): ChatTransport {
  const L = useLabels();
  const me = useMe();
  const convs = useQuery({ queryKey: ["chat-conversations", "caregiver"], queryFn: () => chatApi.listConversations(), refetchInterval: 30_000 });
  // Bookings give the active visit (enables calls) + service type (the role subtitle) per customer.
  const bookings = useQuery({ queryKey: [...keys.bookings, "chat-meta"], queryFn: () => bookingsApi.list({ limit: 50 }) });
  const items = convs.data ?? [];

  const metaByCustomer = useMemo(() => {
    const map: Record<string, { visitId?: string; serviceType?: Specialty }> = {};
    for (const b of bookings.data?.items ?? []) {
      const active = b.visits.find((v) => !["COMPLETED", "CANCELLED", "DECLINED"].includes(v.status));
      const cur = map[b.customerId];
      map[b.customerId] = { visitId: active?.id ?? cur?.visitId, serviceType: cur?.serviceType ?? b.serviceType };
    }
    return map;
  }, [bookings.data]);

  const sig = items
    .map((c) => `${c.counterpartUserId}:${c.counterpartName}:${c.activeBookingId ?? ""}:${c.bookingIds.join(",")}:${metaByCustomer[c.counterpartUserId]?.visitId ?? ""}:${metaByCustomer[c.counterpartUserId]?.serviceType ?? ""}`)
    .join("|");
  const threads = useMemo<ChatThreadMeta[]>(
    () =>
      items.map((c) => {
        const meta = metaByCustomer[c.counterpartUserId];
        return {
          id: c.counterpartUserId,
          name: c.counterpartName,
          role: meta?.serviceType ? L.specialty(meta.serviceType) : "",
          activeBookingId: c.activeBookingId,
          bookingIds: c.bookingIds,
          visitId: meta?.visitId,
          peerUserId: c.counterpartUserId,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sig` captures every field the threads depend on, stably
    [sig],
  );

  return useMemo<ChatTransport>(
    () => ({
      myUserId: me.data?.id,
      threads,
      threadsLoaded: convs.isSuccess,
      listMessages: async (counterpartUserId) => (await chatApi.conversationMessages(counterpartUserId)).items.slice().reverse(),
      send: (bookingId, body, replyToId) => chatApi.send(bookingId, body, replyToId),
      markRead: async (counterpartUserId) => {
        await chatApi.markConversationRead(counterpartUserId);
      },
      uploadMedia: (bookingId, file, opts) => chatApi.uploadMedia(bookingId, file, opts),
      react: (bookingId, msgId, emoji) => chatApi.react(bookingId, msgId, emoji),
      deleteMessage: (bookingId, msgId) => chatApi.deleteMessage(bookingId, msgId),
    }),
    [me.data?.id, threads, convs.isSuccess],
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
