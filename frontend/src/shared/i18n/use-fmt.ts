"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { formatMoney } from "../lib/format";
import { formatPkMobile } from "../lib/phone";

const DAY = 86_400_000;

/** "YYYY-MM-DD…" (Prisma @db.Date) -> local midnight Date, no timezone shift. */
function fromDateOnly(dateOnly: string): Date {
  const [y, m, d] = dateOnly.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function localKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Locale-aware formatting for customer and caregiver screens.
 * Urdu uses Urdu month/day names with Latin digits and AM/PM (as Pakistani
 * apps do); money stays "Rs 2,500" in both languages.
 */
export function useFmt() {
  const locale = useLocale();
  const t = useTranslations("labels.time");
  return useMemo(() => {
    const tag = locale === "ur" ? "ur-PK" : "en-GB";
    const dtf = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(tag, o);
    // LTR isolate: "9:00 AM" must not reorder to "AM 9:00" inside Urdu (RTL) text.
    const isolate = (x: string) => `⁦${x}⁩`;
    const dateF = dtf({ day: "numeric", month: "short", year: "numeric" });
    const dateTimeF = dtf({ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    const dayMonthF = dtf({ day: "numeric", month: "short" });
    const shortDayF = dtf({ weekday: "short", day: "numeric", month: "short" });
    const longDayF = dtf({ weekday: "long", day: "numeric", month: "long" });
    // en-GB writes "9:00 am"; en-US keeps the "9:00 AM" style used across the app.
    const timeF = new Intl.DateTimeFormat(locale === "ur" ? "ur-PK" : "en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    const weekdayF = dtf({ weekday: "short" });
    const rtf = new Intl.RelativeTimeFormat(locale === "ur" ? "ur" : "en", { numeric: "auto", style: "short" });

    const time = (hhmm: string) => {
      const [h, m] = hhmm.split(":").map(Number);
      return isolate(timeF.format(new Date(2000, 0, 1, h, m)));
    };

    return {
      locale,
      money: formatMoney,
      /** Display phone number (isolated LTR so "+92" stays in front in Urdu). */
      phone: formatPkMobile,
      date: (iso: string | null | undefined) => (iso ? dateF.format(new Date(iso)) : "—"),
      dateTime: (iso: string | null | undefined) => {
        if (!iso) return "—";
        const d = new Date(iso);
        // Urdu: date words + an isolated "9:05 PM" so the time doesn't reorder in RTL.
        return locale === "ur" ? `${dayMonthF.format(d)}، ${isolate(timeF.format(d))}` : dateTimeF.format(d);
      },
      /** "5 min ago", "2 hr ago", "3 days ago"; older dates show the date. */
      relativeTime: (iso: string, now = Date.now()) => {
        const mins = Math.round((now - new Date(iso).getTime()) / 60_000);
        if (mins < 1) return t("justNow");
        if (mins < 60) return rtf.format(-mins, "minute");
        const hours = Math.round(mins / 60);
        if (hours < 24) return rtf.format(-hours, "hour");
        const days = Math.round(hours / 24);
        if (days < 30) return rtf.format(-days, "day");
        return dateF.format(new Date(iso));
      },
      /** Today / Tomorrow / Yesterday, else "Sat, 25 Oct". `now` 0 = unknown (prerender). */
      relativeDay: (dateOnly: string, now: number) => {
        if (now) {
          const diff = Math.round((fromDateOnly(dateOnly).getTime() - fromDateOnly(localKey(now)).getTime()) / DAY);
          if (diff === 0) return t("today");
          if (diff === 1) return t("tomorrow");
          if (diff === -1) return t("yesterday");
        }
        return shortDayF.format(fromDateOnly(dateOnly));
      },
      longDay: (dateOnly: string) => longDayF.format(fromDateOnly(dateOnly)),
      /** "YYYY-MM-DD" → compact date with year (e.g. "27 Oct 2026"), parsed locally. */
      dateLong: (dateOnly: string) => dtf({ day: "numeric", month: "short", year: "numeric" }).format(fromDateOnly(dateOnly)),
      /** "09:00" -> "9:00 AM" */
      time,
      timeWindow: (start: string, end: string) => isolate(`${time(start)} – ${time(end)}`),
      /** ISO weekdays (1 = Mon … 7 = Sun) -> "Every day" / "Weekdays" / "Mon, Wed". */
      weekdays: (isoDays: number[]) => {
        const sorted = [...isoDays].sort();
        if (sorted.length === 7) return t("everyDay");
        if (sorted.join() === "1,2,3,4,5") return t("weekdays");
        // 2024-01-01 was a Monday.
        return sorted.map((d) => weekdayF.format(new Date(2024, 0, d))).join(locale === "ur" ? "، " : ", ");
      },
      /** Short name for availability day-of-week (0 = Sunday … 6 = Saturday). */
      dayOfWeek: (dow: number) => weekdayF.format(new Date(2024, 0, dow === 0 ? 7 : dow)),
      dayOfWeekLong: (dow: number) => dtf({ weekday: "long" }).format(new Date(2024, 0, dow === 0 ? 7 : dow)),
      age: (dob: string | null, now: number) => {
        if (!dob || !now) return null;
        const b = new Date(dob);
        const n = new Date(now);
        let a = n.getFullYear() - b.getFullYear();
        if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
        return t("ageYears", { n: a });
      },
      list: (items: string[]) => items.join(locale === "ur" ? "، " : ", "),
    };
  }, [locale, t]);
}

export type Fmt = ReturnType<typeof useFmt>;
