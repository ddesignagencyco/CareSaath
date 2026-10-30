"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Banknote, CreditCard, Smartphone, Wallet } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import { formatMoney } from "@shared/lib/format";
import { PageHeader } from "@shared/page-header";
import { Badge } from "@shared/ui/badge";
import { Card } from "@shared/ui/card";
import { DetailList, EmptyState, ErrorState, Skeleton } from "@shared/ui/misc";
import { DataTable } from "@shared/ui/data-table";
import { Select } from "@shared/ui/select";
import type { ColumnDef } from "@tanstack/react-table";
import { Modal } from "@shared/ui/overlay";
import { Button } from "@shared/ui/button";
import { useAction } from "@shared/api/use-action";
import { saveBlob } from "@shared/api/http";
import type { PaymentMethod, PaymentStatus } from "@shared/caregiver-types";
import type { CustomerPayment, CustomerPaymentWithVisit } from "@shared/customer-types";
import { paymentsApi } from "@/features/customer/lib/api/customer";
import { keys } from "@/features/customer/lib/api/keys";

const ICON: Record<PaymentMethod, React.ComponentType<{ className?: string }>> = {
  CASH: Banknote,
  CARD: CreditCard,
  JAZZCASH: Smartphone,
  EASYPAISA: Smartphone,
};
const TONE: Record<PaymentStatus, "success" | "accent" | "danger" | "neutral"> = { PAID: "success", PENDING: "accent", FAILED: "danger", REFUNDED: "neutral" };
const PAYMENT_STATUSES: PaymentStatus[] = ["PAID", "PENDING", "FAILED", "REFUNDED"];

/** Status text: a pending cash payment is "cash due"; a pending card/wallet one awaits the gateway. */
function useStatusText() {
  const t = useTranslations("customerB.payments");
  const L = useLabels();
  return (p: Pick<CustomerPayment, "status" | "method">) =>
    p.status === "PENDING" ? (p.method === "CASH" ? t("cashDue") : t("awaitingGateway")) : L.paymentStatus(p.status);
}

/** In-app receipt (GET /customer/payments/:id). */
function Receipt({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations("customerB.payments");
  const tr = useTranslations("customerB.payments.receipt");
  const f = useFmt();
  const L = useLabels();
  const statusText = useStatusText();
  const q = useQuery({ queryKey: [...keys.payments, "detail", id], queryFn: () => paymentsApi.get(id) });
  const p = q.data;
  const download = useAction(
    async () => {
      const { blob, filename } = await paymentsApi.receipt(id);
      saveBlob(blob, filename);
    },
    { invalidate: [], success: null },
  );
  return (
    <Modal
      open
      onClose={onClose}
      title={tr("title")}
      description={p ? t("visitFor", { patient: p.visit.booking.patient.name }) : undefined}
      footer={
        p && (
          <div className="flex items-center justify-between gap-3">
            <Link href={`/customer/visits/${p.visitId}`} className="text-sm font-semibold text-brand-700 hover:underline">
              {tr("viewVisit")}
            </Link>
            {p.status === "PAID" && (
              <Button variant="secondary" loading={download.isPending} onClick={() => download.mutate(undefined)}>
                {tr("downloadPdf")}
              </Button>
            )}
          </div>
        )
      }
    >
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !p ? (
        <Skeleton className="h-48" />
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-ink-25 p-4">
            <div>
              <p className="text-xs font-bold tracking-wide text-ink-500 uppercase">{tr("amount")}</p>
              <p className="tabular text-2xl font-extrabold text-ink-900">{formatMoney(p.amount)}</p>
            </div>
            <Badge tone={TONE[p.status]}>{statusText(p)}</Badge>
          </div>
          <DetailList
            items={[
              { label: tr("method"), value: L.paymentMethod(p.method) },
              { label: tr("visitDate"), value: f.date(p.visit.scheduledDate.slice(0, 10)) },
              { label: tr("caregiverShare"), value: <span className="tabular">{formatMoney(p.caregiverAmount)}</span> },
              { label: tr("commission"), value: <span className="tabular">{formatMoney(p.commissionAmount)}</span> },
              {
                label: tr("reference"),
                value: p.gatewayRef ? (
                  <span className="tabular font-mono text-xs break-all" dir="ltr">
                    {p.gatewayRef}
                  </span>
                ) : (
                  <span className="text-ink-400">{tr("noReference")}</span>
                ),
              },
              { label: tr("paidAt"), value: p.paidAt ? f.dateTime(p.paidAt) : <span className="text-ink-400">{tr("notPaidYet")}</span> },
              { label: tr("createdAt"), value: f.dateTime(p.createdAt) },
              {
                label: tr("receiptNo"),
                value: (
                  <span className="tabular font-mono text-xs break-all" dir="ltr">
                    {p.id}
                  </span>
                ),
              },
            ]}
          />
          {p.status === "PENDING" && (
            <p className="rounded-xl bg-accent-50 p-3 text-xs text-accent-700">{p.method === "CASH" ? tr("pendingCash") : tr("pendingGateway")}</p>
          )}
        </div>
      )}
    </Modal>
  );
}

