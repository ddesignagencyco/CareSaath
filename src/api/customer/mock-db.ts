/**
 * In-browser mock database for the customer section. Persisted to
 * localStorage so a demo survives reloads; re-seeds after 6 hours so dates,
 * countdowns and "today" stay realistic.
 */
import { kv } from "../../lib/storage";
import type {
  Address,
  AppNotification,
  AvailabilityRule,
  Booking,
  DisputeRow,
  Me,
  PatientProfile,
  PrescriptionDocument,
  Review,
  SafetyIncidentRow,
  Visit,
  VisitNote,
  VisitStatusHistory,
} from "../types";
import type { CustomerPayment, EmergencyContact, PublicCaregiver } from "../types";
import type { PromoCode } from "../types";

const STORAGE_KEY = "caresaath.customer.mockdb.v1";
const MAX_AGE_MS = 6 * 3_600_000;
const DAY = 86_400_000;

export type MockUser = Omit<Me, "caregiverProfile">;

export interface MockCaregiver extends PublicCaregiver {
  /** Caregiver's user id (for notifications/history actor). */
  userId: string;
  commissionPct: number;
}

export interface MockDb {
  users: MockUser[];
  caregivers: MockCaregiver[];
  patients: PatientProfile[];
  addresses: Address[];
  contacts: EmergencyContact[];
  bookings: Booking[];
  visits: Visit[];
  history: VisitStatusHistory[];
  notes: VisitNote[];
  reviews: Review[];
  prescriptions: PrescriptionDocument[];
  payments: CustomerPayment[];
  incidents: SafetyIncidentRow[];
  disputes: DisputeRow[];
  notifications: AppNotification[];
  promos: PromoCode[];
  /** Bookings the mock caregiver "accepts" shortly after creation. */
  autoAccept: string[];
  seededAt: number;
}

const iso = (ms: number) => new Date(ms).toISOString();

