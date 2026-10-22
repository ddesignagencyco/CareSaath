/**
 * In-browser mock database for the caregiver app. Seeded to mirror the
 * backend's demo accounts and persisted to localStorage so a demo survives
 * reloads (registration, accepted bookings, completed visits…).
 */
import type {
  AppNotification,
  Availability,
  CaregiverProfileRow,
  CredentialReview,
  DisputeRow,
  Me,
  PatientProfile,
  Address,
  Booking,
  Visit,
  VisitNote,
  VisitStatusHistory,
  Review,
  PrescriptionDocument,
  PayoutRequestRow,
  SafetyIncidentRow,
  PaymentMethod,
  PaymentStatus,
} from "@shared/caregiver-types";
import type { CaregiverDocument, PayoutAccount } from "@shared/types";

const STORAGE_KEY = "caresaath.caregiver.mockdb.v1";

export type MockUser = Omit<Me, "caregiverProfile">;

export interface MockPayment {
  id: string;
  visitId: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  commissionAmount: number;
  caregiverAmount: number;
  paidAt: string | null;
  payoutRequestId: string | null;
  createdAt: string;
}

export interface MockDb {
  users: MockUser[];
  profiles: CaregiverProfileRow[];
  documents: CaregiverDocument[];
  reviewsOfCredentials: CredentialReview[];
  availability: Record<string, Availability>;
  customers: { id: string; phone: string; fullName: string }[];
  patients: PatientProfile[];
  addresses: Address[];
  bookings: Booking[];
  visits: Visit[];
  history: VisitStatusHistory[];
  notes: VisitNote[];
  reviews: Review[];
  prescriptions: PrescriptionDocument[];
  payments: MockPayment[];
  payoutAccounts: (PayoutAccount & { fullNumber: string })[];
  payouts: PayoutRequestRow[];
  incidents: SafetyIncidentRow[];
  disputes: DisputeRow[];
  notifications: AppNotification[];
  /** Pending check-in OTPs by visit id. */
  checkinOtps: Record<string, { code: string; expiresAt: number; attempts: number }>;
  /** Seed timestamps are relative to this moment. */
  seededAt: number;
}

/** Re-seed stale demo data so "today", countdowns and request timers stay realistic. */
const MAX_AGE_MS = 6 * 3_600_000;

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const minutesAgo = (m: number) => iso(Date.now() - m * 60_000);
const daysAgo = (d: number, h = 0) => iso(Date.now() - d * DAY - h * 3_600_000);

/** Local calendar date offset, serialized like a Prisma @db.Date column. */
export function dateOnly(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * DAY);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}T00:00:00.000Z`;
}

let counter = 0;
export const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(counter++).toString(36)}`;

