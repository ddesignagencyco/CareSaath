"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeft, Scale } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import { PageHeader } from "@shared/page-header";
import { Badge } from "@shared/ui/badge";
import { Card } from "@shared/ui/card";
import { DataTable } from "@shared/ui/data-table";
import { EmptyState, ErrorState } from "@shared/ui/misc";
import { Select } from "@shared/ui/select";
import type { DisputeRow } from "@shared/caregiver-types";
import { useMyDisputes } from "@/features/customer/components/visit-panels";

/** GET /disputes: everything raised by or against this customer. */
export default function DisputesPage() {
  const t = useTranslations("customerB.disputes");
  const router = useRouter();
  const f = useFmt();
  const L = useLabels();
  const disputes = useMyDisputes();
  const data = disputes.data ?? [];
  const statuses = [...new Set(data.map((d) => d.status))];

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
      filterFn: "equalsString",
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
      ) : disputes.data && data.length === 0 ? (
        <Card>
          <EmptyState icon={Scale} title={t("emptyTitle")} description={t("emptyHint")} />
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={data}
          loading={!disputes.data}
          searchPlaceholder={t("searchPlaceholder")}
          emptyText={t("noResults")}
          onRowClick={(d) => router.push(`/customer/visits/${d.visitId}`)}
          toolbar={
            statuses.length > 1
              ? (table) => {
                  const col = table.getColumn("status");
                  const val = (col?.getFilterValue() as string) ?? "ALL";
                  return (
                    <Select<string>
                      className="w-44"
                      value={val}
                      isSearchable={false}
                      onChange={(v) => col?.setFilterValue(!v || v === "ALL" ? undefined : v)}
                      options={[{ value: "ALL", label: t("allStatuses") }, ...statuses.map((s) => ({ value: s, label: L.dispute(s) }))]}
                    />
                  );
                }
              : undefined
          }
        />
      )}
    </>
  );
}
