import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockFetch } from "@/test/utils";

/** USE_MOCKS is read at module load, so import the API fresh in mock mode. */
async function load() {
  vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "true");
  vi.resetModules();
  const api = await import("../api/customer");
  const { USE_MOCKS } = await import("../api/http");
  const auth = await import("../auth");
  const { db } = await import("./db");
  return { ...api, ...auth, db, USE_MOCKS };
}

/** Mock handlers simulate latency with setTimeout; flush it with fake timers. */
async function settle<T>(p: Promise<T>): Promise<T> {
  const out = p.then(
    (v) => ({ ok: true as const, v }),
    (e: unknown) => ({ ok: false as const, e }),
  );
  await vi.runAllTimersAsync();
  const r = await out;
  if (!r.ok) throw r.e;
  return r.v;
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-10-22T09:00:00+05:00") });
});
afterEach(() => {
  vi.useRealTimers();
});

const DEMO = "+923211234567";

describe("customer mock mode", () => {
  it("signs the demo customer in with OTP 123456 and never touches the network", async () => {
    const f = mockFetch();
    const m = await load();
    expect(m.USE_MOCKS).toBe(true);
    await expect(settle(m.authApi.verifyOtp(DEMO, "000000"))).rejects.toMatchObject({ status: 401, message: "Invalid OTP" });
    const tokens = await settle(m.authApi.verifyOtp(DEMO, "123456"));
    m.storeTokens(tokens, DEMO);
    const me = await settle(m.meApi.get());
    expect(me).toMatchObject({ phone: DEMO, role: "CUSTOMER", fullName: "Ahmed Raza" });
    expect(f.calls).toHaveLength(0);
  });

  it("creates a booking with the real BookingDetail shape", async () => {
    const m = await load();
    m.storeTokens(await settle(m.authApi.verifyOtp(DEMO, "123456")), DEMO);
    const booking = await settle(
      m.bookingsApi.create({
        patientId: "pat-rashida",
        caregiverId: "cg-fatima",
        addressId: "addr-home",
        type: "RECURRING",
        startDate: "2026-11-02",
        endDate: "2026-11-08",
        timeWindowStart: "10:00",
        timeWindowEnd: "11:00",
        weekdays: [1, 3, 5],
        promoCode: "welcome10",
      }),
    );
    expect(booking).toMatchObject({
      status: "REQUESTED",
      type: "RECURRING",
      caregiverId: "cg-fatima",
      recurrenceRule: { weekdays: [1, 3, 5], startDate: "2026-11-02", endDate: "2026-11-08" },
      patient: { id: "pat-rashida" },
      address: { id: "addr-home", latitude: expect.any(String), longitude: expect.any(String) },
      caregiver: { id: "cg-fatima" },
    });
    expect(booking.discountAmount).toBeGreaterThan(0);
    expect(booking.visits.map((x) => x.scheduledDate.slice(0, 10))).toEqual(["2026-11-02", "2026-11-04", "2026-11-06"]);
    expect(Array.isArray(booking.prescriptions)).toBe(true);
  });

  it("rejects an invalid promo code with the backend message", async () => {
    const m = await load();
    m.storeTokens(await settle(m.authApi.verifyOtp(DEMO, "123456")), DEMO);
    await expect(
      settle(
        m.bookingsApi.create({
          patientId: "pat-rashida",
          caregiverId: "cg-fatima",
          addressId: "addr-home",
          type: "SINGLE",
          startDate: "2026-11-02",
          endDate: "2026-11-02",
          timeWindowStart: "10:00",
          timeWindowEnd: "11:00",
          promoCode: "NOPE",
        }),
      ),
    ).rejects.toMatchObject({ status: 400, message: "Promo code is not valid" });
  });

  it("starts every payment PENDING (no instant paid), cash without a gateway ref", async () => {
    const m = await load();
    m.storeTokens(await settle(m.authApi.verifyOtp(DEMO, "123456")), DEMO);
    const d = m.db();
    const paid = new Set(d.payments.filter((p) => p.status === "PAID" || p.status === "PENDING").map((p) => p.visitId));
    const payable = d.visits.filter(
      (x) =>
        !paid.has(x.id) &&
        x.status !== "CANCELLED" &&
        x.status !== "DECLINED" &&
        d.bookings.find((b) => b.id === x.bookingId && b.status === "CONFIRMED" && b.customerId === "cust-ahmed"),
    );
    expect(payable.length).toBeGreaterThanOrEqual(2);

    const cash = await settle(m.paymentsApi.initiate({ visitId: payable[0].id, method: "CASH" }));
    expect(cash).toMatchObject({ status: "PENDING", method: "CASH", gatewayRef: null, paidAt: null });
    const card = await settle(m.paymentsApi.initiate({ visitId: payable[1].id, method: "CARD" }));
    expect(card).toMatchObject({ status: "PENDING", paidAt: null, gatewayRef: `gw_${card.id}` });

    await expect(settle(m.paymentsApi.initiate({ visitId: payable[0].id, method: "CASH" }))).rejects.toMatchObject({
      message: "A payment for this visit is already in progress",
    });
    const pending = await settle(m.paymentsApi.list({ status: "PENDING", limit: 100 }));
    expect(pending.items.map((p) => p.id)).toEqual(expect.arrayContaining([cash.id, card.id]));
  });
});
