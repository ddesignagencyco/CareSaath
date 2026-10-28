"use client";

import { ArrowLeft, BadgeCheck, Briefcase, CalendarCheck2, Clock3, MapPin, ShieldCheck, Siren } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import { formatMoney } from "@shared/lib/format";
import { Card, CardBody, CardHeader } from "@shared/ui/card";
import { Avatar, ErrorState, Skeleton } from "@shared/ui/misc";
import { Rating, useCaregiver } from "@/features/customer/components/caregiver-bits";

/** Monday-first display; availability uses 0 = Sunday … 6 = Saturday. */
const DAYS = [1, 2, 3, 4, 5, 6, 0];

export default function CaregiverProfilePage() {
  const { id } = useParams<{ id: string }>();
  const c = useCaregiver(id);
  const t = useTranslations("customerA.profile");
  const f = useFmt();
  const L = useLabels();

  if (c.isError) {
    return (
      <Card>
        <ErrorState error={c.error} onRetry={() => c.refetch()} />
      </Card>
    );
  }
  const p = c.data;

  return (
    <div className="space-y-5 pb-20 lg:pb-0">
      <Link href="/customer/caregivers" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900">
        <ArrowLeft className="rtl:-scale-x-100 size-4" /> {t("back")}
      </Link>

      {!p ? (
        <Skeleton className="h-80 rounded-2xl" />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-5">
            <Card className="p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <Avatar name={p.user.fullName} src={p.photoUrl} size="lg" />
                <div className="min-w-0 flex-1">
                  <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">{p.user.fullName}</h1>
                  <p className="text-ink-500">{L.specialty(p.specialty)}</p>
                  <div className="mt-2">
                    <Rating average={p.ratingAverage} count={p.ratingCount} />
                  </div>
                </div>
                <div className="sm:text-end">
                  <p className="tabular text-2xl font-extrabold text-ink-900">{formatMoney(p.ratePerVisit)}</p>
                  <p className="text-xs text-ink-500">{t("perVisit")}</p>
                </div>
              </div>

              <div className="mt-5 flex items-start gap-3 rounded-xl border border-brand-100 bg-brand-50/60 p-4">
                <BadgeCheck className="mt-0.5 size-5 shrink-0 text-brand-600" />
                <div className="text-sm">
                  <p className="font-bold text-ink-900">{t("licenseVerified")}</p>
                  <p className="text-ink-600">{L.licenseBody(p.licenseBody)}</p>
                </div>
              </div>

              <dl className="mt-5 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                {p.experienceYears !== null && (
                  <div className="flex items-center gap-2.5 text-ink-700">
                    <Briefcase className="size-4 text-ink-400" />
                    <dd>{t("experience", { years: p.experienceYears })}</dd>
                  </div>
                )}
                <div className="flex items-center gap-2.5 text-ink-700">
                  <MapPin className="size-4 text-ink-400" />
                  <dd>{t("cities", { cities: f.list(p.serviceArea.cities) })}</dd>
                </div>
              </dl>

              {p.bio && (
                <div className="mt-5">
                  <p className="mb-1.5 text-xs font-bold tracking-wide text-ink-500 uppercase">{t("about")}</p>
                  <p dir="auto" className="text-sm leading-relaxed text-ink-800">{p.bio}</p>
                </div>
              )}
            </Card>

            <Card>
              <CardHeader title={t("weeklyHours")} description={t("weeklyHoursHint")} />
              <CardBody>
                <ul className="divide-y divide-ink-100">
                  {DAYS.map((dow) => {
                    const wins = p.availabilityRules.filter((r) => r.dayOfWeek === dow);
                    return (
                      <li key={dow} className="flex items-center gap-4 py-2.5 text-sm">
                        <span className="w-12 font-semibold text-ink-800">{f.dayOfWeek(dow)}</span>
                        {wins.length === 0 ? (
                          <span className="text-ink-400">{t("notAvailable")}</span>
                        ) : (
                          <span className="flex flex-wrap gap-2">
                            {wins.map((w) => (
                              <span key={w.startTime} className="tabular inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-800">
                                <Clock3 className="size-3" /> {f.timeWindow(w.startTime, w.endTime)}
                              </span>
                            ))}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </CardBody>
            </Card>
          </div>

          <div className="space-y-5">
            <Card className="hidden p-5 lg:block">
              <p className="text-sm text-ink-600">{t("bookHint", { name: p.user.fullName.split(" ")[0] })}</p>
              <Link
                href={`/customer/caregivers/${p.id}/book`}
                className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 font-semibold text-white shadow-card hover:bg-brand-700"
              >
                <CalendarCheck2 className="size-4" /> {t("bookVisit")}
              </Link>
            </Card>
            <Card>
              <CardHeader title={t("safeTitle")} />
              <CardBody>
                <ul className="space-y-3 text-sm text-ink-700">
                  <li className="flex gap-3">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" /> {t("safety.identity")}
                  </li>
                  <li className="flex gap-3">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-brand-600" /> {t("safety.notified")}
                  </li>
                  <li className="flex gap-3">
                    <Siren className="mt-0.5 size-4 shrink-0 text-brand-600" /> {t("safety.sos")}
                  </li>
                </ul>
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {p && (
        <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 border-t border-ink-100 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <Link
            href={`/customer/caregivers/${p.id}/book`}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 font-semibold text-white shadow-card"
          >
            <CalendarCheck2 className="size-4" /> {t("bookMobile", { name: p.user.fullName.split(" ")[0], price: formatMoney(p.ratePerVisit) })}
          </Link>
        </div>
      )}
    </div>
  );
}
