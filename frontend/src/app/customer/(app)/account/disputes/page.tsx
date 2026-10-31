"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeft, Scale } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import { PageHeader } from "@shared/page-header";
import { Badge } from "@shared/ui/badge";
import { Card } from "@shared/ui/card";
import { DataTable } from "@shared/ui/data-table";
import { Input } from "@shared/ui/field";
import { EmptyState, ErrorState } from "@shared/ui/misc";
import { Select } from "@shared/ui/select";
import type { DisputeRow } from "@shared/caregiver-types";
import type { DisputeStatus } from "@shared/types";
import { disputesApi } from "@/features/customer/lib/api/customer";

const DISPUTE_STATUSES: DisputeStatus[] = ["OPEN", "RESOLVED"];
const LIMIT = 15;

/** GET /disputes: everything raised by or against this customer (server-paginated). */
export default function DisputesPage() {
  const t = useTranslations("customerB.disputes");
  const router = useRouter();
  const f = useFmt();
  const L = useLabels();
  const [status, setStatus] = useState<DisputeStatus | "ALL">("ALL");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const disputes = useQuery({
    queryKey: ["customer", "disputes", status, q, page],
    queryFn: () => disputesApi.listPaged({ page, limit: LIMIT, ...(status === "ALL" ? {} : { status }), ...(q.trim() ? { q: q.trim() } : {}) }),
  });

  const columns: ColumnDef<DisputeRow, unknown>[] = [
    {
      id: "date",
      header: t("columns.date"),
      accessorFn: (d) => d.createdAt,
      cell: ({ row }) => <span className="text-ink-700">{f.date(row.original.createdAt.slice(0, 10))}</span>,
    },
    {
      id: "description",
      header: t("columns.description"),
      accessorFn: (d) => d.description,
      cell: ({ getValue }) => <span dir="auto" className="line-clamp-1 text-ink-800">{getValue() as string}</span>,
    },
    {
      id: "status",
      header: t("columns.status"),
      accessorFn: (d) => d.status,
      cell: ({ row }) => (
        <Badge tone={row.original.resolvedAt ? "success" : "accent"} dot>
          {L.dispute(row.original.status)}
        </Badge>
      ),
    },
    {
      id: "resolution",
      header: t("columns.resolution"),
      meta: { className: "hidden md:table-cell" },
      enableSorting: false,
      cell: ({ row }) =>
        row.original.resolutionNote ? (
          <span dir="auto" className="line-clamp-1 text-ink-600">{row.original.resolutionNote}</span>
        ) : (
          <span className="text-ink-400">—</span>
        ),
    },
  ];

  return (
    <>
      <Link href="/customer/account" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900">
        <ArrowLeft className="rtl:-scale-x-100 size-4" /> {t("back")}
      </Link>
      <PageHeader title={t("title")} description={t("description")} />
      {disputes.isError ? (
        <Card>
          <ErrorState error={disputes.error} onRetry={() => disputes.refetch()} />
        </Card>
      ) : disputes.data && disputes.data.items.length === 0 && status === "ALL" && !q.trim() ? (
        <Card>
          <EmptyState icon={Scale} title={t("emptyTitle")} description={t("emptyHint")} />
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={disputes.data?.items ?? []}
          loading={!disputes.data}
          emptyText={t("noResults")}
          onRowClick={(d) => router.push(`/customer/visits/${d.visitId}`)}
          serverPagination={disputes.data ? { page: disputes.data.page, limit: disputes.data.limit, total: disputes.data.total, onPageChange: setPage } : undefined}
          toolbar={() => (
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <Input
                className="w-full sm:w-56"
                placeholder={t("searchPlaceholder")}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
              <Select<DisputeStatus | "ALL">
                className="w-44"
                value={status}
                isSearchable={false}
                onChange={(v) => {
                  if (v) {
                    setStatus(v);
                    setPage(1);
                  }
                }}
                options={[{ value: "ALL", label: t("allStatuses") }, ...DISPUTE_STATUSES.map((s) => ({ value: s, label: L.dispute(s) }))]}
              />
            </div>
          )}
        />
      )}
    </>
  );
}
