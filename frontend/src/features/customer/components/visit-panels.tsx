"use client";

import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Banknote, Check, CreditCard, KeyRound, Smartphone, Star } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useAction } from "@shared/api/use-action";
import { useToast } from "@shared/ui/toast";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import { formatMoney } from "@shared/lib/format";
import { formatPkMobile } from "@shared/lib/phone";
import { Button } from "@shared/ui/button";
import { Field, Textarea } from "@shared/ui/field";
import { Modal } from "@shared/ui/overlay";
import { Select } from "@shared/ui/select";
import { DisputeStatusBadge } from "@shared/status";
import type { DisputeRow, PaymentMethod, VisitStatusHistory } from "@shared/caregiver-types";
import type { CustomerVisitDetail } from "@shared/customer-types";
import type { IncidentPriority, VisitStatus } from "@shared/types";
import { disputesApi, paymentsApi, visitsApi } from "@/features/customer/lib/api/customer";
import { keys } from "@/features/customer/lib/api/keys";

/* ---- Progress tracker ------------------------------------------------------ */

const TRACK: { key: "confirmed" | "onTheWay" | "arrived" | "care" | "done"; statuses: VisitStatus[] }[] = [
  { key: "confirmed", statuses: ["CONFIRMED"] },
  { key: "onTheWay", statuses: ["EN_ROUTE"] },
  { key: "arrived", statuses: ["CHECKED_IN"] },
  { key: "care", statuses: ["IN_PROGRESS", "CHECKED_OUT"] },
  { key: "done", statuses: ["COMPLETED"] },
];

function reachedAt(history: VisitStatusHistory[], statuses: VisitStatus[]) {
  return history.find((h) => statuses.includes(h.toStatus))?.at;
}

