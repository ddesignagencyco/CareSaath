import { beforeEach, describe, expect, it } from "vitest";
import { apiPath, fakeJwt, json, mockFetch } from "@/test/utils";
import {
  authApi,
  availabilityApi,
  bookingsApi,
  disputesApi,
  meApi,
  moneyApi,
  notificationsApi,
  paymentsApi,
  profileApi,
  safetyApi,
  visitsApi,
} from "./caregiver";
import { session } from "./session";

const ACCESS = fakeJwt({ sub: "user-1", role: "CAREGIVER", phone: "+923001110011", type: "access" });

beforeEach(() => {
  session.set({ accessToken: ACCESS, refreshToken: "r", phone: "+923001110011" });
});

type Row = [name: string, call: () => Promise<unknown>, method: string, path: string, body: unknown, query?: Record<string, string>];

const rows: Row[] = [
  ["authApi.requestOtp", () => authApi.requestOtp("+923001110011"), "POST", "/auth/otp/request", { phone: "+923001110011" }],
  ["authApi.verifyOtp", () => authApi.verifyOtp("+923001110011", "123456"), "POST", "/auth/otp/verify", { phone: "+923001110011", code: "123456" }],
  ["authApi.refresh", () => authApi.refresh("R1"), "POST", "/auth/refresh", { refreshToken: "R1" }],
  ["authApi.logout", () => authApi.logout("R1"), "POST", "/auth/logout", { refreshToken: "R1" }],
  ["meApi.get", () => meApi.get(), "GET", "/customer/me", undefined],
  ["meApi.update", () => meApi.update({ fullName: "Fatima Noor", preferredLanguage: "UR" }), "PATCH", "/customer/me", { fullName: "Fatima Noor", preferredLanguage: "UR" }],
  [
    "profileApi.register",
    () =>
      profileApi.register({
        cnic: "35201-1234567-1",
        licenseNumber: "PNC-123",
        licenseBody: "PNC",
        specialty: "NURSING",
        experienceYears: 5,
        bio: "Registered nurse",
        serviceCities: ["Lahore"],
        ratePerVisit: 2500_00,
      }),
    "POST",
    "/caregiver/register",
    {
      cnic: "35201-1234567-1",
      licenseNumber: "PNC-123",
      licenseBody: "PNC",
      specialty: "NURSING",
      experienceYears: 5,
      bio: "Registered nurse",
      serviceCities: ["Lahore"],
      ratePerVisit: 250000,
    },
  ],
  ["profileApi.get", () => profileApi.get(), "GET", "/caregiver/profile", undefined],
  ["profileApi.update", () => profileApi.update({ ratePerVisit: 3000_00, serviceCities: ["Lahore", "Karachi"] }), "PATCH", "/caregiver/profile", { ratePerVisit: 300000, serviceCities: ["Lahore", "Karachi"] }],
  ["profileApi.documentUrl", () => profileApi.documentUrl("d1"), "GET", "/caregiver/documents/d1/url", undefined],
  ["profileApi.photoUrl", () => profileApi.photoUrl(), "GET", "/caregiver/photo/url", undefined],
  ["availabilityApi.get", () => availabilityApi.get(), "GET", "/caregiver/availability", undefined],
  [
    "availabilityApi.put",
    () => availabilityApi.put([{ dayOfWeek: 0, startTime: "09:00", endTime: "13:00" }, { dayOfWeek: 6, startTime: "14:30", endTime: "18:00" }]),
    "PUT",
    "/caregiver/availability",
    { rules: [{ dayOfWeek: 0, startTime: "09:00", endTime: "13:00" }, { dayOfWeek: 6, startTime: "14:30", endTime: "18:00" }] },
  ],
  ["availabilityApi.addBlock", () => availabilityApi.addBlock({ startDate: "2026-11-01", endDate: "2026-11-03", reason: "Wedding" }), "POST", "/caregiver/availability/blocks", { startDate: "2026-11-01", endDate: "2026-11-03", reason: "Wedding" }],
  ["availabilityApi.deleteBlock", () => availabilityApi.deleteBlock("blk-1"), "DELETE", "/caregiver/availability/blocks/blk-1", undefined],
  ["bookingsApi.list", () => bookingsApi.list({ status: "REQUESTED", page: 2, limit: 50 }), "GET", "/caregiver/bookings", undefined, { status: "REQUESTED", page: "2", limit: "50" }],
  ["bookingsApi.accept", () => bookingsApi.accept("bk1"), "POST", "/caregiver/bookings/bk1/accept", {}],
  ["bookingsApi.decline (reason)", () => bookingsApi.decline("bk1", "Too far"), "POST", "/caregiver/bookings/bk1/decline", { reason: "Too far" }],
  ["bookingsApi.decline (no reason)", () => bookingsApi.decline("bk1"), "POST", "/caregiver/bookings/bk1/decline", {}],
  ["bookingsApi.prescriptionUrl", () => bookingsApi.prescriptionUrl("bk1", "rx1"), "GET", "/caregiver/bookings/bk1/prescriptions/rx1", undefined],
  ["visitsApi.list", () => visitsApi.list({ status: "CONFIRMED", date: "2026-10-22", page: 1, limit: 20 }), "GET", "/caregiver/visits", undefined, { status: "CONFIRMED", date: "2026-10-22", page: "1", limit: "20" }],
  ["visitsApi.get", () => visitsApi.get("v1"), "GET", "/caregiver/visits/v1", undefined],
  ["visitsApi.enRoute", () => visitsApi.enRoute("v1"), "POST", "/caregiver/visits/v1/en-route", {}],
  ["visitsApi.checkInOtp", () => visitsApi.checkInOtp("v1"), "POST", "/caregiver/visits/v1/check-in-otp", {}],
  ["visitsApi.checkIn (GPS)", () => visitsApi.checkIn("v1", { method: "GPS", lat: 31.5163, lng: 74.3435 }), "POST", "/caregiver/visits/v1/check-in", { method: "GPS", lat: 31.5163, lng: 74.3435 }],
  ["visitsApi.checkIn (OTP)", () => visitsApi.checkIn("v1", { method: "OTP", code: "123456" }), "POST", "/caregiver/visits/v1/check-in", { method: "OTP", code: "123456" }],
  ["visitsApi.checkOut", () => visitsApi.checkOut("v1", { method: "GPS", lat: 31.5, lng: 74.3 }), "POST", "/caregiver/visits/v1/check-out", { method: "GPS", lat: 31.5, lng: 74.3 }],
  ["visitsApi.note", () => visitsApi.note("v1", "BP 130/85"), "POST", "/caregiver/visits/v1/note", { summary: "BP 130/85" }],
  ["paymentsApi.confirmCash", () => paymentsApi.confirmCash("pay1"), "POST", "/caregiver/payments/pay1/confirm-cash", {}],
  ["moneyApi.earnings", () => moneyApi.earnings(), "GET", "/caregiver/earnings", undefined],
  ["moneyApi.payouts", () => moneyApi.payouts({ status: "PAID", limit: 20 }), "GET", "/caregiver/payouts", undefined, { status: "PAID", limit: "20" }],
  ["moneyApi.requestPayout", () => moneyApi.requestPayout({ payoutAccountId: "pa1", amount: 5000_00 }), "POST", "/caregiver/payouts", { payoutAccountId: "pa1", amount: 500000 }],
  ["moneyApi.accounts", () => moneyApi.accounts(), "GET", "/caregiver/payout-accounts", undefined],
  [
    "moneyApi.createAccount",
    () => moneyApi.createAccount({ type: "MOBILE_WALLET", provider: "JazzCash", accountTitle: "Fatima", accountNumber: "03001110011" }),
    "POST",
    "/caregiver/payout-accounts",
    { type: "MOBILE_WALLET", provider: "JazzCash", accountTitle: "Fatima", accountNumber: "03001110011" },
  ],
  ["moneyApi.updateAccount", () => moneyApi.updateAccount("pa1", { accountTitle: "F. Noor" }), "PATCH", "/caregiver/payout-accounts/pa1", { accountTitle: "F. Noor" }],
  ["moneyApi.deleteAccount", () => moneyApi.deleteAccount("pa1"), "DELETE", "/caregiver/payout-accounts/pa1", undefined],
  ["safetyApi.list", () => safetyApi.list(), "GET", "/caregiver/safety-reports", undefined],
  ["safetyApi.report", () => safetyApi.report({ visitId: "v1", description: "Aggressive dog", priority: "HIGH" }), "POST", "/caregiver/safety-reports", { visitId: "v1", description: "Aggressive dog", priority: "HIGH" }],
  ["safetyApi.sos (with coords)", () => safetyApi.sos({ visitId: "v1", note: "Help", latitude: "31.516280", longitude: "74.343470" }), "POST", "/sos", { visitId: "v1", note: "Help", latitude: "31.516280", longitude: "74.343470" }],
  ["safetyApi.sos (no coords)", () => safetyApi.sos({ visitId: "v1" }), "POST", "/sos", { visitId: "v1" }],
  ["disputesApi.list", () => disputesApi.list(), "GET", "/disputes", undefined],
  ["disputesApi.raise", () => disputesApi.raise({ visitId: "v1", description: "Family refused to pay" }), "POST", "/disputes", { visitId: "v1", description: "Family refused to pay" }],
  ["notificationsApi.list", () => notificationsApi.list({ page: 1, limit: 30 }), "GET", "/notifications", undefined, { page: "1", limit: "30" }],
];

