"use client";

import { CalendarDays, ChevronRight, Clock3, Repeat } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useNow } from "@shared/hooks/use-now";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import { Badge } from "@shared/ui/badge";
import { Avatar } from "@shared/ui/misc";
import type { PatientProfile } from "@shared/caregiver-types";
import type { CustomerBookingListItem, PublicCaregiver } from "@shared/customer-types";
import { BOOKING_TONE, bookingDisplayStatus } from "@/features/customer/lib/labels";

/** Booking summary for lists. */
export function BookingCard({
  booking,
  caregiver,
  patient,
}: {
  booking: CustomerBookingListItem;
  caregiver?: PublicCaregiver;
  patient?: PatientProfile;
}) {
  const t = useTranslations("customerB.bookingCard");
  const f = useFmt();
  const L = useLabels();
  const now = useNow(60_000);
  const active = booking.visits.filter((v) => v.status !== "CANCELLED" && v.status !== "DECLINED");
  const done = active.filter((v) => v.status === "COMPLETED").length;
  const name = caregiver?.user.fullName ?? t("caregiverFallback");
  return (
    <Link
      href={`/customer/bookings/${booking.id}`}
      className="group flex h-full flex-col rounded-2xl border border-ink-100 bg-white p-5 shadow-card transition-colors hover:border-brand-300"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={name} />
          <div className="min-w-0">
            <p className="truncate font-bold text-ink-900">{name}</p>
            <p className="truncate text-sm text-ink-500">
              {t("serviceFor", { service: L.specialty(booking.serviceType), patient: patient?.name ?? t("patientFallback") })}
            </p>
          </div>
        </div>
        <Badge tone={BOOKING_TONE[bookingDisplayStatus(booking)]} dot>
          {L.bookingCustomer(bookingDisplayStatus(booking))}
        </Badge>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2 text-sm text-ink-700 sm:grid-cols-2">
        <p className="flex items-start gap-2">
          {booking.recurrenceRule ? <Repeat className="mt-0.5 size-4 shrink-0 text-ink-400" /> : <CalendarDays className="mt-0.5 size-4 shrink-0 text-ink-400" />}
          <span>
            {booking.recurrenceRule ? (
              <>
                {f.weekdays(booking.recurrenceRule.weekdays)} · {f.relativeDay(booking.startDate, now)} → {f.relativeDay(booking.endDate, now)}
              </>
            ) : (
              f.relativeDay(booking.startDate, now)
            )}
          </span>
        </p>
        <p className="flex items-center gap-2">
          <Clock3 className="size-4 shrink-0 text-ink-400" />
          <span className="tabular">{f.timeWindow(booking.timeWindowStart, booking.timeWindowEnd)}</span>
        </p>
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-xs text-ink-500">
        <span>{active.length > 1 ? t("visitsDone", { done, total: active.length }) : active.length === 1 ? t("oneVisit") : t("noActiveVisits")}</span>
        <ChevronRight className="rtl:-scale-x-100 size-4 text-ink-300 group-hover:text-brand-600" />
      </div>
    </Link>
  );
}
