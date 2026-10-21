import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { AllExceptionsFilter } from '../../src/common/filters/http-exception.filter.js';
import { PrismaService } from '../../src/common/prisma/prisma.service.js';
import { RedisService } from '../../src/common/redis/redis.module.js';
import {
  LicenseBody,
  Specialty,
  VerificationStatus,
} from '../../src/generated/prisma/client.js';
import { FAST_3G, SLOW_3G } from './network-profile.js';
import { startThrottledProxy } from './throttled-proxy.js';
import type { ThrottledProxy } from './throttled-proxy.js';
import { formatKb, formatMs, formatSummary, measureGet, summarize } from './perf-utils.js';
import type { LatencySummary, RequestMeasurement } from './perf-utils.js';

/**
 * BE-065 — Search performance test under throttled 3G.
 *
 * SRS §6: "Caregiver search results shall load in under 3 seconds on a 3G
 * connection". TRD §8 asks for a "load test with throttled 3G profile" and
 * leaves the percentile target as TBD; this suite pins it to the SRS wording
 * (p95 under 3 s on the conservative DevTools "Slow 3G" profile) and reports
 * p50/p95/max so the team can tighten the target later.
 *
 * The measurement is end to end: a real HTTP request crosses a local proxy
 * that emulates the mobile link (latency + bandwidth) before reaching the
 * API. No timings are modelled or estimated — the clock starts on the client
 * and stops when the last body byte has been received.
 */

/** SRS §6 budget for the caregiver search on a 3G connection. */
const SRS_SEARCH_BUDGET_MS = 3000;

/** Cities used to build the dataset; 12 covers the "10+ cities" scale target. */
const CITIES = [
  'Lahore',
  'Karachi',
  'Islamabad',
  'Rawalpindi',
  'Faisalabad',
  'Multan',
  'Peshawar',
  'Quetta',
  'Sialkot',
  'Gujranwala',
  'Hyderabad',
  'Sargodha',
];

/** Synthetic caregivers inserted for the run and removed afterwards. */
const CAREGIVER_COUNT = 600;
/**
 * Worst case: caregivers whose bio is at the 2000-character limit allowed by
 * the profile DTO, in a city of their own so the scenario can be queried on
 * its own.
 */
const LONG_BIO_CITY = 'Mardan';
const LONG_BIO_COUNT = 120;
const LONG_BIO_LENGTH = 2000;

const PHONE_PREFIX = '+92399';

const SEARCH_QUERY = 'specialty=NURSING&city=Lahore&page=1&limit=20';
const CACHE_KEY = 'search:caregivers:NURSING:Lahore:1:20';
const WORST_CASE_QUERY = 'specialty=POST_SURGERY_CARE&city=Mardan&page=1&limit=100';
const WORST_CASE_CACHE_KEY = 'search:caregivers:POST_SURGERY_CARE:Mardan:1:100';

interface FixtureIds {
  userIds: string[];
  profileIds: string[];
}

interface SearchPayload {
  items: unknown[];
  page: number;
  limit: number;
  total: number;
}

let app: INestApplication;
let prisma: PrismaService;
let redis: RedisService;
let fixture: FixtureIds;
let apiBaseUrl: string;
let proxy: ThrottledProxy;

