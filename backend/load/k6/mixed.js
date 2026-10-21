/**
 * BE-068 — mixed read/write load.
 *
 * The search script only exercises the read path, which is served from Redis
 * and never touches the write path of the API. This script adds the
 * transactional side: customers book caregivers while the search traffic keeps
 * running, so the database, the audit log and the notification queue are all
 * under pressure at the same time.
 *
 * Usage:
 *   npm run load:run:mixed
 *   PROFILE=spike npm run load:run:mixed
 */
import http from 'k6/http';
import { sleep } from 'k6';
import exec from 'k6/execution';
import {
  API_PREFIX,
  BASE_URL,
  MAX_ERROR_RATE,
  PROFILE,
  SEARCH_P95_MS,
  WRITE_P95_MS,
  stages,
} from './lib/config.js';
import {
  cacheHit,
  checkBookingResponse,
  checkSearchResponse,
  dateOffset,
  pick,
  searchDuration,
  writeDuration,
} from './lib/assertions.js';

const data = JSON.parse(open('./data.json'));

export const options = {
  scenarios: {
    mixed: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: stages(PROFILE),
      gracefulRampDown: '15s',
      exec: 'mixedScenario',
      tags: { endpoint: 'mixed' },
    },
  },
  thresholds: {
    http_req_duration: [`p(95)<${WRITE_P95_MS}`],
    http_req_failed: [`rate<${MAX_ERROR_RATE}`],
    checks: ['rate>0.99'],
    search_duration: [`p(95)<${SEARCH_P95_MS}`],
    write_duration: [`p(95)<${WRITE_P95_MS}`],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

/** 70 % of the traffic is discovery, 30 % is booking creation. */
function isWrite() {
  return Math.random() < 0.3;
}

function search() {
  const city = pick(data.cities);
  const specialty = pick(data.specialties);
  const res = http.get(
    `${BASE_URL}${API_PREFIX}/caregivers?specialty=${encodeURIComponent(specialty)}` +
      `&city=${encodeURIComponent(city)}&page=1&limit=20`,
    {
      headers: { Accept: 'application/json' },
      tags: { name: 'GET /caregivers', endpoint: 'search' },
    },
  );
  searchDuration.add(res.timings.duration);
  const cache = res.headers['X-Cache'] || res.headers['x-cache'] || 'MISS';
  cacheHit.add(cache === 'HIT');
  return res;
}

function book() {
  // Each virtual user keeps its own customer so the write traffic does not
  // fight over the same patient/address rows.
  const customer = data.customers[exec.vu.idInTest % data.customers.length];
  const caregiverId = pick(data.caregivers);
  const start = dateOffset(1 + Math.floor(Math.random() * 27));
  const hour = 8 + Math.floor(Math.random() * 8);

  const payload = JSON.stringify({
    patientId: customer.patientId,
    caregiverId,
    addressId: customer.addressId,
    type: 'SINGLE',
    startDate: start,
    endDate: start,
    timeWindowStart: `${String(hour).padStart(2, '0')}:00`,
    timeWindowEnd: `${String(hour + 2).padStart(2, '0')}:00`,
  });

  const res = http.post(`${BASE_URL}${API_PREFIX}/customer/bookings`, payload, {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${customer.token}`,
    },
    tags: { name: 'POST /customer/bookings', endpoint: 'booking' },
  });
  writeDuration.add(res.timings.duration);
  return res;
}

export function mixedScenario() {
  if (isWrite()) {
    checkBookingResponse(book());
  } else {
    checkSearchResponse(search());
  }
  sleep(Math.random() * 0.2);
}
