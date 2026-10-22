"use client";

import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck2,
  Scale,
  ShieldAlert,
  UserCheck,
  Wallet,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PageHeader } from "@shared/page-header";
import { Card, CardBody, CardHeader } from "@shared/ui/card";
import { ErrorState, FilterTabs, Skeleton } from "@shared/ui/misc";
import { analyticsApi, disputesApi, payoutsApi, safetyApi } from "@/features/admin/lib/api/admin";
import { keys } from "@/features/admin/lib/api/hooks";
import { formatCompactMoney, formatMoney, formatPercent } from "@shared/lib/format";
import type { AnalyticsOverview, AnalyticsRange, BookingStatus } from "@shared/types";

const RANGES: AnalyticsRange[] = ["7d", "30d", "90d", "all"];

const BOOKING_ORDER: BookingStatus[] = ["REQUESTED", "CONFIRMED", "COMPLETED", "DECLINED", "CANCELLED"];

function Stat({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-ink-500">{label}</p>
        <span className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Icon className="size-4" />
        </span>
      </div>
      <p className="tabular mt-2 text-3xl font-extrabold tracking-tight text-ink-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </Card>
  );
}

function BookingsByStatus({ data }: { data: AnalyticsOverview["bookings"] }) {
  const t = useTranslations("adminA.dashboard");
  const max = Math.max(1, ...BOOKING_ORDER.map((s) => data.byStatus[s] ?? 0));
  return (
    <ul className="space-y-3" aria-label={t("byStatus.title")}>
      {BOOKING_ORDER.map((status) => {
        const count = data.byStatus[status] ?? 0;
        const share = data.total ? count / data.total : 0;
        const label = t(`bookingStatus.${status}`);
        return (
          <li key={status} className="group grid grid-cols-[96px_1fr_auto] items-center gap-3 text-sm">
            <span className="font-medium text-ink-600">{label}</span>
            <div className="h-6 rounded-e bg-ink-50" title={t("barTitle", { status: label, count, share: formatPercent(share) })}>
              <div
                className="h-full rounded-e bg-brand-500 transition-[width] duration-500 group-hover:bg-brand-600"
                style={{ width: `${(count / max) * 100}%`, minWidth: count ? 4 : 0 }}
              />
            </div>
            <span className="tabular w-20 text-end">
              <b className="text-ink-900">{count.toLocaleString()}</b>{" "}
              <span className="text-xs text-ink-400">{formatPercent(share, 0)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function RevenueSplit({ data }: { data: AnalyticsOverview }) {
  const gross = data.payments.grossRevenue;
  const commission = data.payments.commissionRevenue;
  const caregiverShare = gross - commission;
  const t = useTranslations("adminA.dashboard.revenue");
  const rows = [
    { label: t("gross"), value: gross, note: t("grossNote", { count: data.payments.paidCount.toLocaleString() }) },
    { label: t("platformCommission"), value: commission, note: gross ? t("takeRate", { rate: formatPercent(commission / gross) }) : "—" },
    { label: t("caregiverShare"), value: caregiverShare, note: t("caregiverShareNote") },
    { label: t("paidOut"), value: data.payouts.paidOut, note: t("paidOutNote") },
  ];
  return (
    <div className="space-y-5">
      <div>
        <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={t("barAria")}>
          <div className="bg-accent-500" style={{ width: `${gross ? (commission / gross) * 100 : 0}%` }} />
          <div className="flex-1 bg-brand-500" />
        </div>
        <div className="mt-2 flex justify-between text-xs text-ink-500">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-accent-500" /> {t("commission")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-brand-500" /> {t("caregiverShare")}
          </span>
        </div>
      </div>
      <dl className="divide-y divide-ink-100">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-4 py-2.5">
            <dt>
              <p className="text-sm font-semibold text-ink-800">{r.label}</p>
              <p className="text-xs text-ink-500">{r.note}</p>
            </dt>
            <dd className="tabular text-sm font-bold text-ink-900">{formatMoney(r.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function AttentionRow({
  href,
  icon: Icon,
  label,
  count,
  tone,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number | undefined;
  tone: "danger" | "accent" | "brand";
}) {
  return (
    <Link href={href} className="group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-ink-50">
      <span
        className={clsx("flex size-9 items-center justify-center rounded-lg", {
          "bg-danger-50 text-danger-600": tone === "danger",
          "bg-accent-50 text-accent-700": tone === "accent",
          "bg-brand-50 text-brand-600": tone === "brand",
        })}
      >
        <Icon className="size-[18px]" />
      </span>
      <span className="flex-1 text-sm font-semibold text-ink-800">{label}</span>
      <span className="tabular text-lg font-extrabold text-ink-900">{count ?? "–"}</span>
      <ArrowRight className="rtl:-scale-x-100 size-4 text-ink-300 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 group-hover:text-ink-600" />
    </Link>
  );
}

export default function OverviewPage() {
  const t = useTranslations("adminA.dashboard");
  const [range, setRange] = useState<AnalyticsRange>("30d");
  const overview = useQuery({ queryKey: [...keys.analytics, range], queryFn: () => analyticsApi.overview(range) });
  const critical = useQuery({
    queryKey: [...keys.incidents, "count", "OPEN", "CRITICAL"],
    queryFn: () => safetyApi.list({ status: "OPEN", priority: "CRITICAL", limit: 1 }),
  });
  const openIncidents = useQuery({
    queryKey: [...keys.incidents, "count", "OPEN"],
    queryFn: () => safetyApi.list({ status: "OPEN", limit: 1 }),
  });
  const disputes = useQuery({
    queryKey: [...keys.disputes, "count", "OPEN"],
    queryFn: () => disputesApi.list({ status: "OPEN", limit: 1 }),
  });
  const payouts = useQuery({
    queryKey: [...keys.payouts, "count", "REQUESTED"],
    queryFn: () => payoutsApi.list({ status: "REQUESTED", limit: 1 }),
  });

  const d = overview.data;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={<FilterTabs value={range} onChange={setRange} options={RANGES.map((value) => ({ value, label: t(`ranges.${value}`) }))} />}
      />

      {overview.isError ? (
        <Card>
          <ErrorState error={overview.error} onRetry={() => overview.refetch()} />
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {!d ? (
              Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[126px] rounded-2xl" />)
            ) : (
              <>
                <Stat label={t("stats.grossRevenue")} value={formatCompactMoney(d.payments.grossRevenue)} hint={t("stats.commissionEarned", { amount: formatCompactMoney(d.payments.commissionRevenue) })} icon={Wallet} />
                <Stat label={t("stats.bookings")} value={d.bookings.total.toLocaleString()} hint={t("stats.visitsCompleted", { count: d.visits.completed.toLocaleString() })} icon={CalendarCheck2} />
                <Stat
                  label={t("stats.cancellationRate")}
                  value={formatPercent(d.bookings.cancellationRate)}
                  hint={t("stats.bookingsCancelled", { count: (d.bookings.byStatus.CANCELLED ?? 0).toLocaleString() })}
                  icon={XCircle}
                />
                <Stat label={t("stats.activeCaregivers")} value={d.caregivers.active.toLocaleString()} hint={t("stats.awaitingVerification", { count: d.caregivers.pendingVerification })} icon={BadgeCheck} />
              </>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title={t("byStatus.title")} description={d ? t("byStatus.description", { count: d.bookings.total.toLocaleString() }) : undefined} />
              <CardBody>{d ? <BookingsByStatus data={d.bookings} /> : <Skeleton className="h-44" />}</CardBody>
            </Card>

            <Card>
              <CardHeader title={t("attention.title")} description={t("attention.description")} />
              <div className="p-2">
                <AttentionRow href="/admin/safety" icon={ShieldAlert} label={t("attention.critical")} count={critical.data?.total} tone="danger" />
                <AttentionRow href="/admin/safety" icon={ShieldAlert} label={t("attention.openIncidents")} count={openIncidents.data?.total} tone="danger" />
                <AttentionRow href="/admin/caregivers" icon={UserCheck} label={t("attention.toVerify")} count={d?.caregivers.pendingVerification} tone="accent" />
                <AttentionRow href="/admin/disputes" icon={Scale} label={t("attention.disputes")} count={disputes.data?.total} tone="accent" />
                <AttentionRow href="/admin/payouts" icon={Wallet} label={t("attention.payouts")} count={payouts.data?.total} tone="brand" />
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title={t("revenue.title")} description={t("revenue.description")} />
            <CardBody>{d ? <RevenueSplit data={d} /> : <Skeleton className="h-56" />}</CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
