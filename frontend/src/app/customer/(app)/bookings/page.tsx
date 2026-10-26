"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { CalendarCheck2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@shared/page-header";
import { Card } from "@shared/ui/card";
import { EmptyState, ErrorState, FilterTabs, Skeleton } from "@shared/ui/misc";
import { BookingCard } from "@/features/customer/components/booking-card";
import { useCaregiverMap } from "@/features/customer/components/caregiver-bits";
import { bookingsApi, patientsApi, paymentsApi } from "@/features/customer/lib/api/customer";
import { keys } from "@/features/customer/lib/api/keys";

type Tab = "active" | "waiting" | "past";

export default function BookingsPage() {
  const t = useTranslations("customerB.bookings");
  const [tab, setTab] = useState<Tab>("active");
  const list = useQuery({ queryKey: [...keys.bookings, "all"], queryFn: () => bookingsApi.list({ limit: 100 }), refetchInterval: 30_000 });
  const patients = useQuery({ queryKey: keys.patients, queryFn: patientsApi.list });
  const payments = useQuery({ queryKey: [...keys.payments, "list"], queryFn: () => paymentsApi.list({ limit: 100 }) });
  const all = list.data?.items ?? [];
  const caregivers = useCaregiverMap(all.map((b) => b.caregiverId));

  // A booking has payment due if a done visit has no settled payment.
  const paidVisitIds = new Set((payments.data?.items ?? []).filter((p) => p.status === "PAID").map((p) => p.visitId));
  const hasPaymentDue = (b: (typeof all)[number]) =>
    b.visits.some((v) => (v.status === "COMPLETED" || v.status === "CHECKED_OUT") && !paidVisitIds.has(v.id));

  // A booking is "past" once all its visits are done (the backend may also set BookingStatus COMPLETED).
  const finished = (b: (typeof all)[number]) =>
    b.visits.length > 0 && b.visits.every((v) => ["COMPLETED", "CANCELLED", "DECLINED"].includes(v.status));
  const groups: Record<Tab, typeof all> = {
    active: all.filter((b) => b.status === "CONFIRMED" && !finished(b)),
    waiting: all.filter((b) => b.status === "REQUESTED"),
    past: all.filter((b) => b.status === "DECLINED" || b.status === "CANCELLED" || b.status === "COMPLETED" || (b.status === "CONFIRMED" && finished(b))),
  };
  const shown = groups[tab];

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="mb-4">
        <FilterTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "active", label: t("tabActive"), count: list.data ? groups.active.length : undefined },
            { value: "waiting", label: t("tabWaiting"), count: list.data ? groups.waiting.length : undefined },
            { value: "past", label: t("tabPast") },
          ]}
        />
      </div>
      {list.isError ? (
        <Card>
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        </Card>
      ) : !list.data ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarCheck2}
            title={tab === "waiting" ? t("emptyWaiting") : tab === "active" ? t("emptyActive") : t("emptyPast")}
            description={tab === "past" ? undefined : t("emptyHint")}
          />
          {tab !== "past" && (
            <div className="-mt-8 pb-8 text-center">
              <Link href="/customer/caregivers" className="text-sm font-semibold text-brand-700 hover:underline">
                {t("findCare")}
              </Link>
            </div>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {shown.map((b) => (
            <BookingCard key={b.id} booking={b} caregiver={caregivers[b.caregiverId]} patient={patients.data?.find((p) => p.id === b.patientId)} paymentDue={hasPaymentDue(b)} />
          ))}
        </div>
      )}
    </>
  );
}
