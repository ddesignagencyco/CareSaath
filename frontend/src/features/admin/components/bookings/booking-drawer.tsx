"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  Clock,
  ExternalLink,
  FileText,
  MapPin,
  Phone,
  Mail,
  User,
  HeartPulse,
  Zap,
  Stethoscope,
  ChevronRight,
  AlertCircle,
  FileQuestion,
  Tag,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { formatMoney } from "@shared/lib/format";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import { VisitStatusBadge } from "@shared/status";
import { Badge, type Tone } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import { Drawer } from "@shared/ui/overlay";
import { ErrorState, Skeleton } from "@shared/ui/misc";
import { UserAvatar } from "@shared/ui/user-avatar";
import { adminBookingsApi } from "@/features/admin/lib/api/admin";
import { keys } from "@/features/admin/lib/api/hooks";
import type { BookingStatus } from "@shared/types";

const BOOKING_TONE: Record<BookingStatus, Tone> = {
  REQUESTED: "neutral",
  CONFIRMED: "neutral",
  COMPLETED: "success",
  DECLINED: "danger",
  CANCELLED: "danger",
};

export function BookingDrawer({
  bookingId,
  onClose,
  onSelectVisit,
}: {
  bookingId: string;
  onClose: () => void;
  onSelectVisit?: (visitId: string) => void;
}) {
  const t = useTranslations("adminB.operations");
  const f = useFmt();
  const L = useLabels();

  const query = useQuery({
    queryKey: [...keys.bookings, "detail", bookingId],
    queryFn: () => adminBookingsApi.getBooking(bookingId),
  });

  const b = query.data;

  return (
    <Drawer
      open
      onClose={onClose}
      title={b ? `Booking #${b.id.slice(0, 8)}` : "Loading booking..."}
      subtitle={
        b ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={BOOKING_TONE[b.status]} dot>
              {L.bookingCaregiver(b.status)}
            </Badge>
            {b.isImmediate && (
              <Badge tone="danger">
                <Zap className="size-3" /> ASAP
              </Badge>
            )}
            <Badge tone="neutral">{L.specialty(b.serviceType)}</Badge>
          </div>
        ) : undefined
      }
    >
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !b ? (
        <div className="space-y-4">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-36 rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-6 text-sm">
          {/* Cancellation Alert */}
          {(b.status === "CANCELLED" || b.cancelledAt) && (
            <div className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-danger-900">
              <p className="flex items-center gap-1.5 font-bold">
                <AlertCircle className="size-4 text-danger-600" /> Cancelled Booking
              </p>
              <p className="mt-1 text-xs text-danger-700">
                {b.cancelledAt && <span>Cancelled {f.dateTime(b.cancelledAt)}. </span>}
                {b.cancelReason ? <span>Reason: &ldquo;{b.cancelReason}&rdquo;</span> : "No cancellation reason provided."}
              </p>
            </div>
          )}

          {/* Customer & Patient */}
          <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-sm">
            <h4 className="flex items-center gap-1.5 font-bold text-ink-900">
              <User className="size-4 text-brand-600" /> Customer & Patient
            </h4>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Customer</p>
                <div className="flex items-center gap-2.5">
                  <UserAvatar userId={b.customer.id} name={b.customer.fullName} size="sm" />
                  <div>
                    <p className="font-semibold text-ink-900">{b.customer.fullName}</p>
                    <a
                      href={`tel:${b.customer.phone}`}
                      className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline"
                    >
                      <Phone className="size-3" /> {b.customer.phone}
                    </a>
                    {b.customer.email && (
                      <a
                        href={`mailto:${b.customer.email}`}
                        className="block truncate text-xs text-ink-500 hover:underline"
                      >
                        <Mail className="inline size-3 mr-1" />
                        {b.customer.email}
                      </a>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Patient</p>
                <div>
                  <p className="font-semibold text-ink-900">{b.patient.name}</p>
                  <p className="text-xs text-ink-500">
                    Relationship: <span className="font-medium text-ink-700">{b.patient.relationship}</span>
                  </p>
                  {b.patient.gender && (
                    <p className="text-xs text-ink-500">
                      Gender: <span className="font-medium text-ink-700">{b.patient.gender}</span>
                    </p>
                  )}
                  {b.patient.medicalContext && (
                    <div className="mt-2 rounded-lg bg-ink-50 p-2 text-xs text-ink-700">
                      <p className="font-medium text-ink-900 flex items-center gap-1">
                        <HeartPulse className="size-3 text-brand-600" /> Medical Context:
                      </p>
                      <p className="mt-0.5 leading-relaxed">{b.patient.medicalContext}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Assigned Caregiver */}
          <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-sm">
            <h4 className="flex items-center gap-1.5 font-bold text-ink-900">
              <Stethoscope className="size-4 text-brand-600" /> Assigned Caregiver
            </h4>
            <div className="mt-3 flex items-start gap-3">
              <UserAvatar userId={b.caregiver.user.id} name={b.caregiver.user.fullName} size="md" />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-ink-900">{b.caregiver.user.fullName}</p>
                  <Badge tone="info">{L.specialty(b.caregiver.specialty)}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-ink-500">
                  {b.caregiver.experienceYears !== null && b.caregiver.experienceYears !== undefined && (
                    <span>{b.caregiver.experienceYears} yrs exp</span>
                  )}
                  {b.caregiver.licenseBody && (
                    <span>License: {b.caregiver.licenseBody} {b.caregiver.licenseNumber ?? ""}</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <a
                    href={`tel:${b.caregiver.user.phone}`}
                    className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline"
                  >
                    <Phone className="size-3" /> {b.caregiver.user.phone}
                  </a>
                  {b.caregiver.user.email && (
                    <a
                      href={`mailto:${b.caregiver.user.email}`}
                      className="inline-flex items-center gap-1 text-xs text-ink-500 hover:underline"
                    >
                      <Mail className="size-3" /> {b.caregiver.user.email}
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Service Address */}
          <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-sm">
            <h4 className="flex items-center gap-1.5 font-bold text-ink-900">
              <MapPin className="size-4 text-brand-600" /> Service Location
            </h4>
            <div className="mt-2.5 space-y-1">
              {b.address.label && <p className="text-xs font-semibold text-brand-700">{b.address.label}</p>}
              <p className="text-sm text-ink-800">{b.address.addressLine}</p>
              <p className="text-xs text-ink-500">{b.address.city}</p>
              {b.address.latitude && b.address.longitude && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${b.address.latitude},${b.address.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
                >
                  <ExternalLink className="size-3" /> Open in Google Maps
                </a>
              )}
            </div>
          </div>

          {/* Schedule & Financials */}
          <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-sm">
            <h4 className="flex items-center gap-1.5 font-bold text-ink-900">
              <CalendarDays className="size-4 text-brand-600" /> Schedule & Pricing
            </h4>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-ink-50 p-2.5">
                <span className="block text-[11px] font-semibold uppercase text-ink-400">Start Date</span>
                <span className="font-semibold text-ink-900">{f.date(b.startDate)}</span>
              </div>
              <div className="rounded-xl bg-ink-50 p-2.5">
                <span className="block text-[11px] font-semibold uppercase text-ink-400">End Date</span>
                <span className="font-semibold text-ink-900">{f.date(b.endDate)}</span>
              </div>
              <div className="rounded-xl bg-ink-50 p-2.5">
                <span className="block text-[11px] font-semibold uppercase text-ink-400">Time Window</span>
                <span className="tabular font-semibold text-ink-900">
                  {f.timeWindow(b.timeWindowStart, b.timeWindowEnd)}
                </span>
              </div>
              <div className="rounded-xl bg-ink-50 p-2.5">
                <span className="block text-[11px] font-semibold uppercase text-ink-400">Rate / Visit</span>
                <span className="tabular font-semibold text-ink-900">{formatMoney(b.rateSnapshot)}</span>
              </div>
            </div>

            {(b.discountAmount > 0 || b.promoCode) && (
              <div className="mt-3 flex items-center justify-between rounded-xl bg-accent-50/70 p-3 text-xs text-accent-800">
                <span className="flex items-center gap-1.5 font-medium">
                  <Tag className="size-3.5" /> Promo / Discount Applied:
                </span>
                <span className="tabular font-bold">
                  -{formatMoney(b.discountAmount)} {b.promoCode ? `(${b.promoCode.code})` : ""}
                </span>
              </div>
            )}
          </div>

          {/* Associated Visits */}
          <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h4 className="flex items-center gap-1.5 font-bold text-ink-900">
                <Clock className="size-4 text-brand-600" /> Visits ({b.visits?.length ?? 0})
              </h4>
            </div>
            <div className="mt-3 divide-y divide-ink-100">
              {(!b.visits || b.visits.length === 0) ? (
                <p className="text-xs text-ink-500">No visits scheduled for this booking.</p>
              ) : (
                b.visits.map((v) => (
                  <div
                    key={v.id}
                    className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink-900">{f.date(v.scheduledDate)}</span>
                        <span className="tabular text-xs text-ink-500">
                          {f.timeWindow(v.timeWindowStart, v.timeWindowEnd)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
                        {v.checkInAt && <span>In: {f.dateTime(v.checkInAt)}</span>}
                        {v.checkOutAt && <span>Out: {f.dateTime(v.checkOutAt)}</span>}
                        {v.note && <span className="italic text-brand-700">Has Clinical Note</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <VisitStatusBadge status={v.status} />
                      {onSelectVisit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onSelectVisit(v.id)}
                          className="text-xs"
                        >
                          View Visit <ChevronRight className="size-3.5 rtl:-scale-x-100" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Attached Prescriptions */}
          {b.prescriptions && b.prescriptions.length > 0 && (
            <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-sm">
              <h4 className="flex items-center gap-1.5 font-bold text-ink-900">
                <FileText className="size-4 text-brand-600" /> Attached Prescriptions ({b.prescriptions.length})
              </h4>
              <ul className="mt-3 space-y-2">
                {b.prescriptions.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between rounded-xl bg-ink-50 p-2.5 text-xs text-ink-700"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <FileQuestion className="size-4 text-ink-400 shrink-0" />
                      <span className="truncate">{p.fileKey.split("/").pop()}</span>
                    </span>
                    <span className="text-ink-400 shrink-0">{f.date(p.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
