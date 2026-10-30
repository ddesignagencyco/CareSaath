import { describe, expect, it } from "vitest";
import { isActive, MORE, PRIMARY, SECONDARY, SIDEBAR_GROUPS } from "./nav";

describe("isActive", () => {
  it.each([
    ["/caregiver", "/caregiver", true],
    ["/caregiver/visits", "/caregiver", false],
    ["/caregiver/visits", "/caregiver/visits", true],
    ["/caregiver/visits/vs-1", "/caregiver/visits", true],
    ["/caregiver/visitsx", "/caregiver/visits", false],
    ["/caregiver/requests", "/caregiver/visits", false],
  ])("isActive(%s, %s) = %s", (path, href, expected) => {
    expect(isActive(path, href)).toBe(expected);
  });

  it("sidebar groups cover exactly the tab + More items", () => {
    const sidebar = SIDEBAR_GROUPS.flatMap((g) => g.items.map((i) => i.href)).sort();
    expect(sidebar).toEqual([...PRIMARY, ...SECONDARY].map((i) => i.href).sort());
    expect(MORE.href).toBe("/caregiver/more");
  });
});
