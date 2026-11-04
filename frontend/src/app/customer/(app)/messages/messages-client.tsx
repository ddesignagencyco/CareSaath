"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChatProvider } from "@shared/chat/context";
import { MessagesShell } from "@shared/chat/messages-shell";
import type { ChatThreadMeta, ChatTransport } from "@shared/chat/types";
import { useLabels } from "@shared/i18n/use-labels";
import { useCaregiverMap } from "@/features/customer/components/caregiver-bits";
import { bookingsApi, chatApi, meApi } from "@/features/customer/lib/api/customer";
import { keys } from "@/features/customer/lib/api/keys";

/** One thread per caregiver (spanning all their bookings), from GET /chat/conversations. */
function useCustomerChatTransport(): ChatTransport {
  const L = useLabels();
  const me = useQuery({ queryKey: keys.me, queryFn: meApi.get, enabled: true });
  const convs = useQuery({ queryKey: ["chat-conversations", "customer"], queryFn: () => chatApi.listConversations(), refetchInterval: 30_000 });
  const bookings = useQuery({ queryKey: [...keys.bookings, "chat-meta"], queryFn: () => bookingsApi.list({ limit: 50 }) });
  const items = convs.data ?? [];
  const caregiverMap = useCaregiverMap(items.map((c) => c.caregiverId));

  const metaByCaregiver = useMemo(() => {
    const map: Record<string, { visitId?: string }> = {};
    for (const b of bookings.data?.items ?? []) {
      const active = b.visits?.find((v) => !["COMPLETED", "CANCELLED", "DECLINED"].includes(v.status));
      const cur = map[b.caregiverId];
      map[b.caregiverId] = { visitId: active?.id ?? cur?.visitId ?? b.visits?.[0]?.id };
    }
    return map;
  }, [bookings.data]);

  const sig = items
    .map(
      (c) =>
        `${c.counterpartUserId}:${c.counterpartName}:${c.activeBookingId ?? ""}:${c.bookingIds.join(",")}:${caregiverMap[c.caregiverId]?.specialty ?? ""}:${metaByCaregiver[c.caregiverId]?.visitId ?? ""}`,
    )
    .join("|");
  const threads = useMemo<ChatThreadMeta[]>(
    () =>
      items.map((c) => {
        const cg = caregiverMap[c.caregiverId];
        const meta = metaByCaregiver[c.caregiverId];
        return {
          id: c.counterpartUserId,
          name: c.counterpartName,
          role: cg ? L.specialty(cg.specialty) : "",
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

export function CustomerMessages({ children }: { children: React.ReactNode }) {
  const transport = useCustomerChatTransport();
  return (
    <ChatProvider scope="customer" transport={transport}>
      <MessagesShell basePath="/customer/messages">{children}</MessagesShell>
    </ChatProvider>
  );
}
