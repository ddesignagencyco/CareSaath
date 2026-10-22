"use client";

import clsx from "clsx";
import { ChevronRight, MapPin, Repeat } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@shared/ui/badge";
import type { CaregiverVisitListItem } from "@shared/caregiver-types";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import { useNow } from "@shared/hooks/use-now";
import { ACTIVE_STATUSES, VISIT_TONE, visitStart } from "@shared/lib/visit";

/** One visit in a schedule list. */
export function VisitRow({ visit, className }: { visit: CaregiverVisitListItem; className?: string }) {
  const now = useNow(60_000);
  const t = useTranslations("caregiverA.visitRow");
  const f = useFmt();
  const L = useLabels();
  const active = ACTIVE_STATUSES.includes(visit.status);
  // Still CONFIRMED after its window ended: never started.
  const overdue = visit.status === "CONFIRMED" && !!now && visitStart(visit.scheduledDate, visit.timeWindowEnd) < now;
  return (
    <Link
      href={`/caregiver/visits/${visit.id}`}
      className={clsx(
        "group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-brand-50/40 sm:px-5",
        active && "bg-brand-50/60",
        className,
      )}
    >
      <div className="w-16 shrink-0 text-center">
        <p className="tabular text-sm font-extrabold text-ink-900">{f.time(visit.timeWindowStart).replace(" ", " ")}</p>
        <p className="text-[11px] text-ink-500">{t("to", { time: f.time(visit.timeWindowEnd) })}</p>
      </div>
      <div className={clsx("h-10 w-1 shrink-0 rounded-full", active ? "bg-accent-500" : visit.status === "COMPLETED" ? "bg-success-600" : "bg-brand-300")} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-ink-900">{visit.booking.patient.name}</p>
        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-500">
          <MapPin className="size-3 shrink-0" />
          <span dir="auto" className="truncate">
            {visit.booking.address.addressLine}, {visit.booking.address.city}
          </span>
        </p>
        <p className="mt-1 flex items-center gap-2 text-xs text-ink-500">
          {L.specialty(visit.booking.serviceType)}
          {visit.booking.type === "RECURRING" && (
            <span className="inline-flex items-center gap-0.5">
              <Repeat className="size-3" /> {t("recurring")}
            </span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {overdue ? (
          <Badge tone="danger" dot>
            {t("notStarted")}
          </Badge>
        ) : (
          <span className="hidden sm:block">
            <Badge tone={VISIT_TONE[visit.status]} dot>
              {L.visitCaregiver(visit.status)}
            </Badge>
          </span>
        )}
        <ChevronRight className="rtl:-scale-x-100 size-4 text-ink-300 group-hover:text-ink-600" />
      </div>
    </Link>
  );
}
