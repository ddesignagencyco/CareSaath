/**
 * Shared configuration for the CareSaath load tests.
 *
 * The scripts run inside the grafana/k6 container (see the `load:*` npm
 * scripts), so the API is reached through host.docker.internal. Override
 * BASE_URL to point at a remote deployment:
 *
 *   docker run --rm -v "$PWD/load/k6:/scripts" -e BASE_URL=https://api.example.com \
 *     grafana/k6 run /scripts/search.js
 */

export const BASE_URL = (__ENV.BASE_URL || 'http://host.docker.internal:3000').replace(
  /\/+$/,
  '',
);
export const API_PREFIX = '/api/v1';

/** Which VU profile to run: smoke (CI), standard, spike or soak. */
export const PROFILE = __ENV.PROFILE || 'standard';

/**
 * VU profiles. `smoke` is the CI guard rail, `standard` is the baseline run,
 * `spike` hunts for the saturation point and `soak` looks for leaks over
 * time.
 */
export const PROFILES = {
  smoke: [{ duration: '10s', target: 5 }],
  standard: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '15s', target: 0 },
  ],
  spike: [
    { duration: '30s', target: 20 },
    { duration: '10s', target: 200 },
    { duration: '1m', target: 200 },
    { duration: '10s', target: 0 },
  ],
  soak: [
    { duration: '1m', target: 20 },
    { duration: '10m', target: 20 },
  ],
};

/** Latency budget for a single search request, in milliseconds. */
export const SEARCH_P95_MS = Number(__ENV.SEARCH_P95_MS || 500);
/** Latency budget for a booking write (transactional, several inserts). */
export const WRITE_P95_MS = Number(__ENV.WRITE_P95_MS || 800);
/** Share of requests that may fail without failing the run. */
export const MAX_ERROR_RATE = Number(__ENV.MAX_ERROR_RATE || 0.01);

/** Returns the ramp stages for the selected profile. */
export function stages(profile) {
  return PROFILES[profile] || PROFILES.standard;
}
