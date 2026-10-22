import { beforeEach, describe, expect, it } from "vitest";
import { apiPath, fakeJwt, json, mockFetch } from "@/test/utils";
import {
  addressesApi,
  authApi,
  bookingsApi,
  caregiversApi,
  contactsApi,
  disputesApi,
  meApi,
  notificationsApi,
  patientsApi,
  paymentsApi,
  visitsApi,
} from "./customer";
import { session } from "./session";

const TOKEN = fakeJwt({ sub: "cust-1", role: "CUSTOMER", phone: "+923211234567", type: "access" });

beforeEach(() => {
  session.set({ accessToken: TOKEN, refreshToken: "r", phone: "+923211234567" });
});

const address = { label: "Home", addressLine: "House 42, Gulberg III", city: "Lahore", latitude: "31.516300", longitude: "74.343500" };
const single = {
  patientId: "p1",
  caregiverId: "cg1",
  addressId: "a1",
  type: "SINGLE" as const,
  startDate: "2026-11-02",
  endDate: "2026-11-02",
  timeWindowStart: "10:00",
  timeWindowEnd: "11:00",
};
const recurring = { ...single, type: "RECURRING" as const, endDate: "2026-11-30", weekdays: [1, 3, 5], promoCode: "WELCOME10" };

type Row = [name: string, call: () => Promise<unknown>, method: string, path: string, body: unknown, query?: Record<string, string>];

const rows: Row[] = [
  ["auth.requestOtp", () => authApi.requestOtp("+923211234567"), "POST", "/auth/otp/request", { phone: "+923211234567" }],
  ["auth.verifyOtp", () => authApi.verifyOtp("+923211234567", "123456"), "POST", "/auth/otp/verify", { phone: "+923211234567", code: "123456" }],
  ["auth.logout", () => authApi.logout("r1"), "POST", "/auth/logout", { refreshToken: "r1" }],
  ["me.get", () => meApi.get(), "GET", "/customer/me", undefined],
  ["me.update", () => meApi.update({ fullName: "Ahmed Raza", preferredLanguage: "UR" }), "PATCH", "/customer/me", { fullName: "Ahmed Raza", preferredLanguage: "UR" }],
  ["contacts.list", () => contactsApi.list(), "GET", "/customer/emergency-contacts", undefined],
  ["contacts.add", () => contactsApi.add({ name: "Sana", phone: "+923331234567" }), "POST", "/customer/emergency-contacts", { name: "Sana", phone: "+923331234567" }],
  ["contacts.remove", () => contactsApi.remove("ec1"), "DELETE", "/customer/emergency-contacts/ec1", undefined],
  ["patients.list", () => patientsApi.list(), "GET", "/customer/patients", undefined],
  ["patients.get", () => patientsApi.get("p1"), "GET", "/customer/patients/p1", undefined],
  [
    "patients.create",
    () => patientsApi.create({ name: "Rashida", relationship: "FAMILY_MEMBER", dateOfBirth: "1950-01-01", gender: "Female", medicalContext: "Diabetes" }),
    "POST",
    "/customer/patients",
    { name: "Rashida", relationship: "FAMILY_MEMBER", dateOfBirth: "1950-01-01", gender: "Female", medicalContext: "Diabetes" },
  ],
  ["patients.update", () => patientsApi.update("p1", { name: "Rashida B" }), "PATCH", "/customer/patients/p1", { name: "Rashida B" }],
  ["patients.remove", () => patientsApi.remove("p1"), "DELETE", "/customer/patients/p1", undefined],
  ["addresses.list", () => addressesApi.list(), "GET", "/customer/addresses", undefined],
  ["addresses.get", () => addressesApi.get("a1"), "GET", "/customer/addresses/a1", undefined],
  ["addresses.create", () => addressesApi.create(address), "POST", "/customer/addresses", address],
  ["addresses.update", () => addressesApi.update("a1", address), "PATCH", "/customer/addresses/a1", address],
  ["addresses.remove", () => addressesApi.remove("a1"), "DELETE", "/customer/addresses/a1", undefined],
  [
    "caregivers.search",
    () => caregiversApi.search({ specialty: "NURSING", city: "Lahore", page: 2, limit: 12 }),
    "GET",
    "/caregivers",
    undefined,
    { specialty: "NURSING", city: "Lahore", page: "2", limit: "12" },
  ],
  ["caregivers.get", () => caregiversApi.get("cg1"), "GET", "/caregivers/cg1", undefined],
  ["bookings.list", () => bookingsApi.list({ status: "CONFIRMED", page: 1, limit: 10 }), "GET", "/customer/bookings", undefined, { status: "CONFIRMED", page: "1", limit: "10" }],
  ["bookings.create (single)", () => bookingsApi.create(single), "POST", "/customer/bookings", single],
  ["bookings.create (recurring)", () => bookingsApi.create(recurring), "POST", "/customer/bookings", recurring],
  ["bookings.get", () => bookingsApi.get("b1"), "GET", "/customer/bookings/b1", undefined],
  ["bookings.cancel with reason", () => bookingsApi.cancel("b1", "Feeling better"), "PATCH", "/customer/bookings/b1/cancel", { reason: "Feeling better" }],
  ["bookings.cancel without reason", () => bookingsApi.cancel("b1"), "PATCH", "/customer/bookings/b1/cancel", {}],
  [
    "bookings.reschedule",
    () => bookingsApi.reschedule("b1", { visitId: "v1", newDate: "2026-11-05", timeWindowStart: "09:00", timeWindowEnd: "10:00" }),
    "PATCH",
    "/customer/bookings/b1/reschedule",
    { visitId: "v1", newDate: "2026-11-05", timeWindowStart: "09:00", timeWindowEnd: "10:00" },
  ],
  ["bookings.prescriptionUrl", () => bookingsApi.prescriptionUrl("b1", "d1"), "GET", "/customer/bookings/b1/prescriptions/d1", undefined],
  ["visits.get", () => visitsApi.get("v1"), "GET", "/customer/visits/v1", undefined],
  ["visits.review", () => visitsApi.review("v1", { rating: 5, comment: "Great" }), "POST", "/customer/visits/v1/review", { rating: 5, comment: "Great" }],
  ["visits.review (rating only)", () => visitsApi.review("v1", { rating: 4 }), "POST", "/customer/visits/v1/review", { rating: 4 }],
  [
    "visits.report",
    () => visitsApi.report("v1", { description: "Arrived late", priority: "HIGH" }),
    "POST",
    "/customer/visits/v1/safety-reports",
    { description: "Arrived late", priority: "HIGH" },
  ],
  ["visits.sos", () => visitsApi.sos({ visitId: "v1", note: "Help" }), "POST", "/sos", { visitId: "v1", note: "Help" }],
  ["payments.list", () => paymentsApi.list({ status: "PENDING", page: 1, limit: 15 }), "GET", "/customer/payments", undefined, { status: "PENDING", page: "1", limit: "15" }],
  ["payments.get", () => paymentsApi.get("pay1"), "GET", "/customer/payments/pay1", undefined],
  ["payments.initiate", () => paymentsApi.initiate({ visitId: "v1", method: "CASH" }), "POST", "/customer/payments", { visitId: "v1", method: "CASH" }],
  ["disputes.list", () => disputesApi.list(), "GET", "/disputes", undefined],
  ["disputes.raise", () => disputesApi.raise({ visitId: "v1", description: "Overcharged" }), "POST", "/disputes", { visitId: "v1", description: "Overcharged" }],
  ["notifications.list", () => notificationsApi.list({ page: 1, limit: 20 }), "GET", "/notifications", undefined, { page: "1", limit: "20" }],
];