describe('BE-065 caregiver search under throttled 3G', () => {
  beforeAll(async () => {
    // Keep the search cache alive for the whole run so the "warm" phase is
    // unambiguously a cache hit.
    process.env['SEARCH_CACHE_TTL_SECONDS'] = '600';

    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0, '127.0.0.1');

    prisma = app.get(PrismaService);
    redis = app.get(RedisService);

    const address = app.getHttpServer().address();
    if (address === null || typeof address === 'string') {
      throw new Error('API did not bind to a TCP port');
    }
    apiBaseUrl = `http://127.0.0.1:${address.port}`;

    // The config value is cached in Redis for 60 s; drop it so the new TTL
    // takes effect immediately.
    await redis.client.del('config:search.cacheTtlSeconds');

    fixture = await seedCaregivers(prisma);
    proxy = await startThrottledProxy(apiBaseUrl, SLOW_3G);
  }, 180_000);

  afterAll(async () => {
    await proxy?.close();
    await cleanupCaregivers(prisma, fixture);
    await app?.close();
  });

  it('returns caregiver results from the search endpoint', async () => {
    const response = await measureGet(`${apiBaseUrl}/api/v1/caregivers?${SEARCH_QUERY}`);
    expect(response.status).toBe(200);
    const body = response.body as SearchPayload;
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.total).toBeGreaterThan(0);
  });

  it('serves the search under a slow-3G link within the SRS 3 s budget', async () => {
    const cold = await measureColdPath(SEARCH_QUERY, CACHE_KEY, 5);
    const warm = await measureWarmPath(SEARCH_QUERY, 5);
    const direct = await measureDirectPath(SEARCH_QUERY, CACHE_KEY, 3);

    printReport('default page (20 items)', cold, warm, direct);

    // SRS §6 — the hard requirement.
    expect(cold.summary.p95).toBeLessThan(SRS_SEARCH_BUDGET_MS);
    expect(warm.summary.p95).toBeLessThan(SRS_SEARCH_BUDGET_MS);
    // The Redis cache (BE-026) has to pay for itself on a slow link.
    expect(warm.summary.p95).toBeLessThan(cold.summary.p95);
  }, 300_000);

  it('scales to a fast-3G link with room to spare', async () => {
    const fastProxy = await startThrottledProxy(apiBaseUrl, FAST_3G);
    try {
      await redis.client.del(CACHE_KEY);
      const measurement = await measureGet(`${fastProxy.baseUrl}/api/v1/caregivers?${SEARCH_QUERY}`);
      expect(measurement.status).toBe(200);
      expect(measurement.totalMs).toBeLessThan(SRS_SEARCH_BUDGET_MS);
      console.log(
        `[BE-065] fast-3g single request: ${formatMs(measurement.totalMs)} ` +
          `(payload ${formatKb(measurement.payloadBytes)}, wire ${formatKb(measurement.wireBytes)})`,
      );
    } finally {
      await fastProxy.close();
    }
  }, 120_000);

  it('stays within budget for the largest allowed page of long bios', async () => {
    const cold = await measureColdPath(WORST_CASE_QUERY, WORST_CASE_CACHE_KEY, 3);
    const warm = await measureWarmPath(WORST_CASE_QUERY, 3);

    printReport('worst case (100 items, 2000-character bios)', cold, warm, null);

    expect(cold.summary.p95).toBeLessThan(SRS_SEARCH_BUDGET_MS);
    expect(warm.summary.p95).toBeLessThan(SRS_SEARCH_BUDGET_MS);
  }, 300_000);

  it('compresses the payload for clients that accept it', async () => {
    const gzip = await measureGet(`${proxy.baseUrl}/api/v1/caregivers?${SEARCH_QUERY}`, 'gzip');
    const brotli = await measureGet(`${proxy.baseUrl}/api/v1/caregivers?${SEARCH_QUERY}`, 'br');
    const identity = await measureGet(
      `${proxy.baseUrl}/api/v1/caregivers?${SEARCH_QUERY}`,
      'identity',
    );

    expect(gzip.status).toBe(200);
    expect(gzip.wireBytes).toBeGreaterThan(0);
    expect(gzip.wireBytes).toBeLessThan(gzip.payloadBytes / 4);
    expect(brotli.wireBytes).toBeLessThanOrEqual(gzip.wireBytes);
    // A client that does not accept compression still gets the whole payload.
    expect(identity.wireBytes).toBe(identity.payloadBytes);

    console.log(
      `[BE-065] payload sizes: gzip ${formatKb(gzip.wireBytes)}, ` +
        `brotli ${formatKb(brotli.wireBytes)}, identity ${formatKb(identity.wireBytes)} ` +
        `(uncompressed ${formatKb(identity.payloadBytes)})`,
    );
  }, 120_000);

  it('reports the query plan for the search filters', async () => {
    const plan = await explainSearchQuery(prisma);
    console.log(`[BE-065] search query plan:\n${plan}`);
    // The city filter is a JSONB containment lookup and only stays cheap when
    // the GIN index on `serviceArea` is used; without it PostgreSQL filters
    // every row the specialty index returned.
    expect(plan).toContain('CaregiverProfile_serviceArea_idx');
    expect(plan).not.toContain('Rows Removed by Filter');
  }, 60_000);
});

interface PhaseMeasurement {
  summary: LatencySummary;
  samples: number[];
  wireBytes: number;
  payloadBytes: number;
  upstreamMs: number[];
}

