import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import { formatMoney } from "@shared/lib/format";
import type { AppNotification } from "@shared/caregiver-types";
import type { IncidentStatus } from "@shared/types";

export interface NotificationView {
  title: string;
  body: string;
  href: string | null;
  tone: "brand" | "accent" | "danger" | "success" | "neutral";
}

const amount = (p: Record<string, unknown>) => (typeof p.amount === "number" ? formatMoney(p.amount) : "");

const INCIDENT_STATUSES: readonly string[] = ["OPEN", "IN_REVIEW", "RESOLVED"];

/**
 * Event catalogue from the backend (caregiver-side events), in the current
 * language. Real payloads (NotificationsService.notify callers):
 * - booking.requested { bookingId, visits }  (seeded rows may lack `visits`)
 * - booking.cancelled { bookingId }
 * - booking.prescription.uploaded { bookingId, documentId }
 * - visit.rescheduled { bookingId, originalVisitId, visitId, scheduledDate: "YYYY-MM-DD" }
 * - dispute.raised { disputeId, visitId } · dispute.resolved { disputeId }
 * - payout.processing|transferred|rejected { payoutRequestId, amount, status }
 * - booking.completed · review.received · payment.cash.initiated · payment.cash.customer_confirmed · payment.paid { amount } · safety_incident.sos.contact { contact }
 * - safety_incident.updated { incidentId, status, priority }
 * Every event is stored once per channel (PUSH always; SMS when a phone is
 * passed), so the app lists PUSH rows only.
 */
export function useDescribe(): (n: AppNotification) => NotificationView {
  const t = useTranslations("caregiverA.notifications");
  const L = useLabels();
  const f = useFmt();
  return useCallback(
    (n: AppNotification): NotificationView => {
      const p = n.payload;
      const visit = typeof p.visitId === "string" ? `/caregiver/visits/${p.visitId}` : "/caregiver/visits";
      switch (n.event) {
        case "booking.requested":
          return {
            title: t("events.bookingRequested.title"),
            body: Number(p.visits) > 0 ? t("events.bookingRequested.body", { count: Number(p.visits) }) : t("events.bookingRequested.bodyNoCount"),
            href: "/caregiver/requests",
            tone: "accent",
          };
        case "booking.cancelled":
          return { title: t("events.bookingCancelled.title"), body: t("events.bookingCancelled.body"), href: "/caregiver/visits", tone: "neutral" };
        case "booking.prescription.uploaded":
          return { title: t("events.prescriptionUploaded.title"), body: t("events.prescriptionUploaded.body"), href: "/caregiver/requests", tone: "brand" };
        case "visit.rescheduled":
          return {
            title: t("events.visitRescheduled.title"),
            body: t("events.visitRescheduled.body", {
              date: typeof p.scheduledDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(p.scheduledDate) ? f.longDay(p.scheduledDate) : t("newDate"),
            }),
            href: typeof p.visitId === "string" ? `/caregiver/visits/${p.visitId}` : "/caregiver/visits",
            tone: "brand",
          };
        case "dispute.raised":
          return { title: t("events.disputeRaised.title"), body: t("events.disputeRaised.body"), href: "/caregiver/reports", tone: "danger" };
        case "dispute.resolved":
          return { title: t("events.disputeResolved.title"), body: t("events.disputeResolved.body"), href: "/caregiver/reports", tone: "success" };
        case "payout.processing":
          return { title: t("events.payoutProcessing.title"), body: t("events.payoutProcessing.body", { amount: amount(p) }), href: "/caregiver/earnings", tone: "brand" };
        case "payout.transferred":
          return { title: t("events.payoutTransferred.title"), body: t("events.payoutTransferred.body", { amount: amount(p) }), href: "/caregiver/earnings", tone: "success" };
        case "payout.rejected":
          return { title: t("events.payoutRejected.title"), body: t("events.payoutRejected.body", { amount: amount(p) }), href: "/caregiver/earnings", tone: "danger" };
        case "safety_incident.updated": {
          const raw = String(p.status ?? "");
          const status = INCIDENT_STATUSES.includes(raw)
            ? L.incidentStatus(raw as IncidentStatus).toLowerCase()
            : raw.replace("_", " ").toLowerCase();
          return { title: t("events.safetyUpdated.title"), body: t("events.safetyUpdated.body", { status }), href: "/caregiver/reports", tone: "neutral" };
        }
        case "booking.completed":
          return { title: t("events.bookingCompleted.title"), body: t("events.bookingCompleted.body"), href: "/caregiver/visits", tone: "success" };
        case "review.received":
          return { title: t("events.reviewReceived.title"), body: t("events.reviewReceived.body"), href: "/caregiver/profile", tone: "brand" };
        case "payment.cash.initiated":
          return { title: t("events.cashInitiated.title"), body: t("events.cashInitiated.body"), href: visit, tone: "accent" };
        case "payment.cash.customer_confirmed":
          return { title: t("events.cashCustomerConfirmed.title"), body: t("events.cashCustomerConfirmed.body"), href: visit, tone: "accent" };
        case "payment.paid":
          return { title: t("events.paymentPaid.title"), body: typeof p.amount === "number" ? t("events.paymentPaid.body", { amount: amount(p) }) : "", href: visit, tone: "success" };
        case "safety_incident.sos.contact":
          return { title: t("events.sosContact.title"), body: typeof p.contact === "string" ? t("events.sosContact.body", { contact: p.contact }) : "", href: "/caregiver/reports", tone: "danger" };
        case "caregiver.strike.recorded":
          return { title: t("events.strikeRecorded.title"), body: t("events.strikeRecorded.body"), href: null, tone: "danger" };
        case "caregiver.suspended":
          return { title: t("events.suspended.title"), body: t("events.suspended.body"), href: "/caregiver/status", tone: "danger" };
        default:
          // Unknown event: show its technical name.
          return { title: n.event.replace(/[._]/g, " "), body: "", href: null, tone: "neutral" };
      }
    },
    [t, L, f],
  );
}

const SEEN_KEY = "caresaath.caregiver.notificationsSeenAt";
export const SEEN_EVENT = "caresaath:notifications-seen";

/** The API has no read flags, so "seen" is tracked per device. */
export function getSeenAt(): string {
  try {
    return localStorage.getItem(SEEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function markSeen(iso: string) {
  try {
    localStorage.setItem(SEEN_KEY, iso);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
}
