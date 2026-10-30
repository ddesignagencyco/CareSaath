import { describe, expect, it } from "vitest";
import { apiPath, json, mockFetch } from "@/test/utils";
import {
  analyticsApi,
  authApi,
  CAN_DEACTIVATE_CAREGIVER,
  caregiversApi,
  commissionsApi,
  configApi,
  disputesApi,
  healthApi,
  payoutsApi,
  promosApi,
  safetyApi,
} from "./admin";
import { session } from "./session";

/* ---- Real mode (NEXT_PUBLIC_USE_MOCKS=false from vitest.config) ----------- */

type Case = [name: string, call: () => Promise<unknown>, method: string, path: string, body: unknown, query?: Record<string, string>];

const promo = {
  code: "WELCOME10",
  discountType: "PERCENT" as const,
  discountValue: 10,
  validFrom: "2026-10-01T00:00:00.000Z",
  validTo: "2026-12-31T18:59:59.000Z",
  maxUses: 100,
  active: true,
};

const cases: Case[] = [
  ["auth.requestOtp", () => authApi.requestOtp("+923000000000"), "POST", "/auth/otp/request", { phone: "+923000000000" }],
  ["auth.verifyOtp", () => authApi.verifyOtp("+923000000000", "123456"), "POST", "/auth/otp/verify", { phone: "+923000000000", code: "123456" }],
  ["auth.logout", () => authApi.logout("R1"), "POST", "/auth/logout", { refreshToken: "R1" }],
  ["caregivers.list", () => caregiversApi.list({ status: "PENDING", page: 2, limit: 10 }), "GET", "/admin/caregivers", undefined, { status: "PENDING", page: "2", limit: "10" }],
  ["caregivers.list (no status)", () => caregiversApi.list({ limit: 1 }), "GET", "/admin/caregivers", undefined, { limit: "1" }],
  ["caregivers.approve (with reason)", () => caregiversApi.approve("cg1", "Checked PNC"), "POST", "/admin/caregivers/cg1/approve", { reason: "Checked PNC" }],
  ["caregivers.approve (no reason)", () => caregiversApi.approve("cg1"), "POST", "/admin/caregivers/cg1/approve", {}],
  ["caregivers.reject", () => caregiversApi.reject("cg1", "Blurry licence"), "POST", "/admin/caregivers/cg1/reject", { reason: "Blurry licence" }],
  ["caregivers.reverify (days as string)", () => caregiversApi.reverify("cg1", 90), "POST", "/admin/caregivers/cg1/reverify", { reverifyInDays: "90" }],
  ["caregivers.reverify (default)", () => caregiversApi.reverify("cg1"), "POST", "/admin/caregivers/cg1/reverify", {}],
  ["caregivers.suspend", () => caregiversApi.suspend("cg1", "Complaint"), "POST", "/admin/caregivers/cg1/suspend", { reason: "Complaint" }],
  ["caregivers.reactivate", () => caregiversApi.reactivate("cg1"), "POST", "/admin/caregivers/cg1/reactivate", {}],
  ["caregivers.deactivate", () => caregiversApi.deactivate("cg1"), "POST", "/admin/caregivers/cg1/deactivate", {}],
  ["caregivers.deactivate (with reason)", () => caregiversApi.deactivate("cg1", "Repeated no-shows"), "POST", "/admin/caregivers/cg1/deactivate", { reason: "Repeated no-shows" }],
  ["caregivers.documentUrl", () => caregiversApi.documentUrl("cg1", "doc9"), "GET", "/admin/caregivers/cg1/documents/doc9/url", undefined, {}],
  ["analytics.overview", () => analyticsApi.overview("90d"), "GET", "/admin/analytics", undefined, { range: "90d" }],
  ["safety.list", () => safetyApi.list({ status: "OPEN", priority: "HIGH", page: 1, limit: 20 }), "GET", "/admin/safety-incidents", undefined, { status: "OPEN", priority: "HIGH", page: "1", limit: "20" }],
  ["safety.update", () => safetyApi.update("inc1", { status: "IN_REVIEW", note: "Called" }), "PATCH", "/admin/safety-incidents/inc1", { status: "IN_REVIEW", note: "Called" }],
  ["disputes.list", () => disputesApi.list({ status: "OPEN", page: 1, limit: 10 }), "GET", "/admin/disputes", undefined, { status: "OPEN", page: "1", limit: "10" }],
  ["disputes.resolve", () => disputesApi.resolve("d1", "Refunded"), "PATCH", "/admin/disputes/d1/resolve", { resolutionNote: "Refunded" }],
  ["payouts.list", () => payoutsApi.list({ status: "REQUESTED", page: 3, limit: 10 }), "GET", "/admin/payouts", undefined, { status: "REQUESTED", page: "3", limit: "10" }],
  ["payouts.approve", () => payoutsApi.approve("p1", { note: "ok" }), "POST", "/admin/payouts/p1/approve", { note: "ok" }],
  ["payouts.approve (no dto)", () => payoutsApi.approve("p1"), "POST", "/admin/payouts/p1/approve", {}],
  ["payouts.markPaid", () => payoutsApi.markPaid("p1", { note: "TRX-1" }), "POST", "/admin/payouts/p1/mark-paid", { note: "TRX-1" }],
  ["payouts.markTransferred", () => payoutsApi.markTransferred("p1", { note: "TRX-1" }), "POST", "/admin/payouts/p1/mark-transferred", { note: "TRX-1" }],
  ["payouts.reject", () => payoutsApi.reject("p1", { reason: "Wrong IBAN" }), "POST", "/admin/payouts/p1/reject", { reason: "Wrong IBAN" }],
  ["commissions.list", () => commissionsApi.list(), "GET", "/admin/commissions", undefined, {}],
  ["commissions.update", () => commissionsApi.update("NURSING", 17.5), "PUT", "/admin/commissions/NURSING", { percentage: 17.5 }],
  ["promos.list", () => promosApi.list(), "GET", "/admin/promos", undefined, {}],
  ["promos.create", () => promosApi.create(promo), "POST", "/admin/promos", promo],
  ["promos.update", () => promosApi.update("pr1", { active: false }), "PATCH", "/admin/promos/pr1", { active: false }],
  ["config.list", () => configApi.list(), "GET", "/admin/config", undefined, {}],
  ["config.set (key URL-encoded)", () => configApi.set("booking.respond window/x", 45), "PUT", "/admin/config/booking.respond%20window%2Fx", { value: 45 }],
];

