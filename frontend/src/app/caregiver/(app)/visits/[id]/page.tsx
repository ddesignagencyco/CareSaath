"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileText, FileWarning, HeartPulse, ImageIcon, MapPin, Navigation, Phone, Scale, Siren } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@shared/ui/badge";
import { Card, CardBody, CardHeader } from "@shared/ui/card";
import { FileViewer } from "@shared/ui/file-viewer";
import { LocationMap } from "@shared/ui/location-map";
import { Avatar, ErrorState, Skeleton } from "@shared/ui/misc";
import { formatBytes } from "@shared/lib/format";
import type { PrescriptionDocument } from "@shared/caregiver-types";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import { DisputeDialog, ReportIssueDialog, SosDialog } from "@/features/caregiver/components/visit/safety-actions";
import { VisitFlow } from "@/features/caregiver/components/visit/visit-flow";
import { CashPayment } from "@/features/caregiver/components/visit/cash-payment";
import { useNow } from "@shared/hooks/use-now";
import { bookingsApi, visitsApi } from "@/features/caregiver/lib/api/caregiver";
import { ACTIVE_STATUSES, mapsUrl, VISIT_TONE } from "@shared/lib/visit";

/**
 * The API decrypts medical context for the assigned caregiver, but when it
 * can't (key mismatch) it returns the stored "iv:tag:data" ciphertext as-is.
 * Never show that to a nurse.
 */
const CIPHERTEXT = /^[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}$/;
function readableMedical(text: string | null | undefined): string | null | "unreadable" {
  if (!text?.trim()) return null;
  return CIPHERTEXT.test(text.trim()) ? "unreadable" : text;
}

function fileKind(mimeType: string | null | undefined): string {
  return (mimeType?.split("/")[1] ?? "").toUpperCase();
}

