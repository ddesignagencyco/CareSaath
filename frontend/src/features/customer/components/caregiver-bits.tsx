"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { BadgeCheck, Briefcase, ChevronRight, MapPin, Star } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatMoney } from "@shared/lib/format";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import { Avatar } from "@shared/ui/misc";
import type { CaregiverSearchItem, PublicCaregiver } from "@shared/customer-types";
import { caregiversApi } from "@/features/customer/lib/api/customer";
import { keys } from "@/features/customer/lib/api/keys";

export function Stars({ value, size = "sm", className }: { value: number; size?: "sm" | "lg"; className?: string }) {
  const t = useTranslations("customerA.bits");
  return (
    <span className={clsx("inline-flex items-center gap-0.5", className)} aria-label={t("starsAria", { value: value.toFixed(1) })}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={clsx(size === "lg" ? "size-5" : "size-3.5", i < Math.round(value) ? "fill-accent-500 text-accent-500" : "fill-ink-100 text-ink-200")}
        />
      ))}
    </span>
  );
}

export function Rating({ average, count }: { average: string; count: number }) {
  const t = useTranslations("customerA.bits");
  if (count === 0) return <span className="text-xs font-semibold text-brand-700">{t("newOn")}</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-600">
      <Stars value={Number(average)} />
      <b className="tabular text-ink-900">{Number(average).toFixed(1)}</b>
      <span className="text-ink-400">({count})</span>
    </span>
  );
}

export function VerifiedTag({ className }: { className?: string }) {
  const t = useTranslations("customerA.bits");
  return (
    <span className={clsx("inline-flex items-center gap-1 text-xs font-semibold text-brand-700", className)}>
      <BadgeCheck className="size-3.5" /> {t("verified")}
    </span>
  );
}

/** Search result card. */
export function CaregiverCard({ c }: { c: CaregiverSearchItem }) {
  const t = useTranslations("customerA.bits");
  const L = useLabels();
  const f = useFmt();
  return (
    <Link
      href={`/customer/caregivers/${c.id}`}
      className="group flex h-full flex-col rounded-2xl border border-ink-100 bg-white p-5 shadow-card transition-colors hover:border-brand-300"
    >
      <div className="flex items-start gap-3">
        <Avatar name={c.user.fullName} src={c.photoUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-ink-900">{c.user.fullName}</p>
          <p className="text-sm text-ink-500">{L.specialty(c.specialty)}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <VerifiedTag />
            <Rating average={c.ratingAverage} count={c.ratingCount} />
          </div>
        </div>
      </div>
      {c.bio && <p dir="auto" className="mt-3 line-clamp-2 text-sm text-ink-600">{c.bio}</p>}
      <div className="mt-auto flex items-end justify-between gap-3 pt-4">
        <div className="space-y-1 text-xs text-ink-500">
          {c.experienceYears !== null && (
            <p className="flex items-center gap-1.5">
              <Briefcase className="size-3.5" /> {t("experience", { n: c.experienceYears })}
            </p>
          )}
          <p className="flex items-center gap-1.5">
            <MapPin className="size-3.5" /> {f.list(c.serviceArea.cities)}
          </p>
        </div>
        <div className="flex items-center gap-1 text-end">
          <div>
            <p className="tabular text-lg font-extrabold text-ink-900">{formatMoney(c.ratePerVisit)}</p>
            <p className="text-[11px] text-ink-500">{t("perVisit")}</p>
          </div>
          <ChevronRight className="rtl:-scale-x-100 size-4 text-ink-300 group-hover:text-brand-600" />
        </div>
      </div>
    </Link>
  );
}

export function useCaregiver(id: string | undefined) {
  return useQuery({ queryKey: [...keys.caregivers, "profile", id], queryFn: () => caregiversApi.get(id!), enabled: !!id, staleTime: 5 * 60_000 });
}

/** Public profiles for a set of caregiver ids (bookings only carry the id). */
export function useCaregiverMap(ids: string[]): Record<string, PublicCaregiver | undefined> {
  const unique = [...new Set(ids)];
  const results = useQueries({
    queries: unique.map((id) => ({
      queryKey: [...keys.caregivers, "profile", id],
      queryFn: () => caregiversApi.get(id),
      staleTime: 5 * 60_000,
    })),
  });
  return Object.fromEntries(unique.map((id, i) => [id, results[i].data]));
}