describe("caregiver API contract (real mode)", () => {
  it.each(rows)("%s", async (_name, call, method, path, body, query = {}) => {
    const f = mockFetch(() => json({}));
    await call();
    expect(f.calls).toHaveLength(1);
    const c = f.last();
    expect(c.method).toBe(method);
    expect(c.url.origin).toBe("http://api.test");
    expect(apiPath(c)).toBe(path);
    // Exactly these fields (forbidNonWhitelisted): toEqual fails on extras.
    expect(c.body).toEqual(body);
    expect(Object.fromEntries(c.url.searchParams)).toEqual(query);
  });

  it("sends the caregiver bearer token on authenticated routes, none on /auth/otp/*", async () => {
    const f = mockFetch(() => json({}));
    await visitsApi.get("v1");
    expect(f.last().headers.Authorization).toBe(`Bearer ${ACCESS}`);
    session.clear();
    await authApi.requestOtp("+923001110011");
    expect(f.last().headers.Authorization).toBeUndefined();
  });

  it("sends latitude/longitude as strings for SOS and numbers for GPS check-in", async () => {
    const f = mockFetch(() => json({}));
    await safetyApi.sos({ visitId: "v1", latitude: "31.5", longitude: "74.3" });
    const sos = f.last().body as Record<string, unknown>;
    expect(typeof sos.latitude).toBe("string");
    expect(typeof sos.longitude).toBe("string");
    await visitsApi.checkIn("v1", { method: "GPS", lat: 31.5, lng: 74.3 });
    const gps = f.last().body as Record<string, unknown>;
    expect(typeof gps.lat).toBe("number");
    expect(typeof gps.lng).toBe("number");
  });

  it("uploads a document as multipart with `file` and `type`", async () => {
    const f = mockFetch(() => json({ id: "d1" }, 201));
    const file = new File(["%PDF"], "license.pdf", { type: "application/pdf" });
    await profileApi.uploadDocument(file, "LICENSE");
    const c = f.last();
    expect(c.method).toBe("POST");
    expect(apiPath(c)).toBe("/caregiver/documents");
    expect(c.headers["Content-Type"]).toBeUndefined();
    const form = c.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect((form.get("file") as File).name).toBe("license.pdf");
    expect(form.get("type")).toBe("LICENSE");
    expect([...form.keys()].sort()).toEqual(["file", "type"]);
  });

  it("uploads the photo as multipart with only `file`", async () => {
    const f = mockFetch(() => json({ photoKey: "k" }, 201));
    await profileApi.uploadPhoto(new File(["x"], "me.jpg", { type: "image/jpeg" }));
    const c = f.last();
    expect(apiPath(c)).toBe("/caregiver/photo");
    expect([...(c.body as FormData).keys()]).toEqual(["file"]);
  });

  it("refreshes an expired access token once and retries", async () => {
    const A2 = fakeJwt({ sub: "user-1", role: "CAREGIVER", type: "access" });
    const f = mockFetch((c) => {
      if (apiPath(c) === "/auth/refresh") return json({ accessToken: A2, refreshToken: "r2" });
      return c.headers.Authorization === `Bearer ${A2}` ? json({ items: [], page: 1, limit: 20, total: 0 }) : json({ statusCode: 401, message: "Invalid or expired access token" }, 401);
    });
    await expect(bookingsApi.list({})).resolves.toMatchObject({ total: 0 });
    expect(f.calls.map((c) => `${c.method} ${apiPath(c)}`)).toEqual(["GET /caregiver/bookings", "POST /auth/refresh", "GET /caregiver/bookings"]);
    expect(f.calls[1].body).toEqual({ refreshToken: "r" });
    expect(session.get()).toMatchObject({ accessToken: A2, refreshToken: "r2" });
  });

  it("surfaces the backend message on errors", async () => {
    mockFetch(() => json({ statusCode: 400, message: "Only requested bookings can be accepted" }, 400));
    await expect(bookingsApi.accept("bk1")).rejects.toMatchObject({ status: 400, message: "Only requested bookings can be accepted" });
  });
});
