import { describe, expect, it, vi } from "vitest";
import { apiPath, clearSessionCookies, json, mockFetch, setSessionCookies } from "@/test/utils";
import { ApiError, checkHealth, createHttp, NETWORK_ERROR } from "./http";
import { createSessionStore } from "./session";

const EVENT = "caresaath:test-session";

/**
 * Cookie-auth: a "signed-in" session is the phone marker plus the JS-readable
 * cs_session/cs_csrf cookies (the httpOnly token cookies are invisible to JS and
 * to jsdom, so the mock fetch simply records `credentials: "include"`).
 */
function setup(signedIn = true) {
  const store = createSessionStore("caresaath.test.session", EVENT);
  if (signedIn) {
    store.set({ phone: "+923001110001" });
    setSessionCookies("CUSTOMER");
  } else {
    store.clear();
    clearSessionCookies();
  }
  return { store, http: createHttp(store) };
}

const unauthorized = () => json({ statusCode: 401, message: "Invalid or expired access token" }, 401);

describe("createHttp: requests", () => {
  it("sends JSON with credentials and the CSRF header, and drops empty query params", async () => {
    const { http } = setup();
    const f = mockFetch(() => json({ ok: true }));
    const res = await http.post<{ ok: boolean }>("/customer/bookings", { a: 1 });
    expect(res).toEqual({ ok: true });
    const c = f.last();
    expect(c.method).toBe("POST");
    expect(c.url.origin + c.url.pathname).toBe("http://api.test/api/v1/customer/bookings");
    // Cookie-auth: cookies ride along via credentials; the CSRF cookie is mirrored into a header.
    expect(c.credentials).toBe("include");
    expect(c.headers["X-CSRF-Token"]).toBe("test-csrf");
    expect(c.headers["Content-Type"]).toBe("application/json");
    expect(c.body).toEqual({ a: 1 });

    await http.get("/caregivers", { city: "Lahore", specialty: undefined, page: 1, q: "", x: null });
    expect(Object.fromEntries(f.last().url.searchParams)).toEqual({ city: "Lahore", page: "1" });
  });

  it("sends credentials but no CSRF or Content-Type header for a GET", async () => {
    const { http } = setup(false);
    const f = mockFetch(() => json([]));
    await http.get("/caregivers");
    expect(f.last().credentials).toBe("include");
    expect(f.last().headers["X-CSRF-Token"]).toBeUndefined();
    expect(f.last().headers["Content-Type"]).toBeUndefined();
  });

  it("uploads multipart without setting Content-Type (browser adds the boundary)", async () => {
    const { http } = setup();
    const f = mockFetch(() => json({ id: "d1" }, 201));
    const file = new File(["%PDF"], "license.pdf", { type: "application/pdf" });
    await http.upload("/caregiver/documents", file, { type: "LICENSE" });
    const c = f.last();
    expect(c.headers["Content-Type"]).toBeUndefined();
    expect(c.body).toBeInstanceOf(FormData);
    const form = c.body as FormData;
    expect((form.get("file") as File).name).toBe("license.pdf");
    expect(form.get("type")).toBe("LICENSE");
  });

  it("parses 204, JSON with an empty body, and text (CSV) responses", async () => {
    const { http } = setup();
    mockFetch(() => new Response(null, { status: 204 }));
    expect(await http.delete("/customer/addresses/a1")).toBeUndefined();
    mockFetch(() => new Response("", { status: 200, headers: { "Content-Type": "application/json" } }));
    expect(await http.post("/auth/logout", { refreshToken: "R1" })).toBeUndefined();
    mockFetch(() => new Response("id,amount\n1,600", { headers: { "Content-Type": "text/csv; charset=utf-8" } }));
    expect(await http.get<string>("/admin/reports/export")).toBe("id,amount\n1,600");
  });
});

describe("createHttp: errors", () => {
  it("throws ApiError with the Nest message (arrays joined)", async () => {
    const { http } = setup();
    mockFetch(() => json({ statusCode: 400, error: "Bad Request", message: ["phone must be valid", "code is required"] }, 400));
    const err = (await http.post("/auth/otp/verify", {}).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.message).toBe("phone must be valid, code is required");
  });

  it("falls back to the status text when the body is not JSON", async () => {
    const { http } = setup();
    mockFetch(() => new Response("<html>", { status: 502, statusText: "Bad Gateway" }));
    await expect(http.get("/health")).rejects.toMatchObject({ status: 502, message: "Bad Gateway" });
  });

  it("maps network failures to ApiError(0, NETWORK_ERROR)", async () => {
    const { http } = setup();
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(http.get("/customer/me")).rejects.toMatchObject({ status: 0, message: NETWORK_ERROR });
  });
});