describe("customer API contract (real mode)", () => {
  it.each(rows)("%s → %s %s", async (_name, call, method, path, body, query = {}) => {
    const f = mockFetch(() => json({}));
    await call();
    expect(f.calls).toHaveLength(1);
    const c = f.last();
    expect(c.method).toBe(method);
    expect(apiPath(c)).toBe(path);
    expect(c.url.origin).toBe("http://api.test");
    // Exact match: forbidNonWhitelisted turns any extra field into a 400.
    expect(c.body).toEqual(body);
    expect(Object.fromEntries(c.url.searchParams)).toEqual(query);
    expect(c.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("address coordinates go out as strings", async () => {
    const f = mockFetch(() => json({}));
    await addressesApi.create(address);
    const body = f.last().body as Record<string, unknown>;
    expect(typeof body.latitude).toBe("string");
    expect(typeof body.longitude).toBe("string");
  });

  it("recurring booking weekdays are integers 1–7", async () => {
    const f = mockFetch(() => json({}));
    await bookingsApi.create(recurring);
    const weekdays = (f.last().body as { weekdays: unknown[] }).weekdays;
    expect(weekdays.every((d) => Number.isInteger(d) && (d as number) >= 1 && (d as number) <= 7)).toBe(true);
  });

  it("payments.initiate never sends an amount", async () => {
    const f = mockFetch(() => json({ id: "pay1", status: "PENDING" }, 201));
    await paymentsApi.initiate({ visitId: "v1", method: "CASH" });
    expect(f.last().body).not.toHaveProperty("amount");
  });

  it("public caregiver search works signed out (no Authorization header)", async () => {
    session.clear();
    const f = mockFetch(() => json({ items: [], page: 1, limit: 12, total: 0 }));
    await caregiversApi.search({ city: "Lahore" });
    expect(f.last().headers.Authorization).toBeUndefined();
    expect(Object.fromEntries(f.last().url.searchParams)).toEqual({ city: "Lahore" });
  });

  it("uploads a prescription as multipart with a `file` field", async () => {
    const f = mockFetch(() => json({ id: "d1" }, 201));
    const file = new File(["%PDF"], "rx.pdf", { type: "application/pdf" });
    await bookingsApi.uploadPrescription("b1", file);
    const c = f.last();
    expect(c.method).toBe("POST");
    expect(apiPath(c)).toBe("/customer/bookings/b1/prescriptions");
    expect(c.body).toBeInstanceOf(FormData);
    expect(((c.body as FormData).get("file") as File).name).toBe("rx.pdf");
    expect(c.headers["Content-Type"]).toBeUndefined();
  });

  it("surfaces backend errors as ApiError with the Nest message", async () => {
    mockFetch(() => json({ statusCode: 400, message: "Promo code is not valid" }, 400));
    await expect(bookingsApi.create({ ...single, promoCode: "NOPE" })).rejects.toMatchObject({ status: 400, message: "Promo code is not valid" });
  });
});