export default function VisitDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("caregiverB.visit");
  const ts = useTranslations("shared");
  const tc = useTranslations("common.actions");
  const f = useFmt();
  const L = useLabels();
  const now = useNow(60_000);
  const visit = useQuery({ queryKey: ["cg-visit", id], queryFn: () => visitsApi.get(id) });
  const [rx, setRx] = useState<PrescriptionDocument | null>(null);
  const [dialog, setDialog] = useState<"sos" | "report" | "dispute" | null>(null);

  if (visit.isError) {
    return (
      <Card>
        <ErrorState error={visit.error} onRetry={() => visit.refetch()} />
      </Card>
    );
  }

  const v = visit.data;
  const active = v && ACTIVE_STATUSES.includes(v.status);
  const booking = v?.booking;
  const patient = booking?.patient;
  const address = booking?.address;
  const customer = booking?.customer;
  const prescriptions = booking?.prescriptions ?? [];
  const history = v?.statusHistory ?? [];
  const medical = readableMedical(patient?.medicalContext);
  const patientName = patient?.name ?? t("patient");

  return (
    <div className="space-y-5">
      <Link href="/caregiver/visits" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900">
        <ArrowLeft className="rtl:-scale-x-100 size-4" /> {t("back")}
      </Link>

      {!v ? (
        <div className="space-y-4">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : (
        <>
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">{patientName}</h1>
              <p className="mt-0.5 text-sm text-ink-500">
                {f.longDay(v.scheduledDate)} · <span className="tabular">{f.timeWindow(v.timeWindowStart, v.timeWindowEnd)}</span>
              </p>
            </div>
            <Badge tone={VISIT_TONE[v.status]} dot className="text-sm">
              {L.visitCaregiver(v.status)}
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

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.35fr_1fr]">
            <div className="space-y-5">
              {(v.status === "DECLINED" || v.status === "CANCELLED") ? (
                <Card className="p-5 text-sm text-ink-600">
                  {booking?.cancelReason
                    ? t("closedWithReason", { status: v.status, reason: booking.cancelReason })
                    : t("closed", { status: v.status })}
                </Card>
              ) : v.status === "REQUESTED" ? (
                <Card className="p-5 text-sm text-ink-600">
                  {t("awaitingResponse")}{" "}
                  <Link href="/caregiver/requests" className="font-semibold text-brand-700 hover:underline">
                    {t("goToRequests")}
                  </Link>
                </Card>
              ) : (
                <Card>
                  <CardBody>
                    <VisitFlow visit={v} />
                  </CardBody>
                </Card>
              )}

              <CashPayment visit={v} />

              <Card>
                <CardHeader title={t("patient")} />
                <CardBody className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={patientName} />
                    <div>
                      <p className="font-bold text-ink-900">{patientName}</p>
                      {patient && <p className="text-sm text-ink-500">{L.patientLine(patient, f.age(patient.dateOfBirth, now))}</p>}
                    </div>
                  </div>
                  <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4">
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold tracking-wide text-brand-800 uppercase">
                      <HeartPulse className="size-3.5" /> {t("medicalContext")}
                    </p>
                    {medical === "unreadable" ? (
                      <p className="text-sm text-ink-500">{t("medicalUnavailable")}</p>
                    ) : (
                      <p dir="auto" className="text-sm leading-relaxed whitespace-pre-line text-ink-800">{medical || t("noMedical")}</p>
                    )}
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-bold tracking-wide text-ink-500 uppercase">{t("prescriptions")}</p>
                    {prescriptions.length === 0 ? (
                      <p className="text-sm text-ink-500">{t("noPrescriptions")}</p>
                    ) : (
                      <ul className="space-y-2">
                        {prescriptions.map((p) => {
                          const Icon = p.mimeType?.startsWith("image/") ? ImageIcon : FileText;
                          return (
                            <li key={p.id}>
                              <button
                                onClick={() => setRx(p)}
                                className="flex w-full items-center gap-3 rounded-xl border border-ink-100 p-3 text-start hover:border-brand-300 hover:bg-brand-50/40"
                              >
                                <span className="flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                                  <Icon className="size-5" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-semibold text-ink-900">{t("prescription")}</span>
                                  <span className="block text-xs text-ink-500">
                                    {fileKind(p.mimeType)} · {formatBytes(p.sizeBytes)} · {f.dateTime(p.createdAt)}
                                  </span>
                                </span>
                                <span className="text-sm font-semibold text-brand-700">{tc("view")}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </CardBody>
              </Card>
            </div>

            <div className="space-y-5">
              {(address || customer) && (
                <Card>
                  <CardHeader title={t("locationFamily")} />
                  <CardBody className="space-y-4">
                    {address && (
                      <>
                        <LocationMap lat={address.latitude} lng={address.longitude} label={address.addressLine} />
                        <div className="flex items-start gap-3">
                          <MapPin className="mt-0.5 size-5 shrink-0 text-ink-400" />
                          <div>
                            {address.label && <p className="text-xs font-semibold text-ink-500">{address.label}</p>}
                            <p dir="auto" className="text-sm font-semibold text-ink-900">{address.addressLine}</p>
                            <p className="text-sm text-ink-500">{address.city}</p>
                          </div>
                        </div>
                      </>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      {address && (
                        <a
                          href={mapsUrl(address)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-ink-200 text-sm font-semibold text-ink-800 hover:bg-ink-50"
                        >
                          <Navigation className="size-4" /> {t("directions")}
                        </a>
                      )}
                      {customer?.phone && (
                        <a
                          href={`tel:${customer.phone}`}
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-ink-200 text-sm font-semibold text-ink-800 hover:bg-ink-50"
                        >
                          <Phone className="size-4" /> {t("callFamily")}
                        </a>
                      )}
                    </div>
                    {customer && (
                      <p className="text-sm text-ink-600">
                        {customer.fullName
                          ? t.rich("bookedBy", {
                              name: customer.fullName,
                              b: (c) => <span className="font-semibold text-ink-900">{c}</span>,
                            })
                          : t("bookedByUnnamed")}
                        {customer.phone && <span className="tabular text-ink-500"> · {f.phone(customer.phone)}</span>}
                      </p>
                    )}
                  </CardBody>
                </Card>
              )}

              <Card>
                <CardHeader title={t("booking")} />
                <CardBody>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-ink-500">{t("service")}</dt>
                      <dd className="font-semibold text-ink-900">{booking ? L.specialty(booking.serviceType) : "—"}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-ink-500">{t("type")}</dt>
                      <dd className="text-end font-semibold text-ink-900">
                        {booking?.recurrenceRule?.weekdays?.length
                          ? t("recurring", { days: f.weekdays(booking.recurrenceRule.weekdays) })
                          : t("singleVisit")}
                      </dd>
                    </div>
                  </dl>
                </CardBody>
              </Card>

              {history.length > 0 && (
                <Card>
                  <CardHeader title={t("timeline")} />
                  <CardBody>
                    <ol className="relative space-y-3 border-s-2 border-ink-100 ps-5">
                      {history.map((h) => (
                        <li key={h.id} className="relative">
                          <span className="absolute top-1 -start-[27px] size-3 rounded-full border-2 border-white bg-brand-500" />
                          <p className="text-sm font-semibold text-ink-800">{L.timeline(h.toStatus)}</p>
                          <p className="text-xs text-ink-500">{f.dateTime(h.at)}</p>
                        </li>
                      ))}
                    </ol>
                  </CardBody>
                </Card>
              )}

              <Card className="divide-y divide-ink-100 overflow-hidden">
                <button onClick={() => setDialog("report")} className="flex w-full items-center gap-3 px-5 py-3.5 text-start text-sm font-semibold text-ink-700 hover:bg-ink-50">
                  <FileWarning className="size-4 text-warning-600" /> {t("reportIssue")}
                </button>
                <button onClick={() => setDialog("dispute")} className="flex w-full items-center gap-3 px-5 py-3.5 text-start text-sm font-semibold text-ink-700 hover:bg-ink-50">
                  <Scale className="size-4 text-ink-400" /> {t("raiseDispute")}
                </button>
              </Card>
            </div>
          </div>

          {rx && (
            <FileViewer
              id={rx.id}
              title={t("prescriptionTitle", { name: patientName })}
              description={`${rx.mimeType} · ${formatBytes(rx.sizeBytes)}`}
              mimeType={rx.mimeType}
              load={() => bookingsApi.prescriptionUrl(v.bookingId, rx.id)}
              onClose={() => setRx(null)}
            />
          )}
          {dialog === "sos" && <SosDialog visitId={v.id} familyPhone={customer?.phone} onClose={() => setDialog(null)} />}
          {dialog === "report" && <ReportIssueDialog visitId={v.id} onClose={() => setDialog(null)} />}
          {dialog === "dispute" && <DisputeDialog visitId={v.id} onClose={() => setDialog(null)} />}
        </>
      )}
    </div>
  );
}
