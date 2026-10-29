"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarClock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { CaregiverDrawer } from "@/features/admin/components/caregivers/caregiver-drawer";
import { PageHeader } from "@shared/page-header";
import { Badge } from "@shared/ui/badge";
import { Card } from "@shared/ui/card";
import { DataTable } from "@shared/ui/data-table";
import { Avatar, EmptyState, ErrorState } from "@shared/ui/misc";
import { Select } from "@shared/ui/select";
import { caregiversApi } from "@/features/admin/lib/api/admin";
import { keys } from "@/features/admin/lib/api/hooks";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import { daysUntil } from "@shared/lib/format";
import type { AdminCaregiver } from "@shared/types";

type DueWindow = "overdue" | "30" | "90" | "all";

function DueBadge({ days }: { days: number }) {
  const t = useTranslations("adminA.reverification.due");
  if (days < 0) return <Badge tone="danger" dot>{t("overdue", { days: -days })}</Badge>;
  if (days <= 30) return <Badge tone="warning" dot>{t("dueIn", { days })}</Badge>;
  return <Badge tone="neutral">{t("inDays", { days })}</Badge>;
}

/**
 * FR-A2 periodic re-verification. For the actionable windows we use the API's
 * `reverifyDueBefore` filter (the server then sorts by due date, ascending);
 * "all" lists every approved caregiver.
 */
export default function ReverificationPage() {
  const t = useTranslations("adminA.reverification");
  const f = useFmt();
  const L = useLabels();
  const [dueWindow, setDueWindow] = useState<DueWindow>("all");
  const [selected, setSelected] = useState<AdminCaregiver | null>(null);

  const scoped = dueWindow !== "all";
  const list = useQuery({
    queryKey: [...keys.caregivers, "list", "APPROVED", "reverify", scoped ? "due90" : "all"],
    queryFn: () =>
      caregiversApi.list({ status: "APPROVED", limit: 100, ...(scoped ? { reverifyDueBefore: new Date(Date.now() + 90 * 86_400_000).toISOString() } : {}) }),
  });

  const rows = useMemo(() => {
    const all = (list.data?.items ?? [])
      .filter((c) => c.reverifyDueAt)
      .map((c) => ({ c, days: daysUntil(c.reverifyDueAt!) }))
      .sort((a, b) => a.days - b.days);
    return {
      overdue: all.filter((r) => r.days < 0),
      "30": all.filter((r) => r.days <= 30),
      "90": all.filter((r) => r.days <= 90),
      all,
    };
  }, [list.data]);

  const data = rows[dueWindow].map(({ c }) => c);
  const items = list.data?.items ?? [];
  const noDueDate = items.filter((c) => !c.reverifyDueAt).length;
  const total = list.data?.total ?? 0;

  const columns: ColumnDef<AdminCaregiver, unknown>[] = [
    {
      id: "caregiver",
      header: t("columns.caregiver"),
      accessorFn: (c) => c.user.fullName,
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <Avatar name={row.original.user.fullName} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink-900">{row.original.user.fullName}</p>
            <p className="text-xs text-ink-500">{L.specialty(row.original.specialty)}</p>
          </div>
        </div>
      ),
    },
    {
      id: "license",
      header: t("columns.license"),
      meta: { className: "hidden md:table-cell" },
      accessorFn: (c) => c.licenseNumber,
      cell: ({ row }) => (
        <div>
          <p className="tabular font-medium text-ink-800">{row.original.licenseNumber}</p>
          <p className="text-xs text-ink-500">{L.licenseBodyShort(row.original.licenseBody)}</p>
        </div>
      ),
    },
    {
      id: "approved",
      header: t("columns.approved"),
      meta: { className: "hidden sm:table-cell" },
      accessorFn: (c) => c.approvedAt ?? "",
      cell: ({ row }) => <span className="text-ink-700">{f.date(row.original.approvedAt)}</span>,
    },
    {
      id: "due",
      header: t("columns.due"),
      accessorFn: (c) => c.reverifyDueAt ?? "",
      cell: ({ row }) => {
        const days = daysUntil(row.original.reverifyDueAt!);
        return (
          <div className="flex flex-col items-start gap-1">
            <DueBadge days={days} />
            <span className="text-xs text-ink-500">{f.date(row.original.reverifyDueAt)}</span>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      {(noDueDate > 0 || total > items.length) && (
        <div className="mb-4 space-y-1 text-sm text-ink-500">
          {noDueDate > 0 && <p>{t("noDueDate", { count: noDueDate })}</p>}
          {total > items.length && <p>{t("truncated", { shown: items.length, total })}</p>}
        </div>
      )}

      {list.isError ? (
        <Card>
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        </Card>
      ) : list.data && rows.all.length === 0 && dueWindow === "all" ? (
        <Card>
          <EmptyState icon={CalendarClock} title={t("empty")} />
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={data}
          loading={!list.data}
          searchPlaceholder={t("searchPlaceholder")}
          emptyText={t("empty")}
          onRowClick={(c) => setSelected(c)}
          toolbar={() => (
            <Select<DueWindow>
              className="w-52"
              value={dueWindow}
              isSearchable={false}
              onChange={(v) => v && setDueWindow(v)}
              options={[
                { value: "all", label: `${t("windows.all")} (${rows.all.length})` },
                { value: "overdue", label: `${t("windows.overdue")} (${rows.overdue.length})` },
                { value: "30", label: `${t("windows.next30")} (${rows["30"].length})` },
                { value: "90", label: `${t("windows.next90")} (${rows["90"].length})` },
              ]}
            />
          )}
        />
      )}

      {selected && <CaregiverDrawer caregiver={selected} onClose={() => setSelected(null)} onChange={setSelected} />}
    </>
  );
}
