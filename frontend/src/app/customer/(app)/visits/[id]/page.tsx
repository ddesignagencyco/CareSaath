"use client";

import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarClock,
  ChevronRight,
  Clock,
  FileWarning,
  MapPin,
  MessagesSquare,
  Navigation,
  NotebookPen,
  Phone,
  Scale,
  Siren,
  Stethoscope,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useNow } from "@shared/hooks/use-now";
import { useAction } from "@shared/api/use-action";
import { saveBlob } from "@shared/api/http";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import { mapsUrl, visitStart } from "@shared/lib/visit";
import { Badge } from "@shared/ui/badge";
import { Card, CardBody, CardHeader } from "@shared/ui/card";
import { LiveRouteMap } from "@shared/ui/live-route-map";
import { Avatar, ErrorState, Skeleton } from "@shared/ui/misc";
import { MedicalOrdersView } from "@shared/ui/medical-orders";
import { SosDialog } from "@shared/ui/sos-dialog";
import { Rating, useCaregiver } from "@/features/customer/components/caregiver-bits";
import { RescheduleDialog } from "@/features/customer/components/reschedule-dialog";
import {
  ArrivalCodeNotice,
  DisputeDialog,
  DisputeItems,
  LiveLocationMap,
  PaymentPanel,
  ReportConcernDialog,
  ReviewPanel,
  useMyDisputes,
  VisitTracker,
} from "@/features/customer/components/visit-panels";
import { visitsApi } from "@/features/customer/lib/api/customer";
import { keys } from "@/features/customer/lib/api/keys";
import { ACTIVE_VISIT, SOS_ELIGIBLE_STATUSES, VISIT_TONE } from "@/features/customer/lib/labels";

type MobileTab = "overview" | "records" | "details";

