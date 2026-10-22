import { afterEach, describe, expect, it, vi } from "vitest";
import { daysUntil, formatBytes, formatCompactMoney, formatMoney, formatPercent, humanize, initials } from "./format";

// Intl may use a non-breaking space between "Rs" and the amount.
const plain = (s: string) => s.replace(/\s/g, " ");

describe("money (API amounts are paisa)", () => {
  it("formats paisa as whole rupees", () => {
    expect(plain(formatMoney(60000))).toBe("Rs 600");
    expect(plain(formatMoney(250000))).toBe("Rs 2,500");
    expect(plain(formatMoney(0))).toBe("Rs 0");
  });

  it("formats compact amounts", () => {
    expect(formatCompactMoney(60000)).toBe("Rs 600");
    expect(formatCompactMoney(140_000_000)).toBe("Rs 1.4M");
    expect(formatCompactMoney(21_040_000)).toBe("Rs 210.4K");
  });
});

describe("small formatters", () => {
  afterEach(() => vi.useRealTimers());

  it("formatPercent", () => {
    expect(formatPercent(0.2)).toBe("20.0%");
    expect(formatPercent(0.053, 1)).toBe("5.3%");
  });

  it("formatBytes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(178 * 1024)).toBe("178 KB");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });

  it("initials", () => {
    expect(initials("Fatima Noor")).toBe("FN");
    expect(initials("  ayesha  ")).toBe("A");
    expect(initials("Muhammad Bilal Khan")).toBe("MB");
    expect(initials("")).toBe("?");
  });

  it("humanize", () => {
    expect(humanize("IN_REVIEW")).toBe("In review");
    expect(humanize("PAID")).toBe("Paid");
  });

  it("daysUntil counts whole days, negative in the past", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T10:00:00Z"));
    expect(daysUntil("2026-10-25T10:00:00Z")).toBe(3);
    expect(daysUntil("2026-10-20T10:00:00Z")).toBe(-2);
  });
});
