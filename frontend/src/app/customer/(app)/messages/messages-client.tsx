"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ChatProvider } from "@shared/chat/context";
import { MessagesShell } from "@shared/chat/messages-shell";
import type { ChatThreadMeta, ChatTransport } from "@shared/chat/types";
import { useLabels } from "@shared/i18n/use-labels";
import { USE_MOCKS } from "@/features/customer/lib/api/http";
import { useCaregiverMap } from "@/features/customer/components/caregiver-bits";
import { bookingsApi, chatApi, meApi } from "@/features/customer/lib/api/customer";
import { keys } from "@/features/customer/lib/api/keys";

/** One chat thread per booking; the other party is the caregiver (name from the public profile). */
function useCustomerChatTransport(): ChatTransport {
  const L = useLabels();
  const th = useTranslations("customerA.home");
  const me = useQuery({ queryKey: keys.me, queryFn: meApi.get, enabled: !USE_MOCKS });
  const bookings = useQuery({ queryKey: [...keys.bookings, "chat"], queryFn: () => bookingsApi.list({}), enabled: !USE_MOCKS });
  const items = bookings.data?.items ?? [];
  const caregiverMap = useCaregiverMap(items.map((b) => b.caregiverId));

  const sig = items.map((b) => `${b.id}:${caregiverMap[b.caregiverId]?.user.fullName ?? ""}:${b.serviceType}`).join("|");
  const threads = useMemo<ChatThreadMeta[]>(
    () => items.map((b) => ({ id: b.id, name: caregiverMap[b.caregiverId]?.user.fullName ?? th("caregiverFallback"), role: L.specialty(b.serviceType) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sig` captures every field the threads depend on, stably
    [sig],
  );

  return useMemo<ChatTransport>(
    () => ({
      myUserId: me.data?.id,
      threads,
      threadsLoaded: USE_MOCKS || bookings.isSuccess,
      listMessages: async (id) => (await chatApi.list(id)).items.slice().reverse(),
      send: (id, body) => chatApi.send(id, body),
      markRead: async (id) => {
        await chatApi.markRead(id);
      },
    }),
    [me.data?.id, threads, bookings.isSuccess],
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
