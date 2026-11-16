"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarRange } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import clsx from "clsx";
import { PageHeader } from "@shared/page-header";
import { Badge } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import { Card } from "@shared/ui/card";
import { DataTable } from "@shared/ui/data-table";
import { DatePicker } from "@shared/ui/date-picker";
import { EmptyState, ErrorState } from "@shared/ui/misc";
import type { CaregiverVisitListItem } from "@shared/caregiver-types";
import { useNow } from "@shared/hooks/use-now";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import { visitsApi } from "@/features/caregiver/lib/api/caregiver";
import { keys } from "@/features/caregiver/lib/api/keys";
import { ACTIVE_STATUSES, dayKey, localDayKey, VISIT_TONE } from "@shared/lib/visit";

type Tab = "upcoming" | "past" | "all";

export default function VisitsPage() {
  const now = useNow(60_000);
  const router = useRouter();
  const t = useTranslations("caregiverA.visits");
  const f = useFmt();
  const L = useLabels();
  const [tab, setTab] = useState<Tab>("all");
  const [onDate, setOnDate] = useState("");

  const list = useQuery({ queryKey: [...keys.visits, "all"], queryFn: () => visitsApi.list({ limit: 100 }) });
  const dated = useQuery({ queryKey: [...keys.visits, "on", onDate], queryFn: () => visitsApi.list({ date: onDate, limit: 100 }), enabled: !!onDate });

  const today = now ? localDayKey(now) : "";
  const visible = (list.data?.items ?? []).filter((v) => v.status !== "REQUESTED" && v.status !== "DECLINED");
  const upcoming = visible.filter((v) => ACTIVE_STATUSES.includes(v.status) || (v.status === "CONFIRMED" && dayKey(v.scheduledDate) >= today));
  const past = visible
    .filter((v) => !upcoming.includes(v))
    .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate) || b.timeWindowStart.localeCompare(a.timeWindowStart));
  const datedShown = (dated.data?.items ?? []).filter((v) => v.status !== "REQUESTED" && v.status !== "DECLINED");

  // "All" = every non-draft visit, most recent first.
  const allSorted = [...visible].sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate) || b.timeWindowStart.localeCompare(a.timeWindowStart));
  const data = onDate ? datedShown : tab === "upcoming" ? upcoming : tab === "past" ? past : allSorted;
  const loading = onDate ? !dated.data || !now : !list.data || !now;

  const columns: ColumnDef<CaregiverVisitListItem, unknown>[] = [
    {
      id: "patient",
      header: t("columns.patient"),
      accessorFn: (v) => `${v.booking.patient.name} ${v.booking.address.addressLine} ${v.booking.address.city}`,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink-900">{row.original.booking.patient.name}</p>
          <p dir="auto" className="truncate text-xs text-ink-500">
            {row.original.booking.address.addressLine}, {row.original.booking.address.city}
          </p>
        </div>
      ),
    },
    {
      id: "service",
      header: t("columns.service"),
      meta: { className: "hidden md:table-cell" },
      accessorFn: (v) => L.specialty(v.booking.serviceType),
      cell: ({ getValue }) => <span className="text-ink-700">{getValue() as string}</span>,
    },
    {
      id: "date",
      header: t("columns.date"),
      accessorFn: (v) => v.scheduledDate,
      cell: ({ row }) => <span className="text-ink-700">{f.relativeDay(row.original.scheduledDate, now)}</span>,
    },
    {
      id: "time",
      header: t("columns.time"),
      meta: { className: "hidden sm:table-cell" },
      accessorFn: (v) => v.timeWindowStart,
      cell: ({ row }) => <span className="tabular text-ink-600">{f.timeWindow(row.original.timeWindowStart, row.original.timeWindowEnd)}</span>,
    },
    {
      id: "status",
      header: t("columns.status"),
      accessorFn: (v) => v.status,
      cell: ({ row }) => (
        <Badge tone={VISIT_TONE[row.original.status]} dot>
          {L.visitCaregiver(row.original.status)}
        </Badge>
      ),
    },
  ];

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="space-y-4">
        {/* Permanent filters bar: always available so the caregiver is never trapped in an empty state */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {!onDate && (
              <div className="flex rounded-lg border border-ink-200 bg-white p-1 shadow-2xs">
                {(
                  [
                    ["all", t("all"), allSorted.length],
                    ["upcoming", t("upcoming"), upcoming.length],
                    ["past", t("past"), past.length],
                  ] as const
                ).map(([val, label, count]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setTab(val)}
                    className={clsx(
                      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                      tab === val
                        ? "bg-brand-50 text-brand-700 shadow-2xs font-bold"
                        : "text-ink-600 hover:text-ink-900 hover:bg-ink-50",
                    )}
                  >
                    <span>{label}</span>
                    <span
                      className={clsx(
                        "rounded-full px-1.5 py-0.2 text-[10px]",
                        tab === val ? "bg-brand-100 text-brand-800" : "bg-ink-100 text-ink-500",
                      )}
                    >
                      {count}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <DatePicker
              aria-label={t("onDate")}
              placeholder={t("onDate")}
              value={onDate}
              onChange={setOnDate}
              className="w-44"
            />
            {onDate && (
              <button
                type="button"
                onClick={() => setOnDate("")}
                className="text-xs font-semibold text-brand-700 hover:underline"
              >
                {t("clearDate")}
              </button>
            )}
          </div>
        </div>

        {(onDate ? dated.isError : list.isError) ? (
          <Card>
            <ErrorState error={(onDate ? dated.error : list.error) as Error} onRetry={() => (onDate ? dated.refetch() : list.refetch())} />
          </Card>
        ) : !loading && data.length === 0 ? (
          <Card className="flex flex-col items-center pb-8">
            <EmptyState
              icon={CalendarRange}
              title={onDate ? t("noOnDate") : tab === "upcoming" ? t("noUpcoming") : t("noPast")}
            />
            {onDate ? (
              <Button size="sm" variant="secondary" onClick={() => setOnDate("")}>
                {t("clearDate")}
              </Button>
            ) : tab !== "all" ? (
              <Button size="sm" variant="secondary" onClick={() => setTab("all")}>
                {t("all")}
              </Button>
            ) : null}
          </Card>
        ) : (
          <DataTable
            columns={columns}
            data={data}
            loading={loading}
            searchPlaceholder={t("searchPlaceholder")}
            emptyText={t("noResults")}
            onRowClick={(v) => router.push(`/caregiver/visits/${v.id}`)}
          />
        )}
      </div>
    </>
  );
}
