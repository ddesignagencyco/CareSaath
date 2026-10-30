import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LRI, PDI, plain, providers, storeLocale } from "../__tests__/helpers";
import { useFmt } from "./use-fmt";

// 2026-10-22 10:30 in Asia/Karachi (UTC+5).
const NOW = new Date(2026, 9, 22, 10, 30).getTime();

function fmt(locale: "en" | "ur" = "en") {
  storeLocale(locale);
  return renderHook(() => useFmt(), { wrapper: providers().Wrapper }).result.current;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("useFmt", () => {
  it("runs in Asia/Karachi", () => {
    expect(new Date(NOW).toISOString()).toBe("2026-10-22T05:30:00.000Z");
  });

  it("time: 24h -> 12h wrapped in LTR isolates", () => {
    const f = fmt();
    const nine = f.time("09:00");
    expect(nine.startsWith(LRI) && nine.endsWith(PDI)).toBe(true);
    expect(plain(nine)).toBe(`${LRI}9:00 AM${PDI}`);
    expect(plain(f.time("21:05"))).toBe(`${LRI}9:05 PM${PDI}`);
    expect(plain(f.time("00:00"))).toBe(`${LRI}12:00 AM${PDI}`);
  });

  it("time in Urdu keeps Latin digits and stays isolated", () => {
    const t = plain(fmt("ur").time("21:05"));
    expect(t.startsWith(LRI) && t.endsWith(PDI)).toBe(true);
    expect(t).toContain("9:05");
  });

  it("timeWindow isolates the whole range", () => {
    expect(plain(fmt().timeWindow("09:00", "13:30"))).toBe(`${LRI}${LRI}9:00 AM${PDI} – ${LRI}1:30 PM${PDI}${PDI}`);
  });

  it("relativeDay: today / tomorrow / yesterday / other, and now=0 never guesses", () => {
    const f = fmt();
    expect(f.relativeDay("2026-10-22", NOW)).toBe("Today");
    expect(f.relativeDay("2026-10-23T00:00:00.000Z", NOW)).toBe("Tomorrow");
    expect(f.relativeDay("2026-10-21", NOW)).toBe("Yesterday");
    expect(plain(f.relativeDay("2026-10-25", NOW))).toMatch(/^Sun,? 25 Oct$/);
    expect(plain(f.relativeDay("2026-10-22", 0))).toMatch(/^Thu,? 22 Oct$/);

    const u = fmt("ur");
    expect(u.relativeDay("2026-10-22", NOW)).toBe("آج");
    expect(u.relativeDay("2026-10-23", NOW)).toBe("کل");
    expect(u.relativeDay("2026-10-21", NOW)).toBe("گزشتہ کل");
  });

  it("dateTime: English one string; Urdu = date words + isolated time", () => {
    const iso = new Date(2026, 9, 22, 21, 5).toISOString();
    expect(plain(fmt().dateTime(iso))).toBe("22 Oct, 21:05");
    const ur = plain(fmt("ur").dateTime(iso));
    expect(ur).toContain("اکتوبر");
    expect(ur).toContain("، ");
    expect(ur).toMatch(new RegExp(`${LRI}9:05 .+${PDI}$`));
    expect(fmt().dateTime(null)).toBe("—");
  });

  it("date", () => {
    expect(plain(fmt().date("2026-01-05T10:00:00Z"))).toBe("5 Jan 2026");
    expect(fmt().date(undefined)).toBe("—");
  });

  it("weekdays: every day / weekdays / explicit list (ISO 1=Mon … 7=Sun)", () => {
    const f = fmt();
    expect(f.weekdays([7, 1, 2, 3, 4, 5, 6])).toBe("Every day");
    expect(f.weekdays([5, 4, 3, 2, 1])).toBe("Weekdays");
    expect(f.weekdays([3, 1])).toBe("Mon, Wed");
    expect(f.weekdays([7])).toBe("Sun");

    const u = fmt("ur");
    expect(u.weekdays([1, 2, 3, 4, 5, 6, 7])).toBe("ہر روز");
    expect(u.weekdays([1, 2, 3, 4, 5])).toBe("پیر تا جمعہ");
    expect(u.weekdays([1, 3])).toBe("پیر، بدھ");
  });

  it("dayOfWeek: 0 = Sunday … 6 = Saturday", () => {
    const f = fmt();
    expect([0, 1, 2, 3, 4, 5, 6].map(f.dayOfWeek)).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    expect(f.dayOfWeekLong(0)).toBe("Sunday");
  });

  it("age counts whole years and needs a known now", () => {
    const f = fmt();
    expect(f.age("1950-10-22", NOW)).toBe("76 yrs"); // birthday today
    expect(f.age("1950-10-23", NOW)).toBe("75 yrs"); // birthday tomorrow
    expect(f.age(null, NOW)).toBeNull();
    expect(f.age("1950-01-01", 0)).toBeNull();
    expect(fmt("ur").age("1950-10-22", NOW)).toBe("76 سال");
  });

  it("money is paisa -> 'Rs' in both languages", () => {
    expect(plain(fmt().money(250000))).toBe("Rs 2,500");
    expect(plain(fmt("ur").money(250000))).toBe("Rs 2,500");
  });

  it("phone is isolated", () => {
    expect(fmt().phone("+923001234567")).toBe(`${LRI}+92 300 1234567${PDI}`);
  });

  it("relativeTime thresholds", () => {
    const f = fmt();
    const ago = (ms: number) => new Date(NOW - ms).toISOString();
    expect(f.relativeTime(ago(20_000), NOW)).toBe("just now");
    expect(plain(f.relativeTime(ago(5 * 60_000), NOW))).toMatch(/^5 min\.? ago$/);
    expect(plain(f.relativeTime(ago(2 * 3_600_000), NOW))).toMatch(/^2 hr\.? ago$/);
    expect(plain(f.relativeTime(ago(3 * 86_400_000), NOW))).toBe("3 days ago");
    expect(plain(f.relativeTime(ago(86_400_000), NOW))).toBe("yesterday");
    expect(plain(f.relativeTime(ago(40 * 86_400_000), NOW))).toBe("12 Sept 2026");
    // Defaults to Date.now()
    expect(f.relativeTime(new Date(NOW).toISOString())).toBe("just now");
    expect(fmt("ur").relativeTime(ago(1000), NOW)).toBe("ابھی");
  });

  it("list uses the locale's separator", () => {
    expect(fmt().list(["a", "b"])).toBe("a, b");
    expect(fmt("ur").list(["a", "b"])).toBe("a، b");
  });
});
