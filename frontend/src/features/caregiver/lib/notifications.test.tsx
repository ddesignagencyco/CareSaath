import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AppNotification } from "@shared/caregiver-types";
import { LocaleProvider } from "@shared/i18n/provider";
import { formatMoney } from "@shared/lib/format";
import { useDescribe, type NotificationView } from "./notifications";

const KEY = "caresaath.caregiver.locale.test";

function describeAll(locale: "en" | "ur", list: AppNotification[]): NotificationView[] {
  localStorage.setItem(KEY, locale);
  const { result, unmount } = renderHook(() => useDescribe(), {
    wrapper: ({ children }) => <LocaleProvider storageKey={KEY}>{children}</LocaleProvider>,
  });
  const views = list.map((n) => result.current(n));
  unmount();
  return views;
}

const n = (event: string, payload: Record<string, unknown> = {}): AppNotification => ({
  id: event,
  userId: "u1",
  channel: "PUSH",
  event,
  payload,
  status: "SENT",
  sentAt: null,
  createdAt: "2026-10-22T05:00:00.000Z",
});

describe("useDescribe (en)", () => {
  it.each<[string, Record<string, unknown>, Partial<NotificationView>]>([
    ["booking.requested", { bookingId: "b", visits: 3 }, { title: "New booking request", body: "3 visits. Respond before the request expires.", href: "/caregiver/requests", tone: "accent" }],
    ["booking.requested", { bookingId: "b", visits: 1 }, { body: "1 visit. Respond before the request expires." }],
    ["booking.requested", { bookingId: "b" }, { body: "Respond before the request expires." }],
    ["booking.cancelled", { bookingId: "b" }, { title: "Booking cancelled", href: "/caregiver/visits", tone: "neutral" }],
    ["booking.prescription.uploaded", { bookingId: "b", documentId: "d" }, { title: "Prescription added", href: "/caregiver/requests" }],
    ["visit.rescheduled", { visitId: "v9", scheduledDate: "2026-11-05" }, { title: "Visit rescheduled", href: "/caregiver/visits/v9", tone: "brand" }],
    ["visit.rescheduled", {}, { body: "Moved to a new date.", href: "/caregiver/visits" }],
    ["visit.rescheduled", { scheduledDate: "soon" }, { body: "Moved to a new date." }],
    ["dispute.raised", { disputeId: "d", visitId: "v" }, { title: "Dispute raised", href: "/caregiver/reports", tone: "danger" }],
    ["dispute.resolved", { disputeId: "d" }, { title: "Dispute resolved", tone: "success" }],
    ["payout.processing", { amount: 1600_00 }, { title: "Payout approved", body: `${formatMoney(160000)} is being transferred to your account.`, href: "/caregiver/earnings" }],
    ["payout.paid", { amount: 500_00 }, { title: "Payout sent", body: `${formatMoney(50000)} has been paid to your account.`, tone: "success" }],
    ["payout.rejected", { amount: 500_00 }, { title: "Payout rejected", tone: "danger" }],
    ["payout.paid", {}, { body: " has been paid to your account." }],
    ["safety_incident.updated", { status: "IN_REVIEW" }, { title: "Safety report updated", body: "Status: in review.", href: "/caregiver/reports" }],
    ["safety_incident.updated", { status: "ESCALATED" }, { body: "Status: escalated." }],
    ["safety_incident.updated", {}, { body: "Status: ." }],
    ["some.new_event", { x: 1 }, { title: "some new event", body: "", href: null, tone: "neutral" }],
  ])("%s %j", (event, payload, expected) => {
    const [view] = describeAll("en", [n(event, payload)]);
    expect(view).toMatchObject(expected);
  });

  it("formats the rescheduled date as a long day", () => {
    const [view] = describeAll("en", [n("visit.rescheduled", { visitId: "v", scheduledDate: "2026-11-05" })]);
    expect(view.body).toBe("Moved to Thursday 5 November.");
  });
});

describe("useDescribe (ur)", () => {
  it("translates every known event and keeps the same links", () => {
    const events: AppNotification[] = [
      n("booking.requested", { visits: 2 }),
      n("booking.requested", {}),
      n("booking.cancelled"),
      n("booking.prescription.uploaded"),
      n("visit.rescheduled", {}),
      n("dispute.raised"),
      n("dispute.resolved"),
      n("payout.processing", { amount: 1000_00 }),
      n("payout.paid", { amount: 1000_00 }),
      n("payout.rejected", { amount: 1000_00 }),
      n("safety_incident.updated", { status: "RESOLVED" }),
    ];
    const ur = describeAll("ur", events);
    const en = describeAll("en", events);
    ur.forEach((view, i) => {
      expect(view.title).toMatch(/[؀-ۿ]/);
      expect(view.title).not.toBe(en[i].title);
      expect(view.href).toBe(en[i].href);
      expect(view.tone).toBe(en[i].tone);
    });
    expect(ur[0].title).toBe("بکنگ کی نئی درخواست");
    expect(ur[0].body).toContain("2");
    expect(ur[1].body).toBe("درخواست ختم ہونے سے پہلے جواب دیں۔");
    expect(ur[4].body).toBe("نئی تاریخ پر منتقل کر دیا گیا۔");
    expect(ur[8].body).toContain(formatMoney(100000));
  });

  it("falls back to the technical name for unknown events", () => {
    const [view] = describeAll("ur", [n("brand.new")]);
    expect(view).toEqual({ title: "brand new", body: "", href: null, tone: "neutral" });
  });
});