/** Local calendar date offset, serialized like a Prisma @db.Date column. */
export function dateOnly(offsetDays = 0, from = Date.now()): string {
  const d = new Date(from + offsetDays * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T00:00:00.000Z`;
}

let counter = 0;
export const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(counter++).toString(36)}`;

function rules(caregiverId: string, days: number[], windows: [string, string][]): AvailabilityRule[] {
  return days.flatMap((d) => windows.map(([s, e], i) => ({ id: `ar-${caregiverId}-${d}-${i}`, caregiverId, dayOfWeek: d, startTime: s, endTime: e })));
}

function seed(): MockDb {
  const now = Date.now();
  const ago = (days: number, minutes = 0) => iso(now - days * DAY - minutes * 60_000);

  const ahmed: MockUser = {
    id: "cust-ahmed",
    phone: "+923211234567",
    role: "CUSTOMER",
    fullName: "Ahmed Raza",
    preferredLanguage: "EN",
    status: "ACTIVE",
    lastLoginAt: ago(1),
    createdAt: ago(60),
  };

  type Seed = [id: string, name: string, specialty: PublicCaregiver["specialty"], body: PublicCaregiver["licenseBody"], license: string, years: number, rateRs: number, cities: string[], rating: string, count: number, bio: string];
  const seeds: Seed[] = [
    ["cg-fatima", "Fatima Noor", "NURSING", "PNC", "PNC-RN-210450", 8, 2500, ["Lahore"], "4.86", 43, "Registered nurse with 8 years at Services Hospital Lahore. Diabetes care, wound dressing, IV and injections, post-stroke support."],
    ["cg-hina", "Hina Javed", "NURSING", "PNC", "PNC-RN-210487", 11, 3200, ["Lahore"], "4.86", 64, "Senior nurse focused on palliative and elderly home care. Calm, patient and experienced with families."],
    ["cg-usman", "Usman Tariq", "PHYSIOTHERAPY", "OTHER", "PPTA-3107", 7, 3800, ["Lahore"], "4.72", 41, "DPT. Stroke rehabilitation, knee and hip replacement recovery, back pain programmes."],
    ["cg-saad", "Dr. Saad Mehmood", "PHYSIOTHERAPY", "PMDC", "PMDC-48220-P", 12, 5000, ["Islamabad"], "4.95", 87, "Consultant physiotherapist. Neuro and sports rehab, home exercise plans with weekly progress tracking."],
    ["cg-rabia", "Rabia Aslam", "POST_SURGERY_CARE", "PNC", "PNC-RN-210709", 8, 3500, ["Islamabad", "Rawalpindi"], "4.91", 38, "Post-operative nursing: dressings, drains, catheter care and medication management after discharge."],
    ["cg-kamran", "Kamran Shah", "ELDERLY_CARE", "OTHER", "CERT-EC-2209", 5, 2200, ["Rawalpindi", "Islamabad"], "4.55", 22, "Elderly attendant: mobility help, hygiene, meals and companionship. Speaks Urdu, Punjabi and Pashto."],
    ["cg-nadia", "Nadia Hussain", "NURSING", "PNC", "PNC-RN-210598", 4, 2400, ["Lahore"], "4.67", 18, "Nurse for injections, IV antibiotics, blood sugar monitoring and post-hospital care."],
    ["cg-bilal", "Bilal Ahmed", "POST_SURGERY_CARE", "PNC", "PNC-RN-211002", 6, 3000, ["Lahore"], "4.60", 12, "Male nurse for post-surgery care, catheter and wound management."],
    ["cg-mariam", "Mariam Javed", "PHYSIOTHERAPY", "OTHER", "PPTA-3188", 5, 3200, ["Lahore"], "4.80", 29, "Women's health and geriatric physiotherapy. Gentle, home-based exercise programmes."],
    ["cg-sadia", "Sadia Malik", "ELDERLY_CARE", "OTHER", "CERT-EC-2311", 2, 1800, ["Lahore"], "0", 0, "Caring attendant for daily routines, mobility and companionship for elderly patients."],
  ];
  const windows: Record<PublicCaregiver["specialty"], [string, string][]> = {
    NURSING: [["08:00", "13:00"], ["15:00", "20:00"]],
    PHYSIOTHERAPY: [["10:00", "18:00"]],
    POST_SURGERY_CARE: [["09:00", "17:00"]],
    ELDERLY_CARE: [["08:00", "20:00"]],
  };
  const caregivers: MockCaregiver[] = seeds.map(([id, name, specialty, body, license, years, rate, cities, rating, count, bio], i) => ({
    id,
    userId: `user-${id}`,
    specialty,
    licenseNumber: license,
    licenseBody: body,
    experienceYears: years,
    bio,
    photoUrl: null,
    ratePerVisit: rate * 100,
    serviceArea: { cities },
    ratingAverage: rating,
    ratingCount: count,
    createdAt: ago(300 - i * 20),
    user: { fullName: name },
    availabilityRules: rules(id, i % 3 === 0 ? [1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4, 5], windows[specialty]),
    commissionPct: 20,
  }));
  const cg = (id: string) => caregivers.find((c) => c.id === id)!;

  const patients: PatientProfile[] = [
    {
      id: "pat-rashida",
      ownerUserId: ahmed.id,
      name: "Rashida Begum",
      relationship: "FAMILY_MEMBER",
      dateOfBirth: "1949-03-12T00:00:00.000Z",
      gender: "Female",
      medicalContext:
        "Type 2 diabetes on insulin (morning and night). Left-side weakness after a stroke in 2024. BP medication: amlodipine 5mg. Check blood sugar and BP each visit; needs help with mobility exercises.",
      createdAt: ago(60),
      updatedAt: ago(60),
    },
    {
      id: "pat-ahmed",
      ownerUserId: ahmed.id,
      name: "Ahmed Raza",
      relationship: "SELF",
      dateOfBirth: "1984-07-02T00:00:00.000Z",
      gender: "Male",
      medicalContext: "Lower back pain after a disc bulge (L4-L5). No surgery. Desk job.",
      createdAt: ago(40),
      updatedAt: ago(40),
    },
  ];
  const addresses: Address[] = [
    { id: "addr-home", userId: ahmed.id, label: "Home", addressLine: "House 42, Street 7, Gulberg III", city: "Lahore", latitude: "31.516300", longitude: "74.343500", createdAt: ago(60), updatedAt: ago(60) },
    { id: "addr-office", userId: ahmed.id, label: "Office", addressLine: "Floor 3, Arfa Software Technology Park, Ferozepur Road", city: "Lahore", latitude: "31.475800", longitude: "74.342600", createdAt: ago(40), updatedAt: ago(40) },
  ];

  const booking = (b: Partial<Booking> & Pick<Booking, "id" | "patientId" | "addressId" | "caregiverId" | "status">): Booking => {
    const c = cg(b.caregiverId);
    return {
      customerId: ahmed.id,
      type: "SINGLE",
      recurrenceRule: null,
      startDate: dateOnly(0),
      endDate: dateOnly(0),
      timeWindowStart: "10:00",
      timeWindowEnd: "11:00",
      serviceType: c.specialty,
      rateSnapshot: c.ratePerVisit,
      promoCodeId: null,
      discountAmount: 0,
      respondBy: ago(5),
      cancelledAt: null,
      cancelledById: null,
      cancelReason: null,
      createdAt: ago(6),
      updatedAt: ago(6),
      ...b,
    };
  };
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
    createdAt: ago(6),
    updatedAt: ago(6),
    ...extra,
  });

  // 1. Daily diabetes care for Rashida with Fatima: 4 done, today's caregiver is on the way.
  const b1 = booking({
    id: "bk-daily",
    caregiverId: "cg-fatima",
    patientId: "pat-rashida",
    addressId: "addr-home",
    status: "CONFIRMED",
    type: "RECURRING",
    recurrenceRule: { weekdays: [1, 2, 3, 4, 5, 6, 7], startDate: dateOnly(-4).slice(0, 10), endDate: dateOnly(9).slice(0, 10) },
    startDate: dateOnly(-4),
    endDate: dateOnly(9),
    timeWindowStart: "09:00",
    timeWindowEnd: "10:00",
    createdAt: ago(6),
    respondBy: ago(6),
  });
  const b1Visits: Visit[] = [];
  for (let d = -4; d <= 9; d++) {
    const key = dateOnly(d).slice(0, 10);
    const at = (hhmm: string) => iso(new Date(`${key}T${hhmm}:00`).getTime());
    if (d < 0) {
      b1Visits.push(
        visit(`vs-daily-${d + 4}`, b1.id, d, "09:00", "10:00", "COMPLETED", {
          enRouteAt: at("08:35"),
          checkInAt: at("09:02"),
          checkOutAt: at("09:51"),
          checkInMethod: "GPS",
          checkOutMethod: "GPS",
        }),
      );
    } else if (d === 0) {
      b1Visits.push(visit("vs-daily-today", b1.id, 0, "09:00", "10:00", "EN_ROUTE", { enRouteAt: ago(0, 12) }));
    } else {
      b1Visits.push(visit(`vs-daily-${d + 4}`, b1.id, d, "09:00", "10:00", "CONFIRMED"));
    }
  }

  // 2. Physio request for Ahmed himself, waiting for Usman.
  const b2 = booking({
    id: "bk-physio",
    caregiverId: "cg-usman",
    patientId: "pat-ahmed",
    addressId: "addr-office",
    status: "REQUESTED",
    startDate: dateOnly(2),
    endDate: dateOnly(2),
    timeWindowStart: "17:00",
    timeWindowEnd: "18:00",
    createdAt: ago(0, 20),
    respondBy: iso(now + 40 * 60_000),
  });
  const b2Visit = visit("vs-physio", b2.id, 2, "17:00", "18:00", "REQUESTED");

  // 3. A past single visit with Nadia, completed but not yet reviewed.
  const b3 = booking({
    id: "bk-nadia",
    caregiverId: "cg-nadia",
    patientId: "pat-rashida",
    addressId: "addr-home",
    status: "CONFIRMED",
    startDate: dateOnly(-10),
    endDate: dateOnly(-10),
    timeWindowStart: "16:00",
    timeWindowEnd: "17:00",
    createdAt: ago(12),
  });
  const k3 = dateOnly(-10).slice(0, 10);
  const b3Visit = visit("vs-nadia", b3.id, -10, "16:00", "17:00", "COMPLETED", {
    enRouteAt: iso(new Date(`${k3}T15:40:00`).getTime()),
    checkInAt: iso(new Date(`${k3}T16:05:00`).getTime()),
    checkOutAt: iso(new Date(`${k3}T16:50:00`).getTime()),
    checkInMethod: "OTP",
    checkOutMethod: "GPS",
  });

  // 4. Declined and 5. cancelled requests (history).
  const b4 = booking({
    id: "bk-declined",
    caregiverId: "cg-hina",
    patientId: "pat-rashida",
    addressId: "addr-home",
    status: "DECLINED",
    startDate: dateOnly(-15),
    endDate: dateOnly(-15),
    cancelledAt: ago(16),
    cancelledById: "user-cg-hina",
    cancelReason: "Fully booked this week",
    createdAt: ago(16, 30),
  });
  const b4Visit = visit("vs-declined", b4.id, -15, "10:00", "11:00", "DECLINED");
  const b5 = booking({
    id: "bk-cancelled",
    caregiverId: "cg-mariam",
    patientId: "pat-ahmed",
    addressId: "addr-home",
    status: "CANCELLED",
    startDate: dateOnly(-20),
    endDate: dateOnly(-20),
    cancelledAt: ago(21),
    cancelledById: ahmed.id,
    cancelReason: "Feeling better, not needed",
    createdAt: ago(22),
  });
  const b5Visit = visit("vs-cancelled", b5.id, -20, "18:00", "19:00", "CANCELLED");

  const fatimaUser = "user-cg-fatima";
  const noteText = [
    "Sugar fasting 142 mg/dL, BP 138/86. Insulin given (14 units). Assisted 15 min of left-arm and leg exercises. Patient in good spirits; family reminded about evening dose.",
    "Sugar 156 fasting, BP 140/88. Insulin given. Skin check fine, no pressure sores. Advised more water intake.",
    "Sugar 131, BP 132/84. Insulin given. Walked with support for 10 minutes. Appetite improved.",
    "Sugar 128, BP 130/82. Insulin given. Exercises done. Family asked about diet chart; shared basic guidance and advised a dietitian.",
  ];
  const done = b1Visits.filter((v) => v.status === "COMPLETED");
  const notes: VisitNote[] = [
    ...done.map((v, i) => ({ id: `note-${v.id}`, visitId: v.id, caregiverId: "cg-fatima", summary: noteText[i % noteText.length], submittedAt: v.checkOutAt! })),
    { id: "note-nadia", visitId: b3Visit.id, caregiverId: "cg-nadia", summary: "IV ceftriaxone 1g given over 30 min, no reaction. Cannula site clean. Temperature 37.4°C. Next dose tomorrow same time.", submittedAt: b3Visit.checkOutAt! },
  ];
  const historyFor = (v: Visit, actor: string): VisitStatusHistory[] =>
    v.status === "COMPLETED"
      ? [
          { id: `h-${v.id}-1`, visitId: v.id, fromStatus: "CONFIRMED", toStatus: "EN_ROUTE", actorId: actor, at: v.enRouteAt! },
          { id: `h-${v.id}-2`, visitId: v.id, fromStatus: "EN_ROUTE", toStatus: "CHECKED_IN", actorId: actor, at: v.checkInAt! },
          { id: `h-${v.id}-3`, visitId: v.id, fromStatus: "CHECKED_IN", toStatus: "IN_PROGRESS", actorId: actor, at: v.checkInAt! },
          { id: `h-${v.id}-4`, visitId: v.id, fromStatus: "IN_PROGRESS", toStatus: "CHECKED_OUT", actorId: actor, at: v.checkOutAt! },
          { id: `h-${v.id}-5`, visitId: v.id, fromStatus: "CHECKED_OUT", toStatus: "COMPLETED", actorId: actor, at: v.checkOutAt! },
        ]
      : [];
  const todayVisit = b1Visits.find((v) => v.id === "vs-daily-today")!;

  const payments: CustomerPayment[] = done.map((v, i) => ({
    id: `pay-${v.id}`,
    visitId: v.id,
    method: i % 2 === 0 ? "JAZZCASH" : "CASH",
    status: "PAID",
    amount: 2500_00,
    commissionAmount: 500_00,
    caregiverAmount: 2000_00,
    gatewayRef: i % 2 === 0 ? `gw_pay-${v.id}` : null,
    paidAt: v.checkOutAt,
    customerConfirmedAt: v.checkOutAt,
    caregiverConfirmedAt: v.checkOutAt,
    confirmationNote: null,
    payoutRequestId: null,
    createdAt: v.checkOutAt!,
    updatedAt: v.checkOutAt!,
  }));
  payments.push({
    id: "pay-nadia",
    visitId: b3Visit.id,
    method: "CASH",
    status: "PAID",
    amount: 2400_00,
    commissionAmount: 480_00,
    caregiverAmount: 1920_00,
    gatewayRef: null,
    paidAt: b3Visit.checkOutAt,
    customerConfirmedAt: b3Visit.checkOutAt,
    caregiverConfirmedAt: b3Visit.checkOutAt,
    confirmationNote: null,
    payoutRequestId: null,
    createdAt: b3Visit.checkOutAt!,
    updatedAt: b3Visit.checkOutAt!,
  });

  const push = (id: string, event: string, payload: Record<string, unknown>, createdAt: string): AppNotification => ({
    id,
    userId: ahmed.id,
    channel: "PUSH",
    event,
    payload,
    status: "SENT",
    sentAt: createdAt,
    readAt: null,
    createdAt,
  });

  return {
    users: [ahmed],
    caregivers,
    patients,
    addresses,
    contacts: [{ id: "ec-sana", userId: ahmed.id, name: "Sana Raza (sister)", phone: "+923331234567", createdAt: ago(50), updatedAt: ago(50) }],
    bookings: [b1, b2, b3, b4, b5],
    visits: [...b1Visits, b2Visit, b3Visit, b4Visit, b5Visit],
    history: [
      ...done.flatMap((v) => historyFor(v, fatimaUser)),
      ...historyFor(b3Visit, "user-cg-nadia"),
      { id: "h-today-1", visitId: todayVisit.id, fromStatus: "CONFIRMED", toStatus: "EN_ROUTE", actorId: fatimaUser, at: todayVisit.enRouteAt! },
    ],
    notes,
    reviews: [
      { id: "rev-1", visitId: done[0].id, customerId: ahmed.id, caregiverId: "cg-fatima", rating: 5, comment: "Very caring and punctual. My mother is comfortable with her.", createdAt: ago(3), updatedAt: ago(3) },
      { id: "rev-2", visitId: done[2].id, customerId: ahmed.id, caregiverId: "cg-fatima", rating: 5, comment: null, createdAt: ago(1), updatedAt: ago(1) },
    ],
    prescriptions: [
      { id: "rx-daily", bookingId: b1.id, uploadedById: ahmed.id, fileKey: "rx/daily", mimeType: "image/jpeg", sizeBytes: 640_000, createdAt: ago(6) },
    ],
    payments,
    incidents: [],
    disputes: [],
    notifications: [
      push("n-1", "visit.en_route", { visitId: todayVisit.id, bookingId: b1.id, status: "EN_ROUTE" }, ago(0, 12)),
      push("n-2", "visit.completed", { visitId: done[done.length - 1].id, bookingId: b1.id, status: "COMPLETED" }, done[done.length - 1].checkOutAt!),
      push("n-3", "payment.paid", { paymentId: payments[payments.length - 2].id, amount: 2500_00 }, done[done.length - 1].checkOutAt!),
      push("n-4", "booking.declined", { bookingId: b4.id }, ago(16)),
      push("n-5", "booking.confirmed", { bookingId: b1.id }, ago(6)),
    ],
    promos: [
      { id: "promo-1", code: "WELCOME10", discountType: "PERCENT", discountValue: 10, validFrom: ago(60), validTo: iso(now + 120 * DAY), maxUses: 1000, usesCount: 342, active: true, createdAt: ago(60), updatedAt: ago(60) },
      { id: "promo-2", code: "ELDERCARE500", discountType: "FIXED", discountValue: 500_00, validFrom: ago(20), validTo: iso(now + 40 * DAY), maxUses: 300, usesCount: 88, active: true, createdAt: ago(20), updatedAt: ago(20) },
      { id: "promo-3", code: "RAMZAN15", discountType: "PERCENT", discountValue: 15, validFrom: ago(200), validTo: ago(170), maxUses: null, usesCount: 615, active: false, createdAt: ago(200), updatedAt: ago(170) },
    ],
    autoAccept: [],
    seededAt: now,
  };
}

let cache: MockDb | null = null;

export function db(): MockDb {
  if (cache) return cache;
  try {
    const raw = kv.getItem(STORAGE_KEY);
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
    kv.setItem(STORAGE_KEY, JSON.stringify(db()));
  } catch {
    // storage unavailable: data lives for this page only
  }
}

export function resetMockDb() {
  cache = seed();
  persist();
}
