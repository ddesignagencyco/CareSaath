import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { useLabels } from "@shared/i18n/use-labels";
import type { Tone } from "@shared/ui/badge";
import { formatMoney } from "@shared/lib/format";
import type { AppNotification, CaregiverBookingStatus } from "@shared/caregiver-types";
import type { IncidentStatus, VisitStatus } from "@shared/types";

export const VISIT_TONE: Record<VisitStatus, Tone> = {
  REQUESTED: "accent",
  CONFIRMED: "brand",
  EN_ROUTE: "brand",
  CHECKED_IN: "brand",
  IN_PROGRESS: "brand",
  CHECKED_OUT: "brand",
  COMPLETED: "success",
  DECLINED: "neutral",
  CANCELLED: "neutral",
};

export const BOOKING_TONE: Record<CaregiverBookingStatus, Tone> = {
  REQUESTED: "accent",
  CONFIRMED: "success",
  DECLINED: "neutral",
  CANCELLED: "neutral",
  COMPLETED: "success",
};

export const ACTIVE_VISIT: VisitStatus[] = ["EN_ROUTE", "CHECKED_IN", "IN_PROGRESS", "CHECKED_OUT"];

/**
 * The backend never moves a booking to COMPLETED (no code path sets it), so a
 * CONFIRMED booking whose remaining visits are all completed is shown as
 * completed. Derived from the visits the API returned, never invented.
 */
export function bookingDisplayStatus(b: { status: CaregiverBookingStatus; visits: { status: VisitStatus }[] }): CaregiverBookingStatus {
  if (b.status !== "CONFIRMED") return b.status;
  const live = b.visits.filter((v) => v.status !== "CANCELLED" && v.status !== "DECLINED");
  return live.length > 0 && live.every((v) => v.status === "COMPLETED") ? "COMPLETED" : b.status;
}

/** True when a booking still has visits the cancel route would cancel (REQUESTED/CONFIRMED). */
export function hasCancellableVisits(b: { status: CaregiverBookingStatus; visits: { status: VisitStatus }[] }): boolean {
  return (b.status === "REQUESTED" || b.status === "CONFIRMED") && b.visits.some((v) => v.status === "REQUESTED" || v.status === "CONFIRMED");
}

const CIPHERTEXT = /^[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}$/;

/**
 * medicalContext is AES-GCM encrypted at rest as "iv:tag:ciphertext". When the
 * backend can't decrypt it (key mismatch) it returns that raw string; it must
 * never be shown or saved back as if it were the patient's notes.
 */
export function isUnreadableMedical(value: string | null | undefined): boolean {
  return !!value && CIPHERTEXT.test(value);
}

export interface NotificationView {
  title: string;
  body: string;
  href: string | null;
  tone: "brand" | "accent" | "danger" | "success" | "neutral";
}

const INCIDENT_STATUSES: readonly string[] = ["OPEN", "IN_REVIEW", "RESOLVED"];

export function useDescribe(): (n: AppNotification) => NotificationView {
  const t = useTranslations("customerA.notifications.events");
  const L = useLabels();
  return useCallback(
    (n: AppNotification): NotificationView => {
      const p = n.payload;
      const visit = typeof p.visitId === "string" ? `/customer/visits/${p.visitId}` : null;
      const booking = typeof p.bookingId === "string" ? `/customer/bookings/${p.bookingId}` : null;
      switch (n.event) {
        case "booking.confirmed":
          return { title: t("bookingConfirmed.title"), body: t("bookingConfirmed.body"), href: booking, tone: "success" };
        case "booking.declined":
          return { title: t("bookingDeclined.title"), body: t("bookingDeclined.body"), href: booking, tone: "neutral" };
        case "visit.en_route":
          return { title: t("enRoute.title"), body: t("enRoute.body"), href: visit, tone: "brand" };
        case "visit.checked_in":
          return { title: t("checkedIn.title"), body: t("checkedIn.body"), href: visit, tone: "brand" };
        case "visit.in_progress":
          return { title: t("inProgress.title"), body: "", href: visit, tone: "brand" };
        case "visit.checked_out":
          return { title: t("checkedOut.title"), body: t("checkedOut.body"), href: visit, tone: "brand" };
        case "visit.completed":
          return { title: t("completed.title"), body: t("completed.body"), href: visit, tone: "success" };
        case "visit.rescheduled":
          return { title: t("rescheduled.title"), body: "", href: visit, tone: "brand" };
        case "payment.paid":
          return {
            title: t("paymentPaid.title"),
            body: typeof p.amount === "number" ? t("paymentPaid.body", { amount: formatMoney(p.amount) }) : "",
            href: "/customer/account/payments",
            tone: "success",
          };
        case "dispute.raised":
          return { title: t("disputeRaised.title"), body: t("disputeRaised.body"), href: null, tone: "danger" };
        case "dispute.resolved":
          return { title: t("disputeResolved.title"), body: t("disputeResolved.body"), href: null, tone: "success" };
        case "safety_incident.sos.contact":
          // One row per emergency contact alerted (the SMS goes to the contact; this PUSH row is the customer's copy).
          return {
            title: t("sosContact.title"),
            body: typeof p.contact === "string" ? t("sosContact.body", { contact: p.contact }) : "",
            href: visit,
            tone: "danger",
          };
        case "safety_incident.updated": {
          const raw = String(p.status ?? "");
          const status = INCIDENT_STATUSES.includes(raw) ? L.incidentStatus(raw as IncidentStatus).toLowerCase() : raw.replace("_", " ").toLowerCase();
          return { title: t("safetyUpdated.title"), body: t("safetyUpdated.body", { status }), href: null, tone: "neutral" };
        }
        default:
          return { title: n.event.replace(/[._]/g, " "), body: "", href: null, tone: "neutral" };
      }
    },
    [t, L],
  );
}

const SEEN_KEY = "caresaath.customer.notificationsSeenAt";
export const SEEN_EVENT = "caresaath:customer-notifications-seen";

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
