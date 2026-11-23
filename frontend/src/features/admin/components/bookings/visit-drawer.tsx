"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  Clock,
  ExternalLink,
  MapPin,
  Phone,
  User,
  Stethoscope,
  ChevronRight,
  AlertCircle,
  FileText,
  CreditCard,
  ShieldAlert,
  Compass,
  CheckCircle2,
} from "lucide-react";
import { formatMoney } from "@shared/lib/format";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import { VisitStatusBadge } from "@shared/status";
import { Badge } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import { Drawer } from "@shared/ui/overlay";
import { ErrorState, Skeleton } from "@shared/ui/misc";
import { UserAvatar } from "@shared/ui/user-avatar";
import { adminBookingsApi } from "@/features/admin/lib/api/admin";
import { keys } from "@/features/admin/lib/api/hooks";

export function VisitDrawer({
  visitId,
  onClose,
  onSelectBooking,
}: {
  visitId: string;
  onClose: () => void;
  onSelectBooking?: (bookingId: string) => void;
}) {
  const f = useFmt();
  const L = useLabels();

  const query = useQuery({
    queryKey: [...keys.visits, "detail", visitId],
    queryFn: () => adminBookingsApi.getVisit(visitId),
  });

  const v = query.data;

  return (
    <Drawer
      open
      onClose={onClose}
      title={v ? `Visit #${v.id.slice(0, 8)}` : "Loading visit..."}
      subtitle={
        v ? (
          <div className="flex flex-wrap items-center gap-2">
            <VisitStatusBadge status={v.status} />
            <span className="text-xs text-ink-500">
              {f.date(v.scheduledDate)} · {f.timeWindow(v.timeWindowStart, v.timeWindowEnd)}
            </span>
          </div>
        ) : undefined
      }
      footer={
        v && onSelectBooking ? (
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => onSelectBooking(v.booking.id)}
          >
            View Parent Booking #{v.booking.id.slice(0, 8)}
            <ChevronRight className="size-4 rtl:-scale-x-100" />
          </Button>
        ) : undefined
      }
    >
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !v ? (
        <div className="space-y-4">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-36 rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-6 text-sm">
          {/* Cancellation Alert */}
          {(v.status === "CANCELLED" || v.booking.cancelledAt) && (
            <div className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-danger-900">
              <p className="flex items-center gap-1.5 font-bold">
                <AlertCircle className="size-4 text-danger-600" /> Cancelled
              </p>
              <p className="mt-1 text-xs text-danger-700">
                {v.booking.cancelledAt && <span>Cancelled {f.dateTime(v.booking.cancelledAt)}. </span>}
                {v.booking.cancelReason
                  ? <span>Reason: &ldquo;{v.booking.cancelReason}&rdquo;</span>
                  : "No cancellation reason provided."}
              </p>
            </div>
          )}

          {/* Check-in & Check-out Status */}
          <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-sm">
            <h4 className="flex items-center gap-1.5 font-bold text-ink-900">
              <Compass className="size-4 text-brand-600" /> Check-in & Check-out
            </h4>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-ink-50 p-3">
                <p className="text-[11px] font-semibold uppercase text-ink-400">Check-in</p>
                {v.checkInAt ? (
                  <div className="mt-1 space-y-1">
                    <p className="font-semibold text-ink-900">{f.dateTime(v.checkInAt)}</p>
                    <div className="flex items-center gap-2 text-xs text-ink-600">
                      <Badge tone="info">{v.checkInMethod ?? "GPS"}</Badge>
                      {v.checkInLat && v.checkInLng && (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${v.checkInLat},${v.checkInLng}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 text-brand-700 hover:underline"
                        >
                          <ExternalLink className="size-3" /> Map Fix
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-ink-400">Not checked in yet</p>
                )}
              </div>

              <div className="rounded-xl bg-ink-50 p-3">
                <p className="text-[11px] font-semibold uppercase text-ink-400">Check-out</p>
                {v.checkOutAt ? (
                  <div className="mt-1 space-y-1">
                    <p className="font-semibold text-ink-900">{f.dateTime(v.checkOutAt)}</p>
                    <div className="flex items-center gap-2 text-xs text-ink-600">
                      <Badge tone="info">{v.checkOutMethod ?? "GPS"}</Badge>
                      {v.checkOutLat && v.checkOutLng && (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${v.checkOutLat},${v.checkOutLng}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 text-brand-700 hover:underline"
                        >
                          <ExternalLink className="size-3" /> Map Fix
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-ink-400">Not checked out yet</p>
                )}
              </div>
            </div>
          </div>

          {/* Clinical Note from Caregiver */}
          <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-sm">
            <h4 className="flex items-center gap-1.5 font-bold text-ink-900">
              <FileText className="size-4 text-brand-600" /> Caregiver Visit Note
            </h4>
            {v.note ? (
              <div className="mt-2.5 space-y-2">
                <div className="rounded-xl bg-ink-50 p-3.5 text-ink-800 leading-relaxed text-sm">
                  {v.note.summary}
                </div>
                <p className="text-end text-[11px] text-ink-400">
                  Submitted: {f.dateTime(v.note.submittedAt)}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-ink-500">No clinical visit note submitted for this visit.</p>
            )}
          </div>

          {/* People & Assigned Caregiver */}
          <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-sm">
            <h4 className="flex items-center gap-1.5 font-bold text-ink-900">
              <User className="size-4 text-brand-600" /> People Involved
            </h4>
            <div className="mt-3 space-y-3 divide-y divide-ink-100">
              <div className="flex items-start justify-between gap-3 pt-2">
                <div>
                  <p className="text-xs font-semibold uppercase text-ink-400">Caregiver</p>
                  <p className="font-semibold text-ink-900">{v.booking.caregiver.user.fullName}</p>
                  <p className="text-xs text-ink-500">{L.specialty(v.booking.caregiver.specialty)}</p>
                </div>
                <a
                  href={`tel:${v.booking.caregiver.user.phone}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
                >
                  <Phone className="size-3" /> {v.booking.caregiver.user.phone}
                </a>
              </div>

              <div className="flex items-start justify-between gap-3 pt-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-ink-400">Customer</p>
                  <p className="font-semibold text-ink-900">{v.booking.customer.fullName}</p>
                  <p className="text-xs text-ink-500">
                    Patient: {v.booking.patient.name} ({v.booking.patient.relationship})
                  </p>
                </div>
                <a
                  href={`tel:${v.booking.customer.phone}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
                >
                  <Phone className="size-3" /> {v.booking.customer.phone}
                </a>
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-sm">
            <h4 className="flex items-center gap-1.5 font-bold text-ink-900">
              <MapPin className="size-4 text-brand-600" /> Location
            </h4>
            <div className="mt-2 text-ink-800">
              <p>{v.booking.address.addressLine}</p>
              <p className="text-xs text-ink-500">{v.booking.address.city}</p>
              {v.booking.address.latitude && v.booking.address.longitude && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${v.booking.address.latitude},${v.booking.address.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
                >
                  <ExternalLink className="size-3" /> Open in Google Maps
                </a>
              )}
            </div>
          </div>

          {/* Status Timeline */}
          {v.statusHistory && v.statusHistory.length > 0 && (
            <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-sm">
              <h4 className="flex items-center gap-1.5 font-bold text-ink-900">
                <Clock className="size-4 text-brand-600" /> Status Timeline
              </h4>
              <ol className="mt-3 relative border-s border-ink-200 ps-4 space-y-3">
                {v.statusHistory.map((item, idx) => (
                  <li key={idx} className="relative">
                    <span className="absolute -start-[21px] top-1.5 size-2.5 rounded-full bg-brand-600 ring-4 ring-white" />
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="text-xs font-bold text-ink-900">
                        {L.visitAdmin(item.toStatus)}
                      </span>
                      <span className="text-[11px] text-ink-400 tabular">{f.dateTime(item.at)}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Payments for this Visit */}
          {v.payments && v.payments.length > 0 && (
            <div className="rounded-2xl border border-ink-100 bg-white p-4 shadow-sm">
              <h4 className="flex items-center gap-1.5 font-bold text-ink-900">
                <CreditCard className="size-4 text-brand-600" /> Payments ({v.payments.length})
              </h4>
              <div className="mt-2 divide-y divide-ink-100">
                {v.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2 text-xs">
                    <div>
                      <p className="font-semibold text-ink-900">{formatMoney(p.amount)}</p>
                      <p className="text-ink-500">{p.method} · {f.date(p.createdAt)}</p>
                    </div>
                    <Badge tone={p.status === "PAID" ? "success" : "neutral"}>{p.status}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Incidents / Disputes */}
          {((v.safetyIncidents && v.safetyIncidents.length > 0) || (v.disputes && v.disputes.length > 0)) && (
            <div className="rounded-2xl border border-danger-200 bg-danger-50/50 p-4">
              <h4 className="flex items-center gap-1.5 font-bold text-danger-900">
                <ShieldAlert className="size-4 text-danger-600" /> Safety Alerts & Disputes
              </h4>
              <div className="mt-2 space-y-2">
                {v.safetyIncidents?.map((s) => (
                  <div key={s.id} className="rounded-lg bg-white p-2.5 text-xs border border-danger-100 shadow-sm">
                    <div className="flex items-center justify-between">
                      <Badge tone="danger">Safety Incident ({s.priority})</Badge>
                      <span className="text-ink-400">{f.date(s.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-ink-800">{s.description}</p>
                  </div>
                ))}
                {v.disputes?.map((d) => (
                  <div key={d.id} className="rounded-lg bg-white p-2.5 text-xs border border-danger-100 shadow-sm">
                    <div className="flex items-center justify-between">
                      <Badge tone="warning">Dispute ({d.priority})</Badge>
                      <span className="text-ink-400">{f.date(d.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-ink-800">{d.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