function seed(): MockDb {
  const now = Date.now();
  const fatimaUser: MockUser = {
    id: "user-fatima",
    phone: "+923001110011",
    role: "CAREGIVER",
    fullName: "Fatima Noor",
    preferredLanguage: "EN",
    status: "ACTIVE",
    lastLoginAt: daysAgo(1),
    createdAt: daysAgo(210),
  };
  const aliUser: MockUser = {
    id: "user-ali",
    phone: "+923001110012",
    role: "CAREGIVER",
    fullName: "Ali Raza",
    preferredLanguage: "EN",
    status: "ACTIVE",
    lastLoginAt: daysAgo(3),
    createdAt: daysAgo(3),
  };

  const fatima: CaregiverProfileRow = {
    id: "cg-fatima",
    userId: fatimaUser.id,
    cnic: "***********11-1",
    licenseNumber: "PNC-RN-210450",
    licenseBody: "PNC",
    specialty: "NURSING",
    experienceYears: 8,
    bio: "Registered nurse with 8 years at Services Hospital Lahore. Diabetes care, wound dressing, IV and injections, post-stroke support.",
    photoKey: null,
    serviceArea: { cities: ["Lahore"] },
    ratePerVisit: 2500_00,
    commissionRateId: "cr-nursing",
    verificationStatus: "APPROVED",
    approvedAt: daysAgo(200),
    reverifyDueAt: iso(now + 165 * DAY),
    ratingAverage: "4.86",
    ratingCount: 43,
    createdAt: daysAgo(205),
    updatedAt: daysAgo(20),
  };
  const ali: CaregiverProfileRow = {
    id: "cg-ali",
    userId: aliUser.id,
    cnic: "***********22-2",
    licenseNumber: "PPTA-3101",
    licenseBody: "OTHER",
    specialty: "PHYSIOTHERAPY",
    experienceYears: 4,
    bio: "DPT, stroke and post-fracture rehabilitation.",
    photoKey: null,
    serviceArea: { cities: ["Lahore"] },
    ratePerVisit: 3000_00,
    commissionRateId: "cr-physio",
    verificationStatus: "PENDING",
    approvedAt: null,
    reverifyDueAt: null,
    ratingAverage: "0",
    ratingCount: 0,
    createdAt: daysAgo(3),
    updatedAt: daysAgo(3),
  };

  const doc = (id: string, caregiverId: string, type: CaregiverDocument["type"], mimeType: string, sizeBytes: number, createdAt: string): CaregiverDocument => ({
    id,
    caregiverId,
    type,
    fileKey: `caresaath/caregivers/${caregiverId}/${id}`,
    mimeType,
    sizeBytes,
    createdAt,
  });

  const customers = [
    { id: "cust-ahmed", phone: "+923211234567", fullName: "Ahmed Raza" },
    { id: "cust-saima", phone: "+923334567890", fullName: "Saima Khalid" },
    { id: "cust-omar", phone: "+923001112233", fullName: "Omar Farooq" },
  ];

  const patient = (id: string, owner: string, name: string, rel: "SELF" | "FAMILY_MEMBER", dob: string, gender: string, ctx: string): PatientProfile => ({
    id,
    ownerUserId: owner,
    name,
    relationship: rel,
    dateOfBirth: dob,
    gender,
    medicalContext: ctx,
    createdAt: daysAgo(60),
    updatedAt: daysAgo(60),
  });
  const patients = [
    patient("pat-rashida", "cust-ahmed", "Rashida Begum", "FAMILY_MEMBER", "1949-03-12T00:00:00.000Z", "Female", "Type 2 diabetes on insulin (morning and night). Left-side weakness after a stroke in 2024. BP medication: amlodipine 5mg. Check blood sugar and BP each visit; needs help with mobility exercises."),
    patient("pat-khalid", "cust-saima", "Khalid Mehmood", "FAMILY_MEMBER", "1958-11-02T00:00:00.000Z", "Male", "Knee replacement (right) 10 days ago. Surgical wound dressing every other day. Allergic to penicillin."),
    patient("pat-omar", "cust-omar", "Omar Farooq", "SELF", "1985-06-20T00:00:00.000Z", "Male", "IV antibiotic course (ceftriaxone 1g daily) for 5 days, prescribed by Dr. Hassan, Doctors Hospital."),
  ];

  const address = (id: string, userId: string, label: string, line: string, lat: string, lng: string): Address => ({
    id,
    userId,
    label,
    addressLine: line,
    city: "Lahore",
    latitude: lat,
    longitude: lng,
    createdAt: daysAgo(60),
    updatedAt: daysAgo(60),
  });
  const addresses = [
    address("addr-ahmed", "cust-ahmed", "Home", "House 42, Street 7, Gulberg III", "31.516300", "74.343500"),
    address("addr-saima", "cust-saima", "Parents' home", "12-B, Block H, Johar Town", "31.469300", "74.272000"),
    address("addr-omar", "cust-omar", "Flat", "Apartment 5C, Askari 10, Sector F", "31.478900", "74.403100"),
  ];

  const booking = (b: Partial<Booking> & Pick<Booking, "id" | "customerId" | "patientId" | "addressId" | "status">): Booking => ({
    caregiverId: fatima.id,
    type: "SINGLE",
    recurrenceRule: null,
    startDate: dateOnly(0),
    endDate: dateOnly(0),
    timeWindowStart: "10:00",
    timeWindowEnd: "11:00",
    serviceType: "NURSING",
    rateSnapshot: fatima.ratePerVisit,
    promoCodeId: null,
    discountAmount: 0,
    respondBy: iso(now + 60 * 60_000),
    cancelledAt: null,
    cancelledById: null,
    cancelReason: null,
    createdAt: daysAgo(5),
    updatedAt: daysAgo(5),
    ...b,
  });

  const visit = (id: string, bookingId: string, offset: number, start: string, end: string, status: Visit["status"], extra: Partial<Visit> = {}): Visit => ({
    id,
    bookingId,
    scheduledDate: dateOnly(offset),
    timeWindowStart: start,
    timeWindowEnd: end,
    status,
    enRouteAt: null,
    checkInAt: null,
    checkOutAt: null,
    checkInMethod: null,
    checkOutMethod: null,
    checkInLat: null,
    checkInLng: null,
    checkOutLat: null,
    checkOutLng: null,
    rescheduledFromId: null,
    createdAt: daysAgo(5),
    updatedAt: daysAgo(5),
    ...extra,
  });

  // Recurring daily diabetes care for Rashida: started 4 days ago, 14 days.
  const bRashida = booking({
    id: "bk-rashida",
    customerId: "cust-ahmed",
    patientId: "pat-rashida",
    addressId: "addr-ahmed",
    status: "CONFIRMED",
    type: "RECURRING",
    recurrenceRule: { weekdays: [1, 2, 3, 4, 5, 6, 7], startDate: dateOnly(-4).slice(0, 10), endDate: dateOnly(9).slice(0, 10) },
    startDate: dateOnly(-4),
    endDate: dateOnly(9),
    timeWindowStart: "09:00",
    timeWindowEnd: "10:00",
    createdAt: daysAgo(6),
    respondBy: daysAgo(6),
  });
  const rashidaVisits: Visit[] = [];
  for (let d = -4; d <= 9; d++) {
    const past = d < 0;
    rashidaVisits.push(
      visit(`vs-rashida-${d + 4}`, bRashida.id, d, "09:00", "10:00", past ? "COMPLETED" : "CONFIRMED", past
        ? {
            enRouteAt: iso(new Date(dateOnly(d).slice(0, 10) + "T08:35:00").getTime()),
            checkInAt: iso(new Date(dateOnly(d).slice(0, 10) + "T09:02:00").getTime()),
            checkOutAt: iso(new Date(dateOnly(d).slice(0, 10) + "T09:51:00").getTime()),
            checkInMethod: "GPS",
            checkOutMethod: "GPS",
            checkInLat: "31.516280",
            checkInLng: "74.343470",
            checkOutLat: "31.516310",
            checkOutLng: "74.343520",
          }
        : {}),
    );
  }

  // Post-surgery dressing for Khalid this afternoon.
  const bKhalid = booking({
    id: "bk-khalid",
    customerId: "cust-saima",
    patientId: "pat-khalid",
    addressId: "addr-saima",
    status: "CONFIRMED",
    serviceType: "NURSING",
    timeWindowStart: "16:00",
    timeWindowEnd: "17:00",
    createdAt: daysAgo(2),
    respondBy: daysAgo(2),
  });
  const khalidVisit = visit("vs-khalid", bKhalid.id, 0, "16:00", "17:00", "CONFIRMED");

  // Two open requests waiting for a response.
  const bOmarReq = booking({
    id: "bk-omar",
    customerId: "cust-omar",
    patientId: "pat-omar",
    addressId: "addr-omar",
    status: "REQUESTED",
    type: "RECURRING",
    recurrenceRule: { weekdays: [1, 2, 3, 4, 5, 6, 7], startDate: dateOnly(1).slice(0, 10), endDate: dateOnly(5).slice(0, 10) },
    startDate: dateOnly(1),
    endDate: dateOnly(5),
    timeWindowStart: "19:00",
    timeWindowEnd: "20:00",
    createdAt: minutesAgo(18),
    respondBy: iso(now + 42 * 60_000),
  });
  const omarVisits = [1, 2, 3, 4, 5].map((d) => visit(`vs-omar-${d}`, bOmarReq.id, d, "19:00", "20:00", "REQUESTED"));

  const bSaimaReq = booking({
    id: "bk-saima-2",
    customerId: "cust-saima",
    patientId: "pat-khalid",
    addressId: "addr-saima",
    status: "REQUESTED",
    startDate: dateOnly(2),
    endDate: dateOnly(2),
    timeWindowStart: "11:00",
    timeWindowEnd: "12:00",
    discountAmount: 250_00,
    createdAt: minutesAgo(51),
    respondBy: iso(now + 9 * 60_000),
  });
  const saimaReqVisit = visit("vs-saima-2", bSaimaReq.id, 2, "11:00", "12:00", "REQUESTED");

  const prescriptions: PrescriptionDocument[] = [
    { id: "rx-omar", bookingId: bOmarReq.id, uploadedById: "cust-omar", fileKey: "rx/omar", mimeType: "application/pdf", sizeBytes: 182_000, createdAt: minutesAgo(17) },
    { id: "rx-khalid", bookingId: bKhalid.id, uploadedById: "cust-saima", fileKey: "rx/khalid", mimeType: "image/jpeg", sizeBytes: 640_000, createdAt: daysAgo(2) },
  ];

  const pastNotes = [
    "Sugar fasting 142 mg/dL, BP 138/86. Insulin given (14 units). Assisted 15 min of left-arm and leg exercises. Patient in good spirits; family reminded about evening dose.",
    "Sugar 156 fasting, BP 140/88. Insulin given. Skin check fine, no pressure sores. Advised more water intake.",
    "Sugar 131, BP 132/84. Insulin given. Walked with support for 10 minutes. Appetite improved.",
    "Sugar 128, BP 130/82. Insulin given. Exercises done. Family asked about diet chart; shared basic guidance and advised a dietitian.",
  ];
  const notes: VisitNote[] = rashidaVisits
    .filter((v) => v.status === "COMPLETED")
    .map((v, i) => ({ id: `note-${v.id}`, visitId: v.id, caregiverId: fatima.id, summary: pastNotes[i % pastNotes.length], submittedAt: v.checkOutAt! }));

  const reviews: Review[] = [
    { id: "rev-1", visitId: "vs-rashida-0", customerId: "cust-ahmed", caregiverId: fatima.id, rating: 5, comment: "Very caring and punctual. My mother is comfortable with her.", createdAt: daysAgo(3), updatedAt: daysAgo(3) },
    { id: "rev-2", visitId: "vs-rashida-2", customerId: "cust-ahmed", caregiverId: fatima.id, rating: 5, comment: null, createdAt: daysAgo(1), updatedAt: daysAgo(1) },
  ];

  const commission = (amount: number) => Math.round(amount * 0.2);
  const payments: MockPayment[] = rashidaVisits
    .filter((v) => v.status === "COMPLETED")
    .map((v, i) => ({
      id: `pay-${v.id}`,
      visitId: v.id,
      method: i % 2 === 0 ? "JAZZCASH" : "CASH",
      status: "PAID",
      amount: 2500_00,
      commissionAmount: commission(2500_00),
      caregiverAmount: 2500_00 - commission(2500_00),
      paidAt: v.checkOutAt,
      payoutRequestId: null,
      createdAt: v.checkOutAt!,
    }));
  // Today's visit is paid in cash: the payment waits for the caregiver to confirm receipt.
  payments.push({
    id: "pay-vs-khalid",
    visitId: khalidVisit.id,
    method: "CASH",
    status: "PENDING",
    amount: bKhalid.rateSnapshot - bKhalid.discountAmount,
    commissionAmount: commission(bKhalid.rateSnapshot - bKhalid.discountAmount),
    caregiverAmount: bKhalid.rateSnapshot - bKhalid.discountAmount - commission(bKhalid.rateSnapshot - bKhalid.discountAmount),
    paidAt: null,
    payoutRequestId: null,
    createdAt: daysAgo(1),
  });
  // Older history so lifetime totals look real.
  for (let i = 0; i < 38; i++) {
    const amt = 2500_00;
    payments.push({
      id: `pay-hist-${i}`,
      visitId: `vs-hist-${i}`,
      method: "JAZZCASH",
      status: "PAID",
      amount: amt,
      commissionAmount: commission(amt),
      caregiverAmount: amt - commission(amt),
      paidAt: daysAgo(20 + i * 3),
      payoutRequestId: i < 30 ? "po-paid-1" : "po-processing",
      createdAt: daysAgo(20 + i * 3),
    });
  }

  const payoutAccounts: MockDb["payoutAccounts"] = [
    { id: "pa-jazz", caregiverId: fatima.id, type: "MOBILE_WALLET", provider: "JazzCash", accountTitle: "Fatima Noor", accountNumber: "****0011", fullNumber: "03001110011", createdAt: daysAgo(190), updatedAt: daysAgo(190) },
    { id: "pa-meezan", caregiverId: fatima.id, type: "BANK", provider: "Meezan Bank", accountTitle: "Fatima Noor", accountNumber: "****4471", fullNumber: "PK36MEZN0002010104274471", createdAt: daysAgo(120), updatedAt: daysAgo(120) },
  ];
  const payouts: PayoutRequestRow[] = [
    { id: "po-processing", caregiverId: fatima.id, payoutAccountId: "pa-jazz", amount: 8 * 2000_00, status: "PROCESSING", requestedAt: daysAgo(2), processedAt: null },
    { id: "po-paid-1", caregiverId: fatima.id, payoutAccountId: "pa-meezan", amount: 30 * 2000_00, status: "PAID", requestedAt: daysAgo(14), processedAt: daysAgo(12) },
  ];

  const incidents: SafetyIncidentRow[] = [
    { id: "inc-fatima-1", visitId: null, reportedById: fatimaUser.id, source: "CAREGIVER_REPORT", description: "Gate guard refused entry to the housing society; address pin was also wrong.", priority: "LOW", status: "RESOLVED", assignedAdminId: "admin-0001", resolvedAt: daysAgo(5), createdAt: daysAgo(6), updatedAt: daysAgo(5) },
  ];

  const push = (id: string, event: string, payload: Record<string, unknown>, createdAt: string): AppNotification => ({
    id,
    userId: fatimaUser.id,
    channel: "PUSH",
    event,
    payload,
    status: "SENT",
    sentAt: createdAt,
    createdAt,
  });
  const notifications: AppNotification[] = [
    push("n-1", "booking.requested", { bookingId: bSaimaReq.id, visits: 1 }, minutesAgo(51)),
    push("n-2", "booking.requested", { bookingId: bOmarReq.id, visits: 5 }, minutesAgo(18)),
    push("n-3", "booking.prescription.uploaded", { bookingId: bOmarReq.id, documentId: "rx-omar" }, minutesAgo(17)),
    push("n-4", "payout.processing", { payoutRequestId: "po-processing", amount: 8 * 2000_00, status: "PROCESSING" }, daysAgo(1)),
    push("n-5", "safety_incident.updated", { incidentId: "inc-fatima-1", status: "RESOLVED", priority: "LOW" }, daysAgo(5)),
    push("n-6", "payout.paid", { payoutRequestId: "po-paid-1", amount: 30 * 2000_00, status: "PAID" }, daysAgo(12)),
  ];

  return {
    users: [fatimaUser, aliUser],
    profiles: [fatima, ali],
    documents: [
      doc("doc-f1", fatima.id, "LICENSE", "application/pdf", 412_000, daysAgo(205)),
      doc("doc-f2", fatima.id, "CERTIFICATE", "application/pdf", 988_000, daysAgo(205)),
      doc("doc-f3", fatima.id, "CNIC_COPY", "image/jpeg", 245_000, daysAgo(205)),
      doc("doc-a1", ali.id, "LICENSE", "application/pdf", 380_000, daysAgo(3)),
    ],
    reviewsOfCredentials: [
      { id: "cr-f1", caregiverId: fatima.id, reviewerId: "admin-0001", kind: "INITIAL", decision: "APPROVED", reason: "PNC registry record validated and active.", decidedAt: daysAgo(200) },
    ],
    availability: {
      [fatima.id]: {
        rules: [1, 2, 3, 4, 5, 6].flatMap((d) => [
          { id: `ar-${d}-a`, caregiverId: fatima.id, dayOfWeek: d, startTime: "08:00", endTime: "13:00" },
          ...(d !== 6 ? [{ id: `ar-${d}-b`, caregiverId: fatima.id, dayOfWeek: d, startTime: "15:00", endTime: "20:00" }] : []),
        ]),
        blocks: [{ id: "blk-1", caregiverId: fatima.id, startDate: dateOnly(18), endDate: dateOnly(20), reason: "Family wedding in Faisalabad", createdAt: daysAgo(2) }],
      },
      [ali.id]: { rules: [], blocks: [] },
    },
    customers,
    patients,
    addresses,
    bookings: [bRashida, bKhalid, bOmarReq, bSaimaReq],
    visits: [...rashidaVisits, khalidVisit, ...omarVisits, saimaReqVisit],
    history: rashidaVisits
      .filter((v) => v.status === "COMPLETED")
      .flatMap((v) => [
        { id: `h-${v.id}-1`, visitId: v.id, fromStatus: "CONFIRMED" as const, toStatus: "EN_ROUTE" as const, actorId: fatimaUser.id, at: v.enRouteAt! },
        { id: `h-${v.id}-2`, visitId: v.id, fromStatus: "EN_ROUTE" as const, toStatus: "CHECKED_IN" as const, actorId: fatimaUser.id, at: v.checkInAt! },
        { id: `h-${v.id}-3`, visitId: v.id, fromStatus: "CHECKED_IN" as const, toStatus: "IN_PROGRESS" as const, actorId: fatimaUser.id, at: v.checkOutAt! },
        { id: `h-${v.id}-4`, visitId: v.id, fromStatus: "IN_PROGRESS" as const, toStatus: "CHECKED_OUT" as const, actorId: fatimaUser.id, at: v.checkOutAt! },
        { id: `h-${v.id}-5`, visitId: v.id, fromStatus: "CHECKED_OUT" as const, toStatus: "COMPLETED" as const, actorId: fatimaUser.id, at: v.checkOutAt! },
      ]),
    notes,
    reviews,
    prescriptions,
    payments,
    payoutAccounts,
    payouts,
    incidents,
    disputes: [],
    notifications,
    checkinOtps: {},
    seededAt: now,
  };
}

let cache: MockDb | null = null;

export function db(): MockDb {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as MockDb;
      if (stored.seededAt && Date.now() - stored.seededAt < MAX_AGE_MS) {
        cache = stored;
        return cache;
      }
    }
  } catch {
    // fall through to a fresh seed
  }
  cache = seed();
  return cache;
}

export function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db()));
  } catch {
    // storage unavailable: data lives for this page only
  }
}

export function resetMockDb() {
  cache = seed();
  persist();
}
