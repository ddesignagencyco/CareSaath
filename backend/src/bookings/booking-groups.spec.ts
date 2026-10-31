import { describe, expect, it } from 'vitest';
import { bookingGroupWhere, derivedBookingGroup } from './bookings.module.js';

const v = (...statuses: string[]) => statuses.map((status) => ({ status })) as never;

describe('booking groups (customer UI tabs)', () => {
  it('derives waiting / active / past like the frontend did', () => {
    expect(derivedBookingGroup({ status: 'REQUESTED' as never, visits: v('REQUESTED') })).toBe('waiting');
    expect(derivedBookingGroup({ status: 'CONFIRMED' as never, visits: v('COMPLETED', 'CONFIRMED') })).toBe('active');
    expect(derivedBookingGroup({ status: 'CONFIRMED' as never, visits: [] })).toBe('active');
    expect(derivedBookingGroup({ status: 'CONFIRMED' as never, visits: v('COMPLETED', 'CANCELLED') })).toBe('past');
    expect(derivedBookingGroup({ status: 'CANCELLED' as never, visits: v('CANCELLED') })).toBe('past');
    expect(derivedBookingGroup({ status: 'COMPLETED' as never, visits: v('COMPLETED') })).toBe('past');
  });

  it('builds matching Prisma filters', () => {
    expect(bookingGroupWhere(undefined)).toEqual({});
    expect(bookingGroupWhere('all')).toEqual({});
    expect(bookingGroupWhere('waiting')).toEqual({ status: 'REQUESTED' });
    const active = bookingGroupWhere('active');
    expect(active).toMatchObject({ status: 'CONFIRMED' });
    expect(bookingGroupWhere('past')).toEqual({ NOT: [{ status: 'REQUESTED' }, active] });
  });
});
