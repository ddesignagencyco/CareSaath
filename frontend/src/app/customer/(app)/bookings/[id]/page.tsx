"use client";

import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowLeft, Banknote, CalendarClock, ChevronRight, FileText, ImageIcon, MessagesSquare, Navigation, NotebookPen, Repeat, UploadCloud, XCircle } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { useAction } from "@shared/api/use-action";
import { useNow } from "@shared/hooks/use-now";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import { formatBytes, formatMoney } from "@shared/lib/format";
import { mapsUrl, visitStart } from "@shared/lib/visit";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@shared/ui/alert-dialog";
import { Field, Textarea } from "@shared/ui/field";
import { Badge } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import { Card, CardBody, CardHeader } from "@shared/ui/card";
import { FileViewer } from "@shared/ui/file-viewer";
import { LocationMap } from "@shared/ui/location-map";
import { Avatar, ErrorState, Skeleton } from "@shared/ui/misc";
import { RespondCountdown } from "@shared/ui/respond-countdown";
import type { PrescriptionSummary, Visit } from "@shared/caregiver-types";
import { Rating, useCaregiver } from "@/features/customer/components/caregiver-bits";
import { RescheduleDialog } from "@/features/customer/components/reschedule-dialog";
import { bookingsApi, paymentsApi } from "@/features/customer/lib/api/customer";
import { keys } from "@/features/customer/lib/api/keys";
import { BOOKING_TONE, bookingDisplayStatus, hasCancellableVisits, VISIT_TONE } from "@/features/customer/lib/labels";

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("customerB.booking");
  const tc = useTranslations("common.actions");
  const ts = useTranslations("shared");
  const f = useFmt();
  const L = useLabels();
  const now = useNow(60_000);
  const booking = useQuery({ queryKey: [...keys.bookings, "detail", id], queryFn: () => bookingsApi.get(id), refetchInterval: 20_000 });
  const payments = useQuery({ queryKey: [...keys.payments, "list"], queryFn: () => paymentsApi.list({ limit: 100 }) });
  const b = booking.data;
  // Per-visit payment state: paid, pending (gateway/cash in progress), or due (visit done, nothing settled).
  const payItems = payments.data?.items ?? [];
  const payState = (visitId: string, status: string): "paid" | "pending" | "due" | null => {
    if (payItems.some((p) => p.visitId === visitId && p.status === "PAID")) return "paid";
    if (payItems.some((p) => p.visitId === visitId && p.status === "PENDING")) return "pending";
    return status === "COMPLETED" || status === "CHECKED_OUT" ? "due" : null;
  };
  const caregiver = useCaregiver(b?.caregiverId);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [moving, setMoving] = useState<Visit | null>(null);
  const [viewing, setViewing] = useState<PrescriptionSummary | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const cancel = useAction((reason: string) => bookingsApi.cancel(id, reason || undefined), {
    invalidate: [keys.bookings],
    success: t("cancelSuccess"),
    onSuccess: () => {
      setCancelling(false);
      setReason("");
    },
  });
  const upload = useAction((file: File) => bookingsApi.uploadPrescription(id, file), {
    invalidate: [keys.bookings],
    success: t("uploadSuccess"),
  });

  if (booking.isError) {
    return (
      <Card>
        <ErrorState error={booking.error} onRetry={() => booking.refetch()} />
      </Card>
    );
  }

  const c = caregiver.data;
  const open = b && (b.status === "REQUESTED" || b.status === "CONFIRMED");
  const shownStatus = b ? bookingDisplayStatus(b) : null;
  const perVisit = b ? b.rateSnapshot - b.discountAmount : 0;

  return (
    <div className="space-y-5">
      <Link href="/customer/bookings" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900">
        <ArrowLeft className="rtl:-scale-x-100 size-4" /> {t("back")}
      </Link>

      {!b ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : (
        <>
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">
                {t("heading", { service: L.specialty(b.serviceType), patient: b.patient.name })}
              </h1>
              <p className="text-sm text-ink-500">{t("requestedAt", { date: f.dateTime(b.createdAt) })}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              {/* While REQUESTED, the "Waiting for …" banner below already states the status, so skip the redundant pill. */}
              {b.status !== "REQUESTED" && (
                <Badge tone={BOOKING_TONE[shownStatus!]} dot className="text-sm">
                  {L.bookingCustomer(shownStatus!)}
                </Badge>
              )}
              {hasCancellableVisits(b) && (
                <Button variant="danger" size="sm" onClick={() => setCancelling(true)}>
                  <XCircle className="size-4" /> {t("cancelBooking")}
                </Button>
              )}
            </div>
          </header>

          {b.status === "REQUESTED" && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-accent-50 p-4 ring-1 ring-accent-400/30">
              <p className="text-sm text-accent-700">
                {t.rich("waitingBanner", { name: c?.user.fullName.split(" ")[0] ?? t("theCaregiver"), b: (chunks) => <b>{chunks}</b> })}
              </p>
              <RespondCountdown respondBy={b.respondBy} />
            </div>
          )}
          {b.status === "DECLINED" && (
            <div className="rounded-2xl bg-ink-100 p-4 text-sm text-ink-700">
              <p dir="auto" className="font-bold">{t("declinedTitle")}</p>
              {b.cancelReason && <p dir="auto" className="mt-1">&ldquo;{b.cancelReason}&rdquo;</p>}
              <Link href={`/customer/caregivers?specialty=${b.serviceType}`} className="mt-2 inline-block font-semibold text-brand-700 hover:underline">
                {t("findAnother")}
              </Link>
            </div>
          )}
          {b.status === "CANCELLED" && (
            <div className="rounded-2xl bg-ink-100 p-4 text-sm text-ink-700">
              {b.cancelReason ? t("cancelledWithReason", { date: f.dateTime(b.cancelledAt), reason: b.cancelReason }) : t("cancelledAt", { date: f.dateTime(b.cancelledAt) })}
            </div>
          )}

          {(() => {
            const due = b.visits.find((v) => payState(v.id, v.status) === "due");
            return due ? (
              <Link
                href={`/customer/visits/${due.id}`}
                className="flex flex-wrap items-center gap-3 rounded-2xl bg-danger-50 p-4 ring-1 ring-danger-400/30 hover:bg-danger-100/60"
              >
                <Banknote className="size-5 shrink-0 text-danger-600" />
                <p className="flex-1 text-sm font-semibold text-danger-700">{t("paymentDueBanner")}</p>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-danger-600 px-3.5 py-2 text-sm font-bold text-white">
                  {t("payNow")} <ChevronRight className="rtl:-scale-x-100 size-4" />
                </span>
              </Link>
            ) : null;
          })()}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
            <div className="space-y-5">
              <Card>
                <CardHeader title={t("visits")} description={b.recurrenceRule ? `${f.weekdays(b.recurrenceRule.weekdays)} · ${f.timeWindow(b.timeWindowStart, b.timeWindowEnd)}` : f.timeWindow(b.timeWindowStart, b.timeWindowEnd)} />
                <ul className="mt-3 divide-y divide-ink-100 border-t border-ink-100">
                  {b.visits.map((v) => {
                    const canMove = open && (v.status === "REQUESTED" || v.status === "CONFIRMED") && now && visitStart(v.scheduledDate, v.timeWindowStart) > now;
                    return (
                      <li key={v.id} className={clsx("flex items-center gap-3 px-5 py-3", (v.status === "CANCELLED" || v.status === "DECLINED") && "opacity-60")}>
                        <Link href={`/customer/visits/${v.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="w-36 shrink-0">
                            <p className="text-sm font-bold text-ink-900">{f.relativeDay(v.scheduledDate, now)}</p>
                            <p className="tabular text-xs whitespace-nowrap text-ink-500">{f.timeWindow(v.timeWindowStart, v.timeWindowEnd)}</p>
                          </div>
                          <Badge tone={VISIT_TONE[v.status]} dot>
                            {L.visitCustomer(v.status)}
                          </Badge>
                          {(() => {
                            const ps = payState(v.id, v.status);
                            return ps === "paid" ? (
                              <Badge tone="success">{t("paid")}</Badge>
                            ) : ps === "pending" ? (
                              <Badge tone="accent">{t("paymentPending")}</Badge>
                            ) : ps === "due" ? (
                              <Badge tone="danger">{t("paymentDue")}</Badge>
                            ) : null;
                          })()}
                          {v.status === "COMPLETED" && (
                            <span className="ms-auto inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-brand-700">
                              <NotebookPen className="size-3.5 shrink-0" /> {t("viewNote")}
                            </span>
                          )}
                        </Link>
                        {canMove ? (
                          <Button size="sm" variant="ghost" onClick={() => setMoving(v)}>
                            <CalendarClock className="size-4" /> <span className="hidden sm:inline">{t("reschedule")}</span>
                          </Button>
                        ) : (
                          <ChevronRight className="rtl:-scale-x-100 size-4 text-ink-300" />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>

              <Card>
                <CardHeader
                  title={t("prescriptions")}
                  description={t("prescriptionsHint")}
                  action={
                    open && (
                      <Button size="sm" variant="secondary" loading={upload.isPending} onClick={() => fileInput.current?.click()}>
                        <UploadCloud className="size-4" /> {tc("add")}
                      </Button>
                    )
                  }
                />
                <input
                  ref={fileInput}
                  type="file"
                  accept={ACCEPT}
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) upload.mutate(file);
                    e.target.value = "";
                  }}
                />
                <CardBody>
                  {b.prescriptions.length === 0 ? (
                    <p className="text-sm text-ink-500">{t("prescriptionsEmpty")}</p>
                  ) : (
                    <ul className="space-y-2">
                      {b.prescriptions.map((p) => {
                        const Icon = p.mimeType.startsWith("image/") ? ImageIcon : FileText;
                        return (
                          <li key={p.id}>
                            <button onClick={() => setViewing(p)} className="flex w-full items-center gap-3 rounded-xl border border-ink-100 p-3 text-start hover:border-brand-300 hover:bg-brand-50/40">
                              <span className="flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                                <Icon className="size-5" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-semibold text-ink-900">{t("prescription")}</span>
                                <span className="block text-xs text-ink-500">
                                  {formatBytes(p.sizeBytes)} · {f.dateTime(p.createdAt)}
                                </span>
                              </span>
                              <span className="text-sm font-semibold text-brand-700">{tc("view")}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardBody>
              </Card>
            </div>

            <div className="space-y-5">
              <Card>
                <CardHeader title={t("caregiver")} />
                <CardBody>
                  {c ? (
                    <Link href={`/customer/caregivers/${c.id}`} className="flex items-center gap-3">
                      <Avatar name={c.user.fullName} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold text-ink-900">{c.user.fullName}</p>
                        <Rating average={c.ratingAverage} count={c.ratingCount} />
                      </div>
                      <ChevronRight className="rtl:-scale-x-100 size-4 text-ink-300" />
                    </Link>
                  ) : caregiver.isError ? (
                    <div className="flex items-center gap-3">
                      <Avatar name="?" />
                      <p className="text-sm text-ink-500">{t("caregiverUnavailable")}</p>
                    </div>
                  ) : (
                    <Skeleton className="h-12" />
                  )}
                  {b.priorVisitsWithCaregiver ? (
                    <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700">
                      <Repeat className="size-3.5 shrink-0" /> {t("repeatVisits", { count: b.priorVisitsWithCaregiver })}
                    </p>
                  ) : null}
                  {c && (b.status === "CONFIRMED" || b.status === "COMPLETED") && (
                    <Link
                      href={`/customer/messages/${b.id}`}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-ink-200 py-2.5 text-sm font-semibold text-ink-800 hover:bg-ink-50"
                    >
                      <MessagesSquare className="size-4" /> {t("messageCaregiver")}
                    </Link>
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardHeader title={t("address")} />
                <CardBody className="space-y-3">
                  <LocationMap lat={b.address.latitude} lng={b.address.longitude} label={b.address.addressLine} />
                  <p dir="auto" className="text-sm text-ink-800">
                    <b>{b.address.label ?? t("address")}</b>
                    <br />
                    {b.address.addressLine}, {b.address.city}
                  </p>
                  <a href={mapsUrl(b.address)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
                    <Navigation className="size-4" /> {t("openInMaps")}
                  </a>
                </CardBody>
              </Card>

              <Card>
                <CardHeader title={t("price")} />
                <CardBody>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-ink-500">{t("perVisit")}</dt>
                      <dd className="tabular font-semibold text-ink-900">{formatMoney(b.rateSnapshot)}</dd>
                    </div>
                    {b.discountAmount > 0 && (
                      <div className="flex justify-between text-success-700">
                        <dt>{t("promoDiscount")}</dt>
                        <dd className="tabular font-semibold">−{formatMoney(b.discountAmount)}</dd>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-ink-100 pt-2">
                      <dt className="font-semibold text-ink-800">{t("youPayPerVisit")}</dt>
                      <dd className="tabular font-extrabold text-ink-900">{formatMoney(perVisit)}</dd>
                    </div>
                  </dl>
                  {b.recurrenceRule && (
                    <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-500">
                      <Repeat className="size-3.5" /> {t("payEachVisit")}
                    </p>
                  )}
                </CardBody>
              </Card>

            </div>
          </div>
        </>
      )}

      <AlertDialog open={cancelling} onOpenChange={setCancelling}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cancelTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("cancelDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="mt-4">
            <Field label={ts("reason.label")}>
              {(fid) => <Textarea id={fid} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder={t("cancelPlaceholder")} />}
            </Field>
          </div>
          <AlertDialogFooter>
            <Button variant="secondary" onClick={() => setCancelling(false)}>
              {tc("back")}
            </Button>
            <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate(reason)}>
              {t("cancelBooking")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {moving && b && <RescheduleDialog bookingId={b.id} visit={moving} onClose={() => setMoving(null)} />}
      {viewing && b && (
        <FileViewer
          id={viewing.id}
          title={t("prescriptionTitle", { patient: b.patient.name })}
          mimeType={viewing.mimeType}
          load={() => bookingsApi.prescriptionUrl(b.id, viewing.id)}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
