"use client";

import { useQuery } from "@tanstack/react-query";
import { FileWarning, Scale } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { PageHeader } from "@shared/page-header";
import { DisputeStatusBadge, IncidentStatusBadge, PriorityBadge } from "@shared/status";
import { Card, CardHeader } from "@shared/ui/card";
import { EmptyState, ErrorState, TableSkeleton } from "@shared/ui/misc";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import { disputesApi, safetyApi } from "@/features/caregiver/lib/api/caregiver";
import { keys } from "@/features/caregiver/lib/api/keys";
import { useMe } from "@/features/caregiver/lib/auth";

export default function ReportsPage() {
  const me = useMe();
  const t = useTranslations("caregiverA.reports");
  const f = useFmt();
  const L = useLabels();
  const reports = useQuery({ queryKey: keys.safety, queryFn: safetyApi.list });
  const disputes = useQuery({ queryKey: keys.disputes, queryFn: disputesApi.list });

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("safetyReports")} />
          {reports.isError ? (
            <ErrorState error={reports.error} onRetry={() => reports.refetch()} />
          ) : !reports.data ? (
            <TableSkeleton rows={2} />
          ) : reports.data.length === 0 ? (
            <EmptyState icon={FileWarning} title={t("noReports")} description={t("noReportsHint")} />
          ) : (
            <ul className="mt-3 divide-y divide-ink-100 border-t border-ink-100">
              {reports.data.map((r) => (
                <li key={r.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink-900">{L.incidentSource(r.source)}</span>
                    <PriorityBadge priority={r.priority} />
                    <IncidentStatusBadge status={r.status} />
                  </div>
                  <p dir="auto" className="mt-1 text-sm text-ink-600">{r.description}</p>
                  <p className="mt-1 text-xs text-ink-400">
                    {f.dateTime(r.createdAt)}
                    {r.visitId && (
                      <>
                        {" · "}
                        <Link href={`/caregiver/visits/${r.visitId}`} className="font-semibold text-brand-700 hover:underline">
                          {t("viewVisit")}
                        </Link>
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title={t("disputes")} />
          {disputes.isError ? (
            <ErrorState error={disputes.error} onRetry={() => disputes.refetch()} />
          ) : !disputes.data ? (
            <TableSkeleton rows={2} />
          ) : disputes.data.length === 0 ? (
            <EmptyState icon={Scale} title={t("noDisputes")} />
          ) : (
            <ul className="mt-3 divide-y divide-ink-100 border-t border-ink-100">
              {disputes.data.map((d) => (
                <li key={d.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink-900">{d.raisedById === me.data?.id ? t("raisedByYou") : t("raisedByFamily")}</span>
                    <DisputeStatusBadge status={d.status} />
                  </div>
                  <p dir="auto" className="mt-1 text-sm text-ink-600">{d.description}</p>
                  {d.resolutionNote && <p dir="auto" className="mt-2 rounded-lg bg-success-50 px-3 py-2 text-sm text-success-700">{d.resolutionNote}</p>}
                  <p className="mt-1 text-xs text-ink-400">
                    {f.dateTime(d.createdAt)} ·{" "}
                    <Link href={`/caregiver/visits/${d.visitId}`} className="font-semibold text-brand-700 hover:underline">
                      {t("viewVisit")}
                    </Link>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
