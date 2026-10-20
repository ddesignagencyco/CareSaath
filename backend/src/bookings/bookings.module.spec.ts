import { describe, expect, it } from 'vitest';
import { BookingType } from '../generated/prisma/client.js';
import { expandOccurrences } from './bookings.module.js';

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

describe('expandOccurrences', () => {
  it('returns a single visit for a SINGLE booking', () => {
    const dates = expandOccurrences(d('2026-01-05'), d('2026-01-30'), BookingType.SINGLE, []);
    expect(dates).toHaveLength(1);
    expect(dates[0].toISOString().slice(0, 10)).toBe('2026-01-05');
  });

  it('expands a recurring booking to matching weekdays only', () => {
    // 2026-01-05 is a Monday. Mon/Wed/Fri over two weeks => 6 visits.
    const dates = expandOccurrences(
      d('2026-01-05'),
      d('2026-01-18'),
      BookingType.RECURRING,
      [1, 3, 5],
    );
    expect(dates.map((x) => x.toISOString().slice(0, 10))).toEqual([
      '2026-01-05',
      '2026-01-07',
      '2026-01-09',
      '2026-01-12',
      '2026-01-14',
      '2026-01-16',
    ]);
  });

  it('treats Sunday as ISO day 7', () => {
    // 2026-01-04 is a Sunday.
    const dates = expandOccurrences(
      d('2026-01-04'),
      d('2026-01-11'),
      BookingType.RECURRING,
      [7],
    );
    expect(dates.map((x) => x.toISOString().slice(0, 10))).toEqual([
      '2026-01-04',
      '2026-01-11',
    ]);
  });

  it('returns no visits when no weekday matches', () => {
    const dates = expandOccurrences(
      d('2026-01-05'),
      d('2026-01-09'),
      BookingType.RECURRING,
      [7],
    );
    expect(dates).toHaveLength(0);
  });
});
