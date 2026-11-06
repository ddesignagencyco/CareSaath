import { describe, expect, it } from "vitest";
import { effectiveEta } from "./visit";

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

  it("ticks down by whole minutes as time passes", () => {
    expect(effectiveEta(8, at, T0 + 3 * 60_000)).toBe(5);
    // elapsed is floored, so 3m54s still counts as 3 minutes elapsed
    expect(effectiveEta(8, at, T0 + 3 * 60_000 + 54_000)).toBe(5);
  });

  it("clamps at zero once the ETA is overdue", () => {
    expect(effectiveEta(2, at, T0 + 10 * 60_000)).toBe(0);
  });

  it("never returns a negative value for a zero ETA", () => {
    expect(effectiveEta(0, at, T0 + 60_000)).toBe(0);
  });

  it("ignores a fix timestamp in the future (no negative elapsed)", () => {
    expect(effectiveEta(5, at, T0 - 60_000)).toBe(5);
  });
});
