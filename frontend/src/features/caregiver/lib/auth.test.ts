import { describe, expect, it } from "vitest";
import type { Me } from "@shared/caregiver-types";
import { apiPath, fakeJwt, json, mockFetch } from "@/test/utils";
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

  it("stores the rotated pair (keeping the phone) and fires the session event", async () => {
    storeTokens({ accessToken: "A1", refreshToken: "R1" }, "+923001110011");
    let events = 0;
    const onEvent = () => events++;
    window.addEventListener("caresaath:caregiver-session", onEvent);
    const f = mockFetch(() => json({ accessToken: "A2", refreshToken: "R2" }, 201));
    await refreshTokens();
    window.removeEventListener("caresaath:caregiver-session", onEvent);
    expect(apiPath(f.last())).toBe("/auth/refresh");
    expect(f.last().body).toEqual({ refreshToken: "R1" });
    expect(session.get()).toEqual({ accessToken: "A2", refreshToken: "R2", phone: "+923001110011" });
    expect(events).toBeGreaterThan(0);
  });

  it("tolerates a parallel rotation (refresh rejected because the pair already changed)", async () => {
    storeTokens({ accessToken: "A1", refreshToken: "R1" }, "+923001110011");
    mockFetch(() => {
      // A 401 retry or another tab rotated the pair while this refresh was in flight.
      session.set({ accessToken: "A9", refreshToken: "R9", phone: "+923001110011" });
      return json({ statusCode: 401, message: "Refresh token already used" }, 401);
    });
    await expect(refreshTokens()).resolves.toBeUndefined();
    expect(session.get()?.refreshToken).toBe("R9");
  });

  it("rethrows when the refresh fails and nothing rotated", async () => {
    storeTokens({ accessToken: "A1", refreshToken: "R1" }, "+923001110011");
    mockFetch(() => json({ statusCode: 401, message: "Invalid refresh token" }, 401));
    await expect(refreshTokens()).rejects.toMatchObject({ status: 401, message: "Invalid refresh token" });
  });
});

describe("tokenRole", () => {
  it("reads the role from the stored access token", () => {
    expect(tokenRole()).toBeUndefined();
    storeTokens({ accessToken: fakeJwt({ sub: "u1", role: "CAREGIVER" }), refreshToken: "r" }, "+923001110011");
    expect(tokenRole()).toBe("CAREGIVER");
  });
});