export default function CustomerVisitPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("customerB.visit");
  const ts = useTranslations("shared");
  const f = useFmt();
  const L = useLabels();
  const now = useNow(60_000);
  const visit = useQuery({
    queryKey: [...keys.visit, id],
    queryFn: () => visitsApi.get(id),
    // Poll faster while the caregiver is on the way or with the patient.
    refetchInterval: (q) => (q.state.data && ACTIVE_VISIT.includes(q.state.data.status) ? 10_000 : 30_000),
  });
  const v = visit.data;
  // The visit response carries only booking.caregiverId; identity comes from the public
  // profile, which 404s once the caregiver is no longer approved/active.
  const caregiver = useCaregiver(v?.booking.caregiverId);
  const disputes = useMyDisputes();
  const visitDisputes = (disputes.data ?? []).filter((d) => d.visitId === id);
  // Doctor visits only: the diagnosis / prescription / lab-test records the doctor recorded.
  const medicalOrders = useQuery({
    queryKey: [...keys.visit, id, "medical-orders"],
    queryFn: () => visitsApi.medicalOrders(id),
    enabled: v?.booking.serviceType === "DOCTOR",
    refetchInterval: 20_000,
  });
  const downloadOrder = useAction(
    async (orderId: string) => {
      const { blob, filename } = await visitsApi.medicalOrderPdf(id, orderId);
      saveBlob(blob, filename);
    },
    { invalidate: [], success: null },
  );
  const [dialog, setDialog] = useState<"sos" | "concern" | "dispute" | "reschedule" | null>(null);
  const [tab, setTab] = useState<MobileTab>("overview");

  if (visit.isError) {
    return (
      <Card>
        <ErrorState error={visit.error} onRetry={() => visit.refetch()} />
      </Card>
    );
  }

  const c = caregiver.data;
  const canSos = v && SOS_ELIGIBLE_STATUSES.includes(v.status);
  const canMessage = v && !["REQUESTED", "DECLINED", "CANCELLED"].includes(v.status);
  const canReschedule = v && (v.status === "REQUESTED" || v.status === "CONFIRMED") && now && visitStart(v.scheduledDate, v.timeWindowStart) > now;
  const address = v?.booking.address;
  const destLat = address ? Number(address.latitude) : undefined;
  const destLng = address ? Number(address.longitude) : undefined;
  const hasValidDest = destLat !== undefined && destLng !== undefined && Number.isFinite(destLat) && Number.isFinite(destLng);
  const hasRecords = Boolean(v?.note) || (medicalOrders.data && medicalOrders.data.length > 0);
  const recordsCount = (v?.note ? 1 : 0) + (medicalOrders.data?.length ?? 0);

  return (
    <div className="space-y-5">
      <Link href={v ? `/customer/bookings/${v.bookingId}` : "/customer/bookings"} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900">
        <ArrowLeft className="rtl:-scale-x-100 size-4" /> {t("back")}
      </Link>

      {!v ? (
        <div className="space-y-4">
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : (
        <>
          {/* Unified Hero Card */}
          <section className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-ink-100">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3.5">
                {c ? (
                  <Link href={`/customer/caregivers/${c.id}`} className="shrink-0">
                    <Avatar name={c.user.fullName} src={c.photoUrl} size="lg" />
                  </Link>
                ) : caregiver.isError ? (
                  <Avatar name="?" size="lg" />
                ) : (
                  <Skeleton className="size-12 rounded-full" />
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="truncate text-lg font-extrabold tracking-tight text-ink-900 sm:text-xl">
                      {c ? (
                        <Link href={`/customer/caregivers/${c.id}`} className="hover:text-brand-700">
                          {c.user.fullName}
                        </Link>
                      ) : caregiver.isError ? (
                        t("yourCaregiver")
                      ) : (
                        t("yourCaregiver")
                      )}
                    </h1>
                    {c && <Rating average={c.ratingAverage} count={c.ratingCount} />}
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-ink-600">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-ink-800">
                      <Stethoscope className="size-3.5 text-brand-600" />
                      {t("serviceFor", { service: L.specialty(v.booking.serviceType), patient: v.booking.patient.name })}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Badge tone={VISIT_TONE[v.status]} dot pulse={["EN_ROUTE", "CHECKED_IN", "IN_PROGRESS"].includes(v.status)} className="text-xs sm:text-sm">
                  {L.visitCustomer(v.status)}
                </Badge>
                {canSos && (
                  <button
                    type="button"
                    onClick={() => setDialog("sos")}
                    className="inline-flex items-center gap-1.5 rounded-lg border-2 border-danger-600 bg-danger-50 px-3 py-1.5 text-xs font-extrabold tracking-wide text-danger-700 uppercase transition-colors hover:bg-danger-600 hover:text-white"
                  >
                    <Siren className="size-4" /> {ts("sos.button")}
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-3.5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-medium text-ink-600 sm:text-sm">
                <span className="inline-flex items-center gap-1.5 font-semibold text-ink-900">
                  <Clock className="size-4 text-brand-600" />
                  {f.longDay(v.scheduledDate)} · <span className="tabular">{f.timeWindow(v.timeWindowStart, v.timeWindowEnd)}</span>
                </span>
                {address && (
                  <span className="inline-flex items-center gap-1.5 text-ink-500">
                    <MapPin className="size-3.5 shrink-0 text-ink-400" />
                    <span className="truncate max-w-[240px] sm:max-w-xs">{address.label ? `${address.label} · ` : ""}{address.city}</span>
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {canMessage && (
                  <Link
                    href={`/customer/messages/${v.bookingId}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-brand-700 sm:text-sm"
                  >
                    <MessagesSquare className="size-4" /> {t("messageCaregiver")}
                  </Link>
                )}
                {canReschedule && (
                  <button
                    type="button"
                    onClick={() => setDialog("reschedule")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs font-semibold text-ink-700 transition-colors hover:bg-ink-50 sm:text-sm"
                  >
                    <CalendarClock className="size-4 text-brand-600" /> {t("rescheduleThis")}
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Responsive Mobile Tab Bar */}
          <div className="flex gap-1.5 rounded-xl bg-ink-100/80 p-1 lg:hidden" role="tablist">
            {(
              [
                { id: "overview" as const, label: "Overview" },
                { id: "records" as const, label: recordsCount > 0 ? `Records (${recordsCount})` : "Records" },
                { id: "details" as const, label: "Details" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => setTab(item.id)}
                className={clsx(
                  "flex-1 rounded-lg px-3 py-2 text-xs font-bold transition-all",
                  tab === item.id ? "bg-white text-brand-700 shadow-xs" : "text-ink-600 hover:text-ink-900",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.45fr_1fr]">
            {/* Primary Column */}
            <div className="space-y-5">
              <div className={clsx("space-y-5", tab !== "overview" && "hidden lg:block")}>
                <Card>
                  <CardBody className="space-y-5">
                    {v.status === "REQUESTED" ? (
                      <p className="text-sm text-ink-600">{t("waiting")}</p>
                    ) : v.status === "DECLINED" || v.status === "CANCELLED" ? (
                      <p dir="auto" className="text-sm text-ink-600">
                        {v.booking.cancelReason
                          ? t("closedWithReason", { status: v.status, reason: v.booking.cancelReason })
                          : t("closed", { status: v.status })}
                      </p>
                    ) : (
                      <VisitTracker visit={v} />
                    )}
                    {v.status === "EN_ROUTE" && (
                      <LiveLocationMap
                        visitId={v.id}
                        caregiverName={c?.user.fullName}
                        destLat={hasValidDest ? destLat : undefined}
                        destLng={hasValidDest ? destLng : undefined}
                        directionsUrl={address ? mapsUrl(address) : undefined}
                      />
                    )}
                    {(v.status === "CONFIRMED" || v.status === "EN_ROUTE") && <ArrivalCodeNotice phone={v.booking.customer.phone} />}
                    <PaymentPanel visit={v} />
                  </CardBody>
                </Card>

                {(v.status === "COMPLETED" || v.review) && (
                  <Card>
                    <CardBody>
                      <ReviewPanel visit={v} caregiverName={c?.user.fullName ?? t("yourCaregiverLower")} />
                    </CardBody>
                  </Card>
                )}
              </div>

              <div className={clsx("space-y-5", tab !== "records" && "hidden lg:block")}>
                {v.note && (
                  <Card>
                    <CardHeader title={t("noteTitle")} description={t("noteBy", { date: f.dateTime(v.note.submittedAt) })} />
                    <CardBody>
                      <p dir="auto" className="flex gap-3 rounded-xl bg-ink-25 p-4 text-sm leading-relaxed whitespace-pre-line text-ink-800">
                        <NotebookPen className="mt-0.5 size-4 shrink-0 text-brand-600" />
                        {v.note.summary}
                      </p>
                    </CardBody>
                  </Card>
                )}

                {medicalOrders.data && medicalOrders.data.length > 0 && (
                  <Card>
                    <CardHeader title={t("doctorOrders")} />
                    <CardBody>
                      <MedicalOrdersView
                        orders={medicalOrders.data}
                        onDownload={(orderId) => downloadOrder.mutate(orderId)}
                        downloadingId={downloadOrder.isPending ? downloadOrder.variables ?? null : null}
                      />
                    </CardBody>
                  </Card>
                )}

                {!hasRecords && tab === "records" && (
                  <Card className="lg:hidden">
                    <CardBody className="py-10 text-center">
                      <NotebookPen className="mx-auto size-8 text-ink-300" />
                      <p className="mt-2 text-sm font-semibold text-ink-700">No visit notes or prescriptions yet</p>
                      <p className="mt-1 text-xs text-ink-500">Notes and medical records added by your caregiver will appear here.</p>
                    </CardBody>
                  </Card>
                )}
              </div>
            </div>

            {/* Sidebar Column */}
            <div className={clsx("space-y-5", tab !== "details" && "hidden lg:block")}>
              {c && (
                <Card>
                  <CardHeader title={t("yourCaregiver")} />
                  <CardBody className="space-y-3.5">
                    <Link href={`/customer/caregivers/${c.id}`} className="flex items-center gap-3 rounded-xl p-1 transition-colors hover:bg-ink-50">
                      <Avatar name={c.user.fullName} src={c.photoUrl} size="lg" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold text-ink-900">{c.user.fullName}</p>
                        <Rating average={c.ratingAverage} count={c.ratingCount} />
                      </div>
                      <ChevronRight className="rtl:-scale-x-100 size-4 text-ink-300" />
                    </Link>
                    <p className="flex items-start gap-2 rounded-xl bg-brand-50/70 p-3 text-xs text-brand-800">
                      <BadgeCheck className="mt-px size-4 shrink-0" />
                      <span>
                        {t.rich("checkId", {
                          name: c.user.fullName,
                          body: L.licenseBody(c.licenseBody),
                          b: (chunks) => <b>{chunks}</b>,
                        })}
                      </span>
                    </p>
                  </CardBody>
                </Card>
              )}

              {address && hasValidDest && v.status !== "EN_ROUTE" && (
                <Card>
                  <CardHeader title={address.label ?? "Visit Location"} />
                  <CardBody className="space-y-3">
                    <LiveRouteMap
                      lat={destLat}
                      lng={destLng}
                      destLabel="Home"
                      heightClass="h-44"
                      directionsUrl={mapsUrl(address)}
                      modalTitle={address.addressLine}
                    />
                    <p dir="auto" className="text-sm text-ink-700">
                      <span className="font-semibold text-ink-900">{address.addressLine}</span>, {address.city}
                    </p>
                    <a
                      href={mapsUrl(address)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline"
                    >
                      <Navigation className="size-4" /> Open in Google Maps
                    </a>
                  </CardBody>
                </Card>
              )}

              {visitDisputes.length > 0 && (
                <Card>
                  <CardHeader title={t("disputesTitle")} />
                  <CardBody>
                    <DisputeItems disputes={visitDisputes} userId={v.booking.customerId} />
                  </CardBody>
                </Card>
              )}

              {v.statusHistory.length > 0 && (
                <Card>
                  <CardHeader title={t("updates")} />
                  <CardBody>
                    <ol className="relative space-y-3 border-s-2 border-ink-100 ps-5">
                      {[...v.statusHistory].reverse().map((h) => (
                        <li key={h.id} className="relative">
                          <span className="absolute top-1 -start-[27px] size-3 rounded-full border-2 border-white bg-brand-500" />
                          <p className="text-sm font-semibold text-ink-800">{L.visitCustomer(h.toStatus)}</p>
                          <p className="text-xs text-ink-500">{f.dateTime(h.at)}</p>
                        </li>
                      ))}
                    </ol>
                  </CardBody>
                </Card>
              )}

              <Card className="divide-y divide-ink-100 overflow-hidden">
                {canReschedule && (
                  <button onClick={() => setDialog("reschedule")} className="flex w-full items-center gap-3 px-5 py-3.5 text-start text-sm font-semibold text-ink-700 hover:bg-ink-50">
                    <CalendarClock className="size-4 text-brand-600" /> {t("rescheduleThis")}
                  </button>
                )}
                <a href="tel:1122" className="flex w-full items-center gap-3 px-5 py-3.5 text-sm font-semibold text-ink-700 hover:bg-ink-50">
                  <Phone className="size-4 text-danger-600" /> {t("call1122")}
                </a>
                <button onClick={() => setDialog("concern")} className="flex w-full items-center gap-3 px-5 py-3.5 text-start text-sm font-semibold text-ink-700 hover:bg-ink-50">
                  <FileWarning className="size-4 text-warning-600" /> {t("reportConcern")}
                </button>
                <button onClick={() => setDialog("dispute")} className="flex w-full items-center gap-3 px-5 py-3.5 text-start text-sm font-semibold text-ink-700 hover:bg-ink-50">
                  <Scale className="size-4 text-ink-400" /> {t("raiseDispute")}
                </button>
              </Card>
            </div>
          </div>

          {dialog === "sos" && (
            <SosDialog
              description={t("sosDescription")}
              send={(note) => visitsApi.sos({ visitId: v.id, note })}
              onClose={() => setDialog(null)}
            />
          )}
          {dialog === "concern" && <ReportConcernDialog visitId={v.id} onClose={() => setDialog(null)} />}
          {dialog === "dispute" && <DisputeDialog visitId={v.id} onClose={() => setDialog(null)} />}
          {dialog === "reschedule" && <RescheduleDialog bookingId={v.bookingId} visit={v} onClose={() => setDialog(null)} />}
        </>
      )}
    </div>
  );
}
