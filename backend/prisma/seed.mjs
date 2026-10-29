import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';

loadEnv({ path: resolve(import.meta.dirname, '../../.env'), override: true });

if (process.env['NODE_ENV'] === 'production') {
  console.error('Refusing to seed demo data: NODE_ENV is production.');
  process.exit(1);
}

const { PrismaClient, Specialty, UserRole, PromoDiscountType } = await import(
  '../dist/generated/prisma/client.js'
);
const { PrismaPg } = await import('@prisma/adapter-pg');

const COMMISSION_DEFAULT_PERCENTAGE = 20;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
});

// --- Field-level encryption (mirrors src/common/crypto/field-encryption.ts) ---
const CNIC_KEY = createHash('sha256')
  .update(process.env['CNIC_ENCRYPTION_KEY'] ?? 'caresaath-dev-cnic-key')
  .digest();
const MEDICAL_KEY = createHash('sha256')
  .update(process.env['MEDICAL_ENCRYPTION_KEY'] ?? 'caresaath-dev-medical-key')
  .digest();
const PAYOUT_KEY = createHash('sha256')
  .update(process.env['PAYOUT_ENCRYPTION_KEY'] ?? 'caresaath-dev-payout-key')
  .digest();

function encryptField(plain, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

// --- Date helpers (all booking dates stay fresh relative to "today") ---
const now = new Date();
function dayOffset(n) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}
function minutesFromNow(n) {
  return new Date(now.getTime() + n * 60_000);
}
function hoursInto(day, hour) {
  const d = new Date(day.getTime());
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

// ===========================================================================
// 1. Platform basics (unchanged from original seed)
// ===========================================================================

const adminPhone = process.env['ADMIN_PHONE'] ?? '+923000000000';
const adminUser = await prisma.user.upsert({
  where: { phone: adminPhone },
  update: { role: UserRole.ADMIN, lastLoginAt: now },
  create: { phone: adminPhone, role: UserRole.ADMIN, fullName: 'Platform Admin', lastLoginAt: now },
});
console.log(`Seeded admin user ${adminPhone}`);

for (const category of Object.values(Specialty)) {
  await prisma.commissionRate.upsert({
    where: { category },
    update: {},
    create: { category, percentage: COMMISSION_DEFAULT_PERCENTAGE },
  });
}
console.log(`Seeded commission rates: ${Object.values(Specialty).join(', ')}`);

const platformConfig = [
  { key: 'booking.respondWindowMinutes', value: 60 },
  { key: 'booking.cancelNoticeMinutes', value: 0 },
  { key: 'otp.ttlSeconds', value: 300 },
  { key: 'otp.checkinTtlSeconds', value: 600 },
  { key: 'retention.notificationDays', value: 90 },
  { key: 'search.cacheTtlSeconds', value: 30 },
];
for (const setting of platformConfig) {
  await prisma.platformConfig.upsert({
    where: { key: setting.key },
    update: {},
    create: setting,
  });
}
console.log(`Seeded ${platformConfig.length} platform config values`);

// ===========================================================================
// 2. Demo users (login via OTP -> MailHog at http://localhost:18025)
// ===========================================================================

const CUSTOMERS = [
  { phone: '+923001110001', fullName: 'Ayesha Khan', preferredLanguage: 'EN' },
  { phone: '+923001110002', fullName: 'Bilal Ahmed', preferredLanguage: 'UR' },
];

const CAREGIVERS = [
  {
    phone: '+923001110011',
    fullName: 'Fatima Noor',
    cnicPlain: '35201-1111111-1',
    licenseNumber: 'PNC-100001',
    licenseBody: 'PNC',
    specialty: Specialty.NURSING,
    experienceYears: 8,
    bio: 'Registered nurse with 8 years of hospital and home-care experience.',
    ratePerVisit: 60000,
    cities: ['Lahore'],
    verificationStatus: 'APPROVED',
    ratingAverage: '4.80',
    ratingCount: 12,
  },
  {
    phone: '+923001110012',
    fullName: 'Ali Raza',
    cnicPlain: '35201-2222222-2',
    licenseNumber: 'PMDC-200002',
    licenseBody: 'PMDC',
    specialty: Specialty.PHYSIOTHERAPY,
    experienceYears: 5,
    bio: 'Physiotherapist specialising in post-operative rehabilitation.',
    ratePerVisit: 45000,
    cities: ['Lahore'],
    verificationStatus: 'APPROVED',
    ratingAverage: '0.00',
    ratingCount: 0,
  },
  {
    phone: '+923001110013',
    fullName: 'Sana Iqbal',
    cnicPlain: '35201-3333333-3',
    licenseNumber: 'PNC-300003',
    licenseBody: 'PNC',
    specialty: Specialty.ELDERLY_CARE,
    experienceYears: 10,
    bio: 'Elderly-care specialist focused on mobility and daily living support.',
    ratePerVisit: 50000,
    cities: ['Lahore'],
    verificationStatus: 'APPROVED',
    ratingAverage: '0.00',
    ratingCount: 0,
  },
  {
    phone: '+923001110014',
    fullName: 'Kashif Mehmood',
    cnicPlain: '35201-4444444-4',
    licenseNumber: 'PNC-400004',
    licenseBody: 'PNC',
    specialty: Specialty.POST_SURGERY_CARE,
    experienceYears: 3,
    bio: 'Post-surgery home care nurse (application under review).',
    ratePerVisit: 55000,
    cities: ['Lahore'],
    verificationStatus: 'PENDING',
    ratingAverage: '0.00',
    ratingCount: 0,
  },
  {
    phone: '+923001110021',
    fullName: 'Dr. Hira Siddiqui',
    cnicPlain: '35201-5555555-5',
    licenseNumber: 'PMDC-500005',
    licenseBody: 'PMDC',
    specialty: Specialty.DOCTOR,
    experienceYears: 12,
    bio: 'General physician; house calls for diagnosis, prescriptions, and lab-test orders.',
    ratePerVisit: 150000,
    cities: ['Lahore'],
    verificationStatus: 'APPROVED',
    ratingAverage: '4.90',
    ratingCount: 30,
  },
  {
    phone: '+923001110022',
    fullName: 'Dr. Usman Tariq',
    cnicPlain: '35201-6666666-6',
    licenseNumber: 'PMDC-600006',
    licenseBody: 'PMDC',
    specialty: Specialty.DOCTOR,
    experienceYears: 6,
    bio: 'Internal medicine; post-operative follow-up and chronic care visits.',
    ratePerVisit: 120000,
    cities: ['Lahore'],
    verificationStatus: 'APPROVED',
    ratingAverage: '4.60',
    ratingCount: 14,
  },
];

const customers = [];
for (const c of CUSTOMERS) {
  const user = await prisma.user.upsert({
    where: { phone: c.phone },
    update: { fullName: c.fullName, role: UserRole.CUSTOMER, preferredLanguage: c.preferredLanguage, lastLoginAt: now },
    create: {
      lastLoginAt: now,
      phone: c.phone,
      role: UserRole.CUSTOMER,
      fullName: c.fullName,
      preferredLanguage: c.preferredLanguage,
    },
  });
  customers.push(user);
}

const caregiverProfiles = [];
const caregiverUsers = [];
for (const c of CAREGIVERS) {
  const user = await prisma.user.upsert({
    where: { phone: c.phone },
    update: { fullName: c.fullName, role: UserRole.CAREGIVER, lastLoginAt: now },
    create: { phone: c.phone, role: UserRole.CAREGIVER, fullName: c.fullName, lastLoginAt: now },
  });
  caregiverUsers.push(user);
  const commission = await prisma.commissionRate.findUniqueOrThrow({
    where: { category: c.specialty },
  });
  const approved = c.verificationStatus === 'APPROVED';
  const reverifyDueAt = new Date(now.getTime() + 365 * 24 * 3600 * 1000);
  const profile = await prisma.caregiverProfile.upsert({
    where: { userId: user.id },
    update: {
      specialty: c.specialty,
      verificationStatus: c.verificationStatus,
      ratePerVisit: c.ratePerVisit,
      reverifyDueAt: approved ? reverifyDueAt : null,
    },
    create: {
      userId: user.id,
      cnic: encryptField(c.cnicPlain, CNIC_KEY),
      licenseNumber: c.licenseNumber,
      licenseBody: c.licenseBody,
      specialty: c.specialty,
      experienceYears: c.experienceYears,
      bio: c.bio,
      serviceArea: { cities: c.cities },
      ratePerVisit: c.ratePerVisit,
      commissionRateId: commission.id,
      verificationStatus: c.verificationStatus,
      approvedAt: approved ? now : null,
      reverifyDueAt: approved ? reverifyDueAt : null,
      ratingAverage: c.ratingAverage,
      ratingCount: c.ratingCount,
    },
  });
  caregiverProfiles.push(profile);
}

console.log(`Seeded ${customers.length} customers and ${caregiverProfiles.length} caregivers`);

// Wipe dependent rows owned by the demo users so every run produces a clean,
// deterministic graph (no duplicate bookings/visits accumulating).
const customerIds = customers.map((u) => u.id);
const caregiverUserIds = caregiverUsers.map((u) => u.id);
const caregiverProfileIds = caregiverProfiles.map((p) => p.id);

await prisma.notification.deleteMany({
  where: { userId: { in: [...customerIds, ...caregiverUserIds] } },
});
await prisma.incidentEvent.deleteMany({
  where: { incident: { reportedById: { in: customerIds } } },
});
await prisma.safetyIncident.deleteMany({ where: { reportedById: { in: customerIds } } });
await prisma.dispute.deleteMany({ where: { raisedById: { in: customerIds } } });
await prisma.review.deleteMany({ where: { caregiverId: { in: caregiverProfileIds } } });
// Scoped by the visit (via its booking's customer) rather than by caregiverId:
// a note's caregiverId can drift from its visit's current caregiver on a dirty
// re-seed, which would otherwise leave it behind and break the visit delete below.
await prisma.visitNote.deleteMany({
  where: { visit: { booking: { customerId: { in: customerIds } } } },
});
await prisma.payment.deleteMany({
  where: { visit: { booking: { customerId: { in: customerIds } } } },
});
await prisma.visitStatusHistory.deleteMany({
  where: { visit: { booking: { customerId: { in: customerIds } } } },
});
await prisma.visit.deleteMany({ where: { booking: { customerId: { in: customerIds } } } });
await prisma.prescriptionDocument.deleteMany({
  where: { booking: { customerId: { in: customerIds } } },
});
await prisma.booking.deleteMany({ where: { customerId: { in: customerIds } } });
await prisma.patientProfile.deleteMany({ where: { ownerUserId: { in: customerIds } } });
await prisma.address.deleteMany({ where: { userId: { in: customerIds } } });
await prisma.emergencyContact.deleteMany({ where: { userId: { in: customerIds } } });
await prisma.payoutRequest.deleteMany({ where: { caregiverId: { in: caregiverProfileIds } } });
await prisma.availabilityRule.deleteMany({ where: { caregiverId: { in: caregiverProfileIds } } });
await prisma.availabilityBlock.deleteMany({ where: { caregiverId: { in: caregiverProfileIds } } });
await prisma.caregiverDocument.deleteMany({ where: { caregiverId: { in: caregiverProfileIds } } });
await prisma.credentialReview.deleteMany({ where: { caregiverId: { in: caregiverProfileIds } } });
await prisma.payoutAccount.deleteMany({ where: { caregiverId: { in: caregiverProfileIds } } });

// ===========================================================================
// 3. Customer-side data: patients, addresses, emergency contacts
// ===========================================================================

const ayeshap = await prisma.patientProfile.create({
  data: {
    ownerUserId: customers[0].id,
    name: 'Ayesha Khan',
    relationship: 'SELF',
    dateOfBirth: new Date('1992-04-17T00:00:00.000Z'),
    gender: 'female',
    medicalContext: encryptField('Post-operative knee replacement; limited mobility.', MEDICAL_KEY),
  },
});
const mother = await prisma.patientProfile.create({
  data: {
    ownerUserId: customers[0].id,
    name: 'Rukhsana Khan',
    relationship: 'FAMILY_MEMBER',
    dateOfBirth: new Date('1958-11-02T00:00:00.000Z'),
    gender: 'female',
    medicalContext: encryptField('Type-2 diabetes, mild hypertension; needs daily medication reminders.', MEDICAL_KEY),
  },
});
const bilalSelf = await prisma.patientProfile.create({
  data: {
    ownerUserId: customers[1].id,
    name: 'Bilal Ahmed',
    relationship: 'SELF',
    dateOfBirth: new Date('1985-07-23T00:00:00.000Z'),
    gender: 'male',
  },
});

const home = await prisma.address.create({
  data: {
    userId: customers[0].id,
    label: 'Home',
    addressLine: '12 Gulberg III, Main Boulevard',
    city: 'Lahore',
    latitude: '31.516300',
    longitude: '74.345200',
  },
});
const office = await prisma.address.create({
  data: {
    userId: customers[0].id,
    label: 'Office',
    addressLine: 'Plot 44, Johar Town, Block J2',
    city: 'Lahore',
    latitude: '31.469700',
    longitude: '74.272800',
  },
});
const bilalHome = await prisma.address.create({
  data: {
    userId: customers[1].id,
    label: 'Home',
    addressLine: 'House 7, Clifton Block 5',
    city: 'Karachi',
    latitude: '24.813500',
    longitude: '67.029900',
  },
});

await prisma.emergencyContact.createMany({
  data: [
    { userId: customers[0].id, name: 'Hamza Khan (spouse)', phone: '+923002220001' },
    { userId: customers[1].id, name: 'Zara Ahmed (sister)', phone: '+923002220002' },
  ],
});

console.log('Seeded patients, addresses and emergency contacts');

// ===========================================================================
// 4. Caregiver-side data: availability, documents, reviews, payouts
// ===========================================================================

for (let i = 0; i < caregiverProfiles.length; i++) {
  const profile = caregiverProfiles[i];
  const caregiver = CAREGIVERS[i];

  await prisma.availabilityRule.createMany({
    data: Array.from({ length: 7 }, (_, day) => ({
      caregiverId: profile.id,
      dayOfWeek: day,
      startTime: '09:00',
      endTime: '17:00',
    })),
  });

  await prisma.caregiverDocument.create({
    data: {
      caregiverId: profile.id,
      type: 'LICENSE',
      fileKey: `demo/licenses/${caregiver.licenseNumber}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: 182_040,
    },
  });
  await prisma.caregiverDocument.create({
    data: {
      caregiverId: profile.id,
      type: 'CNIC_COPY',
      fileKey: `demo/cnic/${caregiver.phone}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: 95_120,
    },
  });

  if (caregiver.verificationStatus === 'APPROVED') {
    await prisma.credentialReview.create({
      data: {
        caregiverId: profile.id,
        reviewerId: adminUser.id,
        kind: 'INITIAL',
        decision: 'APPROVED',
        reason: 'Credentials verified.',
      },
    });
  }

  await prisma.payoutAccount.create({
    data: {
      caregiverId: profile.id,
      type: 'MOBILE_WALLET',
      provider: 'JazzCash',
      accountTitle: caregiver.fullName,
      accountNumber: encryptField(`0300-${1000000 + i}`, PAYOUT_KEY),
    },
  });
}

console.log('Seeded caregiver availability, documents and payout accounts');

// ===========================================================================
// 5. Bookings + visits across every lifecycle status
// ===========================================================================

const fatima = caregiverProfiles[0]; // NURSING
const ali = caregiverProfiles[1]; // PHYSIOTHERAPY
const sana = caregiverProfiles[2]; // ELDERLY_CARE

const respondWindowMinutes = 60;

// --- Booking 1: REQUESTED (awaiting caregiver response) ---
const requestedDay = dayOffset(3);
const bookingRequested = await prisma.booking.create({
  data: {
    customerId: customers[0].id,
    patientId: mother.id,
    caregiverId: fatima.id,
    addressId: home.id,
    startDate: requestedDay,
    endDate: requestedDay,
    timeWindowStart: '09:00',
    timeWindowEnd: '11:00',
    serviceType: fatima.specialty,
    rateSnapshot: fatima.ratePerVisit,
    status: 'REQUESTED',
    respondBy: minutesFromNow(respondWindowMinutes),
    visits: {
      create: {
        scheduledDate: requestedDay,
        timeWindowStart: '09:00',
        timeWindowEnd: '11:00',
        status: 'REQUESTED',
        statusHistory: { create: { toStatus: 'REQUESTED', actorId: customers[0].id } },
      },
    },
  },
  include: { visits: true },
});

// --- Booking 2: CONFIRMED (upcoming visit) ---
const confirmedDay = dayOffset(2);
const bookingConfirmed = await prisma.booking.create({
  data: {
    customerId: customers[0].id,
    patientId: ayeshap.id,
    caregiverId: ali.id,
    addressId: office.id,
    startDate: confirmedDay,
    endDate: confirmedDay,
    timeWindowStart: '10:00',
    timeWindowEnd: '12:00',
    serviceType: ali.specialty,
    rateSnapshot: ali.ratePerVisit,
    status: 'CONFIRMED',
    respondBy: minutesFromNow(respondWindowMinutes),
    visits: {
      create: {
        scheduledDate: confirmedDay,
        timeWindowStart: '10:00',
        timeWindowEnd: '12:00',
        status: 'CONFIRMED',
        statusHistory: {
          create: [
            { toStatus: 'REQUESTED', actorId: customers[0].id, at: hoursInto(dayOffset(-1), 14) },
            { fromStatus: 'REQUESTED', toStatus: 'CONFIRMED', actorId: caregiverUsers[1].id, at: hoursInto(dayOffset(-1), 15) },
          ],
        },
      },
    },
  },
  include: { visits: true },
});

// --- Booking 3: COMPLETED (past, with note, review, payment) ---
const completedDay = dayOffset(-7);
const bookingCompleted = await prisma.booking.create({
  data: {
    customerId: customers[0].id,
    patientId: mother.id,
    caregiverId: fatima.id,
    addressId: home.id,
    startDate: completedDay,
    endDate: completedDay,
    timeWindowStart: '09:00',
    timeWindowEnd: '11:00',
    serviceType: fatima.specialty,
    rateSnapshot: fatima.ratePerVisit,
    status: 'COMPLETED',
    respondBy: hoursInto(dayOffset(-9), 12),
    visits: {
      create: {
        scheduledDate: completedDay,
        timeWindowStart: '09:00',
        timeWindowEnd: '11:00',
        status: 'COMPLETED',
        enRouteAt: hoursInto(completedDay, 8),
        checkInAt: hoursInto(completedDay, 9),
        checkOutAt: hoursInto(completedDay, 11),
        checkInMethod: 'GPS',
        checkOutMethod: 'GPS',
        checkInLat: '31.516300',
        checkInLng: '74.345200',
        checkOutLat: '31.516300',
        checkOutLng: '74.345200',
        statusHistory: {
          create: [
            { toStatus: 'REQUESTED', actorId: customers[0].id, at: hoursInto(dayOffset(-9), 12) },
            { fromStatus: 'REQUESTED', toStatus: 'CONFIRMED', actorId: caregiverUsers[0].id, at: hoursInto(dayOffset(-9), 13) },
            { fromStatus: 'CONFIRMED', toStatus: 'EN_ROUTE', actorId: caregiverUsers[0].id, at: hoursInto(completedDay, 8) },
            { fromStatus: 'EN_ROUTE', toStatus: 'CHECKED_IN', actorId: caregiverUsers[0].id, at: hoursInto(completedDay, 9) },
            { fromStatus: 'CHECKED_IN', toStatus: 'CHECKED_OUT', actorId: caregiverUsers[0].id, at: hoursInto(completedDay, 11) },
            { fromStatus: 'CHECKED_OUT', toStatus: 'COMPLETED', actorId: caregiverUsers[0].id, at: hoursInto(completedDay, 11) },
          ],
        },
        note: {
          create: {
            caregiverId: fatima.id,
            summary: 'Blood pressure stable. Dressing changed, patient comfortable. Medication reminders issued.',
          },
        },
        review: {
          create: {
            customerId: customers[0].id,
            caregiverId: fatima.id,
            rating: 5,
            comment: 'Excellent, caring and punctual. Highly recommended.',
          },
        },
        payments: {
          create: {
            method: 'CASH',
            status: 'PAID',
            amount: fatima.ratePerVisit,
            commissionAmount: Math.round(fatima.ratePerVisit * 0.2),
            caregiverAmount: fatima.ratePerVisit - Math.round(fatima.ratePerVisit * 0.2),
            gatewayRef: 'demo-cash-receipt-0001',
            paidAt: hoursInto(completedDay, 11),
          },
        },
      },
    },
  },
  include: { visits: true },
});

// --- Booking 4: CANCELLED (with reason) ---
const cancelledDay = dayOffset(5);
const bookingCancelled = await prisma.booking.create({
  data: {
    customerId: customers[1].id,
    patientId: bilalSelf.id,
    caregiverId: sana.id,
    addressId: bilalHome.id,
    startDate: cancelledDay,
    endDate: cancelledDay,
    timeWindowStart: '14:00',
    timeWindowEnd: '16:00',
    serviceType: sana.specialty,
    rateSnapshot: sana.ratePerVisit,
    status: 'CANCELLED',
    respondBy: hoursInto(dayOffset(-1), 18),
    cancelledAt: hoursInto(dayOffset(-1), 19),
    cancelledById: customers[1].id,
    cancelReason: 'Travel plans changed; will rebook next week.',
    visits: {
      create: {
        scheduledDate: cancelledDay,
        timeWindowStart: '14:00',
        timeWindowEnd: '16:00',
        status: 'CANCELLED',
        statusHistory: {
          create: [
            { toStatus: 'REQUESTED', actorId: customers[1].id, at: hoursInto(dayOffset(-2), 10) },
            { fromStatus: 'REQUESTED', toStatus: 'CANCELLED', actorId: customers[1].id, at: hoursInto(dayOffset(-1), 19) },
          ],
        },
      },
    },
  },
  include: { visits: true },
});

// --- Booking 5: DECLINED (caregiver declined) ---
const declinedDay = dayOffset(4);
const bookingDeclined = await prisma.booking.create({
  data: {
    customerId: customers[1].id,
    patientId: bilalSelf.id,
    caregiverId: fatima.id,
    addressId: bilalHome.id,
    startDate: declinedDay,
    endDate: declinedDay,
    timeWindowStart: '11:00',
    timeWindowEnd: '13:00',
    serviceType: fatima.specialty,
    rateSnapshot: fatima.ratePerVisit,
    status: 'DECLINED',
    respondBy: hoursInto(dayOffset(-1), 16),
    visits: {
      create: {
        scheduledDate: declinedDay,
        timeWindowStart: '11:00',
        timeWindowEnd: '13:00',
        status: 'DECLINED',
        statusHistory: {
          create: [
            { toStatus: 'REQUESTED', actorId: customers[1].id, at: hoursInto(dayOffset(-2), 12) },
            { fromStatus: 'REQUESTED', toStatus: 'DECLINED', actorId: caregiverUsers[0].id, at: hoursInto(dayOffset(-2), 13) },
          ],
        },
      },
    },
  },
  include: { visits: true },
});

console.log(
  `Seeded bookings: REQUESTED=${bookingRequested.id.slice(0, 8)}… CONFIRMED=${bookingConfirmed.id.slice(0, 8)}… COMPLETED/CANCELLED/DECLINED`,
);

// ===========================================================================
// 6. Promo, safety incident, dispute, notifications
// ===========================================================================

await prisma.promoCode.upsert({
  where: { code: 'WELCOME10' },
  update: { active: true },
  create: {
    code: 'WELCOME10',
    discountType: PromoDiscountType.PERCENT,
    discountValue: 10,
    validFrom: dayOffset(-30),
    validTo: dayOffset(90),
    maxUses: 100,
  },
});

const completedVisitId = bookingCompleted.visits[0].id;
await prisma.safetyIncident.create({
  data: {
    visitId: completedVisitId,
    reportedById: customers[0].id,
    source: 'CUSTOMER_COMPLAINT',
    description: 'Caregiver arrived 25 minutes late without prior notice.',
    priority: 'LOW',
    status: 'OPEN',
    events: {
      create: {
        actorId: customers[0].id,
        action: 'REPORTED',
        note: 'Customer raised the incident from the visit detail screen.',
      },
    },
  },
});

await prisma.dispute.create({
  data: {
    visitId: completedVisitId,
    raisedById: customers[0].id,
    againstUserId: caregiverUsers[0].id,
    description: 'Charged full rate despite late arrival; requesting partial refund.',
    status: 'OPEN',
  },
});

await prisma.notification.createMany({
  data: [
    {
      userId: customers[0].id,
      channel: 'SMS',
      event: 'booking.confirmed',
      payload: { bookingId: bookingConfirmed.id },
      status: 'SENT',
      sentAt: hoursInto(dayOffset(-1), 15),
    },
    {
      userId: customers[0].id,
      channel: 'PUSH',
      event: 'visit.completed',
      payload: { visitId: completedVisitId },
      status: 'SENT',
      sentAt: hoursInto(dayOffset(-7), 11),
    },
    {
      userId: caregiverUsers[0].id,
      channel: 'SMS',
      event: 'booking.requested',
      payload: { bookingId: bookingRequested.id },
      status: 'SENT',
      sentAt: now,
    },
    {
      userId: customers[1].id,
      channel: 'SMS',
      event: 'booking.cancelled',
      payload: { bookingId: bookingCancelled.id },
      status: 'SENT',
      sentAt: hoursInto(dayOffset(-1), 19),
    },
  ],
});

console.log('Seeded promo code, safety incident, dispute and notifications');

// ===========================================================================
// Summary
// ===========================================================================

console.log('\n=== Demo login (OTP arrives in MailHog: http://localhost:18025) ===');
console.log(`  ADMIN     ${adminPhone}`);
console.log(`  CUSTOMER  ${CUSTOMERS[0].phone}  (${CUSTOMERS[0].fullName})`);
console.log(`  CUSTOMER  ${CUSTOMERS[1].phone}  (${CUSTOMERS[1].fullName})`);
console.log(`  CAREGIVER ${CAREGIVERS[0].phone}  (${CAREGIVERS[0].fullName}, NURSING, APPROVED)`);
console.log(`  CAREGIVER ${CAREGIVERS[1].phone}  (${CAREGIVERS[1].fullName}, PHYSIOTHERAPY, APPROVED)`);
console.log(`  CAREGIVER ${CAREGIVERS[2].phone}  (${CAREGIVERS[2].fullName}, ELDERLY_CARE, APPROVED)`);
console.log(`  CAREGIVER ${CAREGIVERS[3].phone}  (${CAREGIVERS[3].fullName}, POST_SURGERY_CARE, PENDING)`);
console.log(`  DOCTOR    ${CAREGIVERS[4].phone}  (${CAREGIVERS[4].fullName}, DOCTOR, APPROVED)`);
console.log(`  DOCTOR    ${CAREGIVERS[5].phone}  (${CAREGIVERS[5].fullName}, DOCTOR, APPROVED)`);
console.log('=====================================================================\n');

await prisma.$disconnect();
