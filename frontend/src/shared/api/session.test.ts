import { describe, expect, it, vi } from "vitest";
import { fakeJwt } from "@/test/utils";
import { createSessionStore, decodeToken } from "./session";

const KEY = "caresaath.test.session";
const EVENT = "caresaath:test-session";
const SESSION = { accessToken: "A", refreshToken: "R", phone: "+923001234567" };

describe("createSessionStore", () => {
  it("round-trips through localStorage and announces every change", () => {
    const store = createSessionStore(KEY, EVENT);
    const heard = vi.fn();
    window.addEventListener(EVENT, heard);
    try {
      expect(store.key).toBe(KEY);
      expect(store.get()).toBeNull();

      store.set(SESSION);
      expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(SESSION);
      expect(store.get()).toEqual(SESSION);
      expect(heard).toHaveBeenCalledTimes(1);

      store.clear();
      expect(localStorage.getItem(KEY)).toBeNull();
      expect(store.get()).toBeNull();
      expect(heard).toHaveBeenCalledTimes(2);
    } finally {
      window.removeEventListener(EVENT, heard);
    }
  });

  it("returns null for corrupt JSON", () => {
    localStorage.setItem(KEY, "{not json");
    expect(createSessionStore(KEY).get()).toBeNull();
  });

  it("works without an event name and keeps sections apart", () => {
    const a = createSessionStore("caresaath.a.session");
    const b = createSessionStore("caresaath.b.session");
    a.set(SESSION);
    expect(b.get()).toBeNull();
  });
});

describe("decodeToken", () => {
  it("decodes the payload", () => {
    const payload = { sub: "u1", role: "CUSTOMER", phone: "+923001234567", type: "access" };
    expect(decodeToken(fakeJwt(payload))).toEqual(payload);
  });

  it("handles base64url characters (- and _)", () => {
    // "?>" / "?~" style bytes encode to "+" and "/" in base64; JWTs use "-" and "_".
    const payload = { sub: "ü>?~", role: "ADMIN" };
    const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(payload))));
    expect(b64).toMatch(/[+/]/);
    const url = b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const decoded = decodeToken(`h.${url}.s`);
    expect(decoded?.role).toBe("ADMIN");
  });

  it.each(["", "garbage", "a.b.c", "a.!!!.c"])("returns null for %j", (token) => {
    expect(decodeToken(token)).toBeNull();
  });
});
