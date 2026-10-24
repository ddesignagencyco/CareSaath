/**
 * In-memory implementation of the customer API, mirroring backend rules and
 * exact error messages so the UI handles the same failures it will meet
 * against the real server.
 */
import { ApiError } from "@shared/api/http";
import { decodeToken } from "@shared/api/session";
import type {
  Address,
  AppNotification,
  BookingDetail,
  DisputeRow,
  Me,
  PatientProfile,
  Review,
  SafetyIncidentRow,
  SosResult,
  Visit,
} from "@shared/caregiver-types";
import type {
  AddressInput,
  CaregiverSearchItem,
  CreateBookingInput,
  CustomerBookingListItem,
  CustomerPayment,
  CustomerPaymentWithVisit,
  CustomerVisitDetail,
  EmergencyContact,
  PatientInput,
  PublicCaregiver,
  RescheduleInput,
  ReviewInput,
} from "@shared/customer-types";
import { parsePkMobile } from "@shared/lib/phone";
import type { IncidentPriority, PageQuery, Paginated, Specialty, TokenPair } from "@shared/types";
import type { CaregiverBookingStatus, PaymentMethod, PaymentStatus } from "@shared/caregiver-types";
import { session } from "../api/session";
import { db, persist, uid, type MockCaregiver, type MockUser } from "./db";

const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms + Math.random() * 250));
const clone = <T>(v: T): T => structuredClone(v);
const nowIso = () => new Date().toISOString();
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const notFound = (m: string): never => {
  throw new ApiError(404, m);
};
const bad = (m: string): never => {
  throw new ApiError(400, m);
};

function paginate<T>(all: T[], q: PageQuery): Paginated<T> {
  const page = q.page ?? 1;
  const limit = q.limit ?? 20;
  return { items: clone(all.slice((page - 1) * limit, page * limit)), page, limit, total: all.length };
}

/* ---- Identity -------------------------------------------------------------- */

export const MOCK_OTP = "123456";

