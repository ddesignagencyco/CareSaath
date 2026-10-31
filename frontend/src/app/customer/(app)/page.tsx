"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowRight, Bandage, HeartHandshake, Navigation, Siren, Stethoscope, UserPlus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useNow } from "@shared/hooks/use-now";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import { dayKey, localDayKey, visitStart } from "@shared/lib/visit";
import { Badge } from "@shared/ui/badge";
import { Card } from "@shared/ui/card";
import { Avatar, Skeleton } from "@shared/ui/misc";
import type { Specialty } from "@shared/types";
import { useCaregiverMap } from "@/features/customer/components/caregiver-bits";
import { bookingsApi, patientsApi } from "@/features/customer/lib/api/customer";
import { keys } from "@/features/customer/lib/api/keys";
import { useMe } from "@/features/customer/lib/auth";
import { ACTIVE_VISIT, VISIT_TONE } from "@/features/customer/lib/labels";

const SERVICES: { specialty: Specialty; icon: React.ComponentType<{ className?: string }> }[] = [
  { specialty: "NURSING", icon: Stethoscope },
  { specialty: "PHYSIOTHERAPY", icon: Activity },
  { specialty: "POST_SURGERY_CARE", icon: Bandage },
  { specialty: "ELDERLY_CARE", icon: HeartHandshake },
  { specialty: "DOCTOR", icon: Stethoscope },
];

function period(now: number) {
  if (!now) return "welcome";
  const h = new Date(now).getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

export default function CustomerHome() {
  const now = useNow(60_000);
  const t = useTranslations("customerA.home");
  const tEmer = useTranslations("customerA.emergency");
  const f = useFmt();
  const L = useLabels();
  const me = useMe();
  const bookings = useQuery({ queryKey: [...keys.bookings, "all"], queryFn: () => bookingsApi.list({ limit: 50 }), refetchInterval: 30_000 });
  const patients = useQuery({ queryKey: keys.patients, queryFn: patientsApi.list });
  const all = bookings.data?.items ?? [];
  const caregivers = useCaregiverMap(all.map((b) => b.caregiverId));
  const patientName = (id: string) => patients.data?.find((p) => p.id === id)?.name ?? "";

  const visits = all
    .filter((b) => b.status === "CONFIRMED" || b.status === "REQUESTED")
    .flatMap((b) => b.visits.map((v) => ({ v, b })));
  const active = visits.find(({ v }) => ACTIVE_VISIT.includes(v.status));
  const today = now ? localDayKey(now) : "";
  const upcoming = visits
    .filter(({ v }) => (v.status === "CONFIRMED" || v.status === "REQUESTED") && now && dayKey(v.scheduledDate) >= today && visitStart(v.scheduledDate, v.timeWindowEnd) > now)
    .sort((a, b) => visitStart(a.v.scheduledDate, a.v.timeWindowStart) - visitStart(b.v.scheduledDate, b.v.timeWindowStart))
    .slice(0, 4);
  // Gate the name on `now` (0 during SSR + the first hydration render, like useNow) so the
  // server and first client render both show the neutral greeting — the name appears once mounted.
  const firstName = now ? me.data?.fullName.split(" ")[0] : undefined;
  const noPatients = patients.data && patients.data.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
          {firstName ? t("greetingNamed", { period: period(now), name: firstName }) : t("greeting", { period: period(now) })}
        </h1>
        <p className="mt-1 text-ink-500">{t("subtitle")}</p>
      </div>

      {active && (
        <Link href={`/customer/visits/${active.v.id}`} className="flex items-center gap-4 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-800 p-4 text-white shadow-pop transition-transform active:scale-[0.99]">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/15">
            <Navigation className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold tracking-wide text-white/80 uppercase">{L.visitCustomer(active.v.status)}</span>
            <span className="block truncate font-bold">
              {caregivers[active.b.caregiverId]?.user.fullName ?? t("yourCaregiver")} · {patientName(active.b.patientId)}
            </span>
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-bold">
            {t("track")} <ArrowRight className="rtl:-scale-x-100 size-4" />
          </span>
        </Link>
      )}

      <Link
        href="/customer/emergency"
        className="flex items-center gap-4 rounded-2xl border border-ink-200 bg-white p-4 shadow-card transition-colors hover:border-danger-300 active:scale-[0.99]"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-danger-600 text-white">
          <Siren className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-ink-900">{tEmer("cta")}</span>
          <span className="block text-sm text-ink-500">{tEmer("ctaHint")}</span>
        </span>
        <ArrowRight className="rtl:-scale-x-100 size-5 shrink-0 text-danger-600" />
      </Link>

      {noPatients && (
        <Card className="flex flex-col gap-4 border-brand-200 bg-brand-50/50 p-5 sm:flex-row sm:items-center">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
            <UserPlus className="size-6" />
          </span>
          <div className="flex-1">
            <p className="font-bold text-ink-900">{t("firstTime.title")}</p>
            <p className="text-sm text-ink-600">{t("firstTime.text")}</p>
          </div>
          <Link href="/customer/account/patients" className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700">
            {t("firstTime.cta")}
          </Link>
        </Card>
      )}

      <section>
        <h2 className="mb-3 font-bold text-ink-900">{t("servicesTitle")}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {SERVICES.map(({ specialty, icon: Icon }) => (
            <Link
              key={specialty}
              href={`/customer/caregivers?specialty=${specialty}`}
              className="group flex h-full flex-col rounded-2xl border border-ink-100 bg-white p-4 shadow-card transition-colors hover:border-brand-300"
            >
              <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-white">
                <Icon className="size-5" />
              </span>
              <span className="mt-3 font-bold text-ink-900">{L.specialty(specialty)}</span>
              <span className="text-xs text-ink-500">{t(`services.${specialty}`)}</span>
            </Link>
          ))}
        </div>
      </section>

      <Card>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="font-bold text-ink-900">{t("upcomingTitle")}</h2>
          <Link href="/customer/bookings" className="text-sm font-semibold text-brand-700 hover:underline">
            {t("allBookings")}
          </Link>
        </div>
        {!bookings.data || !now ? (
          <Skeleton className="mx-5 mb-5 h-24" />
        ) : upcoming.length === 0 ? (
          <div className="px-5 pb-6">
            <p className="text-sm text-ink-500">{t("noUpcoming")}</p>
            <Link href="/customer/caregivers" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
              {t("findCaregiver")} <ArrowRight className="rtl:-scale-x-100 size-4" />
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-ink-100 border-t border-ink-100">
            {upcoming.map(({ v, b }) => {
              const cg = caregivers[b.caregiverId];
              return (
                <li key={v.id}>
                  <Link href={`/customer/visits/${v.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-brand-50/40">
                    <div className="w-20 shrink-0">
                      <p className="text-sm font-bold text-ink-900">{f.relativeDay(v.scheduledDate, now)}</p>
                      <p className="tabular text-xs text-ink-500">{f.time(v.timeWindowStart)}</p>
                    </div>
                    <Avatar name={cg?.user.fullName ?? "?"} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink-900">{cg?.user.fullName ?? t("caregiverFallback")}</p>
                      <p className="flex items-center gap-1 truncate text-xs text-ink-500">
                        {t("forPatient", { specialty: L.specialty(b.serviceType), patient: patientName(b.patientId) })}
                      </p>
                    </div>
                    <span className="hidden sm:block">
                      <Badge tone={VISIT_TONE[v.status]} dot>
                        {L.visitCustomer(v.status)}
                      </Badge>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

    </div>
  );
}
