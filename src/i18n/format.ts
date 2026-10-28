import { useMemo } from 'react';
import type {
  CaregiverBookingStatus,
  DisputeStatus,
  DocType,
  IncidentPriority,
  IncidentSource,
  IncidentStatus,
  LicenseBody,
  PatientRelation,
  PaymentMethod,
  PaymentStatus,
  PayoutAccountType,
  PayoutStatus,
  Specialty,
  VerificationStatus,
  VisitStatus,
} from '../api/types';
import { formatPkMobile } from '../lib/phone';
import { useSettings, useT } from './index';

const DAY = 86_400_000;

/*
 * Dates are formatted by hand rather than with Intl: Hermes' Intl coverage
 * differs between Android and iOS, and Urdu month names must be identical on
 * both. Urdu keeps Latin digits and AM/PM, as Pakistani apps do (same as web).
 */
const NAMES = {
  en: {
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    monthsLong: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    daysLong: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    sep: ', ',
  },
  ur: {
    months: ['جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون', 'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر'],
    monthsLong: ['جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون', 'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر'],
    days: ['اتوار', 'پیر', 'منگل', 'بدھ', 'جمعرات', 'جمعہ', 'ہفتہ'],
    daysLong: ['اتوار', 'پیر', 'منگل', 'بدھ', 'جمعرات', 'جمعہ', 'ہفتہ'],
    sep: '، ',
  },
};

/** LTR isolate so "9:00 AM" / "+92 300…" don't reorder inside Urdu text. */
const isolate = (x: string) => `⁦${x}⁩`;

