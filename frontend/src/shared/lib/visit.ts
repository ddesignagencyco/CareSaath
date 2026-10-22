import type { Tone } from "../ui/badge";
import type { Address } from "../caregiver-types";
import type { VisitStatus } from "../types";

/*
 * Non-text visit helpers. Anything users read (dates, times, status labels)
 * comes from useFmt() / useLabels() in shared/i18n so it follows the locale.
 */

/** @db.Date "YYYY-MM-DDT00:00:00.000Z" -> "YYYY-MM-DD" (no timezone shift). */
export const dayKey = (dateOnly: string) => dateOnly.slice(0, 10);

export function localDayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Visit start as epoch ms in local time. */
export function visitStart(dateOnly: string, hhmm: string): number {
  const [y, m, d] = dayKey(dateOnly).split("-").map(Number);
  const [h, min] = hhmm.split(":").map(Number);
  return new Date(y, m - 1, d, h, min, 0, 0).getTime();
}

export const mapsUrl = (a: Pick<Address, "latitude" | "longitude">) =>
  `https://www.google.com/maps/dir/?api=1&destination=${a.latitude},${a.longitude}`;

export const VISIT_TONE: Record<VisitStatus, Tone> = {
  REQUESTED: "accent",
  CONFIRMED: "brand",
  EN_ROUTE: "brand",
  CHECKED_IN: "brand",
  IN_PROGRESS: "brand",
  CHECKED_OUT: "warning",
  COMPLETED: "success",
  DECLINED: "neutral",
  CANCELLED: "neutral",
};

/** Statuses where the caregiver is actively handling the visit. */
export const ACTIVE_STATUSES: VisitStatus[] = ["EN_ROUTE", "CHECKED_IN", "IN_PROGRESS", "CHECKED_OUT"];