/** Cache miss: the request has to reach PostgreSQL through the slow link. */
async function measureColdPath(
  query: string,
  cacheKey: string,
  iterations: number,
): Promise<PhaseMeasurement> {
  const samples: number[] = [];
  const upstreamMs: number[] = [];
  let wireBytes = 0;
  let payloadBytes = 0;

  for (let i = 0; i < iterations; i += 1) {
    await redis.client.del(cacheKey);
    const measurement = await measureGet(`${proxy.baseUrl}/api/v1/caregivers?${query}`);
    expectSearchResponse(measurement);
    samples.push(measurement.totalMs);
    upstreamMs.push(measurement.upstreamMs);
    wireBytes += measurement.wireBytes;
    payloadBytes += measurement.payloadBytes;
  }

  return { summary: summarize(samples), samples, wireBytes, payloadBytes, upstreamMs };
}

/** Cache hit: the request is answered from Redis, so the link is the cost. */
async function measureWarmPath(query: string, iterations: number): Promise<PhaseMeasurement> {
  const samples: number[] = [];
  const upstreamMs: number[] = [];
  let wireBytes = 0;
  let payloadBytes = 0;

  for (let i = 0; i < iterations; i += 1) {
    // Prime the cache out of band so the measured request is a guaranteed hit.
    await fetch(`${apiBaseUrl}/api/v1/caregivers?${query}`);
    const measurement = await measureGet(`${proxy.baseUrl}/api/v1/caregivers?${query}`);
    expectSearchResponse(measurement);
    samples.push(measurement.totalMs);
    upstreamMs.push(measurement.upstreamMs);
    wireBytes += measurement.wireBytes;
    payloadBytes += measurement.payloadBytes;
  }

  return { summary: summarize(samples), samples, wireBytes, payloadBytes, upstreamMs };
}

/** Same query without the emulated link: isolates the API's own cost. */
async function measureDirectPath(
  query: string,
  cacheKey: string,
  iterations: number,
): Promise<PhaseMeasurement> {
  const samples: number[] = [];
  const upstreamMs: number[] = [];
  let wireBytes = 0;
  let payloadBytes = 0;

  for (let i = 0; i < iterations; i += 1) {
    await redis.client.del(cacheKey);
    const measurement = await measureGet(`${apiBaseUrl}/api/v1/caregivers?${query}`);
    expectSearchResponse(measurement);
    samples.push(measurement.totalMs);
    upstreamMs.push(measurement.upstreamMs);
    wireBytes += measurement.wireBytes;
    payloadBytes += measurement.payloadBytes;
  }

  return { summary: summarize(samples), samples, wireBytes, payloadBytes, upstreamMs };
}

/** Fails the sample if the API did not answer with a well-formed page. */
function expectSearchResponse(measurement: RequestMeasurement): void {
  expect(measurement.status).toBe(200);
  const body = measurement.body as SearchPayload;
  expect(Array.isArray(body?.items)).toBe(true);
  expect(body.items.length).toBeGreaterThan(0);
}

function printReport(
  label: string,
  cold: PhaseMeasurement,
  warm: PhaseMeasurement,
  direct: PhaseMeasurement | null,
): void {
  console.log(`\n[BE-065] caregiver search — ${label}`);
  console.log(`[BE-065] profile "${SLOW_3G.name}": ${SLOW_3G.description}`);
  console.log(formatSummary('cold cache (PostgreSQL)', cold.summary));
  console.log(formatSummary('warm cache (Redis)', warm.summary));
  if (direct) {
    console.log(formatSummary('unthrottled (API only)', direct.summary));
  }
  console.log(
    `[BE-065] payload: ${formatKb(cold.payloadBytes / cold.samples.length)} per response ` +
      `(wire ${formatKb(cold.wireBytes / cold.samples.length)}), ` +
      `upstream API time p95 ${formatMs(summarize(cold.upstreamMs).p95)}`,
  );
  console.log(
    `[BE-065] budget: p95 < ${SRS_SEARCH_BUDGET_MS} ms (SRS §6) — ` +
      `cold ${formatMs(cold.summary.p95)}, warm ${formatMs(warm.summary.p95)}\n`,
  );
}

/**
 * Inserts synthetic approved caregivers spread over the pilot cities so the
 * search has a realistic amount of rows to filter and rank, plus a worst-case
 * group whose bios are at the DTO's length limit.
 */