describe("createHttp: token refresh", () => {
  it("refreshes once on a token-expiry 401 and retries (cookies swap server-side)", async () => {
    const { http, store } = setup();
    // No token in the body/header — the backend rotates the httpOnly cookies.
    // The mock flips once /auth/refresh is hit, so the retry succeeds.
    let refreshed = false;
    const f = mockFetch((c) => {
      if (apiPath(c) === "/auth/refresh") {
        refreshed = true;
        return json({}, 201);
      }
      return refreshed ? json({ id: "me" }) : unauthorized();
    });

    await expect(http.get("/customer/me")).resolves.toEqual({ id: "me" });
    expect(f.calls.map((c) => `${c.method} ${apiPath(c)}`)).toEqual(["GET /customer/me", "POST /auth/refresh", "GET /customer/me"]);
    expect(f.calls[1].body).toEqual({});
    expect(f.calls[1].headers.Authorization).toBeUndefined();
    expect(f.calls[1].credentials).toBe("include");
    // A successful refresh leaves the session marker untouched (only the cookies change).
    expect(store.get()).toMatchObject({ phone: "+923001110001" });
  });

  it("shares one refresh between concurrent 401s", async () => {
    const { http } = setup();
    let refreshed = false;
    const f = mockFetch((c) => {
      if (apiPath(c) === "/auth/refresh") {
        refreshed = true;
        return json({});
      }
      return refreshed ? json({ path: apiPath(c) }) : unauthorized();
    });
    const results = await Promise.all([http.get("/a"), http.get("/b"), http.get("/c")]);
    expect(results).toEqual([{ path: "/a" }, { path: "/b" }, { path: "/c" }]);
    expect(f.calls.filter((c) => apiPath(c) === "/auth/refresh")).toHaveLength(1);
  });

  it("clears the session and rethrows when the refresh is rejected", async () => {
    const { http, store } = setup();
    mockFetch((c) =>
      apiPath(c) === "/auth/refresh" ? json({ statusCode: 401, message: "Refresh token already used" }, 401) : unauthorized(),
    );
    await expect(http.get("/customer/me")).rejects.toMatchObject({ status: 401, message: "Invalid or expired access token" });
    expect(store.get()).toBeNull();
  });

  it("does not refresh or resend on business 401s (e.g. a wrong check-in OTP)", async () => {
    const { http, store } = setup();
    const f = mockFetch(() => json({ statusCode: 401, message: "Invalid check-in OTP" }, 401));
    await expect(http.post("/caregiver/visits/v1/check-in", { method: "OTP", code: "000000" })).rejects.toMatchObject({
      status: 401,
      message: "Invalid check-in OTP",
    });
    expect(f.calls).toHaveLength(1);
    expect(store.get()?.phone).toBe("+923001110001");
  });

  it("never refreshes for /auth/* routes or when signed out", async () => {
    const signedIn = setup();
    const f = mockFetch(() => json({ statusCode: 401, message: "Invalid OTP" }, 401));
    await expect(signedIn.http.post("/auth/otp/verify", { phone: "+923001110001", code: "000000" })).rejects.toMatchObject({ message: "Invalid OTP" });
    signedIn.store.clear();
    const anonymous = setup(false);
    await expect(anonymous.http.get("/customer/me")).rejects.toMatchObject({ status: 401 });
    expect(f.calls.some((c) => apiPath(c) === "/auth/refresh")).toBe(false);
  });
});

describe("checkHealth", () => {
  it("returns the health payload and throws on 503", async () => {
    mockFetch(() => json({ status: "ok", postgres: true, redis: true }));
    await expect(checkHealth()).resolves.toEqual({ status: "ok", postgres: true, redis: true });
    mockFetch(() => json({ statusCode: 503, message: "Redis unavailable" }, 503));
    await expect(checkHealth()).rejects.toMatchObject({ status: 503, message: "Redis unavailable" });
  });
});
