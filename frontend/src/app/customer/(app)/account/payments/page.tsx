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
import { DetailList, EmptyState, ErrorState, FilterTabs, Pagination, Skeleton, TableSkeleton } from "@shared/ui/misc";
import { Modal } from "@shared/ui/overlay";
import type { PaymentMethod, PaymentStatus } from "@shared/caregiver-types";
import type { CustomerPayment } from "@shared/customer-types";
import { paymentsApi } from "@/features/customer/lib/api/customer";
import { keys } from "@/features/customer/lib/api/keys";

const ICON: Record<PaymentMethod, React.ComponentType<{ className?: string }>> = {
  CASH: Banknote,
  CARD: CreditCard,
  JAZZCASH: Smartphone,
  EASYPAISA: Smartphone,
};
const TONE: Record<PaymentStatus, "success" | "accent" | "danger" | "neutral"> = { PAID: "success", PENDING: "accent", FAILED: "danger", REFUNDED: "neutral" };
const STATUSES = ["ALL", "PAID", "PENDING", "FAILED", "REFUNDED"] as const;
const LIMIT = 15;

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
  return (
    <Modal
      open
      onClose={onClose}
      title={tr("title")}
      description={p ? t("visitFor", { patient: p.visit.booking.patient.name }) : undefined}
      footer={
        p && (
          <Link href={`/customer/visits/${p.visitId}`} className="text-sm font-semibold text-brand-700 hover:underline">
            {tr("viewVisit")}
          </Link>
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

export default function PaymentsPage() {
  const t = useTranslations("customerB.payments");
  const f = useFmt();
  const L = useLabels();
  const statusText = useStatusText();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("ALL");
  const [viewing, setViewing] = useState<string | null>(null);
  const list = useQuery({
    queryKey: [...keys.payments, "page", status, page],
    queryFn: () => paymentsApi.list({ page, limit: LIMIT, status: status === "ALL" ? undefined : status }),
  });
  return (
    <>
      <Link href="/customer/account" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900">
        <ArrowLeft className="rtl:-scale-x-100 size-4" /> {t("back")}
      </Link>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="mb-4">
        <FilterTabs
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={STATUSES.map((s) => ({ value: s, label: s === "ALL" ? t("all") : L.paymentStatus(s) }))}
        />
      </div>
      <Card>
        {list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : !list.data ? (
          <TableSkeleton />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={Wallet} title={t("emptyTitle")} description={t("emptyHint")} />
        ) : (
          <>
            <ul className="divide-y divide-ink-100">
              {list.data.items.map((p) => {
                const Icon = ICON[p.method];
                return (
                  <li key={p.id}>
                    <button onClick={() => setViewing(p.id)} className="flex w-full items-center gap-4 px-5 py-4 text-start hover:bg-ink-25">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                        <Icon className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-ink-900">{t("visitFor", { patient: p.visit.booking.patient.name })}</p>
                        <p className="text-xs text-ink-500">
                          {f.date(p.visit.scheduledDate.slice(0, 10))} · {L.paymentMethod(p.method)}
                        </p>
                      </div>
                      <div className="text-end">
                        <p className="tabular font-bold text-ink-900">{formatMoney(p.amount)}</p>
                        <Badge tone={TONE[p.status]}>{statusText(p)}</Badge>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
            <Pagination page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={setPage} />
          </>
        )}
      </Card>
      {viewing && <Receipt id={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}
