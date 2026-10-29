"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PageHeader } from "@shared/page-header";
import { Badge, type Tone } from "@shared/ui/badge";
import { Card } from "@shared/ui/card";
import { DataTable } from "@shared/ui/data-table";
import { EmptyState, ErrorState } from "@shared/ui/misc";
import { Select } from "@shared/ui/select";
import { CAN_CALL_LOGS, callLogsApi } from "@/features/admin/lib/api/admin";
import { useFmt } from "@shared/i18n/use-fmt";
import type { CallLogEntry, CallStatus } from "@shared/types";

const LIMIT = 15;
const STATUSES: CallStatus[] = ["INITIATED", "CONNECTED", "ENDED", "MISSED", "REJECTED"];
const TONE: Record<CallStatus, Tone> = { INITIATED: "neutral", CONNECTED: "success", ENDED: "neutral", MISSED: "warning", REJECTED: "danger" };

function formatDuration(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Persisted in-app call history. Gated behind CAN_CALL_LOGS until the backend ships GET /admin/call-logs (see requirement.md). */
export default function CallLogsPage() {
  const t = useTranslations("adminB.callLogs");
  const f = useFmt();
  const [status, setStatus] = useState<CallStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);

  const list = useQuery({
    queryKey: ["admin-call-logs", status, page],
    queryFn: () => callLogsApi.list({ page, limit: LIMIT, ...(status === "ALL" ? {} : { status }) }),
    enabled: CAN_CALL_LOGS,
  });

  const columns: ColumnDef<CallLogEntry, unknown>[] = [
    {
      id: "caller",
      header: t("columns.caller"),
      accessorFn: (r) => r.caller.fullName,
      cell: ({ row }) => <span className="font-semibold text-ink-900">{row.original.caller.fullName}</span>,
    },
    {
      id: "callee",
      header: t("columns.callee"),
      accessorFn: (r) => r.callee.fullName,
      cell: ({ row }) => <span className="text-ink-800">{row.original.callee.fullName}</span>,
    },
    {
      id: "started",
      header: t("columns.started"),
      meta: { className: "hidden sm:table-cell" },
      accessorFn: (r) => r.startedAt,
      cell: ({ row }) => <span className="text-ink-700">{f.dateTime(row.original.startedAt)}</span>,
    },
    {
      id: "duration",
      header: t("columns.duration"),
      meta: { className: "hidden sm:table-cell" },
      accessorFn: (r) => r.durationSec ?? -1,
      cell: ({ row }) => <span dir="ltr" className="tabular text-ink-700">{formatDuration(row.original.durationSec)}</span>,
    },
    {
      id: "status",
      header: t("columns.status"),
      enableSorting: false,
      cell: ({ row }) => (
        <Badge tone={TONE[row.original.status]} dot>
          {t(`status.${row.original.status}`)}
        </Badge>
      ),
    },
  ];

  if (!CAN_CALL_LOGS) {
    return (
      <>
        <PageHeader title={t("title")} description={t("description")} />
        <Card>
          <EmptyState icon={Phone} title={t("pendingTitle")} description={t("pendingHint")} />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      {list.isError ? (
        <Card>
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={list.data?.items ?? []}
          loading={!list.data}
          emptyText={t("empty")}
          serverPagination={list.data ? { page: list.data.page, limit: list.data.limit, total: list.data.total, onPageChange: setPage } : undefined}
          toolbar={() => (
            <Select<CallStatus | "ALL">
              className="w-44"
              isSearchable={false}
              value={status}
              onChange={(v) => {
                if (v) {
                  setStatus(v);
                  setPage(1);
                }
              }}
              options={[{ value: "ALL", label: t("allStatuses") }, ...STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))]}
            />
          )}
        />
      )}
    </>
  );
}
