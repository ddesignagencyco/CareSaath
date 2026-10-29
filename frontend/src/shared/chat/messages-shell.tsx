"use client";

import clsx from "clsx";
import { useEffect, type ReactNode } from "react";
import { MessagesSquare } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Skeleton } from "@shared/ui/misc";
import { ChatThread, ConversationList } from "./chat";
import { useChatContext } from "./context";

/** Master-detail chat frame: conversation list + the open thread (the routed child). */
export function MessagesShell({ basePath, children }: { basePath: string; children: ReactNode }) {
  const t = useTranslations("common.chat");
  const router = useRouter();
  const pathname = usePathname();
  const { conversations, loaded } = useChatContext();
  const selectedId = pathname.startsWith(`${basePath}/`) ? pathname.slice(basePath.length + 1).split("/")[0] || null : null;
  const hasConversation = !!selectedId;

  if (!loaded) return <Skeleton className="h-[calc(100dvh-9rem)] min-h-[30rem] rounded-2xl" />;

  return (
    <div className="h-[calc(100dvh-9rem)] min-h-[30rem] overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-card">
      <div className="flex h-full">
        <div className={clsx("flex w-full flex-col border-e border-ink-100 lg:w-80 lg:shrink-0", hasConversation && "hidden lg:flex")}>
          <div className="shrink-0 border-b border-ink-100 px-4 py-3">
            <h1 className="text-lg font-extrabold text-ink-900">{t("title")}</h1>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ConversationList conversations={conversations} selectedId={selectedId} onSelect={(id) => router.push(`${basePath}/${id}`)} />
          </div>
        </div>
        <div className={clsx("w-full lg:flex-1", !hasConversation && "hidden lg:block")}>{children}</div>
      </div>
    </div>
  );
}

/** Thread-pane placeholder shown at the index route (no conversation open). */
export function EmptyScreen() {
  const t = useTranslations("common.chat");
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <span className="mb-3 flex size-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <MessagesSquare className="size-7" />
      </span>
      <p className="font-semibold text-ink-900">{t("selectConversation")}</p>
    </div>
  );
}

/** The open conversation (routed by id). */
export function ConversationScreen({ conversationId, basePath }: { conversationId: string; basePath: string }) {
  const t = useTranslations("common.chat");
  const router = useRouter();
  const { conversations, send, react, remove, markUploaded, markRead } = useChatContext();
  const conversation = conversations.find((c) => c.id === conversationId);
  // Opening a thread marks the other party's messages read (real backend); no-op in the mock.
  useEffect(() => {
    markRead(conversationId);
  }, [conversationId, markRead]);
  if (!conversation) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <p className="font-semibold text-ink-900">{t("notFound")}</p>
      </div>
    );
  }
  return (
    <ChatThread
      key={conversation.id}
      conversation={conversation}
      onSend={send}
      onReact={react}
      onDelete={remove}
      onUploadComplete={markUploaded}
      onBack={() => router.push(basePath)}
    />
  );
}
