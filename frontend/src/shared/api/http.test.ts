import { describe, expect, it, vi } from "vitest";
import { apiPath, json, mockFetch } from "@/test/utils";
import { ApiError, checkHealth, createHttp, NETWORK_ERROR } from "./http";
import { createSessionStore } from "./session";

const EVENT = "caresaath:test-session";

function setup(session: { accessToken: string; refreshToken: string } | null = { accessToken: "A1", refreshToken: "R1" }) {
  const store = createSessionStore("caresaath.test.session", EVENT);
  if (session) store.set({ ...session, phone: "+923001110001" });
  return { store, http: createHttp(store) };
}

const unauthorized = () => json({ statusCode: 401, message: "Invalid or expired access token" }, 401);

describe("createHttp: requests", () => {
  it("sends JSON with the bearer token and drops empty query params", async () => {
    const { http } = setup();
    const f = mockFetch(() => json({ ok: true }));
    const res = await http.post<{ ok: boolean }>("/customer/bookings", { a: 1 });
    expect(res).toEqual({ ok: true });
    const c = f.last();
    expect(c.method).toBe("POST");
    expect(c.url.origin + c.url.pathname).toBe("http://api.test/api/v1/customer/bookings");
    expect(c.headers.Authorization).toBe("Bearer A1");
    expect(c.headers["Content-Type"]).toBe("application/json");
    expect(c.body).toEqual({ a: 1 });

    await http.get("/caregivers", { city: "Lahore", specialty: undefined, page: 1, q: "", x: null });
    expect(Object.fromEntries(f.last().url.searchParams)).toEqual({ city: "Lahore", page: "1" });
  });

  it("sends no Authorization header when signed out, and no Content-Type for GET", async () => {
    const { http } = setup(null);
    const f = mockFetch(() => json([]));
    await http.get("/caregivers");
    expect(f.last().headers.Authorization).toBeUndefined();
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
  it("refreshes once on 401, stores the rotated pair, notifies, and retries", async () => {
    const { http, store } = setup();
    const onSession = vi.fn();
    window.addEventListener(EVENT, onSession);
    const f = mockFetch((c) => {
      if (apiPath(c) === "/auth/refresh") return json({ accessToken: "A2", refreshToken: "R2" }, 201);
      return c.headers.Authorization === "Bearer A2" ? json({ id: "me" }) : unauthorized();
    });

    await expect(http.get("/customer/me")).resolves.toEqual({ id: "me" });
    expect(f.calls.map((c) => `${c.method} ${apiPath(c)}`)).toEqual(["GET /customer/me", "POST /auth/refresh", "GET /customer/me"]);
    expect(f.calls[1].body).toEqual({ refreshToken: "R1" });
    expect(f.calls[1].headers.Authorization).toBeUndefined();
    expect(store.get()).toMatchObject({ accessToken: "A2", refreshToken: "R2", phone: "+923001110001" });
    expect(onSession).toHaveBeenCalled();
    window.removeEventListener(EVENT, onSession);
  });

  it("shares one refresh between concurrent 401s", async () => {
    const { http } = setup();
    const f = mockFetch((c) => {
      if (apiPath(c) === "/auth/refresh") return json({ accessToken: "A2", refreshToken: "R2" });
      return c.headers.Authorization === "Bearer A2" ? json({ path: apiPath(c) }) : unauthorized();
    });
    const results = await Promise.all([http.get("/a"), http.get("/b"), http.get("/c")]);
    expect(results).toEqual([{ path: "/a" }, { path: "/b" }, { path: "/c" }]);
    expect(f.calls.filter((c) => apiPath(c) === "/auth/refresh")).toHaveLength(1);
  });

  it("uses a pair another tab already rotated instead of burning the old refresh token", async () => {
    const { http, store } = setup();
    let first = true;
    const f = mockFetch((c) => {
      if (first) {
        first = false;
        // Another tab rotates while this request is in flight.
        store.set({ accessToken: "A9", refreshToken: "R9", phone: "+923001110001" });
        return unauthorized();
      }
      return c.headers.Authorization === "Bearer A9" ? json({ ok: true }) : unauthorized();
    });
    await expect(http.get("/customer/me")).resolves.toEqual({ ok: true });
    expect(f.calls.some((c) => apiPath(c) === "/auth/refresh")).toBe(false);
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
    expect(store.get()?.refreshToken).toBe("R1");
  });

  it("never refreshes for /auth/* routes or when signed out", async () => {
    const signedIn = setup();
    const f = mockFetch(() => json({ statusCode: 401, message: "Invalid OTP" }, 401));
    await expect(signedIn.http.post("/auth/otp/verify", { phone: "+923001110001", code: "000000" })).rejects.toMatchObject({ message: "Invalid OTP" });
    signedIn.store.clear();
    const anonymous = setup(null);
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