function fakeJwt(payload: object): string {
  const enc = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, "");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc(payload)}.mock-signature`;
}

function currentUser(): MockUser {
  const payload = decodeToken(session.get()?.accessToken ?? "");
  if (!payload) throw new ApiError(401, "Missing access token");
  return db().users.find((u) => u.id === payload.sub) ?? (() => { throw new ApiError(401, "Invalid or expired access token"); })();
}

/** Customer routes are @Roles(CUSTOMER) (checked against the JWT role). */
function customer(): MockUser {
  const user = currentUser();
  if (decodeToken(session.get()?.accessToken ?? "")?.role !== "CUSTOMER") throw new ApiError(403, "Insufficient role");
  return user;
}

export async function requestOtp(phone: string) {
  await delay();
  const parsed = parsePkMobile(phone);
  if (!parsed.ok) bad(parsed.error);
  return { ttlSeconds: 300 };
}

export async function verifyOtp(phone: string, code: string): Promise<TokenPair> {
  await delay();
  if (code !== MOCK_OTP) throw new ApiError(401, "Invalid OTP");
  const d = db();
  let user = d.users.find((u) => u.phone === phone);
  if (!user) {
    user = { id: uid("cust"), phone, role: "CUSTOMER", fullName: "", preferredLanguage: "EN", status: "ACTIVE", lastLoginAt: null, createdAt: nowIso() };
    d.users.push(user);
  }
  user.lastLoginAt = nowIso();
  persist();
  const claims = { sub: user.id, role: user.role, phone: user.phone };
  return { accessToken: fakeJwt({ ...claims, type: "access" }), refreshToken: fakeJwt({ ...claims, type: "refresh" }) };
}

export async function me(): Promise<Me> {
  await delay(150);
  return { ...clone(currentUser()), caregiverProfile: null };
}

export async function updateMe(dto: { fullName?: string; preferredLanguage?: "EN" | "UR" }) {
  await delay();
  const user = currentUser();
  if (dto.fullName !== undefined) {
    if (dto.fullName.length < 1 || dto.fullName.length > 120) bad("fullName must be between 1 and 120 characters");
    user.fullName = dto.fullName;
  }
  if (dto.preferredLanguage) user.preferredLanguage = dto.preferredLanguage;
  persist();
  return { id: user.id, phone: user.phone, fullName: user.fullName, preferredLanguage: user.preferredLanguage };
}

/* ---- Emergency contacts ----------------------------------------------------- */

export async function listContacts(): Promise<EmergencyContact[]> {
  await delay(150);
  const user = currentUser();
  return clone(db().contacts.filter((c) => c.userId === user.id));
}

export async function addContact(dto: { name: string; phone: string }): Promise<EmergencyContact> {
  await delay();
  const user = currentUser();
  if (!dto.name.trim()) bad("name must be longer than or equal to 1 characters");
  const contact = { id: uid("ec"), userId: user.id, name: dto.name.trim(), phone: dto.phone, createdAt: nowIso(), updatedAt: nowIso() };
  db().contacts.push(contact);
  persist();
  return clone(contact);
}

export async function deleteContact(id: string) {
  await delay();
  const user = currentUser();
  const d = db();
  if (!d.contacts.some((c) => c.id === id && c.userId === user.id)) notFound("Emergency contact not found");
  d.contacts = d.contacts.filter((c) => c.id !== id);
  persist();
  return { ok: true as const };
}

/* ---- Patients & addresses --------------------------------------------------- */

export async function listPatients(): Promise<PatientProfile[]> {
  await delay(150);
  const user = customer();
  return clone(db().patients.filter((p) => p.ownerUserId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}

export async function getPatient(id: string): Promise<PatientProfile> {
  await delay(150);
  const user = customer();
  return clone(db().patients.find((p) => p.id === id && p.ownerUserId === user.id) ?? notFound("Patient profile not found"));
}

function checkPatient(dto: Partial<PatientInput>) {
  if (dto.name !== undefined && (dto.name.trim().length < 1 || dto.name.length > 120)) bad("name must be longer than or equal to 1 characters");
  if (dto.medicalContext && dto.medicalContext.length > 4000) bad("medicalContext must be shorter than or equal to 4000 characters");
}

export async function createPatient(dto: PatientInput): Promise<PatientProfile> {
  await delay();
  const user = customer();
  checkPatient(dto);
  const p: PatientProfile = {
    id: uid("pat"),
    ownerUserId: user.id,
    name: dto.name.trim(),
    relationship: dto.relationship ?? "SELF",
    dateOfBirth: dto.dateOfBirth ? `${dto.dateOfBirth}T00:00:00.000Z` : null,
    gender: dto.gender ?? null,
    medicalContext: dto.medicalContext ?? null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  db().patients.push(p);
  persist();
  return clone(p);
}

export async function updatePatient(id: string, dto: Partial<PatientInput>): Promise<PatientProfile> {
  await delay();
  const user = customer();
  const p = db().patients.find((x) => x.id === id && x.ownerUserId === user.id) ?? notFound("Patient profile not found");
  checkPatient(dto);
  if (dto.name !== undefined) p.name = dto.name.trim();
  if (dto.relationship) p.relationship = dto.relationship;
  if (dto.dateOfBirth !== undefined) p.dateOfBirth = dto.dateOfBirth ? `${dto.dateOfBirth}T00:00:00.000Z` : null;
  if (dto.gender !== undefined) p.gender = dto.gender || null;
  if (dto.medicalContext !== undefined) p.medicalContext = dto.medicalContext || null;
  p.updatedAt = nowIso();
  persist();
  return clone(p);
}

export async function deletePatient(id: string) {
  await delay();
  const user = customer();
  const d = db();
  if (!d.patients.some((x) => x.id === id && x.ownerUserId === user.id)) notFound("Patient profile not found");
  if (d.bookings.some((b) => b.patientId === id)) notFound("Patient has bookings; medical records must be retained for audit");
  d.patients = d.patients.filter((x) => x.id !== id);
  persist();
  return { ok: true as const };
}

const DECIMAL = /^-?\d{1,3}(\.\d{1,8})?$/;

function checkAddress(dto: Partial<AddressInput>) {
  if (dto.addressLine !== undefined && (dto.addressLine.trim().length < 3 || dto.addressLine.length > 240)) bad("addressLine must be longer than or equal to 3 characters");
  if (dto.city !== undefined && (dto.city.length < 2 || dto.city.length > 80)) bad("city must be longer than or equal to 2 characters");
  if (dto.latitude !== undefined && !DECIMAL.test(dto.latitude)) bad("latitude is not a valid decimal number.");
  if (dto.longitude !== undefined && !DECIMAL.test(dto.longitude)) bad("longitude is not a valid decimal number.");
}

export async function listAddresses(): Promise<Address[]> {
  await delay(150);
  const user = customer();
  return clone(db().addresses.filter((a) => a.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}

export async function getAddress(id: string): Promise<Address> {
  await delay(150);
  const user = customer();
  return clone(db().addresses.find((a) => a.id === id && a.userId === user.id) ?? notFound("Address not found"));
}

export async function createAddress(dto: AddressInput): Promise<Address> {
  await delay();
  const user = customer();
  checkAddress(dto);
  const a: Address = { id: uid("addr"), userId: user.id, label: dto.label ?? null, addressLine: dto.addressLine.trim(), city: dto.city, latitude: dto.latitude, longitude: dto.longitude, createdAt: nowIso(), updatedAt: nowIso() };
  db().addresses.push(a);
  persist();
  return clone(a);
}

export async function updateAddress(id: string, dto: AddressInput): Promise<Address> {
  await delay();
  const user = customer();
  const a = db().addresses.find((x) => x.id === id && x.userId === user.id) ?? notFound("Address not found");
  checkAddress(dto);
  Object.assign(a, { label: dto.label ?? a.label, addressLine: dto.addressLine.trim(), city: dto.city, latitude: dto.latitude, longitude: dto.longitude, updatedAt: nowIso() });
  persist();
  return clone(a);
}

export async function deleteAddress(id: string) {
  await delay();
  const user = customer();
  const d = db();
  if (!d.addresses.some((x) => x.id === id && x.userId === user.id)) notFound("Address not found");
  if (d.bookings.some((b) => b.addressId === id)) notFound("Address is referenced by existing bookings and cannot be deleted");
  d.addresses = d.addresses.filter((x) => x.id !== id);
  persist();
  return { ok: true as const };
}

/* ---- Caregiver directory (public) ------------------------------------------ */

const toSearchItem = ({ id, specialty, ratePerVisit, experienceYears, bio, ratingAverage, ratingCount, serviceArea, user, photoUrl }: MockCaregiver): CaregiverSearchItem => ({
  id,
  specialty,
  ratePerVisit,
  experienceYears,
  bio,
  ratingAverage,
  ratingCount,
  serviceArea,
  user,
  photoUrl,
});

export async function searchCaregivers(q: PageQuery & { specialty?: Specialty; city?: string }): Promise<Paginated<CaregiverSearchItem>> {
  await delay();
  const rows = db()
    .caregivers.filter((c) => (!q.specialty || c.specialty === q.specialty) && (!q.city || c.serviceArea.cities.includes(q.city)))
    .sort((a, b) => Number(b.ratingAverage) - Number(a.ratingAverage))
    .map(toSearchItem);
  return paginate(rows, q);
}

export async function getCaregiver(id: string): Promise<PublicCaregiver> {
  await delay(200);
  const c = db().caregivers.find((x) => x.id === id) ?? notFound("Caregiver not found");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- strip mock-only fields
  const { userId, commissionPct, ...pub } = c;
  return clone(pub);
}

/* ---- Bookings ---------------------------------------------------------------- */

/** Mock caregivers respond to new requests about a minute after they're sent. */
function simulate() {
  const d = db();
  let changed = false;
  for (const id of d.autoAccept) {
    const b = d.bookings.find((x) => x.id === id);
    if (!b || b.status !== "REQUESTED" || Date.now() - new Date(b.createdAt).getTime() < 60_000) continue;
    b.status = "CONFIRMED";
    b.updatedAt = nowIso();
    d.visits.filter((v) => v.bookingId === id && v.status === "REQUESTED").forEach((v) => (v.status = "CONFIRMED"));
    d.notifications.push(push(b.customerId, "booking.confirmed", { bookingId: b.id }));
    changed = true;
  }
  if (changed) {
    d.autoAccept = d.autoAccept.filter((id) => d.bookings.find((b) => b.id === id)?.status === "REQUESTED");
    persist();
  }
}

function push(userId: string, event: string, payload: Record<string, unknown>): AppNotification {
  return { id: uid("n"), userId, channel: "PUSH", event, payload, status: "SENT", sentAt: nowIso(), readAt: null, createdAt: nowIso() };
}

function detail(id: string): BookingDetail {
  const d = db();
  const b = d.bookings.find((x) => x.id === id)!;
  const p = d.patients.find((x) => x.id === b.patientId)!;
  const c = d.caregivers.find((x) => x.id === b.caregiverId)!;
  return clone({
    ...b,
    visits: d.visits.filter((v) => v.bookingId === id).sort((x, y) => x.scheduledDate.localeCompare(y.scheduledDate)),
    patient: { id: p.id, name: p.name, relationship: p.relationship },
    address: d.addresses.find((a) => a.id === b.addressId)!,
    caregiver: { id: c.id, specialty: c.specialty, userId: c.userId },
    prescriptions: d.prescriptions
      .filter((x) => x.bookingId === id)
      .sort((x, y) => y.createdAt.localeCompare(x.createdAt))
      .map(({ id: rid, mimeType, sizeBytes, createdAt, uploadedById }) => ({ id: rid, mimeType, sizeBytes, createdAt, uploadedById })),
  });
}

/** 1 = Monday … 7 = Sunday, matching the backend's expandOccurrences. */
function occurrences(start: string, end: string, type: "SINGLE" | "RECURRING", weekdays: number[]): string[] {
  if (type === "SINGLE") return [start];
  const out: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    const iso = cursor.getUTCDay() === 0 ? 7 : cursor.getUTCDay();
    if (weekdays.includes(iso)) out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export async function quotePromoPreview(code: string, caregiverId: string): Promise<{ code: string; discountAmount: number; perVisitAfterDiscount: number }> {
  await delay(150);
  const c = db().caregivers.find((x) => x.id === caregiverId) ?? notFound("Caregiver not available");
  const { promo, discountAmount } = quotePromo(code, c.ratePerVisit);
  return { code: promo.code, discountAmount, perVisitAfterDiscount: c.ratePerVisit - discountAmount };
}

export function quotePromo(code: string, baseAmount: number) {
  const promo = db().promos.find((p) => p.code === code.toUpperCase());
  if (!promo || !promo.active) bad("Promo code is not valid");
  const now = Date.now();
  if (now < new Date(promo!.validFrom).getTime() || now > new Date(promo!.validTo).getTime()) bad("Promo code is outside its validity window");
  if (promo!.maxUses !== null && promo!.usesCount >= promo!.maxUses) bad("Promo code has reached its usage limit");
  const raw = promo!.discountType === "PERCENT" ? Math.round((baseAmount * promo!.discountValue) / 100) : promo!.discountValue;
  return { promo: promo!, discountAmount: Math.max(0, Math.min(raw, baseAmount)) };
}

export async function createBooking(dto: CreateBookingInput): Promise<BookingDetail> {
  await delay(600);
  const user = customer();
  const d = db();
  const type = dto.type ?? "SINGLE";
  if (!TIME_RE.test(dto.timeWindowStart) || !TIME_RE.test(dto.timeWindowEnd)) bad("timeWindowStart must match /^([01]\\d|2[0-3]):[0-5]\\d$/ regular expression");
  if (dto.endDate < dto.startDate) bad("endDate must be on or after startDate");
  if (dto.timeWindowStart >= dto.timeWindowEnd) bad("timeWindowStart must be before timeWindowEnd");
  if (type === "RECURRING" && (!dto.weekdays || dto.weekdays.length === 0)) bad("weekdays are required for a recurring booking");
  const patient = d.patients.find((p) => p.id === dto.patientId && p.ownerUserId === user.id);
  if (!patient) notFound("Patient profile not found");
  if (!d.addresses.some((a) => a.id === dto.addressId && a.userId === user.id)) notFound("Address not found");
  const c = d.caregivers.find((x) => x.id === dto.caregiverId) ?? notFound("Caregiver not available");
  const dates = occurrences(dto.startDate, dto.endDate, type, dto.weekdays ?? []);
  if (dates.length === 0) bad("The recurrence rule produces no visits");

  let promoCodeId: string | null = null;
  let discountAmount = 0;
  if (dto.promoCode) {
    const quote = quotePromo(dto.promoCode, c.ratePerVisit);
    promoCodeId = quote.promo.id;
    discountAmount = quote.discountAmount;
    quote.promo.usesCount += 1;
  }

  const now = Date.now();
  const booking = {
    id: uid("bk"),
    customerId: user.id,
    patientId: dto.patientId,
    caregiverId: c.id,
    addressId: dto.addressId,
    type,
    recurrenceRule: type === "RECURRING" ? { weekdays: dto.weekdays ?? [], startDate: dto.startDate, endDate: dto.endDate } : null,
    startDate: `${dto.startDate}T00:00:00.000Z`,
    endDate: `${dto.endDate}T00:00:00.000Z`,
    timeWindowStart: dto.timeWindowStart,
    timeWindowEnd: dto.timeWindowEnd,
    serviceType: c.specialty,
    rateSnapshot: c.ratePerVisit,
    promoCodeId,
    discountAmount,
    status: "REQUESTED" as const,
    respondBy: new Date(now + 60 * 60_000).toISOString(),
    cancelledAt: null,
    cancelledById: null,
    cancelReason: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  d.bookings.push(booking);
  for (const date of dates) {
    d.visits.push({
      id: uid("vs"),
      bookingId: booking.id,
      scheduledDate: `${date}T00:00:00.000Z`,
      timeWindowStart: dto.timeWindowStart,
      timeWindowEnd: dto.timeWindowEnd,
      status: "REQUESTED",
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
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }
  d.autoAccept.push(booking.id);
  persist();
  return detail(booking.id);
}

export async function listBookings(q: PageQuery & { status?: CaregiverBookingStatus }): Promise<Paginated<CustomerBookingListItem>> {
  await delay();
  const user = customer();
  simulate();
  const d = db();
  const rows = d.bookings
    .filter((b) => b.customerId === user.id && (!q.status || b.status === q.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((b) => ({ ...b, visits: d.visits.filter((v) => v.bookingId === b.id).sort((x, y) => x.scheduledDate.localeCompare(y.scheduledDate)) }));
  return paginate(rows, q);
}

function myBooking(id: string) {
  const user = customer();
  return db().bookings.find((b) => b.id === id && b.customerId === user.id) ?? notFound("Booking not found");
}

export async function getBooking(id: string): Promise<BookingDetail> {
  await delay(200);
  simulate();
  myBooking(id);
  return detail(id);
}

export async function cancelBooking(id: string, reason?: string): Promise<BookingDetail> {
  await delay(450);
  const b = myBooking(id);
  if (b.status !== "REQUESTED" && b.status !== "CONFIRMED") bad("Only requested or confirmed bookings can be cancelled");
  b.status = "CANCELLED";
  b.cancelledAt = nowIso();
  b.cancelledById = b.customerId;
  b.cancelReason = reason ?? null;
  db().visits.filter((v) => v.bookingId === id && (v.status === "REQUESTED" || v.status === "CONFIRMED")).forEach((v) => (v.status = "CANCELLED"));
  persist();
  return detail(id);
}

export async function reschedule(bookingId: string, dto: RescheduleInput): Promise<Visit> {
  await delay(450);
  const b = myBooking(bookingId);
  if (b.status !== "REQUESTED" && b.status !== "CONFIRMED") bad("Cannot reschedule a closed booking");
  if (dto.timeWindowStart >= dto.timeWindowEnd) bad("timeWindowStart must be before timeWindowEnd");
  const d = db();
  const v = d.visits.find((x) => x.id === dto.visitId && x.bookingId === bookingId) ?? notFound("Visit not found");
  if (v.status !== "REQUESTED" && v.status !== "CONFIRMED") bad("Only requested or confirmed visits can be rescheduled");
  const replacement: Visit = {
    ...clone(v),
    id: uid("vs"),
    scheduledDate: `${dto.newDate}T00:00:00.000Z`,
    timeWindowStart: dto.timeWindowStart,
    timeWindowEnd: dto.timeWindowEnd,
    status: b.status === "CONFIRMED" ? "CONFIRMED" : "REQUESTED",
    rescheduledFromId: v.id,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  v.status = "CANCELLED";
  v.updatedAt = nowIso();
  d.visits.push(replacement);
  persist();
  return clone(replacement);
}

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export async function uploadPrescription(bookingId: string, file: File) {
  await delay(700);
  const b = myBooking(bookingId);
  if (b.status === "CANCELLED" || b.status === "DECLINED") bad("Cannot attach documents to a closed booking");
  if (file.size > 10 * 1024 * 1024) throw new ApiError(413, "File too large");
  if (!ALLOWED_MIME.includes(file.type)) bad("Only JPEG, PNG, WEBP or PDF files are allowed");
  const doc = { id: uid("rx"), bookingId, uploadedById: b.customerId, fileKey: `rx/${file.name}`, mimeType: file.type, sizeBytes: file.size, createdAt: nowIso() };
  db().prescriptions.push(doc);
  persist();
  return { id: doc.id, bookingId, mimeType: doc.mimeType, sizeBytes: doc.sizeBytes, createdAt: doc.createdAt };
}

export async function prescriptionUrl(bookingId: string, documentId: string) {
  await delay(200);
  const b = myBooking(bookingId);
  const rx = db().prescriptions.find((x) => x.id === documentId && x.bookingId === b.id) ?? notFound("Prescription not found");
  const patient = db().patients.find((p) => p.id === b.patientId)!;
  const lines = [`Patient: ${patient.name}`, `Uploaded: ${rx.createdAt.slice(0, 10)}`, "Rx as advised by the treating doctor."];
  const body = lines.map((l, i) => `<text x="70" y="${250 + i * 46}">${l}</text>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="850" height="1100" viewBox="0 0 850 1100"><rect width="850" height="1100" fill="#fbfcfc"/><rect x="40" y="40" width="770" height="1020" fill="none" stroke="#167267" stroke-width="3"/><rect x="40" y="40" width="770" height="120" fill="#edf8f6"/><text x="425" y="105" font-family="sans-serif" font-size="30" font-weight="700" fill="#135c54" text-anchor="middle">PRESCRIPTION</text><g font-family="sans-serif" font-size="22" fill="#242c2a">${body}</g></svg>`;
  return { url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, mimeType: "image/svg+xml" };
}

/* ---- Visits ------------------------------------------------------------------ */

function myVisit(id: string): Visit {
  const user = customer();
  const d = db();
  const v = d.visits.find((x) => x.id === id);
  if (!v || d.bookings.find((b) => b.id === v.bookingId)?.customerId !== user.id) notFound("Visit not found");
  return v!;
}

export async function getVisit(id: string): Promise<CustomerVisitDetail> {
  await delay(200);
  simulate();
  const v = myVisit(id);
  const d = db();
  const b = d.bookings.find((x) => x.id === v.bookingId)!;
  const user = d.users.find((u) => u.id === b.customerId)!;
  return clone({
    ...v,
    booking: {
      ...b,
      patient: d.patients.find((p) => p.id === b.patientId)!,
      address: d.addresses.find((a) => a.id === b.addressId)!,
      prescriptions: d.prescriptions.filter((x) => x.bookingId === b.id),
      customer: { id: user.id, phone: user.phone, fullName: user.fullName },
    },
    statusHistory: d.history.filter((h) => h.visitId === id).sort((a, b2) => a.at.localeCompare(b2.at)),
    note: d.notes.find((n) => n.visitId === id) ?? null,
    review: d.reviews.find((r) => r.visitId === id) ?? null,
  });
}

export async function review(visitId: string, dto: ReviewInput): Promise<Review> {
  await delay(400);
  const user = customer();
  const v = myVisit(visitId);
  if (v.status !== "COMPLETED") bad("Only completed visits can be reviewed");
  const d = db();
  if (d.reviews.some((r) => r.visitId === visitId)) bad("This visit has already been reviewed");
  if (!Number.isInteger(dto.rating) || dto.rating < 1 || dto.rating > 5) bad("rating must not be greater than 5");
  const b = d.bookings.find((x) => x.id === v.bookingId)!;
  const r: Review = { id: uid("rev"), visitId, customerId: user.id, caregiverId: b.caregiverId, rating: dto.rating, comment: dto.comment ?? null, createdAt: nowIso(), updatedAt: nowIso() };
  d.reviews.push(r);
  const c = d.caregivers.find((x) => x.id === b.caregiverId)!;
  const total = Number(c.ratingAverage) * c.ratingCount + dto.rating;
  c.ratingCount += 1;
  c.ratingAverage = (total / c.ratingCount).toFixed(2);
  persist();
  return clone(r);
}

export async function reportIncident(visitId: string, dto: { description: string; priority?: IncidentPriority }): Promise<SafetyIncidentRow> {
  await delay(400);
  const user = customer();
  myVisit(visitId);
  if (dto.description.trim().length < 3) bad("description must be longer than or equal to 3 characters");
  const inc: SafetyIncidentRow = { id: uid("inc"), visitId, reportedById: user.id, source: "CUSTOMER_COMPLAINT", description: dto.description, priority: dto.priority ?? "MEDIUM", status: "OPEN", assignedAdminId: null, resolvedAt: null, createdAt: nowIso(), updatedAt: nowIso() };
  db().incidents.push(inc);
  persist();
  return clone(inc);
}

export async function sos(dto: { visitId: string; note?: string }): Promise<SosResult> {
  await delay(400);
  const user = customer();
  const v = myVisit(dto.visitId);
  if (["COMPLETED", "CANCELLED", "DECLINED"].includes(v.status)) bad("SOS can only be raised during an active visit");
  const inc: SafetyIncidentRow = { id: uid("inc"), visitId: v.id, reportedById: user.id, source: "SOS", description: dto.note || "SOS raised during visit", priority: "CRITICAL", status: "OPEN", assignedAdminId: null, resolvedAt: null, createdAt: nowIso(), updatedAt: nowIso() };
  db().incidents.push(inc);
  persist();
  return { incident: clone(inc), notifiedAdmins: 2, notifiedContacts: db().contacts.filter((c) => c.userId === user.id).length };
}

/* ---- Payments ------------------------------------------------------------------ */

export async function initiatePayment(dto: { visitId: string; method: PaymentMethod }): Promise<CustomerPayment> {
  await delay(700);
  const v = myVisit(dto.visitId);
  const d = db();
  const b = d.bookings.find((x) => x.id === v.bookingId)!;
  if (b.status !== "CONFIRMED") bad("The booking must be confirmed before paying");
  if (v.status === "CANCELLED" || v.status === "DECLINED") bad("This visit is no longer payable");
  const existing = d.payments.find((p) => p.visitId === v.id && (p.status === "PENDING" || p.status === "PAID"));
  if (existing) bad(existing.status === "PAID" ? "This visit has already been paid" : "A payment for this visit is already in progress");
  const amount = b.rateSnapshot - b.discountAmount;
  if (amount <= 0) bad("Payment amount must be positive");
  const pct = d.caregivers.find((c) => c.id === b.caregiverId)!.commissionPct;
  const commissionAmount = Math.round((amount * pct) / 100);
  const id = uid("pay");
  // Like the backend: every method starts PENDING. Cash waits for the caregiver to
  // confirm receipt; card/wallets get a placeholder gateway ref and only settle via
  // the (not yet integrated) gateway webhook.
  const payment: CustomerPayment = {
    id,
    visitId: v.id,
    method: dto.method,
    status: "PENDING",
    amount,
    commissionAmount,
    caregiverAmount: amount - commissionAmount,
    gatewayRef: dto.method === "CASH" ? null : `gw_${id}`,
    paidAt: null,
    payoutRequestId: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  d.payments.push(payment);
  persist();
  return clone(payment);
}

function myPayments(): CustomerPaymentWithVisit[] {
  const user = customer();
  const d = db();
  return d.payments
    .map((p): CustomerPaymentWithVisit | null => {
      const v = d.visits.find((x) => x.id === p.visitId)!;
      const b = d.bookings.find((x) => x.id === v.bookingId)!;
      if (b.customerId !== user.id) return null;
      const pat = d.patients.find((x) => x.id === b.patientId)!;
      return {
        ...p,
        payoutRequest: p.payoutRequestId ? { id: p.payoutRequestId, status: "REQUESTED" } : null,
        visit: { ...v, booking: { ...b, patient: { id: pat.id, name: pat.name }, customer: { id: user.id, phone: user.phone, fullName: user.fullName } } },
      };
    })
    .filter((x): x is CustomerPaymentWithVisit => x !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listPayments(q: PageQuery & { status?: PaymentStatus }): Promise<Paginated<CustomerPaymentWithVisit>> {
  await delay();
  return paginate(
    myPayments().filter((p) => !q.status || p.status === q.status),
    q,
  );
}

export async function getPayment(id: string): Promise<CustomerPaymentWithVisit> {
  await delay(150);
  return clone(myPayments().find((p) => p.id === id) ?? notFound("Payment not found"));
}

export async function cancelPayment(id: string): Promise<CustomerPayment> {
  await delay(200);
  const d = db();
  const p = d.payments.find((x) => x.id === id) ?? notFound("Payment not found");
  if (p.status !== "PENDING") bad(`Only a pending payment can be cancelled (this one is ${p.status})`);
  p.status = "FAILED";
  p.updatedAt = nowIso();
  persist();
  return clone(p);
}

/* ---- Disputes & notifications ---------------------------------------------------- */

export async function listDisputes(): Promise<DisputeRow[]> {
  await delay(200);
  const user = currentUser();
  return clone(db().disputes.filter((x) => x.raisedById === user.id || x.againstUserId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}

export async function raiseDispute(dto: { visitId: string; description: string }): Promise<DisputeRow> {
  await delay(400);
  const user = currentUser();
  if (dto.description.trim().length < 5) bad("description must be longer than or equal to 5 characters");
  const v = myVisit(dto.visitId);
  const d = db();
  if (d.disputes.some((x) => x.visitId === v.id && x.raisedById === user.id && x.status === "OPEN")) bad("You already have an open dispute for this visit");
  const b = d.bookings.find((x) => x.id === v.bookingId)!;
  const c = d.caregivers.find((x) => x.id === b.caregiverId)!;
  const dispute: DisputeRow = { id: uid("dsp"), visitId: v.id, raisedById: user.id, againstUserId: c.userId, description: dto.description, status: "OPEN", resolutionNote: null, resolvedById: null, resolvedAt: null, createdAt: nowIso(), updatedAt: nowIso() };
  d.disputes.push(dispute);
  persist();
  return clone(dispute);
}

export async function listNotifications(q: PageQuery): Promise<Paginated<AppNotification>> {
  await delay(200);
  simulate();
  const user = currentUser();
  return paginate(db().notifications.filter((n) => n.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), q);
}

export async function markNotifsRead(dto: { ids?: string[]; before?: string }): Promise<{ updated: number }> {
  await delay(100);
  const user = currentUser();
  const now = nowIso();
  let updated = 0;
  for (const n of db().notifications) {
    if (n.userId !== user.id || n.readAt) continue;
    if (dto.ids && !dto.ids.includes(n.id)) continue;
    if (dto.before && n.createdAt > dto.before) continue;
    n.readAt = now;
    updated++;
  }
  persist();
  return { updated };
}
