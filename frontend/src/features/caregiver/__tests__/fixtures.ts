/** Shared fixtures for caregiver page/component tests. */
import type { Address, CaregiverBookingListItem, CaregiverVisitDetail, Visit } from "@shared/caregiver-types";
import { fakeJwt } from "@/test/utils";
import { session } from "../lib/api/session";

export const LOCALE_KEY = "caresaath.caregiver.locale";

export function signInCaregiver() {
  session.set({
    accessToken: fakeJwt({ sub: "user-fatima", role: "CAREGIVER", phone: "+923001110011", type: "access" }),
    refreshToken: "r",
    phone: "+923001110011",
  });
}

const T = "2026-10-20T05:00:00.000Z";

export const address: Address = {
  id: "addr-1",
  userId: "cust-1",
  label: "Home",
  addressLine: "House 12, Street 4, DHA Phase 5",
  city: "Lahore",
  latitude: "31.516280",
  longitude: "74.343470",
  createdAt: T,
  updatedAt: T,
};

export function visit(over: Partial<Visit> = {}): Visit {
  return {
    id: "v1",
    bookingId: "bk1",
    scheduledDate: "2026-10-22T00:00:00.000Z",
    timeWindowStart: "09:00",
    timeWindowEnd: "10:00",
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
    ...over,
  };
}

const bookingBase = {
  id: "bk1",
  customerId: "cust-1",
  patientId: "pat-1",
  caregiverId: "cg-1",
  addressId: "addr-1",
  type: "SINGLE" as const,
  recurrenceRule: null,
  startDate: "2026-10-23T00:00:00.000Z",
  endDate: "2026-10-23T00:00:00.000Z",
  timeWindowStart: "09:00",
  timeWindowEnd: "10:00",
  serviceType: "NURSING" as const,
  rateSnapshot: 2500_00,
  promoCodeId: null,
  discountAmount: 0,
  respondBy: "2026-10-22T12:00:00.000Z",
  cancelledAt: null,
  cancelledById: null,
  cancelReason: null,
  createdAt: T,
  updatedAt: T,
};

export function requestItem(over: Partial<CaregiverBookingListItem> = {}): CaregiverBookingListItem {
  return {
    ...bookingBase,
    status: "REQUESTED",
    patient: { id: "pat-1", name: "Rashida Begum", relationship: "FAMILY_MEMBER" },
    address,
    visits: [visit({ status: "REQUESTED", scheduledDate: "2026-10-23T00:00:00.000Z" })],
    ...over,
  };
}

export function visitDetail(over: Partial<CaregiverVisitDetail> = {}): CaregiverVisitDetail {
  return {
    ...visit(),
    booking: {
      ...bookingBase,
      status: "CONFIRMED",
      patient: {
        id: "pat-1",
        ownerUserId: "cust-1",
        name: "Rashida Begum",
        relationship: "FAMILY_MEMBER",
        dateOfBirth: "1950-01-01",
        gender: "FEMALE",
        medicalContext: "Type 2 diabetes, insulin twice daily.",
        createdAt: T,
        updatedAt: T,
      },
      address,
      prescriptions: [],
      customer: { id: "cust-1", phone: "+923211234567", fullName: "Ahmed Raza" },
    },
    statusHistory: [],
    note: null,
    review: null,
    ...over,
  };
}
