"use client";

/** Where Stripe Checkout sends the customer back to (PAYMENT_RETURN_URL). */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useEffect } from "react";
import { Logo } from "@shared/brand";
import { LocaleProvider } from "@shared/i18n/provider";
import { formatMoney } from "@shared/lib/format";
import { Button } from "@shared/ui/button";
import { paymentsApi } from "@/features/customer/lib/api/customer";
import { keys } from "@/features/customer/lib/api/keys";

function ReturnInner() {
  const t = useTranslations("customerB.paymentReturn");
  const params = useSearchParams();
  const cancelled = params.get("status") === "cancelled";
  const paymentId = params.get("paymentId");

  // Settle straight from Stripe on return (fallback to the webhook: covers a delayed or lost
  // `checkout.session.completed`). Idempotent; poll a few times for async methods, then stop.
  const payment = useQuery({
    queryKey: [...keys.payments, "return", paymentId],
    queryFn: () => paymentsApi.confirmStripe(paymentId!),
    enabled: !!paymentId && !cancelled,
    refetchInterval: (q) => (q.state.data?.status === "PENDING" && q.state.dataUpdateCount < 12 ? 1500 : false),
  });

  // Once settled, refresh the shared payments caches so bookings/visits drop the "payment due" state.
  const qc = useQueryClient();
  const settled = payment.data?.status === "PAID";
  useEffect(() => {
    if (settled) qc.invalidateQueries({ queryKey: keys.payments });
  }, [settled, qc]);

  const bookingId = payment.data?.visit.bookingId;
  const bookingHref = bookingId ? `/customer/bookings/${bookingId}` : "/customer/bookings";

  const state: "cancelled" | "paid" | "confirming" | "unknown" = cancelled
    ? "cancelled"
    : payment.data?.status === "PAID"
      ? "paid"
      : payment.data?.status === "PENDING"
        ? "confirming"
        : paymentId
          ? "confirming"
          : "unknown";

  const view = {
    cancelled: { Icon: XCircle, tone: "text-danger-600 bg-danger-50", title: t("cancelledTitle"), body: t("cancelledBody") },
    paid: { Icon: CheckCircle2, tone: "text-success-700 bg-success-50", title: t("paidTitle"), body: t("paidBody") },
    confirming: { Icon: Clock, tone: "text-accent-700 bg-accent-50", title: t("confirmingTitle"), body: t("confirmingBody") },
    unknown: { Icon: Clock, tone: "text-ink-600 bg-ink-50", title: t("genericTitle"), body: t("genericBody") },
  }[state];

  return (
    <main className="grid min-h-dvh place-items-center bg-ink-25 p-4">
      <div className="w-full max-w-md rounded-3xl border border-ink-100 bg-white p-8 text-center shadow-card">
        <div className="mb-6 flex justify-center">
          <Logo subtitle="CareSaath" />
        </div>
        <span className={`mx-auto flex size-16 items-center justify-center rounded-full ${view.tone}`}>
          <view.Icon className={`size-8 ${state === "confirming" ? "animate-pulse" : ""}`} />
        </span>
        <h1 className="mt-5 text-2xl font-extrabold text-ink-900">{view.title}</h1>
        <p className="mt-2 text-ink-500">{view.body}</p>

        {state === "paid" && payment.data && (
          <p className="tabular mt-4 text-lg font-bold text-ink-900">
            {t("amount")}: {formatMoney(payment.data.amount)}
          </p>
        )}

        <div className="mt-8 flex flex-col gap-3">
          <Link href={bookingHref}>
            <Button className="w-full">{state === "cancelled" ? t("tryAgain") : t("viewBooking")}</Button>
          </Link>
          <Link href="/customer/bookings" className="text-sm font-semibold text-brand-700 hover:underline">
            {t("myBookings")}
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function PaymentReturnPage() {
  // Honour the customer's chosen language; useSearchParams needs Suspense.
  return (
    <LocaleProvider storageKey="caresaath.customer.locale">
      <Suspense>
        <ReturnInner />
      </Suspense>
    </LocaleProvider>
  );
}