const LIMIT = 15;

export default function PaymentsPage() {
  const t = useTranslations("customerB.payments");
  const f = useFmt();
  const L = useLabels();
  const statusText = useStatusText();
  const [viewing, setViewing] = useState<string | null>(null);
  const [status, setStatus] = useState<PaymentStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: [...keys.payments, "all", status, page],
    queryFn: () => paymentsApi.list({ page, limit: LIMIT, ...(status === "ALL" ? {} : { status }) }),
  });

  const columns: ColumnDef<CustomerPaymentWithVisit, unknown>[] = [
    {
      id: "visit",
      header: t("columns.visit"),
      accessorFn: (p) => p.visit.booking.patient.name,
      cell: ({ row, getValue }) => {
        const Icon = ICON[row.original.method];
        return (
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Icon className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink-900">{t("visitFor", { patient: getValue() as string })}</p>
              <p className="text-xs text-ink-500 sm:hidden">
                {f.date(row.original.visit.scheduledDate.slice(0, 10))} · {L.paymentMethod(row.original.method)}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      id: "date",
      header: t("columns.date"),
      meta: { className: "hidden sm:table-cell" },
      accessorFn: (p) => p.visit.scheduledDate,
      cell: ({ row }) => <span className="text-ink-700">{f.date(row.original.visit.scheduledDate.slice(0, 10))}</span>,
    },
    {
      id: "method",
      header: t("columns.method"),
      meta: { className: "hidden md:table-cell" },
      accessorKey: "method",
      filterFn: "equalsString",
      cell: ({ row }) => <span className="text-ink-700">{L.paymentMethod(row.original.method)}</span>,
    },
    {
      id: "amount",
      header: t("columns.amount"),
      meta: { className: "text-end" },
      accessorKey: "amount",
      cell: ({ row }) => <span className="tabular font-bold text-ink-900">{formatMoney(row.original.amount)}</span>,
    },
    {
      id: "status",
      header: t("columns.status"),
      accessorKey: "status",
      filterFn: "equalsString",
      cell: ({ row }) => <Badge tone={TONE[row.original.status]}>{statusText(row.original)}</Badge>,
    },
  ];

  return (
    <>
      <Link href="/customer/account" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900">
        <ArrowLeft className="rtl:-scale-x-100 size-4" /> {t("back")}
      </Link>
      <PageHeader title={t("title")} description={t("description")} />
      {list.isError ? (
        <Card>
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        </Card>
      ) : list.data && list.data.items.length === 0 ? (
        <Card>
          <EmptyState icon={Wallet} title={t("emptyTitle")} description={t("emptyHint")} />
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={list.data?.items ?? []}
          loading={!list.data}
          emptyText={t("noResults")}
          onRowClick={(p) => setViewing(p.id)}
          serverPagination={list.data ? { page: list.data.page, limit: list.data.limit, total: list.data.total, onPageChange: setPage } : undefined}
          toolbar={() => (
            <Select<PaymentStatus | "ALL">
              className="w-40"
              value={status}
              isSearchable={false}
              onChange={(v) => {
                if (v) {
                  setStatus(v);
                  setPage(1);
                }
              }}
              options={[{ value: "ALL", label: t("all") }, ...PAYMENT_STATUSES.map((s) => ({ value: s, label: L.paymentStatus(s) }))]}
            />
          )}
        />
      )}
      {viewing && <Receipt id={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}
