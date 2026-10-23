import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@shared/i18n/provider";
import { messages } from "@shared/i18n/messages";
import { formatMoney } from "@shared/lib/format";
import type { AppNotification } from "@shared/caregiver-types";
import type { VisitStatus } from "@shared/types";
import { fakeJwt, json, mockFetch } from "@/test/utils";
import { session, SESSION_KEY } from "./api/session";
import { useSignOut } from "./auth";
import { bookingDisplayStatus, getSeenAt, hasCancellableVisits, isUnreadableMedical, markSeen, SEEN_EVENT, useDescribe } from "./labels";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/customer",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

const v = (...statuses: VisitStatus[]) => statuses.map((status) => ({ status }));

describe("bookingDisplayStatus", () => {
  it.each([
    ["CONFIRMED with all live visits completed → COMPLETED", "CONFIRMED", v("COMPLETED", "COMPLETED", "CANCELLED"), "COMPLETED"],
    ["CONFIRMED with a pending visit stays CONFIRMED", "CONFIRMED", v("COMPLETED", "CONFIRMED"), "CONFIRMED"],
    ["CONFIRMED with only cancelled visits stays CONFIRMED", "CONFIRMED", v("CANCELLED", "DECLINED"), "CONFIRMED"],
    ["CONFIRMED with no visits stays CONFIRMED", "CONFIRMED", [], "CONFIRMED"],
    ["REQUESTED is untouched", "REQUESTED", v("COMPLETED"), "REQUESTED"],
    ["CANCELLED is untouched", "CANCELLED", v("COMPLETED"), "CANCELLED"],
  ] as const)("%s", (_n, status, visits, expected) => {
    expect(bookingDisplayStatus({ status, visits: [...visits] })).toBe(expected);
  });
});

describe("hasCancellableVisits", () => {
  it.each([
    ["REQUESTED", v("REQUESTED"), true],
    ["CONFIRMED", v("COMPLETED", "CONFIRMED"), true],
    ["CONFIRMED", v("COMPLETED", "IN_PROGRESS"), false],
    ["CANCELLED", v("REQUESTED"), false],
    ["DECLINED", v("DECLINED"), false],
  ] as const)("%s %j → %s", (status, visits, expected) => {
    expect(hasCancellableVisits({ status, visits: [...visits] })).toBe(expected);
  });
});

describe("isUnreadableMedical (ciphertext guard)", () => {
  it("flags the raw iv:tag:ciphertext string the backend returns when it can't decrypt", () => {
    expect(isUnreadableMedical("q1w2e3r4t5y6u7i8o9p0aa==:ZmFrZXRhZw==:Y2lwaGVydGV4dA==")).toBe(true);
    expect(isUnreadableMedical("abc:def:ghi")).toBe(true);
  });
  it.each([null, undefined, "", "Type 2 diabetes on insulin", "BP: 140/90: monitor daily", "ذیابیطس"])("treats %j as readable", (value) => {
    expect(isUnreadableMedical(value)).toBe(false);
  });
});

describe("notifications seen marker", () => {
  it("getSeenAt is empty until markSeen stores it and fires the event", () => {
    expect(getSeenAt()).toBe("");
    const onSeen = vi.fn();
    window.addEventListener(SEEN_EVENT, onSeen);
    markSeen("2026-10-22T10:00:00.000Z");
    window.removeEventListener(SEEN_EVENT, onSeen);
    expect(getSeenAt()).toBe("2026-10-22T10:00:00.000Z");
    expect(onSeen).toHaveBeenCalledOnce();
  });
});

const KEY = "caresaath.customer.locale";
const n = (event: string, payload: Record<string, unknown> = {}): AppNotification => ({
  id: "n1",
  userId: "u1",
  channel: "PUSH",
  event,
  payload,
  status: "SENT",
  sentAt: null,
  createdAt: "2026-10-22T10:00:00.000Z",
});

function describeIn(locale: "en" | "ur") {
  localStorage.setItem(KEY, locale);
  const { result } = renderHook(() => useDescribe(), {
    wrapper: ({ children }) => <LocaleProvider storageKey={KEY}>{children}</LocaleProvider>,
  });
  return result.current;
}

describe("useDescribe (notification texts)", () => {
  const en = messages.en.customerA.notifications.events;
  const ur = messages.ur.customerA.notifications.events;

  it("describes booking/visit events in English with links", () => {
    const d = describeIn("en");
    expect(d(n("booking.confirmed", { bookingId: "b1" }))).toEqual({ title: en.bookingConfirmed.title, body: en.bookingConfirmed.body, href: "/customer/bookings/b1", tone: "success" });
    expect(d(n("visit.en_route", { visitId: "v1" }))).toMatchObject({ title: en.enRoute.title, href: "/customer/visits/v1" });
    expect(d(n("visit.completed", { visitId: "v1" }))).toMatchObject({ title: en.completed.title, tone: "success" });
    expect(d(n("booking.declined"))).toMatchObject({ href: null });
  });

  it("formats payment amounts (paisa), SOS contacts and incident statuses", () => {
    const d = describeIn("en");
    expect(d(n("payment.paid", { amount: 250000 })).body).toBe(`${formatMoney(250000)} paid.`);
    expect(d(n("payment.paid", {})).body).toBe("");
    expect(d(n("safety_incident.sos.contact", { contact: "Sana", visitId: "v1" }))).toMatchObject({ body: "Sana was alerted by SMS.", tone: "danger", href: "/customer/visits/v1" });
    expect(d(n("safety_incident.updated", { status: "IN_REVIEW" })).body).toBe("Status: in review.");
  });

  it("falls back to a readable event name for unknown events", () => {
    const d = describeIn("en");
    expect(d(n("some.new_event"))).toEqual({ title: "some new event", body: "", href: null, tone: "neutral" });
  });

  it("describes events in Urdu", () => {
    const d = describeIn("ur");
    expect(d(n("booking.confirmed", { bookingId: "b1" }))).toMatchObject({ title: ur.bookingConfirmed.title, body: ur.bookingConfirmed.body });
    expect(d(n("safety_incident.updated", { status: "RESOLVED" })).body).toBe(`صورتحال: ${messages.ur.labels.incidentStatus.RESOLVED}۔`);
    expect(d(n("unknown_event")).title).toBe("unknown event");
  });
});

describe("useSignOut", () => {
  it("clears the session, removes only customer (c-*) queries, revokes the refresh token and goes to login", async () => {
    session.set({ accessToken: fakeJwt({ sub: "u1", role: "CUSTOMER", type: "access" }), refreshToken: "refresh-1", phone: "+923211234567" });
    const f = mockFetch(() => json({ ok: true }));
    const client = new QueryClient();
    client.setQueryData(["c-me"], { id: "u1" });
    client.setQueryData(["c-bookings", "list"], []);
    client.setQueryData(["g-me"], { id: "cg" });
    client.setQueryData(["admin", "x"], 1);
    const { result } = renderHook(() => useSignOut(), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });
    await act(() => result.current());
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(client.getQueryData(["c-me"])).toBeUndefined();
    expect(client.getQueryData(["c-bookings", "list"])).toBeUndefined();
    expect(client.getQueryData(["g-me"])).toEqual({ id: "cg" });
    expect(client.getQueryData(["admin", "x"])).toBe(1);
    expect(f.calls.map((c) => [c.method, c.url.pathname, c.body])).toEqual([["POST", "/api/v1/auth/logout", { refreshToken: "refresh-1" }]]);
    expect(replace).toHaveBeenCalledWith("/login");
  });
});
