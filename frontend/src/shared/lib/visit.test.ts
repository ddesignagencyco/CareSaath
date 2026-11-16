import { describe, expect, it } from "vitest";
import { effectiveEta, splitEta } from "./visit";

describe("effectiveEta", () => {
  const T0 = new Date("2026-01-01T10:00:00.000Z").getTime();
  const at = new Date(T0).toISOString();

  it("returns the rounded server value during prerender (now = 0)", () => {
    expect(effectiveEta(5.4, at, 0)).toBe(5);
    expect(effectiveEta(5.6, at, 0)).toBe(6);
  });

  it("equals the server value at the moment of the fix", () => {
    expect(effectiveEta(8, at, T0)).toBe(8);
  });

  it("interpolates at most 1 minute between live fixes", () => {
    expect(effectiveEta(8, at, T0 + 60_000)).toBe(7);
    // Even if time elapses without a new GPS fix, never decay to 0 while far away
    expect(effectiveEta(8, at, T0 + 10 * 60_000)).toBe(7);
  });

  it("keeps estimated ETA steady instead of ticking down to zero on clock time", () => {
    expect(effectiveEta(20, at, T0 + 10 * 60_000, true)).toBe(20);
  });

  it("preserves zero ETA when the doctor has arrived", () => {
    expect(effectiveEta(0, at, T0 + 60_000)).toBe(0);
  });

  it("never returns a negative value for a zero ETA", () => {
    expect(effectiveEta(0, at, T0 + 60_000)).toBe(0);
  });

  it("ignores a fix timestamp in the future (no negative elapsed)", () => {
    expect(effectiveEta(5, at, T0 - 60_000)).toBe(5);
  });
});

describe("splitEta", () => {
  it("formats under 60 minutes as minutes only", () => {
    expect(splitEta(45)).toEqual({ days: 0, hours: 0, mins: 45 });
    expect(splitEta(5)).toEqual({ days: 0, hours: 0, mins: 5 });
  });

  it("formats 60 minutes as 1 hour and 0 minutes", () => {
    expect(splitEta(60)).toEqual({ days: 0, hours: 1, mins: 0 });
  });

  it("formats multi-hour ETAs under 24 hours into hours and minutes", () => {
    expect(splitEta(125)).toEqual({ days: 0, hours: 2, mins: 5 });
    expect(splitEta(90)).toEqual({ days: 0, hours: 1, mins: 30 });
  });

  it("formats ETAs of 24+ hours into days, hours, and minutes", () => {
    expect(splitEta(1440)).toEqual({ days: 1, hours: 0, mins: 0 });
    expect(splitEta(2476)).toEqual({ days: 1, hours: 17, mins: 16 });
    expect(splitEta(3000)).toEqual({ days: 2, hours: 2, mins: 0 });
  });

  it("clamps negative values to zero", () => {
    expect(splitEta(-10)).toEqual({ days: 0, hours: 0, mins: 0 });
    expect(splitEta(0)).toEqual({ days: 0, hours: 0, mins: 0 });
  });
});