async function seedCaregivers(prisma: PrismaService): Promise<FixtureIds> {
  const commissionRates = await prisma.commissionRate.findMany();
  if (commissionRates.length === 0) {
    throw new Error('No commission rates found — run `npm run seed` before the performance suite');
  }
  const rateBySpecialty = new Map(commissionRates.map((rate) => [rate.category, rate.id]));

  const userIds: string[] = [];
  const profileIds: string[] = [];
  const users: Array<{
    id: string;
    phone: string;
    role: 'CAREGIVER';
    fullName: string;
    status: 'ACTIVE';
  }> = [];
  const profiles: Array<Record<string, unknown>> = [];

  const addCaregiver = (
    index: number,
    city: string,
    specialty: Specialty,
    bio: string,
    rating: number,
  ): void => {
    const commissionRateId = rateBySpecialty.get(specialty);
    if (!commissionRateId) {
      throw new Error(`Missing commission rate for specialty ${specialty} — run \`npm run seed\``);
    }
    const userId = randomUUID();
    const profileId = randomUUID();
    userIds.push(userId);
    profileIds.push(profileId);

    users.push({
      id: userId,
      phone: `${PHONE_PREFIX}${String(index).padStart(6, '0')}`,
      role: 'CAREGIVER',
      fullName: `Perf Caregiver ${index}`,
      status: 'ACTIVE',
    });

    profiles.push({
      id: profileId,
      userId,
      cnic: `perf-${index}-${'0'.repeat(11)}`,
      licenseNumber: `PERF-${String(index).padStart(6, '0')}`,
      licenseBody: index % 2 === 0 ? LicenseBody.PNC : LicenseBody.PMDC,
      specialty,
      experienceYears: 2 + (index % 15),
      bio,
      serviceArea: { cities: [city] },
      ratePerVisit: 40000 + (index % 25) * 1000,
      commissionRateId,
      verificationStatus: VerificationStatus.APPROVED,
      approvedAt: new Date(),
      ratingAverage: rating,
      ratingCount: index % 47,
    });
  };

  const specialties = Object.values(Specialty);
  for (let i = 0; i < CAREGIVER_COUNT; i += 1) {
    const city = CITIES[i % CITIES.length];
    const specialty = specialties[i % specialties.length];
    addCaregiver(
      i,
      city,
      specialty,
      `${REGULAR_BIO} Specialising in ${city} and the surrounding district.`,
      Number((3 + (i % 20) / 10).toFixed(2)),
    );
  }

  const longBio = `${REGULAR_BIO} `.repeat(20).slice(0, LONG_BIO_LENGTH);
  for (let i = 0; i < LONG_BIO_COUNT; i += 1) {
    addCaregiver(
      CAREGIVER_COUNT + i,
      LONG_BIO_CITY,
      Specialty.POST_SURGERY_CARE,
      longBio,
      Number((3 + (i % 20) / 10).toFixed(2)),
    );
  }

  await prisma.user.createMany({ data: users });
  await prisma.caregiverProfile.createMany({ data: profiles as never });

  return { userIds, profileIds };
}

const REGULAR_BIO =
  'Registered home-care professional with a track record of post-operative recovery, ' +
  'medication administration, mobility support, wound dressing and routine vital-sign ' +
  'monitoring. Comfortable working alongside family members, physiotherapists and ' +
  'attending physicians, and experienced in keeping clear, accurate visit notes.';

async function cleanupCaregivers(prisma: PrismaService, fixture: FixtureIds): Promise<void> {
  if (!fixture) {
    return;
  }
  await prisma.caregiverProfile.deleteMany({ where: { id: { in: fixture.profileIds } } });
  await prisma.user.deleteMany({ where: { id: { in: fixture.userIds } } });
}

/** EXPLAIN ANALYZE for the filters the search endpoint applies. */
async function explainSearchQuery(prisma: PrismaService): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, string>>>(
    `EXPLAIN (ANALYZE, BUFFERS)
     SELECT cp."id", cp."specialty", cp."ratePerVisit", cp."experienceYears", cp."bio",
            cp."ratingAverage", cp."ratingCount", cp."serviceArea", u."fullName"
     FROM "CaregiverProfile" cp
     JOIN "User" u ON u."id" = cp."userId"
     WHERE cp."verificationStatus" = 'APPROVED'
       AND u."status" = 'ACTIVE'
       AND cp."specialty" = 'NURSING'
       AND cp."serviceArea" @> '{"cities":["Lahore"]}'
     ORDER BY cp."ratingAverage" DESC
     LIMIT 20`,
  );
  return rows.map((row) => Object.values(row).join(' | ')).join('\n');
}
