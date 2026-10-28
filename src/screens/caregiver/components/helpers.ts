import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import type { Address, DocType, LicenseBody, Specialty, VisitStatus } from '../../../api/types';
import type { Tone } from '../../../components/ui';

/*
 * Caregiver-side helpers, ported from the web (shared/lib/visit.ts,
 * shared/lib/options.ts, shared/hooks/use-now.ts).
 */

/** Current time, re-rendered every `ms`. */
export function useNow(ms = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** @db.Date "YYYY-MM-DDT00:00:00.000Z" -> "YYYY-MM-DD" (no timezone shift). */
export const dayKey = (dateOnly: string) => dateOnly.slice(0, 10);

/** Visit start as epoch ms in local time. */
export function visitStart(dateOnly: string, hhmm: string): number {
  const [y, m, d] = dayKey(dateOnly).split('-').map(Number);
  const [h, min] = hhmm.split(':').map(Number);
  return new Date(y, m - 1, d, h, min, 0, 0).getTime();
}

export const mapsUrl = (a: Pick<Address, 'latitude' | 'longitude'>) =>
  `https://www.google.com/maps/dir/?api=1&destination=${a.latitude},${a.longitude}`;

export const openMaps = (a: Pick<Address, 'latitude' | 'longitude'>) => Linking.openURL(mapsUrl(a)).catch(() => undefined);
export const callPhone = (phone: string) => Linking.openURL(`tel:${phone}`).catch(() => undefined);

export const VISIT_TONE: Record<VisitStatus, Tone> = {
  REQUESTED: 'accent',
  CONFIRMED: 'brand',
  EN_ROUTE: 'brand',
  CHECKED_IN: 'brand',
  IN_PROGRESS: 'brand',
  CHECKED_OUT: 'warning',
  COMPLETED: 'success',
  DECLINED: 'neutral',
  CANCELLED: 'neutral',
};

/** Statuses where the caregiver is actively handling the visit. */
export const ACTIVE_STATUSES: VisitStatus[] = ['EN_ROUTE', 'CHECKED_IN', 'IN_PROGRESS', 'CHECKED_OUT'];

export const SPECIALTIES: Specialty[] = ['NURSING', 'PHYSIOTHERAPY', 'POST_SURGERY_CARE', 'ELDERLY_CARE'];
export const LICENSE_BODIES: LicenseBody[] = ['PNC', 'PMDC', 'OTHER'];
export const DOC_TYPES: DocType[] = ['LICENSE', 'CERTIFICATE', 'CNIC_COPY', 'OTHER'];

/** Pilot launch is Lahore only; add cities here as the pilot expands. */
export const CITIES = ['Lahore'];

/** "3520112345671" or partial -> "35201-1234567-1" as the user types. */
export function formatCnic(input: string): string {
  const d = input.replace(/\D/g, '').slice(0, 13);
  if (d.length <= 5) return d;
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
}

export const CNIC_PATTERN = /^\d{5}-\d{7}-\d$/;

/** Digits only, for rupee / year inputs. */
export const digits = (v: string, max = 9) => v.replace(/\D/g, '').slice(0, max);

/**
 * The API decrypts medical context for the assigned caregiver, but if it
 * can't, it returns the stored "iv:tag:data" ciphertext. Never show that.
 */
const CIPHERTEXT = /^[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}$/;
export function readableMedical(text: string | null | undefined): string | null | 'unreadable' {
  if (!text?.trim()) return null;
  return CIPHERTEXT.test(text.trim()) ? 'unreadable' : text;
}

export function greetingKey(now: number): 'morning' | 'afternoon' | 'evening' {
  const h = new Date(now).getHours();
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}

/** "YYYY-MM-DD" for a Date in local time. */
export function toDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Short label under a DateBlock's day number: Today / Tomorrow / Yesterday,
 * else the weekday only. The block already shows the date, and a full
 * "Sat, 25 Oct" truncates in its 60dp width.
 */
export function dateBlockLabel(f: { relativeDay: (d: string) => string; shortDay: (d: string) => string; dayOfWeek: (dow: number) => string }, dateOnly: string): string {
  const rel = f.relativeDay(dateOnly);
  if (rel !== f.shortDay(dateOnly)) return rel;
  const [y, m, d] = dateOnly.slice(0, 10).split('-').map(Number);
  return f.dayOfWeek(new Date(y, m - 1, d).getDay());
}
