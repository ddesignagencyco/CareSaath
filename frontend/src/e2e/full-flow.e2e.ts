/**
 * Live production-shaped flow across all three roles, run through the frontend's
 * own API functions against a RUNNING backend. Not part of `npm test`; run with
 * `npm run test:e2e` while the backend (port 3000) and its Docker services are up.
 *
 * Payments: only the cash path is exercised. The JazzCash/Easypaisa/Card webhook
 * settlement needs real providers and is out of scope (see docs/requirement.md).
 */
import { afterAll, describe, expect, it } from "vitest";
import * as admin from "@/features/admin/lib/api/admin";
import * as caregiver from "@/features/caregiver/lib/api/caregiver";
import * as customer from "@/features/customer/lib/api/customer";
import { createUser, expectThat, results, signIn, signSession, step, VALID_PNG, type TestUser } from "./support";

// Shared state built up across the ordered steps.
const ctx: {
  cust?: TestUser;
  care?: TestUser;
  adminU?: TestUser;
  patientId?: string;
  addressId?: string;
  caregiverProfileId?: string;
  documentId?: string;
  bookingId?: string;
  visitId?: string;
  paymentId?: string;
  payoutAccountId?: string;
  payoutId?: string;
} = {};

const futureDate = (days: number) => {
  const d = new Date(Date.now() + days * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

describe("CareSaath live flow — all roles", () => {
  afterAll(() => {
    const byArea = new Map<string, { ok: number; fail: number }>();
    for (const r of results) {
      const a = byArea.get(r.area) ?? { ok: 0, fail: 0 };
      if (r.ok) a.ok++;
      else a.fail++;
      byArea.set(r.area, a);
    }
    const lines = ["", "================ LIVE FLOW RESULTS ================"];
    for (const r of results) lines.push(`${r.ok ? "PASS" : "FAIL"}  [${r.area}] ${r.step}${r.ok ? "" : `  — ${r.detail}`}`);
    lines.push("--------------------------------------------------");
    for (const [area, a] of byArea) lines.push(`${area}: ${a.ok}/${a.ok + a.fail} passed`);
    const failed = results.filter((r) => !r.ok);
    lines.push(`TOTAL: ${results.length - failed.length}/${results.length} steps passed`);
    lines.push("==================================================");
    console.log(lines.join("\n"));
  });

  it("admin: health, analytics, commission baseline", async () => {
    ctx.adminU = createUser("ADMIN", "E2E Admin");
    signIn("admin", ctx.adminU);
    await step("Admin", "GET /health", async () => {
      const h = await admin.healthApi.check();
      expectThat(h.postgres && h.redis, "postgres/redis not healthy");
    });
    await step("Admin", "GET /admin/analytics", async () => {
      const a = await admin.analyticsApi.overview("30d");
      expectThat(typeof a.bookings?.total === "number" || typeof a === "object", "no analytics payload");
    });
    await step("Admin", "GET /admin/commissions", () => admin.commissionsApi.list());
    await step("Admin", "PUT /admin/commissions/NURSING = 20%", () => admin.commissionsApi.update("NURSING", 20));
  });

  it("customer: profile, patient, address, contact", async () => {
    ctx.cust = createUser("CUSTOMER", "E2E Customer");
    signIn("customer", ctx.cust);
    await step("Customer", "GET /customer/me", async () => {
      const me = await customer.meApi.get();
      expectThat(me.role === "CUSTOMER", `role ${me.role}`);
    });
    await step("Customer", "PATCH /customer/me", () => customer.meApi.update({ fullName: "E2E Customer", preferredLanguage: "UR" }));
    await step("Customer", "POST /customer/patients", async () => {
      const p = await customer.patientsApi.create({
        name: "E2E Patient",
        relationship: "FAMILY_MEMBER",
        dateOfBirth: "1950-01-01",
        gender: "female",
        medicalContext: "Hypertension; needs mobility help.",
      });
      ctx.patientId = p.id;
      expectThat(!!p.id, "no patient id");
    });
    await step("Customer", "GET /customer/patients/:id (decrypts medicalContext)", async () => {
      const p = await customer.patientsApi.get(ctx.patientId!);
      expectThat(p.medicalContext?.includes("Hypertension") ?? false, `medicalContext not readable: ${p.medicalContext}`);
    });
    await step("Customer", "POST /customer/addresses", async () => {
      const a = await customer.addressesApi.create({
        label: "Home",
        addressLine: "12 Gulberg III",
        city: "Lahore",
        latitude: "31.51630000",
        longitude: "74.34520000",
      });
      ctx.addressId = a.id;
      expectThat(!!a.id, "no address id");
    });
    await step("Customer", "POST /customer/emergency-contacts", () =>
      customer.contactsApi.add({ name: "Next of kin", phone: "+923002220001" }),
    );
  });

  it("caregiver: onboarding, documents, availability", async () => {
    ctx.care = createUser("CUSTOMER", "E2E Caregiver"); // a caregiver signs up as a user first
    signIn("caregiver", ctx.care);
    await step("Caregiver", "POST /caregiver/register", async () => {
      const profile = await caregiver.profileApi.register({
        cnic: "35201-1111119-1",
        licenseNumber: `PNC-E2E-${Math.floor(Math.random() * 1e5)}`,
        licenseBody: "PNC",
        specialty: "NURSING",
        experienceYears: 7,
        bio: "Registered nurse for the live flow test.",
        serviceCities: ["Lahore"],
        ratePerVisit: 60000,
      });
      ctx.caregiverProfileId = profile.id;
      // Register flips the DB role to CAREGIVER; re-sign so later calls carry it (mirrors refreshTokens()).
      ctx.care = { ...ctx.care!, role: "CAREGIVER", ...signSession(ctx.care!.id, ctx.care!.phone, "CAREGIVER") };
      signIn("caregiver", ctx.care);
    });
    await step("Caregiver", "POST /caregiver/documents (image upload)", async () => {
      const doc = await caregiver.profileApi.uploadDocument(VALID_PNG(), "LICENSE");
      ctx.documentId = doc.id;
      expectThat(!!doc.id, "no document id");
    });
    await step("Caregiver", "PUT /caregiver/availability", () =>
      caregiver.availabilityApi.put([
        { dayOfWeek: 1, startTime: "09:00", endTime: "17:00" },
        { dayOfWeek: 3, startTime: "09:00", endTime: "17:00" },
        { dayOfWeek: 5, startTime: "09:00", endTime: "17:00" },
      ]),
    );
    await step("Caregiver", "GET /caregiver/profile = PENDING", async () => {
      const p = await caregiver.profileApi.get();
      expectThat(p.verificationStatus === "PENDING", `status ${p.verificationStatus}`);
    });
  });

  it("admin: verify and approve the caregiver", async () => {
    signIn("admin", ctx.adminU!);
    await step("Admin", "GET /admin/caregivers?status=PENDING (finds ours)", async () => {
      const list = await admin.caregiversApi.list({ status: "PENDING", page: 1, limit: 50 });
      const found = list.items.some((c) => c.id === ctx.caregiverProfileId);
      expectThat(found, "new caregiver not in PENDING queue");
    });
    await step("Admin", "GET document presigned URL", async () => {
      const u = await admin.caregiversApi.documentUrl(ctx.caregiverProfileId!, ctx.documentId!);
      expectThat(!!u.url, "no document url");
    });
    await step("Admin", "POST /admin/caregivers/:id/approve", async () => {
      const c = await admin.caregiversApi.approve(ctx.caregiverProfileId!, "Verified for E2E");
      expectThat(c.verificationStatus === "APPROVED", `status ${c.verificationStatus}`);
    });
  });

  it("customer: discovery and booking", async () => {
    signIn("customer", ctx.cust!);
    await step("Customer", "GET /caregivers?specialty=NURSING&city=Lahore (ours visible)", async () => {
      // Public search is Redis-cached for 30s and NOT invalidated on approval (see
      // docs/requirement.md), so a just-approved caregiver can be briefly absent. Poll
      // until the cache expires rather than fail on the staleness window.
      const deadline = Date.now() + 35_000;
      for (;;) {
        const res = await customer.caregiversApi.search({ specialty: "NURSING", city: "Lahore", page: 1, limit: 50 });
        if (res.items.some((c) => c.id === ctx.caregiverProfileId)) return;
        if (Date.now() > deadline) throw new Error("approved caregiver not in public search after 35s (cache not invalidated on approve)");
        await new Promise((r) => setTimeout(r, 3000));
      }
    });
    await step("Customer", "GET /caregivers/:id (public profile)", async () => {
      const c = await customer.caregiversApi.get(ctx.caregiverProfileId!);
      expectThat(!!c.user?.fullName, "no caregiver name on public profile");
    });
    await step("Customer", "POST /customer/bookings (SINGLE)", async () => {
      const b = await customer.bookingsApi.create({
        patientId: ctx.patientId!,
        caregiverId: ctx.caregiverProfileId!,
        addressId: ctx.addressId!,
        type: "SINGLE",
        startDate: futureDate(2),
        endDate: futureDate(2),
        timeWindowStart: "09:00",
        timeWindowEnd: "11:00",
      });
      ctx.bookingId = b.id;
      ctx.visitId = b.visits?.[0]?.id;
      expectThat(!!ctx.visitId, "booking produced no visit");
    });
    await step("Customer", "POST prescription upload", () =>
      customer.bookingsApi.uploadPrescription(ctx.bookingId!, VALID_PNG()),
    );
  });

  it("caregiver: accept and run the visit", async () => {
    signIn("caregiver", ctx.care!);
    await step("Caregiver", "GET /caregiver/bookings?status=REQUESTED", async () => {
      const list = await caregiver.bookingsApi.list({ status: "REQUESTED", page: 1, limit: 50 });
      expectThat(list.items.some((b) => b.id === ctx.bookingId), "request not in caregiver queue");
    });
    await step("Caregiver", "POST accept → CONFIRMED", async () => {
      const b = await caregiver.bookingsApi.accept(ctx.bookingId!);
      expectThat(b.status === "CONFIRMED", `booking ${b.status}`);
    });
    await step("Caregiver", "POST en-route", () => caregiver.visitsApi.enRoute(ctx.visitId!));
    await step("Caregiver", "POST check-in (GPS)", async () => {
      const v = await caregiver.visitsApi.checkIn(ctx.visitId!, { method: "GPS", lat: 31.5163, lng: 74.3452 });
      expectThat(v.status === "CHECKED_IN", `visit ${v.status}`);
    });
    await step("Caregiver", "POST check-out (GPS) → CHECKED_OUT", async () => {
      const v = await caregiver.visitsApi.checkOut(ctx.visitId!, { method: "GPS", lat: 31.5163, lng: 74.3452 });
      expectThat(v.status === "CHECKED_OUT", `visit ${v.status}`);
    });
    await step("Caregiver", "POST note → COMPLETED", async () => {
      const v = await caregiver.visitsApi.note(ctx.visitId!, "Vitals normal. Wound dressing changed. No pain reported.");
      expectThat(v.status === "COMPLETED", `visit ${v.status}`);
    });
  });

  it("payments (cash): customer initiates, caregiver confirms", async () => {
    signIn("customer", ctx.cust!);
    await step("Customer", "POST /customer/payments (CASH, no amount)", async () => {
      const res = await customer.paymentsApi.initiate({ visitId: ctx.visitId!, method: "CASH" });
      const p = "payment" in res ? res.payment : res; // CASH returns the bare payment
      ctx.paymentId = p.id;
      expectThat(p.status === "PENDING", `payment ${p.status}`);
      expectThat(p.amount > 0 && p.caregiverAmount > 0, "amount/caregiverAmount not computed server-side");
    });
    signIn("caregiver", ctx.care!);
    await step("Caregiver", "POST /caregiver/payments/:id/confirm-cash → PAID", async () => {
      const p = await caregiver.paymentsApi.confirmCash(ctx.paymentId!);
      expectThat(p.status === "PAID", `payment ${p.status}`);
    });
  });

  it("customer: review the completed visit", async () => {
    signIn("customer", ctx.cust!);
    await step("Customer", "GET /customer/visits/:id (tracks status)", async () => {
      const v = await customer.visitsApi.get(ctx.visitId!);
      expectThat(v.status === "COMPLETED", `visit ${v.status}`);
    });
    await step("Customer", "POST /customer/visits/:id/review", async () => {
      const r = await customer.visitsApi.review(ctx.visitId!, { rating: 5, comment: "Professional and punctual." });
      expectThat(r.rating === 5, "review not saved");
    });
    await step("Customer", "GET /customer/payments/:id (receipt)", async () => {
      const p = await customer.paymentsApi.get(ctx.paymentId!);
      expectThat(p.status === "PAID", `receipt ${p.status}`);
    });
  });

  it("caregiver: earnings and payout request", async () => {
    signIn("caregiver", ctx.care!);
    await step("Caregiver", "POST /caregiver/payout-accounts", async () => {
      const acc = await caregiver.moneyApi.createAccount({
        type: "MOBILE_WALLET",
        provider: "JazzCash",
        accountTitle: "E2E Caregiver",
        accountNumber: "03001110011",
      });
      ctx.payoutAccountId = acc.id;
      expectThat(!!acc.id, "no account id");
    });
    await step("Caregiver", "GET /caregiver/earnings (available > 0 after paid cash)", async () => {
      const e = await caregiver.moneyApi.earnings();
      expectThat(e.availableAmount > 0, `availableAmount ${e.availableAmount}`);
    });
    await step("Caregiver", "POST /caregiver/payouts (request available balance)", async () => {
      const e = await caregiver.moneyApi.earnings();
      const req = await caregiver.moneyApi.requestPayout({ payoutAccountId: ctx.payoutAccountId!, amount: e.availableAmount });
      ctx.payoutId = req.id;
      expectThat(req.status === "REQUESTED", `payout ${req.status}`);
    });
  });

  it("admin: approve and settle the payout", async () => {
    signIn("admin", ctx.adminU!);
    await step("Admin", "GET /admin/payouts?status=REQUESTED", async () => {
      const list = await admin.payoutsApi.list({ status: "REQUESTED", page: 1, limit: 50 });
      expectThat(list.items.some((p) => p.id === ctx.payoutId), "payout not in admin queue");
    });
    await step("Admin", "POST /admin/payouts/:id/approve → PROCESSING", async () => {
      const p = await admin.payoutsApi.approve(ctx.payoutId!, { note: "Approved in E2E" });
      expectThat(p.status === "PROCESSING", `payout ${p.status}`);
    });
    await step("Admin", "POST /admin/payouts/:id/mark-paid → PAID", async () => {
      const p = await admin.payoutsApi.markPaid(ctx.payoutId!, { note: "Ref TXN-E2E" });
      expectThat(p.status === "PAID", `payout ${p.status}`);
    });
  });

  it("safety and disputes", async () => {
    signIn("customer", ctx.cust!);
    await step("Customer", "POST /customer/visits/:id/safety-reports", () =>
      customer.visitsApi.report(ctx.visitId!, { description: "E2E: caregiver was 20 minutes late.", priority: "LOW" }),
    );
    await step("Customer", "POST /disputes + GET /disputes", async () => {
      await customer.disputesApi.raise({ visitId: ctx.visitId!, description: "E2E dispute: service quality." });
      const mine = await customer.disputesApi.list();
      expectThat(mine.some((d) => d.visitId === ctx.visitId), "dispute not listed for customer");
    });
    signIn("caregiver", ctx.care!);
    await step("Caregiver", "POST /caregiver/safety-reports + GET", async () => {
      await caregiver.safetyApi.report({ visitId: ctx.visitId!, description: "E2E: access to the building was blocked." });
      const list = await caregiver.safetyApi.list();
      expectThat(Array.isArray(list), "caregiver safety list not returned");
    });
    signIn("admin", ctx.adminU!);
    await step("Admin", "GET /admin/safety-incidents + PATCH status", async () => {
      const list = await admin.safetyApi.list({ page: 1, limit: 50 });
      const incident = list.items.find((i) => i.visitId === ctx.visitId);
      expectThat(!!incident, "incident not in admin triage");
      const updated = await admin.safetyApi.update(incident!.id, { status: "IN_REVIEW", note: "Reviewing (E2E)." });
      expectThat(updated.status === "IN_REVIEW", `incident ${updated.status}`);
    });
    await step("Admin", "GET /admin/disputes + resolve", async () => {
      const list = await admin.disputesApi.list({ page: 1, limit: 50 });
      const dispute = list.items.find((d) => d.visitId === ctx.visitId);
      expectThat(!!dispute, "dispute not in admin queue");
      const resolved = await admin.disputesApi.resolve(dispute!.id, "Resolved amicably (E2E).");
      expectThat(resolved.status === "RESOLVED", `dispute ${resolved.status}`);
    });
  });

  it("every step above passed", () => {
    const failed = results.filter((r) => !r.ok);
    expect(failed.map((f) => `[${f.area}] ${f.step}: ${f.detail}`)).toEqual([]);
  });
});
