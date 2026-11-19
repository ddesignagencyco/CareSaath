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

/**
 * inDrive-style live ETA. The backend sends `etaMinutes` computed at the moment
 * of a GPS fix (`at`); this anchors that value to the clock so the countdown
 * keeps falling minute-by-minute between fixes, and re-syncs whenever a fresh
 * fix arrives. `now = 0` (server prerender) returns the raw server value so
 * hydration matches. Never returns a negative number.
 */
export function effectiveEta(etaMinutes: number, at: string, now: number, estimate?: boolean): number {
  const base = Math.max(0, Math.round(etaMinutes));
  if (!now || base === 0) return base;
  // If this is an unconfirmed fallback estimate (the caregiver hasn't started streaming
  // live GPS yet), don't decay with the clock to zero — keep the estimate steady so customers
  // aren't misled into thinking the caregiver has arrived when they haven't moved.
  if (estimate) return base;
  const fixTime = new Date(at).getTime();
  if (!Number.isFinite(fixTime)) return base;
  const elapsedMin = Math.floor((now - fixTime) / 60_000);
  // Between live GPS fixes (streamed every 12-20s), allow a small decay buffer,
  // but cap clock decay at 1 minute so a stationary caregiver never counts down to 0.
  return Math.max(1, base - Math.min(1, Math.max(0, elapsedMin)));
}

/**
 * Splits an ETA in minutes into days, hours, and remaining minutes.
 * - Under 1 hour (e.g. 45): { days: 0, hours: 0, mins: 45 }
 * - 1 to 24 hours (e.g. 125): { days: 0, hours: 2, mins: 5 }
 * - Over 24 hours (e.g. 2476): { days: 1, hours: 17, mins: 16 }
 */
export function splitEta(etaMinutes: number): { days: number; hours: number; mins: number } {
  const total = Math.max(0, Math.round(etaMinutes));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  return { days, hours, mins };
}

/**
 * One palette for web and app: green = finished, teal = happening now,
 * muted = still ahead, red = ended badly. EN_ROUTE keeps its travel accent.
 */
export const VISIT_TONE: Record<VisitStatus, Tone> = {
  REQUESTED: "neutral",
  CONFIRMED: "neutral",
  EN_ROUTE: "accent",
  CHECKED_IN: "brand",
  IN_PROGRESS: "brand",
  CHECKED_OUT: "success",
  COMPLETED: "success",
  DECLINED: "danger",
  CANCELLED: "danger",
};

/** Statuses where the caregiver is actively handling the visit. */
export const ACTIVE_STATUSES: VisitStatus[] = ["EN_ROUTE", "CHECKED_IN", "IN_PROGRESS", "CHECKED_OUT"];

/** Statuses where an SOS can be raised (visit is confirmed or ongoing, not completed or cancelled). */
export const SOS_ELIGIBLE_STATUSES: VisitStatus[] = [
  "CONFIRMED",
  "EN_ROUTE",
  "CHECKED_IN",
  "IN_PROGRESS",
  "CHECKED_OUT",
];

