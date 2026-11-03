import { describe, expect, it } from "vitest";
import type { Me } from "@shared/caregiver-types";
import { apiPath, clearSessionCookies, json, mockFetch, setSessionCookies } from "@/test/utils";
import { session } from "./api/session";
import { homeFor, refreshTokens, storeTokens, tokenRole } from "./auth";

const me = (caregiverProfile: Me["caregiverProfile"]): Me => ({
  id: "u1",
  phone: "+923001110011",
  role: caregiverProfile ? "CAREGIVER" : "CUSTOMER",
  fullName: "Fatima",
  preferredLanguage: "EN",
  status: "ACTIVE",
  lastLoginAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  caregiverProfile,
});

describe("homeFor", () => {
  it.each([
    ["no caregiver profile", me(null), "/caregiver/onboarding"],
    ["pending verification", me({ id: "cg", verificationStatus: "PENDING" }), "/caregiver/status"],
    ["rejected", me({ id: "cg", verificationStatus: "REJECTED" }), "/caregiver/status"],
    ["approved", me({ id: "cg", verificationStatus: "APPROVED" }), "/caregiver"],
  ] as const)("%s -> %s", (_label, user, href) => {
    expect(homeFor(user)).toBe(href);
  });
});

describe("refreshTokens", () => {
  it("does nothing when signed out", async () => {
    const f = mockFetch();
    await refreshTokens();
    expect(f.calls).toHaveLength(0);
  });

  it("posts /auth/refresh with credentials; the cookies rotate server-side", async () => {
    storeTokens("+923001110011");
    const f = mockFetch(() => json({}, 201));
    await refreshTokens();
    expect(apiPath(f.last())).toBe("/auth/refresh");
    expect(f.last().body).toEqual({});
    expect(f.last().credentials).toBe("include");
    // The session marker is untouched by refresh — only the httpOnly cookies change.
    expect(session.get()).toEqual({ phone: "+923001110011" });
  });

  it("rethrows when the refresh fails", async () => {
    storeTokens("+923001110011");
    mockFetch(() => json({ statusCode: 401, message: "Invalid refresh token" }, 401));
    await expect(refreshTokens()).rejects.toMatchObject({ status: 401, message: "Invalid refresh token" });
  });
});

describe("tokenRole", () => {
  it("reads the role from the cs_session cookie", () => {
    clearSessionCookies();
    expect(tokenRole()).toBeUndefined();
    setSessionCookies("CAREGIVER");
    expect(tokenRole()).toBe("CAREGIVER");
  });
});
