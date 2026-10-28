"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BadgeCheck, CalendarClock, ChevronRight, FileWarning, NotebookPen, Phone, Scale, Siren } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useNow } from "@shared/hooks/use-now";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import { visitStart } from "@shared/lib/visit";
import { Badge } from "@shared/ui/badge";
import { Card, CardBody, CardHeader } from "@shared/ui/card";
import { Avatar, ErrorState, Skeleton } from "@shared/ui/misc";
import { SosDialog } from "@shared/ui/sos-dialog";
import { Rating, useCaregiver } from "@/features/customer/components/caregiver-bits";
import { RescheduleDialog } from "@/features/customer/components/reschedule-dialog";
import {
  ArrivalCodeNotice,
  DisputeDialog,
  DisputeItems,
  PaymentPanel,
  ReportConcernDialog,
  ReviewPanel,
  useMyDisputes,
  VisitTracker,
} from "@/features/customer/components/visit-panels";
import { visitsApi } from "@/features/customer/lib/api/customer";
import { keys } from "@/features/customer/lib/api/keys";
import { ACTIVE_VISIT, VISIT_TONE } from "@/features/customer/lib/labels";

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
  const [dialog, setDialog] = useState<"sos" | "concern" | "dispute" | "reschedule" | null>(null);

  if (visit.isError) {
    return (
      <Card>
        <ErrorState error={visit.error} onRetry={() => visit.refetch()} />
      </Card>
    );
  }

  const c = caregiver.data;
  const active = v && ACTIVE_VISIT.includes(v.status);
  const canReschedule = v && (v.status === "REQUESTED" || v.status === "CONFIRMED") && now && visitStart(v.scheduledDate, v.timeWindowStart) > now;

  return (
    <div className="space-y-5">
      <Link href={v ? `/customer/bookings/${v.bookingId}` : "/customer/bookings"} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900">
        <ArrowLeft className="rtl:-scale-x-100 size-4" /> {t("back")}
      </Link>

      {!v ? (
        <Skeleton className="h-72 rounded-2xl" />
      ) : (
        <>
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">{f.longDay(v.scheduledDate)}</h1>
              <p className="tabular text-sm text-ink-500">
                {f.timeWindow(v.timeWindowStart, v.timeWindowEnd)} · {t("serviceFor", { service: L.specialty(v.booking.serviceType), patient: v.booking.patient.name })}
              </p>
            </div>
            <Badge tone={VISIT_TONE[v.status]} dot className="text-sm">
              {L.visitCustomer(v.status)}
            </Badge>
          </header>

          {active && (
            <button
              onClick={() => setDialog("sos")}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-danger-600 bg-danger-50 py-3 text-sm font-extrabold tracking-wide text-danger-700 uppercase transition-colors hover:bg-danger-600 hover:text-white"
            >
              <Siren className="size-5" /> {ts("sos.button")}
            </button>
          )}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
            <div className="space-y-5">
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
                  {(v.status === "CONFIRMED" || v.status === "EN_ROUTE") && <ArrivalCodeNotice phone={v.booking.customer.phone} />}
                  <PaymentPanel visit={v} />
                </CardBody>
              </Card>

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

              {(v.status === "COMPLETED" || v.review) && (
                <Card>
                  <CardBody>
                    <ReviewPanel visit={v} caregiverName={c?.user.fullName ?? t("yourCaregiverLower")} />
                  </CardBody>
                </Card>
              )}
            </div>

            <div className="space-y-5">
              <Card>
                <CardHeader title={t("yourCaregiver")} />
                <CardBody className="space-y-4">
                  {c ? (
                    <>
                      <Link href={`/customer/caregivers/${c.id}`} className="flex items-center gap-3">
                        <Avatar name={c.user.fullName} size="lg" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-bold text-ink-900">{c.user.fullName}</p>
                          <Rating average={c.ratingAverage} count={c.ratingCount} />
                        </div>
                        <ChevronRight className="rtl:-scale-x-100 size-4 text-ink-300" />
                      </Link>
                      <p className="flex items-start gap-2 rounded-xl bg-brand-50/60 p-3 text-xs text-brand-800">
                        <BadgeCheck className="mt-px size-4 shrink-0" />
                        <span>
                          {t.rich("checkId", {
                            name: c.user.fullName,
                            body: L.licenseBody(c.licenseBody),
                            b: (chunks) => <b>{chunks}</b>,
                          })}
                        </span>
                      </p>
                    </>
                  ) : caregiver.isError ? (
                    <div className="flex items-center gap-3">
                      <Avatar name="?" size="lg" />
                      <p className="text-sm text-ink-500">{t("caregiverUnavailable")}</p>
                    </div>
                  ) : (
                    <Skeleton className="h-14" />
                  )}
                </CardBody>
              </Card>

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
