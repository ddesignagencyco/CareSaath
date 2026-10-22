"use client";

import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowRight, CalendarCheck2, Clock3, Inbox, MapPin, Navigation, Wallet } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@shared/ui/badge";
import { Card } from "@shared/ui/card";
import { EmptyState, ErrorState, Skeleton } from "@shared/ui/misc";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import { RespondCountdown } from "@shared/ui/respond-countdown";
import { VisitRow } from "@/features/caregiver/components/visit-row";
import { useNow } from "@shared/hooks/use-now";
import { bookingsApi, moneyApi, visitsApi } from "@/features/caregiver/lib/api/caregiver";
import { keys } from "@/features/caregiver/lib/api/keys";
import { useMe } from "@/features/caregiver/lib/auth";
import { ACTIVE_STATUSES, dayKey, localDayKey, mapsUrl, visitStart } from "@shared/lib/visit";

function greetingKey(now: number) {
  if (!now) return "welcome" as const;
  const h = new Date(now).getHours();
  return h < 12 ? ("morning" as const) : h < 17 ? ("afternoon" as const) : ("evening" as const);
}

export default function TodayPage() {
  const now = useNow(60_000);
  const me = useMe();
  const t = useTranslations("caregiverA.today");
  const f = useFmt();
  const L = useLabels();
  const visits = useQuery({ queryKey: [...keys.visits, "all"], queryFn: () => visitsApi.list({ limit: 100 }) });
  const requests = useQuery({ queryKey: [...keys.bookings, "list", "REQUESTED"], queryFn: () => bookingsApi.list({ status: "REQUESTED", limit: 20 }) });
  const earnings = useQuery({ queryKey: keys.earnings, queryFn: moneyApi.earnings });

  const today = now ? localDayKey(now) : null;
  const all = visits.data?.items ?? [];
  const active = all.find((v) => ACTIVE_STATUSES.includes(v.status));
  const todays = today ? all.filter((v) => dayKey(v.scheduledDate) === today && v.status !== "DECLINED" && v.status !== "CANCELLED") : [];
  const next = all
    .filter((v) => v.status === "CONFIRMED" && now && visitStart(v.scheduledDate, v.timeWindowEnd) > now)
    .sort((a, b) => visitStart(a.scheduledDate, a.timeWindowStart) - visitStart(b.scheduledDate, b.timeWindowStart))[0];
  const pending = requests.data?.items ?? [];
  const soonest = [...pending].sort((a, b) => a.respondBy.localeCompare(b.respondBy))[0];
  const firstName = me.data?.fullName.split(" ")[0];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-ink-500">
          {now ? f.longDay(localDayKey(now)) : " "}
        </p>
        <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
          {firstName
            ? t("greetingName", { greeting: t(`greeting.${greetingKey(now)}`), name: firstName })
            : t(`greeting.${greetingKey(now)}`)}
        </h1>
      </div>

      {active && (
        <Link
          href={`/caregiver/visits/${active.id}`}
          className="flex items-center gap-4 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-800 p-4 text-white shadow-pop transition-transform active:scale-[0.99]"
        >
          <span className="relative flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/15">
            <span className="absolute inset-0 animate-ping rounded-xl bg-white/20" aria-hidden />
            <Navigation className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold tracking-wide text-white/80 uppercase">{L.visitCaregiver(active.status)}</span>
            <span className="block truncate font-bold">{active.booking.patient.name}</span>
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-bold">
            {t("continue")} <ArrowRight className="rtl:-scale-x-100 size-4" />
          </span>
        </Link>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.4fr_1fr]">
        {/* Next visit */}
        <Card className="overflow-hidden">
          {visits.isError ? (
            <ErrorState error={visits.error} onRetry={() => visits.refetch()} />
          ) : !visits.data || !now ? (
            <Skeleton className="m-5 h-40" />
          ) : next ? (
            <div className="p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold tracking-wide text-brand-700 uppercase">{t("nextVisit")}</p>
                <Badge tone="brand">{f.relativeDay(next.scheduledDate, now)}</Badge>
              </div>
              <p className="mt-3 text-xl font-extrabold text-ink-900">{next.booking.patient.name}</p>
              <p className="text-sm text-ink-500">{L.specialty(next.booking.serviceType)}</p>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex items-center gap-2.5 text-ink-700">
                  <Clock3 className="size-4 text-ink-400" />
                  <dd className="tabular font-semibold">{f.timeWindow(next.timeWindowStart, next.timeWindowEnd)}</dd>
                </div>
                <div className="flex items-start gap-2.5 text-ink-700">
                  <MapPin className="mt-0.5 size-4 text-ink-400" />
                  <dd dir="auto">
                    {next.booking.address.addressLine}, {next.booking.address.city}
                  </dd>
                </div>
              </dl>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <a
                  href={mapsUrl(next.booking.address)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-ink-200 bg-white text-sm font-semibold text-ink-800 shadow-card hover:bg-ink-50"
                >
                  <Navigation className="size-4" /> {t("directions")}
                </a>
                <Link
                  href={`/caregiver/visits/${next.id}`}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-600 text-sm font-semibold text-white shadow-card hover:bg-brand-700"
                >
                  {t("openVisit")} <ArrowRight className="rtl:-scale-x-100 size-4" />
                </Link>
              </div>
            </div>
          ) : (
            <EmptyState icon={CalendarCheck2} title={t("noUpcoming")} description={t("noUpcomingHint")} />
          )}
        </Card>

        <div className="space-y-4">
          {/* Requests */}
          <Link href="/caregiver/requests" className="block">
            <Card className={clsx("p-5 transition-colors hover:border-accent-400/50", pending.length > 0 && "border-accent-400/40 bg-accent-50/50")}>
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-accent-100 text-accent-700">
                  <Inbox className="size-5" />
                </span>
                {soonest && <RespondCountdown respondBy={soonest.respondBy} />}
              </div>
              <p className="tabular mt-3 text-3xl font-extrabold text-ink-900">{requests.data ? pending.length : "–"}</p>
              <p className="text-sm font-semibold text-ink-600">
                {t("requestsWaiting", { count: pending.length })}
              </p>
            </Card>
          </Link>

          {/* Earnings */}
          <Link href="/caregiver/earnings" className="block">
            <Card className="p-5 transition-colors hover:border-brand-200">
              <div className="flex items-center justify-between">
                <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Wallet className="size-5" />
                </span>
                <ArrowRight className="rtl:-scale-x-100 size-4 text-ink-300" />
              </div>
              <p className="tabular mt-3 text-3xl font-extrabold text-ink-900">
                {earnings.data ? f.money(earnings.data.availableAmount) : "–"}
              </p>
              <p className="text-sm font-semibold text-ink-600">{t("availableToWithdraw")}</p>
            </Card>
          </Link>
        </div>
      </div>

      {/* Today's schedule */}
      <Card>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="font-bold text-ink-900">{t("schedule")}</h2>
          <Link href="/caregiver/visits" className="text-sm font-semibold text-brand-700 hover:underline">
            {t("allVisits")}
          </Link>
        </div>
        {!visits.data || !now ? (
          <Skeleton className="mx-5 mb-5 h-24" />
        ) : todays.length === 0 ? (
          <p className="px-5 pb-6 text-sm text-ink-500">{t("noVisitsToday")}</p>
        ) : (
          <div className="divide-y divide-ink-100 border-t border-ink-100">
            {todays.map((v) => (
              <VisitRow key={v.id} visit={v} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