describe("admin API contract (real mode)", () => {
  it.each(cases)("%s", async (_name, call, method, path, body, query) => {
    session.set({ accessToken: "A1", refreshToken: "R1", phone: "+923000000000" });
    const f = mockFetch(() => json({}));
    await call();
    expect(f.calls).toHaveLength(1);
    const c = f.last();
    expect(c.method).toBe(method);
    expect(c.url.origin).toBe("http://api.test");
    expect(apiPath(c)).toBe(path);
    // Exact body: forbidNonWhitelisted rejects any extra field.
    if (body === undefined) expect(c.body).toBeUndefined();
    else expect(c.body).toEqual(body);
    if (query) expect(Object.fromEntries(c.url.searchParams)).toEqual(query);
    if (!path.startsWith("/auth/")) expect(c.headers.Authorization).toBe("Bearer A1");
  });

  it("health.check calls GET /health without a token", async () => {
    session.set({ accessToken: "A1", refreshToken: "R1", phone: "+923000000000" });
    const f = mockFetch(() => json({ status: "ok", postgres: true, redis: false }));
    await expect(healthApi.check()).resolves.toEqual({ status: "ok", postgres: true, redis: false });
    expect(f.last().method).toBe("GET");
    expect(apiPath(f.last())).toBe("/health");
    expect(f.last().headers.Authorization).toBeUndefined();
  });

  it("exportCsv requests type+format=csv and rebuilds the filename", async () => {
    const f = mockFetch(() => new Response("id,amount\n1,600", { headers: { "Content-Type": "text/csv; charset=utf-8" } }));
    await expect(analyticsApi.exportCsv("payouts")).resolves.toEqual({ filename: "payouts-report.csv", csv: "id,amount\n1,600" });
    expect(apiPath(f.last())).toBe("/admin/reports/export");
    expect(Object.fromEntries(f.last().url.searchParams)).toEqual({ type: "payouts", format: "csv" });
  });

  it("exportCsv coerces an empty (JSON) body to an empty string", async () => {
    mockFetch(() => new Response("", { headers: { "Content-Type": "application/json" } }));
    await expect(analyticsApi.exportCsv("bookings")).resolves.toEqual({ filename: "bookings-report.csv", csv: "" });
  });

  it("deactivate is now available (FR-A3 route exposed)", () => {
    expect(CAN_DEACTIVATE_CAREGIVER).toBe(true);
  });

  it("surfaces the backend error message", async () => {
    mockFetch(() => json({ statusCode: 400, message: "A reason is required to reject a payout" }, 400));
    await expect(payoutsApi.reject("p1", {})).rejects.toMatchObject({ status: 400, message: "A reason is required to reject a payout" });
  });
});
