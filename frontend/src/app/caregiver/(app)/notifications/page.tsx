"use client";

import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Bell, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { PageHeader } from "@shared/page-header";
import { Card } from "@shared/ui/card";
import { EmptyState, ErrorState, TableSkeleton } from "@shared/ui/misc";
import { useFmt } from "@shared/i18n/use-fmt";
import { notificationsApi } from "@/features/caregiver/lib/api/caregiver";
import { keys } from "@/features/caregiver/lib/api/keys";
import { getSeenAt, markSeen, useDescribe } from "@/features/caregiver/lib/notifications";

const DOT = {
  brand: "bg-brand-500",
  accent: "bg-accent-500",
  danger: "bg-danger-600",
  success: "bg-success-600",
  neutral: "bg-ink-300",
};

export default function NotificationsPage() {
  const t = useTranslations("caregiverA.notifications");
  const f = useFmt();
  const describe = useDescribe();
  const list = useQuery({ queryKey: [...keys.notifications, "list"], queryFn: () => notificationsApi.list({ limit: 50 }) });
  // Snapshot of "seen" before this visit, so new items stay highlighted while the page is open.
  const [seenBefore] = useState(() => (typeof window === "undefined" ? "" : getSeenAt()));

  // The API returns one row per channel (PUSH, SMS, WhatsApp); the in-app feed is PUSH only.
  const items = (list.data?.items ?? []).filter((n) => n.channel === "PUSH");

  const newest = items[0]?.createdAt;
  useEffect(() => {
    if (newest) markSeen(newest);
  }, [newest]);

  return (
    <>
      <PageHeader title={t("title")} />
      <Card>
        {list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : !list.data ? (
          <TableSkeleton rows={4} />
        ) : items.length === 0 ? (
          <EmptyState icon={Bell} title={t("empty")} />
        ) : (
          <ul className="divide-y divide-ink-100">
            {items.map((n) => {
              const v = describe(n);
              const isNew = n.createdAt > seenBefore;
              const body = (
                <>
                  <span className={clsx("mt-1.5 size-2.5 shrink-0 rounded-full", DOT[v.tone], !isNew && "opacity-40")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className={clsx("text-sm", isNew ? "font-bold text-ink-900" : "font-semibold text-ink-700")}>{v.title}</span>
                      <span className="shrink-0 text-xs text-ink-400">{f.relativeTime(n.createdAt)}</span>
                    </span>
                    {v.body && <span className="mt-0.5 block text-sm text-ink-500">{v.body}</span>}
                  </span>
                  {v.href && <ChevronRight className="rtl:-scale-x-100 mt-1 size-4 shrink-0 text-ink-300" />}
                </>
              );
              return (
                <li key={n.id}>
                  {v.href ? (
                    <Link href={v.href} className={clsx("flex gap-3 px-5 py-4 hover:bg-ink-25", isNew && "bg-brand-50/40")}>
                      {body}
                    </Link>
                  ) : (
                    <div className="flex gap-3 px-5 py-4">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
