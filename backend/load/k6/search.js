/**
 * BE-068 — caregiver search under concurrent load.
 *
 * The BE-065 performance suite proves a single search stays inside the SRS §6
 * budget on a throttled 3G link. This script asks the other question: what
 * happens when many people search at the same time?
 *
 * It drives the public discovery endpoints (no authentication needed) with a
 * ramping number of virtual users and asserts:
 *   - p95 latency stays inside the budget,
 *   - the error rate stays under the threshold,
 *   - the Redis cache actually serves the traffic (cache hit ratio).
 *
 * Usage (see the npm scripts in backend/package.json):
 *   npm run load:run                    # standard profile
 *   PROFILE=spike npm run load:run      # hunt for the saturation point
 */
import http from 'k6/http';
import { sleep } from 'k6';
import {
  API_PREFIX,
  BASE_URL,
  MAX_ERROR_RATE,
  PROFILE,
  SEARCH_P95_MS,
  stages,
} from './lib/config.js';
import {
  cacheHit,
  checkProfileResponse,
  checkSearchResponse,
  pick,
  profileDuration,
  searchDuration,
} from './lib/assertions.js';

const data = JSON.parse(open('./data.json'));

export const options = {
  scenarios: {
    search: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: stages(PROFILE),
      gracefulRampDown: '15s',
      exec: 'searchScenario',
      tags: { endpoint: 'search' },
    },
  },
  thresholds: {
    http_req_duration: [`p(95)<${SEARCH_P95_MS}`],
    http_req_failed: [`rate<${MAX_ERROR_RATE}`],
    checks: ['rate>0.99'],
    search_duration: [`p(95)<${SEARCH_P95_MS}`],
    // The search page is cached in Redis (BE-026); a run that mostly misses
    // the cache is a sign the cache stopped working. The floor is low
    // because a short run touches more distinct filters than it repeats.
    search_cache_hit: ['rate>0.3'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

/** One search request; returns the response so the caller can assert on it. */
function search(city, specialty, page) {
  const url =
    `${BASE_URL}${API_PREFIX}/caregivers` +
    `?specialty=${encodeURIComponent(specialty)}` +
    `&city=${encodeURIComponent(city)}` +
    `&page=${page}&limit=20`;
  const res = http.get(url, {
    headers: { Accept: 'application/json' },
    tags: { name: 'GET /caregivers', endpoint: 'search' },
  });
  searchDuration.add(res.timings.duration);
  const cache = res.headers['X-Cache'] || res.headers['x-cache'] || 'MISS';
  cacheHit.add(cache === 'HIT');
  return res;
}

export function searchScenario() {
  const city = pick(data.cities);
  const specialty = pick(data.specialties);

  checkSearchResponse(search(city, specialty, 1));

  // A second request on a different filter exercises a different cache key.
  if (Math.random() < 0.5) {
    checkSearchResponse(search(pick(data.cities), pick(data.specialties), 2));
  }

  // Every so often, open a caregiver profile: it is the click-through from
  // the search result and hits a different query shape.
  if (Math.random() < 0.2) {
    const id = pick(data.caregivers);
    const res = http.get(`${BASE_URL}${API_PREFIX}/caregivers/${id}`, {
      headers: { Accept: 'application/json' },
      tags: { name: 'GET /caregivers/:id', endpoint: 'profile' },
    });
    profileDuration.add(res.timings.duration);
    checkProfileResponse(res);
  }

  sleep(Math.random() * 0.3);
}
