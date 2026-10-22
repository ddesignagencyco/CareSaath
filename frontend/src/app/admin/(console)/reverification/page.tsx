"use client";

import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { CalendarClock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { CaregiverDrawer } from "@/features/admin/components/caregivers/caregiver-drawer";
import { PageHeader } from "@shared/page-header";
import { Badge } from "@shared/ui/badge";
import { Card } from "@shared/ui/card";
import { Avatar, EmptyState, ErrorState, FilterTabs, TableSkeleton } from "@shared/ui/misc";
import { Table, Td, Th, Tr } from "@shared/ui/table";
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
 * FR-A2 periodic re-verification. The API has no "due soon" filter, so this
 * pulls approved caregivers (max page size) and sorts by reverifyDueAt.
 */
export default function ReverificationPage() {
  const t = useTranslations("adminA.reverification");
  const f = useFmt();
  const L = useLabels();
  const [dueWindow, setDueWindow] = useState<DueWindow>("30");
  const [selected, setSelected] = useState<AdminCaregiver | null>(null);

  const list = useQuery({
    queryKey: [...keys.caregivers, "list", "APPROVED", "reverify"],
    queryFn: () => caregiversApi.list({ status: "APPROVED", limit: 100 }),
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

  const shown = rows[dueWindow];
  const items = list.data?.items ?? [];
  const noDueDate = items.filter((c) => !c.reverifyDueAt).length;
  const total = list.data?.total ?? 0;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
      />

      <div className="mb-4">
        <FilterTabs
          value={dueWindow}
          onChange={setDueWindow}
          options={[
            { value: "overdue", label: t("windows.overdue"), count: rows.overdue.length },
            { value: "30", label: t("windows.next30"), count: rows["30"].length },
            { value: "90", label: t("windows.next90"), count: rows["90"].length },
            { value: "all", label: t("windows.all"), count: rows.all.length },
          ]}
        />
      </div>

      {(noDueDate > 0 || total > items.length) && (
        <div className="mb-4 space-y-1 text-sm text-ink-500">
          {noDueDate > 0 && <p>{t("noDueDate", { count: noDueDate })}</p>}
          {total > items.length && <p>{t("truncated", { shown: items.length, total })}</p>}
        </div>
      )}

      <Card>
        {list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : !list.data ? (
          <TableSkeleton />
        ) : shown.length === 0 ? (
          <EmptyState icon={CalendarClock} title={t("empty")} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("columns.caregiver")}</Th>
                <Th className="hidden md:table-cell">{t("columns.license")}</Th>
                <Th className="hidden sm:table-cell">{t("columns.approved")}</Th>
                <Th>{t("columns.due")}</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ c, days }) => (
                <Tr key={c.id} onClick={() => setSelected(c)} className={clsx(days < 0 && "bg-danger-50/40")}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={c.user.fullName} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink-900">{c.user.fullName}</p>
                        <p className="text-xs text-ink-500">{L.specialty(c.specialty)}</p>
                      </div>
                    </div>
                  </Td>
                  <Td className="hidden md:table-cell">
                    <p className="tabular font-medium text-ink-800">{c.licenseNumber}</p>
                    <p className="text-xs text-ink-500">{L.licenseBodyShort(c.licenseBody)}</p>
                  </Td>
                  <Td className="hidden sm:table-cell text-ink-700">{f.date(c.approvedAt)}</Td>
                  <Td>
                    <div className="flex flex-col items-start gap-1">
                      <DueBadge days={days} />
                      <span className="text-xs text-ink-500">{f.date(c.reverifyDueAt)}</span>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {selected && <CaregiverDrawer caregiver={selected} onClose={() => setSelected(null)} onChange={setSelected} />}
    </>
  );
}
