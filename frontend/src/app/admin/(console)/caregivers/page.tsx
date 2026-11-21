"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { FileWarning, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CaregiverDrawer } from "@/features/admin/components/caregivers/caregiver-drawer";
import { PageHeader } from "@shared/page-header";
import { UserStatusBadge, VerificationBadge } from "@shared/status";
import { Card } from "@shared/ui/card";
import { DataTable } from "@shared/ui/data-table";
import { Input } from "@shared/ui/field";
import { ErrorState } from "@shared/ui/misc";
import { UserAvatar } from "@shared/ui/user-avatar";
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const idParam = searchParams?.get("id") ?? searchParams?.get("caregiverId") ?? "";
  const qParam = searchParams?.get("q") ?? "";
  const [status, setStatus] = useState<VerificationStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AdminCaregiver | null>(null);
  const [qInput, setQInput] = useState(qParam);
  const q = useDebouncedValue(qInput.trim());

  useEffect(() => {
    setQInput(searchParams?.get("q") ?? "");
  }, [searchParams]);

  const list = useQuery({
    queryKey: [...keys.caregivers, "list", status, q, page, idParam],
    queryFn: () =>
      caregiversApi.list({
        ...(status === "ALL" ? {} : { status }),
        ...(idParam ? { id: idParam } : {}),
        ...(q ? { q } : {}),
        page,
        limit: LIMIT,
      }),
  });

  useEffect(() => {
    if (idParam && list.data?.items?.length) {
      const match = list.data.items.find((c) => c.id === idParam || c.user.id === idParam);
      if (match) {
        setSelected(match);
      }
    }
  }, [idParam, list.data?.items]);

  const clearIdFilter = () => {
    router.replace("/admin/caregivers");
  };

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
            <UserAvatar userId={c.user.id} name={c.user.fullName} />
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
                <Input
                  value={qInput}
                  onChange={(e) => {
                    setQInput(e.target.value);
                    setPage(1);
                    if (idParam) router.replace("/admin/caregivers");
                  }}
                  placeholder={t("searchPlaceholder")}
                />
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
              {idParam && (
                <button
                  type="button"
                  onClick={clearIdFilter}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-800 transition-colors hover:bg-brand-100"
                  title="Clear ID filter and show all caregivers"
                >
                  <span>Filtered caregiver</span>
                  <X className="size-3.5 text-brand-600" />
                </button>
              )}
            </div>
          )}
        />
      )}

      {selected && (
        <CaregiverDrawer
          caregiver={selected}
          onClose={() => {
            setSelected(null);
            if (idParam) {
              router.replace("/admin/caregivers");
            }
          }}
          onChange={setSelected}
        />
      )}
    </>
  );
}
