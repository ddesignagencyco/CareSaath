/**
 * Seeds (and cleans up) the dataset the k6 load tests run against.
 *
 * The load scripts need a realistic amount of data to filter and rank:
 * approved caregivers spread over the pilot cities, plus a pool of customers
 * with a patient profile and an address so the booking endpoint can be
 * exercised as well.
 *
 * Everything it creates is marked so it can be removed again:
 *   - caregiver users  : phone  +92399xxxxxxx
 *   - customer users   : phone  +92398xxxxxxx
 *   - caregiver profile: licenseNumber LOADTEST-xxxxxx
 *
 * Usage:
 *   node load/k6/seed.mjs              # seed and write data.json
 *   node load/k6/seed.mjs --cleanup    # remove everything it created
 *
 * Environment:
 *   CAREGIVER_COUNT  number of caregivers to create (default 2000)
 *   CUSTOMER_COUNT   number of customers to create (default 20)
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';

loadEnv({ path: resolve(import.meta.dirname, '../../../.env'), override: true });

if (process.env['NODE_ENV'] === 'production') {
  console.error('Refusing to seed load-test data: NODE_ENV is production.');
  process.exit(1);
}

const { PrismaClient, Specialty, UserRole, LicenseBody, VerificationStatus } = await import(
  '../../dist/generated/prisma/client.js'
);
const { PrismaPg } = await import('@prisma/adapter-pg');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
});

const CAREGIVER_COUNT = Number(process.env['CAREGIVER_COUNT'] || 2000);
const CUSTOMER_COUNT = Number(process.env['CUSTOMER_COUNT'] || 20);
const BATCH_SIZE = 500;

const CAREGIVER_PHONE_PREFIX = '+92399';
const CUSTOMER_PHONE_PREFIX = '+92398';
const LICENSE_PREFIX = 'LOADTEST-';

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

const DATA_FILE = resolve(import.meta.dirname, 'data.json');

const cleanup = process.argv.includes('--cleanup');

if (cleanup) {
  await removeLoadTestData();
} else {
  await seedLoadTestData();
}

async function seedLoadTestData() {
  const commissionRates = await prisma.commissionRate.findMany();
  if (commissionRates.length === 0) {
    throw new Error(
      'No commission rates found. Run `npm run seed` before the load tests (the caregiver profile needs one).',
    );
  }
  const rateBySpecialty = new Map(commissionRates.map((rate) => [rate.category, rate.id]));

  const specialties = Object.values(Specialty);
  const caregiverUsers = [];
  const caregiverProfiles = [];

  for (let i = 0; i < CAREGIVER_COUNT; i += 1) {
    const specialty = specialties[i % specialties.length];
    const commissionRateId = rateBySpecialty.get(specialty);
    if (!commissionRateId) {
      throw new Error(`Missing commission rate for specialty ${specialty}. Run \`npm run seed\`.`);
    }
    const userId = randomUUID();
    const profileId = randomUUID();
    const city = CITIES[i % CITIES.length];
    // A fifth of the caregivers also cover the neighbouring city.
    const secondCity = i % 5 === 0 ? CITIES[(i + 1) % CITIES.length] : null;

    caregiverUsers.push({
      id: userId,
      phone: `${CAREGIVER_PHONE_PREFIX}${String(i).padStart(7, '0')}`,
      role: UserRole.CAREGIVER,
      fullName: `Load Caregiver ${i}`,
      status: 'ACTIVE',
    });
    caregiverProfiles.push({
      id: profileId,
      userId,
      cnic: `35202-9${String(i).padStart(6, '0')}-1`,
      licenseNumber: `${LICENSE_PREFIX}${String(i).padStart(6, '0')}`,
      licenseBody: i % 2 === 0 ? LicenseBody.PNC : LicenseBody.PMDC,
      specialty,
      experienceYears: 2 + (i % 15),
      bio: `Load-test caregiver ${i} covering ${city}${secondCity ? ` and ${secondCity}` : ''}. ` +
        'Experienced in post-operative recovery, medication administration and mobility support.',
      serviceArea: { cities: secondCity ? [city, secondCity] : [city] },
      ratePerVisit: 40000 + (i % 25) * 1000,
      commissionRateId,
      verificationStatus: VerificationStatus.APPROVED,
      approvedAt: new Date(),
      ratingAverage: Number((3 + (i % 20) / 10).toFixed(2)),
      ratingCount: i % 47,
    });
  }

  const customerUsers = [];
  const patientProfiles = [];
  const addresses = [];

  for (let i = 0; i < CUSTOMER_COUNT; i += 1) {
    const userId = randomUUID();
    const patientId = randomUUID();
    const addressId = randomUUID();
    const city = CITIES[i % CITIES.length];

    customerUsers.push({
      id: userId,
      phone: `${CUSTOMER_PHONE_PREFIX}${String(i).padStart(7, '0')}`,
      role: UserRole.CUSTOMER,
      fullName: `Load Customer ${i}`,
      status: 'ACTIVE',
    });
    patientProfiles.push({
      id: patientId,
      ownerUserId: userId,
      name: `Load Patient ${i}`,
      relationship: 'SELF',
      gender: i % 2 === 0 ? 'MALE' : 'FEMALE',
    });
    addresses.push({
      id: addressId,
      userId,
      label: 'Home',
      addressLine: `${i + 1} Load Test Street`,
      city,
      latitude: 31.5204,
      longitude: 74.3587,
    });
  }

  console.log(`Seeding ${CAREGIVER_COUNT} caregivers and ${CUSTOMER_COUNT} customers...`);
  await prisma.user.createMany({ data: customerUsers });
  await prisma.patientProfile.createMany({ data: patientProfiles });
  await prisma.address.createMany({ data: addresses });

  for (let offset = 0; offset < caregiverUsers.length; offset += BATCH_SIZE) {
    await prisma.user.createMany({ data: caregiverUsers.slice(offset, offset + BATCH_SIZE) });
    await prisma.caregiverProfile.createMany({
      data: caregiverProfiles.slice(offset, offset + BATCH_SIZE),
    });
  }

  const secret = process.env['JWT_ACCESS_SECRET'];
  if (!secret) {
    throw new Error('JWT_ACCESS_SECRET is not set; cannot sign load-test access tokens.');
  }

  const customers = customerUsers.map((user, index) => ({
    token: jwt.sign(
      { sub: user.id, role: user.role, phone: user.phone, type: 'access' },
      secret,
      { expiresIn: '2h' },
    ),
    patientId: patientProfiles[index].id,
    addressId: addresses[index].id,
    phone: user.phone,
  }));

  const payload = {
    generatedAt: new Date().toISOString(),
    caregiverCount: CAREGIVER_COUNT,
    customerCount: CUSTOMER_COUNT,
    cities: CITIES,
    specialties,
    caregivers: caregiverProfiles.map((profile) => profile.id),
    customers,
  };

  await writeFile(DATA_FILE, JSON.stringify(payload, null, 2), 'utf8');
  console.log(
    `Done. Wrote ${DATA_FILE} (${CAREGIVER_COUNT} caregivers, ${CUSTOMER_COUNT} customers).`,
  );
}

async function removeLoadTestData() {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { phone: { startsWith: CAREGIVER_PHONE_PREFIX } },
        { phone: { startsWith: CUSTOMER_PHONE_PREFIX } },
      ],
    },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);

  const caregiverProfiles = await prisma.caregiverProfile.findMany({
    where: { licenseNumber: { startsWith: LICENSE_PREFIX } },
    select: { id: true },
  });
  const caregiverIds = caregiverProfiles.map((profile) => profile.id);

  console.log(`Removing ${userIds.length} load-test users and ${caregiverIds.length} profiles...`);

  if (userIds.length > 0) {
    const bookings = await prisma.booking.findMany({
      where: { customerId: { in: userIds } },
      select: { id: true },
    });
    const bookingIds = bookings.map((booking) => booking.id);
    if (bookingIds.length > 0) {
      await prisma.visit.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    }
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.patientProfile.deleteMany({ where: { ownerUserId: { in: userIds } } });
    await prisma.address.deleteMany({ where: { userId: { in: userIds } } });
  }

  if (caregiverIds.length > 0) {
    const bookings = await prisma.booking.findMany({
      where: { caregiverId: { in: caregiverIds } },
      select: { id: true },
    });
    const bookingIds = bookings.map((booking) => booking.id);
    if (bookingIds.length > 0) {
      await prisma.visit.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    }
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  }

  if (caregiverIds.length > 0) {
    await prisma.caregiverProfile.deleteMany({ where: { id: { in: caregiverIds } } });
  }
  if (userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  console.log('Load-test data removed.');
}

await prisma.$disconnect();