/** "YYYY-MM-DD…" (Prisma @db.Date) -> local midnight, no timezone shift. */
export function fromDateOnly(dateOnly: string): Date {
  const [y, m, d] = dateOnly.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function localDayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** API money is integer paisa; display whole rupees: "Rs 2,500". */
export function formatMoney(paisa: number): string {
  const rupees = Math.round(Math.abs(paisa) / 100);
  const sign = paisa < 0 ? '−' : '';
  // LTR isolate: "−Rs 500" must not reorder to "Rs 500−" inside Urdu text.
  return `⁦${sign}Rs ${rupees.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}⁩`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Locale-aware formatting for screens; mirrors the web's useFmt(). */
export function useFmt() {
  const { locale } = useSettings();
  const t = useT('labels.time');
  const tm = useT('mobile.time');
  return useMemo(() => {
    const n = NAMES[locale];
    const clock = (h: number, m: number) => `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
    const time = (hhmm: string) => {
      const [h, m] = hhmm.split(':').map(Number);
      return isolate(clock(h, m));
    };
    const dayMonth = (d: Date) => `${d.getDate()} ${n.months[d.getMonth()]}`;
    const date = (d: Date) => `${dayMonth(d)} ${d.getFullYear()}`;
    const shortDay = (d: Date) => `${n.days[d.getDay()]}${n.sep}${dayMonth(d)}`;

    return {
      locale,
      money: formatMoney,
      phone: formatPkMobile,
      date: (iso: string | null | undefined) => (iso ? date(new Date(iso)) : '—'),
      dateTime: (iso: string | null | undefined) => {
        if (!iso) return '—';
        const d = new Date(iso);
        return `${dayMonth(d)}${n.sep}${isolate(clock(d.getHours(), d.getMinutes()))}`;
      },
      relativeTime: (iso: string, now = Date.now()) => {
        const mins = Math.round((now - new Date(iso).getTime()) / 60_000);
        if (mins < 1) return t('justNow');
        if (mins < 60) return tm('minutesAgo', { n: mins });
        const hours = Math.round(mins / 60);
        if (hours < 24) return tm('hoursAgo', { n: hours });
        const days = Math.round(hours / 24);
        if (days < 30) return tm('daysAgo', { n: days });
        return date(new Date(iso));
      },
      /** Today / Tomorrow / Yesterday, else "Sat, 25 Oct". */
      relativeDay: (dateOnly: string, now = Date.now()) => {
        const diff = Math.round((fromDateOnly(dateOnly).getTime() - fromDateOnly(localDayKey(now)).getTime()) / DAY);
        if (diff === 0) return t('today');
        if (diff === 1) return t('tomorrow');
        if (diff === -1) return t('yesterday');
        return shortDay(fromDateOnly(dateOnly));
      },
      shortDay: (dateOnly: string) => shortDay(fromDateOnly(dateOnly)),
      longDay: (dateOnly: string) => {
        const d = fromDateOnly(dateOnly);
        return `${n.daysLong[d.getDay()]}${n.sep}${d.getDate()} ${n.monthsLong[d.getMonth()]}`;
      },
      monthYear: (d: Date) => `${n.monthsLong[d.getMonth()]} ${d.getFullYear()}`,
      /** "09:00" -> "9:00 AM" */
      time,
      timeWindow: (start: string, end: string) => isolate(`${time(start)} – ${time(end)}`),
      /** ISO weekdays (1 = Mon … 7 = Sun) -> "Every day" / "Weekdays" / "Mon, Wed". */
      weekdays: (isoDays: number[]) => {
        const sorted = [...isoDays].sort();
        if (sorted.length === 7) return t('everyDay');
        if (sorted.join() === '1,2,3,4,5') return t('weekdays');
        return sorted.map(d => n.days[d % 7]).join(n.sep);
      },
      /** Availability day-of-week (0 = Sunday … 6 = Saturday). */
      dayOfWeek: (dow: number) => n.days[dow],
      dayOfWeekLong: (dow: number) => n.daysLong[dow],
      age: (dob: string | null, now = Date.now()) => {
        if (!dob) return null;
        const b = new Date(dob);
        const c = new Date(now);
        let a = c.getFullYear() - b.getFullYear();
        if (c.getMonth() < b.getMonth() || (c.getMonth() === b.getMonth() && c.getDate() < b.getDate())) a--;
        return t('ageYears', { n: a });
      },
      list: (items: string[]) => items.join(n.sep),
    };
  }, [locale, t, tm]);
}

export type Fmt = ReturnType<typeof useFmt>;

/** Translated enum labels (statuses, specialties, councils…); mirrors web useLabels(). */
export function useLabels() {
  const t = useT('labels');
  return useMemo(() => {
    const gender = (v: string) => (v === 'Female' || v === 'Male' || v === 'Other' ? t(`gender.${v}`) : v);
    return {
      specialty: (v: Specialty) => t(`specialty.${v}`),
      specialtyHint: (v: Specialty) => t(`specialtyHint.${v}`),
      licenseBody: (v: LicenseBody) => t(`licenseBody.${v}`),
      licenseBodyShort: (v: LicenseBody) => t(`licenseBodyShort.${v}`),
      licenseBodyOption: (v: LicenseBody) => t(`licenseBodyOption.${v}`),
      licenseBodyHint: (v: LicenseBody) => t(`licenseBodyHint.${v}`),
      verification: (v: VerificationStatus) => t(`verification.${v}`),
      docType: (v: DocType) => t(`docType.${v}`),
      visitCaregiver: (v: VisitStatus) => t(`visitCaregiver.${v}`),
      visitCustomer: (v: VisitStatus) => t(`visitCustomer.${v}`),
      timeline: (v: VisitStatus) => t(`timeline.${v}`),
      bookingCustomer: (v: CaregiverBookingStatus) => t(`bookingCustomer.${v}`),
      bookingCaregiver: (v: CaregiverBookingStatus) => t(`bookingCaregiver.${v}`),
      payout: (v: PayoutStatus) => t(`payout.${v}`),
      payoutAccount: (v: PayoutAccountType) => t(`payoutAccount.${v}`),
      priority: (v: IncidentPriority) => t(`priority.${v}`),
      incidentStatus: (v: IncidentStatus) => t(`incidentStatus.${v}`),
      incidentSource: (v: IncidentSource) => t(`incidentSource.${v}`),
      dispute: (v: DisputeStatus) => t(`dispute.${v}`),
      paymentMethod: (v: PaymentMethod) => t(`paymentMethod.${v}`),
      paymentStatus: (v: PaymentStatus) => t(`paymentStatus.${v}`),
      relation: (v: PatientRelation) => t(`relation.${v}`),
      gender,
      patientLine: (p: { relationship: PatientRelation; gender: string | null }, age: string | null) =>
        [age, p.gender ? gender(p.gender) : null, p.relationship === 'SELF' ? t('patient.self') : t('patient.family')]
          .filter(Boolean)
          .join(' · '),
    };
  }, [t]);
}

export type Labels = ReturnType<typeof useLabels>;
