/**
 * Shared metrics and assertions for the CareSaath load tests.
 */
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

/** Duration of a single public search request. */
export const searchDuration = new Trend('search_duration', true);
/** Duration of a public caregiver profile lookup. */
export const profileDuration = new Trend('profile_duration', true);
/** Duration of a booking creation (transactional write). */
export const writeDuration = new Trend('write_duration', true);
/** 1 when the search page was served from Redis, 0 when it hit PostgreSQL. */
export const cacheHit = new Rate('search_cache_hit');
/** Bookings created during the run. */
export const bookingsCreated = new Counter('bookings_created');
/**
 * Double-booking conflicts. These are a correct response (the API refuses
 * an overlapping slot) and not a failure, but they are counted so a run can
 * show how much of the write traffic was rejected.
 */
export const bookingConflicts = new Counter('booking_conflicts');

/** Validates a public search response. */
export function checkSearchResponse(res) {
  const ok = check(res, {
    'search: status is 200': (r) => r.status === 200,
    'search: body has items array': (r) => {
      const body = r.json();
      return body !== null && Array.isArray(body.items);
    },
    'search: page metadata present': (r) => {
      const body = r.json();
      return body !== null && typeof body.total === 'number' && typeof body.page === 'number';
    },
  });
  return ok;
}

/** Validates a public caregiver profile response. */
export function checkProfileResponse(res) {
  return check(res, {
    'profile: status is 200': (r) => r.status === 200,
    'profile: body has an id': (r) => {
      const body = r.json();
      return body !== null && typeof body.id === 'string';
    },
  });
}

/**
 * Validates a booking creation. A 409 means the slot was taken by a racing
 * request, which is the documented conflict behaviour rather than an error.
 */
export function checkBookingResponse(res) {
  const status = res.status;
  if (status === 409) {
    bookingConflicts.add(1);
    return check(res, { 'booking: conflict is reported as 409': () => true });
  }
  const ok = check(res, {
    'booking: status is 201': (r) => r.status === 201,
    'booking: body has an id': (r) => {
      const body = r.json();
      return body !== null && typeof body.id === 'string';
    },
  });
  if (ok) {
    bookingsCreated.add(1);
  }
  return ok;
}

/** Picks a random element from an array. */
export function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/** ISO date (YYYY-MM-DD) `days` from today. */
export function dateOffset(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
