"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { CreditCard } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PageHeader } from "@shared/page-header";
import { Badge, type Tone } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import { Card } from "@shared/ui/card";
import { DataTable } from "@shared/ui/data-table";
import { Avatar, EmptyState, ErrorState } from "@shared/ui/misc";
import { Select } from "@shared/ui/select";
import { CAN_ADMIN_PAYMENTS, paymentsApi } from "@/features/admin/lib/api/admin";
import { useAction } from "@/features/admin/lib/api/hooks";
import { saveBlob } from "@shared/api/http";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import type { PaymentStatus } from "@shared/caregiver-types";
import type { AdminPayment } from "@shared/types";

const LIMIT = 10;
const TONE: Record<PaymentStatus, Tone> = { PAID: "success", PENDING: "warning", FAILED: "danger", REFUNDED: "neutral" };
const STATUSES: PaymentStatus[] = ["PAID", "PENDING", "FAILED", "REFUNDED"];

/** FR-A admin payments ledger — GET /admin/payments (?status=, page, limit). No server-side method filter. */
export default function AdminPaymentsPage() {
  const t = useTranslations("adminB.payments");
  const f = useFmt();
  const L = useLabels();
  const [status, setStatus] = useState<PaymentStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);

  const list = useQuery({
    queryKey: ["admin-payments", "list", status, page],
    queryFn: () => paymentsApi.list({ page, limit: LIMIT, ...(status === "ALL" ? {} : { status }) }),
    enabled: CAN_ADMIN_PAYMENTS,
  });

  const receipt = useAction(
    async (id: string) => {
      const { blob, filename } = await paymentsApi.receipt(id);
      saveBlob(blob, filename);
    },
    { invalidate: [], success: null },
  );

  const columns: ColumnDef<AdminPayment, unknown>[] = [
    {
      id: "payer",
      header: t("columns.payer"),
      accessorFn: (p) => p.visit.booking.customer.fullName,
      cell: ({ row }) => {
        const b = row.original.visit.booking;
        return (
          <div className="flex items-center gap-3">
            <Avatar name={b.customer.fullName} size="sm" />
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink-900">{b.customer.fullName}</p>
              <p className="text-xs text-ink-500">{t("forPatient", { name: b.patient.name })}</p>
            </div>
          </div>
        );
      },
    },
    {
      id: "caregiver",
      header: t("columns.caregiver"),
      meta: { className: "hidden md:table-cell" },
      accessorFn: (p) => p.visit.booking.caregiver.user.fullName,
      cell: ({ getValue }) => <span className="text-ink-700">{getValue() as string}</span>,
    },
    {
      id: "date",
      header: t("columns.date"),
      meta: { className: "hidden sm:table-cell" },
      accessorFn: (p) => p.paidAt ?? p.createdAt,
      cell: ({ row }) => <span className="text-ink-700">{f.date((row.original.paidAt ?? row.original.createdAt).slice(0, 10))}</span>,
    },
    {
      id: "method",
      header: t("columns.method"),
      meta: { className: "hidden sm:table-cell" },
      accessorFn: (p) => p.method,
      cell: ({ row }) => <span className="text-ink-700">{L.paymentMethod(row.original.method)}</span>,
    },
    {
      id: "amount",
      header: t("columns.amount"),
      accessorFn: (p) => p.amount,
      cell: ({ row }) => <span dir="ltr" className="tabular font-bold text-ink-900">{f.money(row.original.amount)}</span>,
    },
    {
      id: "status",
      header: t("columns.status"),
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Badge tone={TONE[row.original.status]} dot>
            {L.paymentStatus(row.original.status)}
          </Badge>
          {row.original.status === "PAID" && (
            <Button size="sm" variant="ghost" loading={receipt.isPending && receipt.variables === row.original.id} onClick={() => receipt.mutate(row.original.id)}>
              {t("receipt")}
            </Button>
          )}
        </div>
      ),
    },
  ];

  if (!CAN_ADMIN_PAYMENTS) {
    return (
      <>
        <PageHeader title={t("title")} description={t("description")} />
        <Card>
          <EmptyState icon={CreditCard} title={t("pendingTitle")} description={t("pendingHint")} />
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
            <Select<PaymentStatus | "ALL">
              className="w-40"
              isSearchable={false}
              value={status}
              onChange={(v) => {
                if (v) {
                  setStatus(v);
                  setPage(1);
                }
              }}
              options={[{ value: "ALL", label: t("allStatuses") }, ...STATUSES.map((s) => ({ value: s, label: L.paymentStatus(s) }))]}
            />
          )}
        />
      )}
    </>
  );
}
