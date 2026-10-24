"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarRange } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PageHeader } from "@shared/page-header";
import { Card } from "@shared/ui/card";
import { EmptyState, ErrorState, FilterTabs, TableSkeleton } from "@shared/ui/misc";
import type { CaregiverVisitListItem } from "@shared/caregiver-types";
import { VisitRow } from "@/features/caregiver/components/visit-row";
import { useNow } from "@shared/hooks/use-now";
import { visitsApi } from "@/features/caregiver/lib/api/caregiver";
import { keys } from "@/features/caregiver/lib/api/keys";
import { useFmt } from "@shared/i18n/use-fmt";
import { ACTIVE_STATUSES, dayKey, localDayKey } from "@shared/lib/visit";

type Tab = "upcoming" | "past";

function groupByDay(visits: CaregiverVisitListItem[]) {
  const groups = new Map<string, CaregiverVisitListItem[]>();
  for (const v of visits) groups.set(dayKey(v.scheduledDate), [...(groups.get(dayKey(v.scheduledDate)) ?? []), v]);
  return [...groups];
}

export default function VisitsPage() {
  const now = useNow(60_000);
  const t = useTranslations("caregiverA.visits");
  const f = useFmt();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [onDate, setOnDate] = useState("");
  // Fetch the whole schedule and split by day client-side for the tabs.
  const list = useQuery({ queryKey: [...keys.visits, "all"], queryFn: () => visitsApi.list({ limit: 100 }) });
  // A specific day is filtered server-side via the ?date= param.
  const dated = useQuery({
    queryKey: [...keys.visits, "on", onDate],
    queryFn: () => visitsApi.list({ date: onDate, limit: 100 }),
    enabled: !!onDate,
  });

  const today = now ? localDayKey(now) : "";
  const visible = (list.data?.items ?? []).filter((v) => v.status !== "REQUESTED" && v.status !== "DECLINED");
  const upcoming = visible.filter(
    (v) => ACTIVE_STATUSES.includes(v.status) || (v.status === "CONFIRMED" && dayKey(v.scheduledDate) >= today),
  );
  const past = visible
    .filter((v) => !upcoming.includes(v))
    .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate) || b.timeWindowStart.localeCompare(a.timeWindowStart));
  const shown = tab === "upcoming" ? upcoming : past;
  const datedShown = (dated.data?.items ?? []).filter((v) => v.status !== "REQUESTED" && v.status !== "DECLINED");

  const renderGroups = (visits: CaregiverVisitListItem[]) => (
    <div className="space-y-5">
      {groupByDay(visits).map(([key, group]) => (
        <section key={key}>
          <h2 className="mb-2 flex items-baseline gap-2 px-1">
            <span className="font-bold text-ink-900">{f.relativeDay(group[0].scheduledDate, now)}</span>
            <span className="text-xs text-ink-500">{f.longDay(group[0].scheduledDate)}</span>
          </h2>
          <Card className="divide-y divide-ink-100 overflow-hidden">
            {group.map((v) => (
              <VisitRow key={v.id} visit={v} />
            ))}
          </Card>
        </section>
      ))}
    </div>
  );

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {onDate ? <span /> : (
          <FilterTabs
            value={tab}
            onChange={setTab}
            options={[
              { value: "upcoming", label: t("upcoming"), count: list.data && now ? upcoming.length : undefined },
              { value: "past", label: t("past") },
            ]}
          />
        )}
        <div className="flex items-center gap-2">
          <input
            type="date"
            aria-label={t("onDate")}
            value={onDate}
            onChange={(e) => setOnDate(e.target.value)}
            className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm text-ink-900"
          />
          {onDate && (
            <button type="button" onClick={() => setOnDate("")} className="text-sm font-semibold text-brand-700 hover:underline">
              {t("clearDate")}
            </button>
          )}
        </div>
      </div>

      {onDate ? (
        dated.isError ? (
          <Card>
            <ErrorState error={dated.error} onRetry={() => dated.refetch()} />
          </Card>
        ) : !dated.data || !now ? (
          <Card>
            <TableSkeleton />
          </Card>
        ) : datedShown.length === 0 ? (
          <Card>
            <EmptyState icon={CalendarRange} title={t("noOnDate")} />
          </Card>
        ) : (
          renderGroups(datedShown)
        )
      ) : list.isError ? (
        <Card>
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        </Card>
      ) : !list.data || !now ? (
        <Card>
          <TableSkeleton />
        </Card>
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState icon={CalendarRange} title={tab === "upcoming" ? t("noUpcoming") : t("noPast")} />
        </Card>
      ) : (
        renderGroups(shown)
      )}
    </>
  );
}
