"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { FileWarning } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { CaregiverDrawer } from "@/features/admin/components/caregivers/caregiver-drawer";
import { PageHeader } from "@shared/page-header";
import { UserStatusBadge, VerificationBadge } from "@shared/status";
import { Card } from "@shared/ui/card";
import { DataTable } from "@shared/ui/data-table";
import { Input } from "@shared/ui/field";
import { Avatar, ErrorState } from "@shared/ui/misc";
import { Select } from "@shared/ui/select";
import { caregiversApi } from "@/features/admin/lib/api/admin";
import { keys } from "@/features/admin/lib/api/hooks";
import { useDebouncedValue } from "@shared/hooks/use-debounced-value";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import type { AdminCaregiver, VerificationStatus } from "@shared/types";

const STATUSES: VerificationStatus[] = ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"];

const LIMIT = 10;

export default function CaregiversPage() {
  const t = useTranslations("adminA.caregivers");
  const f = useFmt();
  const L = useLabels();
  const [status, setStatus] = useState<VerificationStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AdminCaregiver | null>(null);
  const [qInput, setQInput] = useState("");
  const q = useDebouncedValue(qInput.trim());

  const list = useQuery({
    queryKey: [...keys.caregivers, "list", status, q, page],
    queryFn: () => caregiversApi.list({ ...(status === "ALL" ? {} : { status }), ...(q ? { q } : {}), page, limit: LIMIT }),
  });

  const counts = useQueries({
    queries: STATUSES.map((s) => ({
      queryKey: [...keys.caregivers, "count", s],
      queryFn: () => caregiversApi.list({ status: s, limit: 1 }),
    })),
  });
  // Combined "All" count: sum of the per-status totals once every count has loaded.
  const allCount = counts.every((c) => c.data?.total != null) ? counts.reduce((n, c) => n + c.data!.total, 0) : null;

  const columns: ColumnDef<AdminCaregiver, unknown>[] = [
    {
      id: "caregiver",
      header: t("columns.caregiver"),
      accessorFn: (c) => c.user.fullName,
      cell: ({ row }) => {
        const c = row.original;
        return (
          <div className="flex items-center gap-3">
            <Avatar name={c.user.fullName} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink-900">{c.user.fullName || t("unnamed")}</p>
              <p className="text-xs text-ink-500">{t("registered", { cities: f.list(c.serviceArea.cities), when: f.relativeTime(c.createdAt) })}</p>
            </div>
          </div>
        );
      },
    },
    {
      id: "specialty",
      header: t("columns.specialty"),
      meta: { className: "hidden md:table-cell" },
      accessorFn: (c) => L.specialty(c.specialty),
      cell: ({ getValue }) => <span className="text-ink-700">{getValue() as string}</span>,
    },
    {
      id: "license",
      header: t("columns.license"),
      meta: { className: "hidden lg:table-cell" },
      accessorFn: (c) => c.licenseNumber,
      cell: ({ row }) => (
        <div>
          <p className="tabular font-medium text-ink-800">{row.original.licenseNumber}</p>
          <p className="text-xs text-ink-500">{L.licenseBodyShort(row.original.licenseBody)}</p>
        </div>
      ),
    },
    {
      id: "documents",
      header: t("columns.documents"),
      meta: { className: "hidden sm:table-cell" },
      enableSorting: false,
      cell: ({ row }) =>
        row.original.documents.length === 0 ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-warning-700">
            <FileWarning className="size-3.5" /> {t("noneUploaded")}
          </span>
        ) : (
          <span className="text-ink-700">{t("fileCount", { count: row.original.documents.length })}</span>
        ),
    },
    {
      id: "rate",
      header: t("columns.rate"),
      meta: { className: "hidden lg:table-cell" },
      accessorFn: (c) => c.ratePerVisit,
      cell: ({ row }) => <span className="tabular text-ink-800">{f.money(row.original.ratePerVisit)}</span>,
    },
    {
      id: "status",
      header: t("columns.status"),
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex flex-col items-start gap-1">
          <VerificationBadge status={row.original.verificationStatus} />
          {row.original.user.status !== "ACTIVE" && <UserStatusBadge status={row.original.user.status} />}
        </div>
      ),
    },
  ];

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
          emptyText={status === "PENDING" ? t("emptyPendingTitle") : t("emptyTitle")}
          onRowClick={(c) => setSelected(c)}
          serverPagination={list.data ? { page: list.data.page, limit: list.data.limit, total: list.data.total, onPageChange: setPage } : undefined}
          toolbar={() => (
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1 sm:max-w-xs">
                <Input value={qInput} onChange={(e) => { setQInput(e.target.value); setPage(1); }} placeholder={t("searchPlaceholder")} />
              </div>
              <Select<VerificationStatus | "ALL">
                className="w-52"
                value={status}
                isSearchable={false}
                onChange={(v) => {
                  if (v) {
                    setStatus(v);
                    setPage(1);
                  }
                }}
                options={[
                  { value: "ALL", label: allCount != null ? `${t("allStatuses")} (${allCount})` : t("allStatuses") },
                  ...STATUSES.map((s, i) => ({
                    value: s,
                    label: counts[i].data?.total != null ? `${t(`statuses.${s}`)} (${counts[i].data!.total})` : t(`statuses.${s}`),
                  })),
                ]}
              />
            </div>
          )}
        />
      )}

      {selected && <CaregiverDrawer caregiver={selected} onClose={() => setSelected(null)} onChange={setSelected} />}
    </>
  );
}
