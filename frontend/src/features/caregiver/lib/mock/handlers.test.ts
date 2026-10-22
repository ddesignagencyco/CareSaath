import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mock mode: the API functions go to the in-browser handlers. USE_MOCKS is read
 * at module load, so the modules are re-imported after stubbing the env.
 * Handlers sleep 150–550 ms; fake timers keep the suite fast.
 */
type Api = typeof import("../api/caregiver");
type Session = typeof import("../api/session")["session"];

let api: Api;
let session: Session;

/** Settle a mock call by advancing past its artificial delay. */
async function run<T>(p: Promise<T>): Promise<T> {
  const settled = p.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  await vi.advanceTimersByTimeAsync(2000);
  const r = await settled;
  if (!r.ok) throw r.error;
  return r.value;
}

async function signIn(phone: string) {
  await run(api.authApi.requestOtp(phone));
  const tokens = await run(api.authApi.verifyOtp(phone, "123456"));
  session.set({ ...tokens, phone });
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-22T07:00:00+05:00"));
  vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "true");
  vi.resetModules();
  api = await import("../api/caregiver");
  session = (await import("../api/session")).session;
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.useRealTimers();
});

describe("mock auth", () => {
  it("accepts only OTP 123456", async () => {
    await expect(run(api.authApi.verifyOtp("+923001110011", "000000"))).rejects.toMatchObject({ status: 401, message: "Invalid OTP" });
    const tokens = await run(api.authApi.verifyOtp("+923001110011", "123456"));
    expect(tokens.accessToken).toEqual(expect.any(String));
  });

  it("creates unknown numbers as customers without a caregiver profile", async () => {
    await signIn("+923459998877");
    const me = await run(api.meApi.get());
    expect(me).toMatchObject({ role: "CUSTOMER", caregiverProfile: null });
    await expect(run(api.visitsApi.list({}))).rejects.toMatchObject({ status: 403, message: "Insufficient role" });
  });

  it("knows the seeded approved and pending caregivers", async () => {
    await signIn("+923001110011");
    expect((await run(api.meApi.get())).caregiverProfile?.verificationStatus).toBe("APPROVED");
    await signIn("+923001110012");
    expect((await run(api.meApi.get())).caregiverProfile?.verificationStatus).not.toBe("APPROVED");
  });
});

describe("mock visit state machine", () => {
  it("walks CONFIRMED -> EN_ROUTE -> CHECKED_IN -> CHECKED_OUT -> COMPLETED", async () => {
    await signIn("+923001110011");
    const id = "vs-khalid";
    expect((await run(api.visitsApi.get(id))).status).toBe("CONFIRMED");

    // Can't skip travel.
    await expect(run(api.visitsApi.checkIn(id, { method: "GPS", lat: 31.5, lng: 74.3 }))).rejects.toMatchObject({
      status: 400,
      message: "Cannot move visit from CONFIRMED to CHECKED_IN",
    });

    expect((await run(api.visitsApi.enRoute(id))).status).toBe("EN_ROUTE");
    await expect(run(api.visitsApi.checkIn(id, { method: "OTP", code: "123456" }))).rejects.toMatchObject({
      status: 401,
      message: "Check-in OTP expired or not requested",
    });
    await run(api.visitsApi.checkInOtp(id));
    await expect(run(api.visitsApi.checkIn(id, { method: "OTP", code: "111111" }))).rejects.toMatchObject({ message: "Invalid check-in OTP" });
    const checkedIn = await run(api.visitsApi.checkIn(id, { method: "OTP", code: "123456" }));
    expect(checkedIn).toMatchObject({ status: "CHECKED_IN", checkInMethod: "OTP", checkInLat: null });

    await expect(run(api.visitsApi.checkOut(id, { method: "GPS" }))).rejects.toMatchObject({ message: "GPS check-out requires lat and lng" });
    const out = await run(api.visitsApi.checkOut(id, { method: "GPS", lat: 31.5163, lng: 74.3435 }));
    expect(out).toMatchObject({ status: "CHECKED_OUT", checkOutLat: "31.516300", checkOutLng: "74.343500" });

    await expect(run(api.visitsApi.note(id, "   "))).rejects.toMatchObject({ status: 400 });
    const done = await run(api.visitsApi.note(id, "BP 130/85"));
    expect(done.status).toBe("COMPLETED");
    expect(done.note?.summary).toBe("BP 130/85");
    expect(done.statusHistory.map((h) => h.toStatus)).toEqual(["EN_ROUTE", "CHECKED_IN", "IN_PROGRESS", "CHECKED_OUT", "COMPLETED"]);
    await expect(run(api.visitsApi.note(id, "again"))).rejects.toMatchObject({ message: "A note has already been submitted for this visit" });
  });
});

describe("mock bookings", () => {
  it("accepting a request confirms the booking and its visits; it can't be accepted twice", async () => {
    await signIn("+923001110011");
    const pending = await run(api.bookingsApi.list({ status: "REQUESTED" }));
    expect(pending.items.map((b) => b.id).sort()).toEqual(["bk-omar", "bk-saima-2"]);

    const accepted = await run(api.bookingsApi.accept("bk-omar"));
    expect(accepted.status).toBe("CONFIRMED");
    expect(accepted.visits.every((v) => v.status === "CONFIRMED")).toBe(true);
    await expect(run(api.bookingsApi.accept("bk-omar"))).rejects.toMatchObject({ status: 400, message: "Only requested bookings can be accepted" });
  });

  it("declining stores the reason and declines the visits", async () => {
    await signIn("+923001110011");
    const declined = await run(api.bookingsApi.decline("bk-saima-2", "Too far from my area"));
    expect(declined).toMatchObject({ status: "DECLINED", cancelReason: "Too far from my area" });
    expect(declined.visits.every((v) => v.status === "DECLINED")).toBe(true);
    const left = await run(api.bookingsApi.list({ status: "REQUESTED" }));
    expect(left.items.map((b) => b.id)).toEqual(["bk-omar"]);
  });
});