export function VisitTracker({ visit }: { visit: CustomerVisitDetail }) {
  const tr = useTranslations("customerB.tracker");
  const f = useFmt();
  const current = TRACK.findIndex((t) => t.statuses.includes(visit.status));
  if (current < 0) return null;
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label={tr("label")}>
      {TRACK.map((t, i) => {
        const done = i < current || visit.status === "COMPLETED";
        const now = i === current && visit.status !== "COMPLETED";
        const at = i === 0 ? null : reachedAt(visit.statusHistory, t.statuses);
        return (
          <li key={t.key} className="flex flex-col items-center gap-1.5 text-center" aria-current={now ? "step" : undefined}>
            <span className="flex w-full items-center">
              <span className={clsx("h-0.5 flex-1", i === 0 ? "invisible" : done || now ? "bg-brand-400" : "bg-ink-200")} />
              <span
                className={clsx(
                  "relative flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  done && "bg-brand-600 text-white",
                  now && "bg-accent-500 text-white ring-4 ring-accent-100",
                  !done && !now && "bg-ink-100 text-ink-400",
                )}
              >
                {done ? <Check className="size-4" /> : i + 1}
              </span>
              <span className={clsx("h-0.5 flex-1", i === TRACK.length - 1 ? "invisible" : done ? "bg-brand-400" : "bg-ink-200")} />
            </span>
            <span className={clsx("text-[11px] font-semibold sm:text-xs", done || now ? "text-ink-900" : "text-ink-400")}>{tr(t.key)}</span>
            {at && (
              <span className="tabular hidden text-[10px] text-ink-400 sm:block">
                {f.time(`${new Date(at).getHours()}:${String(new Date(at).getMinutes()).padStart(2, "0")}`)}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Explains the arrival code the caregiver may ask for (POST check-in-otp sends it to the customer). */
export function ArrivalCodeNotice({ phone }: { phone: string }) {
  const t = useTranslations("customerB.arrivalCode");
  return (
    <p className="flex items-start gap-3 rounded-xl bg-brand-50 p-4 text-sm text-brand-800">
      <KeyRound className="mt-0.5 size-4 shrink-0" />
      <span>
        {t.rich("notice", {
          phone: formatPkMobile(phone),
          b: (chunks) => <b>{chunks}</b>,
          num: (chunks) => <span className="tabular font-semibold">{chunks}</span>,
        })}
      </span>
    </p>
  );
}

/* ---- Payment ----------------------------------------------------------------- */

/**
 * Cash settles when the caregiver confirms receipt. Card opens Stripe Checkout:
 * the API returns { payment, checkoutUrl } and we redirect, settling via webhook.
 * JazzCash/Easypaisa stay disabled until their gateway integration lands.
 */
const METHODS: { value: PaymentMethod; icon: React.ComponentType<{ className?: string }>; available: boolean }[] = [
  { value: "CASH", icon: Banknote, available: true },
  { value: "CARD", icon: CreditCard, available: true },
  { value: "JAZZCASH", icon: Smartphone, available: false },
  { value: "EASYPAISA", icon: Smartphone, available: false },
];

/** Stripe refuses charges below ~US$0.50; the backend enforces PKR 140 (STRIPE_MIN_CHARGE_PKR). */
const STRIPE_MIN_PAISA = 14_000;

export function PaymentPanel({ visit }: { visit: CustomerVisitDetail }) {
  const t = useTranslations("customerB.payment");
  const tc = useTranslations("common.actions");
  const f = useFmt();
  const L = useLabels();
  const methodLabel = (m: PaymentMethod) => (m === "CASH" ? t("methodCash") : m === "CARD" ? t("methodCard") : L.paymentMethod(m));
  const methodDescription = (m: PaymentMethod) => (m === "CASH" ? t("methodCashHint") : m === "CARD" ? t("methodCardHint") : t("methodWalletHint"));
  const toast = useToast();
  const payments = useQuery({ queryKey: [...keys.payments, "list"], queryFn: () => paymentsApi.list({ limit: 100 }) });
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [open, setOpen] = useState(false);
  const amount = visit.booking.rateSnapshot - visit.booking.discountAmount;
  // Payment is due during the booking AND after it completes (esp. cash-on-visit),
  // so keep the pay option until it's paid — not only while CONFIRMED.
  const payable = (visit.booking.status === "CONFIRMED" || visit.booking.status === "COMPLETED") && visit.status !== "CANCELLED" && visit.status !== "DECLINED";
  const existing = payments.data?.items.find((p) => p.visitId === visit.id && (p.status === "PAID" || p.status === "PENDING"));

  const pay = useAction(() => paymentsApi.initiate({ visitId: visit.id, method }), {
    invalidate: [keys.payments],
    success: null,
    onSuccess: (res) => {
      // A gateway method returns a hosted-checkout URL — hand off to it.
      if ("checkoutUrl" in res) {
        toast.success(t("redirecting"));
        window.location.assign(res.checkoutUrl);
        return;
      }
      toast.success(res.status === "PAID" ? t("paidToast", { amount: formatMoney(res.amount) }) : res.method === "CASH" ? t("cashToast") : t("pendingToast"));
      setOpen(false);
    },
  });

  // Abandon a stuck PENDING gateway payment so the customer can pay another way.
  const abandon = useAction(() => paymentsApi.cancel(existing?.id ?? ""), {
    invalidate: [keys.payments],
    success: t("abandoned"),
  });

  // Phase 15: two-sided cash — the customer confirms they handed the money over.
  const confirmCash = useAction(() => paymentsApi.confirmCash(existing?.id ?? ""), {
    invalidate: [keys.payments],
    success: t("cashConfirmedToast"),
  });

  if (!payable && !existing) return null;

  return (
    <div className="rounded-xl border border-ink-100 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-wide text-ink-500 uppercase">{t("title")}</p>
          <p className="tabular text-lg font-extrabold text-ink-900">{formatMoney(existing?.amount ?? amount)}</p>
        </div>
        {payments.isLoading && !payments.data ? null : existing ? (
          existing.status === "PAID" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-50 px-3 py-1 text-sm font-semibold text-success-700">
              <Check className="size-4" /> {t("paidWith", { method: L.paymentMethod(existing.method) })}
            </span>
          ) : (
            <span className="rounded-full bg-accent-50 px-3 py-1 text-sm font-semibold text-accent-700">
              {existing.method === "CASH" ? t("cashDue") : t("awaitingGateway", { method: L.paymentMethod(existing.method) })}
            </span>
          )
        ) : (
          <Button onClick={() => setOpen(true)}>{t("payNow")}</Button>
        )}
      </div>
      {/* A PENDING non-cash payment blocks paying cash — let the customer abandon it. */}
      {existing?.status === "PENDING" && existing.method !== "CASH" && (
        <button
          type="button"
          onClick={() => abandon.mutate(undefined)}
          disabled={abandon.isPending}
          className="mt-2 text-sm font-semibold text-brand-700 hover:underline disabled:opacity-60"
        >
          {t("payAnotherWay")}
        </button>
      )}
      {existing?.status === "PAID" && existing.paidAt && <p className="mt-1 text-xs text-ink-500">{t("paidAt", { date: f.dateTime(existing.paidAt) })}</p>}

      {/* Two-sided cash: confirm handing the money over, then wait for the caregiver. */}
      {existing?.status === "PENDING" &&
        existing.method === "CASH" &&
        (existing.customerConfirmedAt ? (
          <p className="mt-2 text-sm text-ink-500">{t("cashWaitingCaregiver")}</p>
        ) : (
          <Button className="mt-2 w-full" variant="secondary" loading={confirmCash.isPending} onClick={() => confirmCash.mutate(undefined)}>
            {t("confirmCash")}
          </Button>
        ))}

      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title={t("modalTitle")}
          description={formatMoney(amount)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                {tc("cancel")}
              </Button>
              <Button loading={pay.isPending} onClick={() => pay.mutate(undefined)}>
                {method === "CASH" ? t("payCash") : t("payAmount", { amount: formatMoney(amount) })}
              </Button>
            </>
          }
        >
          <div className="space-y-2" role="radiogroup" aria-label={t("methodLabel")}>
            {METHODS.map(({ value, icon: Icon, available }) => {
              // Card needs the Stripe minimum; below it, disable with a hint instead of letting the backend reject.
              const belowMin = value === "CARD" && amount < STRIPE_MIN_PAISA;
              const isAvailable = available && !belowMin;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={method === value}
                  aria-disabled={!isAvailable}
                  disabled={!isAvailable}
                  onClick={() => setMethod(value)}
                  className={clsx(
                    "flex w-full items-center gap-3 rounded-xl border-2 p-3.5 text-start transition-colors",
                    !isAvailable && "cursor-not-allowed opacity-60",
                    method === value ? "border-brand-500 bg-brand-50/50" : "border-ink-100",
                    isAvailable && method !== value && "hover:border-ink-200",
                  )}
                >
                  <span className="flex size-10 items-center justify-center rounded-lg bg-white text-brand-600 ring-1 ring-ink-100">
                    <Icon className="size-5" />
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-bold text-ink-900">{methodLabel(value)}</span>
                    <span className="block text-xs text-ink-500">
                      {isAvailable ? methodDescription(value) : belowMin ? t("cardMinimum", { amount: formatMoney(STRIPE_MIN_PAISA) }) : t("comingSoon")}
                    </span>
                  </span>
                  <span className={clsx("size-5 rounded-full border-2", method === value ? "border-[6px] border-brand-600" : "border-ink-300")} />
                </button>
              );
            })}
            <p className="pt-1 text-xs text-ink-500">{t("gatewayNote")}</p>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---- Review -------------------------------------------------------------------- */

export function ReviewPanel({ visit, caregiverName }: { visit: CustomerVisitDetail; caregiverName: string }) {
  const t = useTranslations("customerB.review");
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const submit = useAction(() => visitsApi.review(visit.id, { rating, comment: comment.trim() || undefined }), {
    invalidate: [keys.visit, keys.caregivers],
    success: t("success"),
  });

  if (visit.review) {
    return (
      <div className="rounded-xl border border-accent-400/30 bg-accent-50/50 p-4">
        <p className="text-xs font-bold tracking-wide text-ink-500 uppercase">{t("yours")}</p>
        <p className="mt-1 flex items-center gap-0.5" aria-label={t("outOf5", { rating: visit.review.rating })}>
          {Array.from({ length: 5 }, (_, i) => (
            <Star key={i} className={clsx("size-5", i < visit.review!.rating ? "fill-accent-500 text-accent-500" : "text-ink-200")} />
          ))}
        </p>
        {visit.review.comment && <p dir="auto" className="mt-2 text-sm text-ink-800">&ldquo;{visit.review.comment}&rdquo;</p>}
      </div>
    );
  }
  if (visit.status !== "COMPLETED") return null;

  const shown = hover || rating;
  return (
    <div className="space-y-3 rounded-xl border border-ink-100 p-4">
      <p className="font-bold text-ink-900">{t("question", { name: caregiverName.split(" ")[0] })}</p>
      <div className="flex gap-1" role="radiogroup" aria-label={t("rating")} onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={t("stars", { n })}
            onMouseEnter={() => setHover(n)}
            onClick={() => setRating(n)}
            className="rounded-md p-0.5"
          >
            <Star className={clsx("size-8 transition-colors", n <= shown ? "fill-accent-500 text-accent-500" : "text-ink-200")} />
          </button>
        ))}
      </div>
      <Textarea aria-label={t("comment")} value={comment} maxLength={2000} rows={3} onChange={(e) => setComment(e.target.value)} placeholder={t("placeholder")} />
      <div className="flex justify-end">
        <Button disabled={rating === 0} loading={submit.isPending} onClick={() => submit.mutate(undefined)}>
          {t("submit")}
        </Button>
      </div>
    </div>
  );
}

/* ---- Concerns ------------------------------------------------------------------- */

const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const satisfies readonly IncidentPriority[];

export function ReportConcernDialog({ visitId, onClose }: { visitId: string; onClose: () => void }) {
  const t = useTranslations("customerB.concern");
  const tc = useTranslations("common.actions");
  const L = useLabels();
  const priorityOptions = PRIORITIES.map((value) => ({ value, label: L.priority(value), description: t(`priorityHint.${value}`) }));
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<IncidentPriority>("MEDIUM");
  const report = useAction(() => visitsApi.report(visitId, { description: description.trim(), priority }), {
    invalidate: [keys.visit],
    success: t("success"),
    onSuccess: onClose,
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={t("title")}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button loading={report.isPending} disabled={description.trim().length < 3} onClick={() => report.mutate(undefined)}>
            {t("send")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t("severity")}>{(id) => <Select inputId={id} value={priority} onChange={(v) => v && setPriority(v)} options={priorityOptions} />}</Field>
        <Field label={t("whatHappened")} required hint={`${description.length}/4000`}>
          {(id) => <Textarea id={id} value={description} maxLength={4000} rows={4} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
      </div>
    </Modal>
  );
}

export function DisputeDialog({ visitId, onClose }: { visitId: string; onClose: () => void }) {
  const t = useTranslations("customerB.dispute");
  const tc = useTranslations("common.actions");
  const [description, setDescription] = useState("");
  const raise = useAction(() => disputesApi.raise({ visitId, description: description.trim() }), {
    invalidate: [keys.disputes],
    success: t("success"),
    onSuccess: onClose,
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={t("title")}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button loading={raise.isPending} disabled={description.trim().length < 5} onClick={() => raise.mutate(undefined)}>
            {t("submit")}
          </Button>
        </>
      }
    >
      <Field label={t("label")} required hint={t("hint", { count: description.length })}>
        {(id) => <Textarea id={id} value={description} maxLength={4000} rows={5} onChange={(e) => setDescription(e.target.value)} />}
      </Field>
    </Modal>
  );
}

/* ---- My disputes (GET /disputes) ------------------------------------------------ */

/** Disputes raised by or against the customer; the API returns them all, unpaginated. */
export function useMyDisputes() {
  return useQuery({ queryKey: [...keys.disputes, "mine"], queryFn: disputesApi.list });
}

export function DisputeItems({ disputes, userId, linkVisits = false }: { disputes: DisputeRow[]; userId?: string; linkVisits?: boolean }) {
  const t = useTranslations("customerB.disputes");
  const f = useFmt();
  return (
    <ul className="space-y-3">
      {disputes.map((d) => (
        <li key={d.id} className="rounded-xl border border-ink-100 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-ink-500">
              {d.raisedById === userId ? t("raisedByYou", { date: f.dateTime(d.createdAt) }) : t("raisedAgainstYou", { date: f.dateTime(d.createdAt) })}
            </p>
            <DisputeStatusBadge status={d.status} />
          </div>
          <p dir="auto" className="mt-2 text-sm whitespace-pre-line text-ink-800">
            {d.description}
          </p>
          {d.status === "RESOLVED" && (
            <div className="mt-3 rounded-lg bg-success-50 p-3 text-sm text-success-700">
              <p className="text-xs font-bold">{d.resolvedAt ? t("resolvedAt", { date: f.dateTime(d.resolvedAt) }) : t("resolved")}</p>
              {d.resolutionNote && (
                <p dir="auto" className="mt-1">
                  {d.resolutionNote}
                </p>
              )}
            </div>
          )}
          {linkVisits && (
            <Link href={`/customer/visits/${d.visitId}`} className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline">
              {t("viewVisit")}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
