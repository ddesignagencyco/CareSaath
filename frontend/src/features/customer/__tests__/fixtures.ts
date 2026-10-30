/** Shared fixtures and a tiny fetch router for the customer component tests. */
import type { Address, Booking, PatientProfile } from "@shared/caregiver-types";
import type { CustomerPaymentWithVisit, CustomerVisitDetail, PublicCaregiver } from "@shared/customer-types";
import { formatMoney } from "@shared/lib/format";
import { apiPath, fakeJwt, json, type RecordedCall } from "@/test/utils";
import { session } from "../lib/api/session";

export const STORAGE_KEY = "caresaath.customer.locale";

/** formatMoney output as Testing Library sees it (NBSP collapsed to a space). */
export const money = (paisa: number) => formatMoney(paisa).replace(/\s+/g, " ");

export function signIn() {
  session.set({ accessToken: fakeJwt({ sub: "cust-1", role: "CUSTOMER", phone: "+923211234567", type: "access" }), refreshToken: "r", phone: "+923211234567" });
}

/** Respond by "METHOD /path" (path relative to the API base); unknown routes 404. */
export function router(routes: Record<string, unknown | ((c: RecordedCall) => Response)>) {
  return (c: RecordedCall) => {
    const r = routes[`${c.method} ${apiPath(c)}`];
    if (r === undefined) return json({ statusCode: 404, message: `No route ${c.method} ${apiPath(c)}` }, 404);
    if (typeof r === "function") return (r as (c: RecordedCall) => Response)(c);
    return r instanceof Response ? r.clone() : json(r);
  };
}

const T = "2026-10-01T10:00:00.000Z";

export const caregiver: PublicCaregiver = {
  id: "cg1",
  specialty: "NURSING",
  ratePerVisit: 250000,
  experienceYears: 8,
  bio: "Registered nurse.",
  ratingAverage: "4.8",
  ratingCount: 43,
  serviceArea: { cities: ["Lahore"] },
  user: { fullName: "Fatima Noor" },
  licenseNumber: "PNC-1",
  licenseBody: "PNC",
  photoUrl: null,
  createdAt: T,
  availabilityRules: [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, startTime: "08:00", endTime: "18:00" })),
};

export const patient: PatientProfile = {
  id: "p1",
  ownerUserId: "cust-1",
  name: "Rashida Begum",
  relationship: "FAMILY_MEMBER",
  dateOfBirth: "1950-03-01T00:00:00.000Z",
  gender: "Female",
  medicalContext: "Type 2 diabetes",
  createdAt: T,
  updatedAt: T,
};

export const address: Address = {
  id: "a1",
  userId: "cust-1",
  label: "Home",
  addressLine: "House 42, Gulberg III",
  city: "Lahore",
  latitude: "31.516300",
  longitude: "74.343500",
  createdAt: T,
  updatedAt: T,
};

export const booking: Booking = {
  id: "bk1",
  customerId: "cust-1",
  patientId: "p1",
  caregiverId: "cg1",
  addressId: "a1",
  type: "SINGLE",
  recurrenceRule: null,
  startDate: "2026-10-25T00:00:00.000Z",
  endDate: "2026-10-25T00:00:00.000Z",
  timeWindowStart: "10:00",
  timeWindowEnd: "11:00",
  serviceType: "NURSING",
  rateSnapshot: 250000,
  promoCodeId: null,
  discountAmount: 0,
  status: "CONFIRMED",
  respondBy: T,
  cancelledAt: null,
  cancelledById: null,
  cancelReason: null,
  createdAt: T,
  updatedAt: T,
};

export function visitDetail(over: Partial<CustomerVisitDetail> = {}): CustomerVisitDetail {
  return {
    id: "v1",
    bookingId: "bk1",
    scheduledDate: "2026-10-25T00:00:00.000Z",
    timeWindowStart: "10:00",
    timeWindowEnd: "11:00",
    status: "CONFIRMED",
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
    createdAt: T,
    updatedAt: T,
    booking: { ...booking, patient, address, prescriptions: [], customer: { id: "cust-1", phone: "+923211234567", fullName: "Ahmed Raza" } },
    statusHistory: [],
    note: null,
    review: null,
    ...over,
  };
}

export const payment: CustomerPaymentWithVisit = {
  id: "pay1",
  visitId: "v1",
  method: "CASH",
  status: "PENDING",
  amount: 250000,
  commissionAmount: 37500,
  caregiverAmount: 212500,
  gatewayRef: null,
  paidAt: null,
  payoutRequestId: null,
  createdAt: T,
  updatedAt: T,
  payoutRequest: null,
  visit: {
    ...visitDetail(),
    booking: { ...booking, patient: { id: "p1", name: "Rashida Begum" }, customer: { id: "cust-1", phone: "+923211234567", fullName: "Ahmed Raza" } },
  },
};
