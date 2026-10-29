"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ScrollText } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PageHeader } from "@shared/page-header";
import { Card } from "@shared/ui/card";
import { DataTable } from "@shared/ui/data-table";
import { EmptyState, ErrorState } from "@shared/ui/misc";
import { CAN_AUDIT_LOG, auditApi } from "@/features/admin/lib/api/admin";
import { useFmt } from "@shared/i18n/use-fmt";
import type { AuditLogEntry } from "@shared/types";

const LIMIT = 15;

/** SRS §6 admin audit trail. Gated behind CAN_AUDIT_LOG until the backend ships GET /admin/audit-logs (see requirement.md). */
export default function AuditLogsPage() {
  const t = useTranslations("adminB.auditLogs");
  const f = useFmt();
  const [page, setPage] = useState(1);

  const list = useQuery({
    queryKey: ["admin-audit-logs", page],
    queryFn: () => auditApi.list({ page, limit: LIMIT }),
    enabled: CAN_AUDIT_LOG,
  });

  const columns: ColumnDef<AuditLogEntry, unknown>[] = [
    {
      id: "at",
      header: t("columns.when"),
      accessorFn: (r) => r.at,
      cell: ({ row }) => <span className="text-ink-700">{f.dateTime(row.original.at)}</span>,
    },
    {
      id: "actor",
      header: t("columns.actor"),
      meta: { className: "hidden sm:table-cell" },
      accessorFn: (r) => r.actorName ?? "",
      cell: ({ row }) => <span className="text-ink-800">{row.original.actorName ?? t("system")}</span>,
    },
    {
      id: "action",
      header: t("columns.action"),
      accessorFn: (r) => r.action,
      cell: ({ row }) => <span dir="ltr" className="font-mono text-xs text-ink-800">{row.original.action}</span>,
    },
    {
      id: "entity",
      header: t("columns.entity"),
      meta: { className: "hidden md:table-cell" },
      enableSorting: false,
      cell: ({ row }) => (
        <span dir="ltr" className="font-mono text-xs text-ink-500">
          {row.original.entityType}:{row.original.entityId.slice(0, 8)}
        </span>
      ),
    },
  ];

  if (!CAN_AUDIT_LOG) {
    return (
      <>
        <PageHeader title={t("title")} description={t("description")} />
        <Card>
          <EmptyState icon={ScrollText} title={t("pendingTitle")} description={t("pendingHint")} />
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
        />
      )}
    </>
  );
}
