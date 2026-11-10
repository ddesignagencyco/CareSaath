/**
 * Fetch wrapper for the NestJS API (`/api/v1`). Each section creates one client
 * bound to its own session store.
 *
 * Access tokens live 15 minutes. On a 401 the client exchanges the refresh
 * token once (POST /auth/refresh, which rotates it), stores the new pair and
 * retries the request; if that fails the session is cleared and the section
 * shell sends the user to its login page.
 */
import type { SessionStore } from "./session";

/**
 * Shared secret for the API's access gate (backend API_ACCESS_KEY). NEXT_PUBLIC_ means it is
 * readable in the bundle: it deters bots/crawlers only, it is not a login. Empty = gate off.
 */
export const API_ACCESS_KEY = process.env.NEXT_PUBLIC_API_ACCESS_KEY ?? "";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

/** Message used when the API can't be reached at all (translated in apiErrors). */
export const NETWORK_ERROR = "Cannot reach the server. Check your connection.";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** 401 messages from the backend's JwtAuthGuard (common/guards/jwt-auth.guard.ts). */
const TOKEN_ERRORS = new Set(["Missing access token", "Invalid or expired access token"]);

type Query = object;

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`${API_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(query ?? {}) as [string, unknown][]) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/**
 * CSRF double-submit token, held in MEMORY. The backend's readable cs_csrf cookie
 * cannot be read by JS when the API is on a different site (Vercel ↔ Render), so
 * the token is delivered in the auth response bodies and echoed back in a header.
 */
let csrfToken: string | undefined;
export function setCsrf(token: string | undefined): void {
  csrfToken = token || undefined;
}
/** Pick up the CSRF token the backend returns on login/refresh/session responses. */
function captureCsrf(data: unknown): void {
  if (data && typeof data === "object" && typeof (data as { csrfToken?: unknown }).csrfToken === "string") {
    csrfToken = (data as { csrfToken: string }).csrfToken;
  }
}
/** Same-site fallback (e.g. local dev): the readable cs_csrf cookie, if present. */
function readCsrfCookie(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const m = document.cookie.match(/(?:^|;\s*)cs_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : undefined;
}

async function send(method: string, url: string, body?: unknown): Promise<Response> {
  const isForm = body instanceof FormData;
  const headers: Record<string, string> = {
    ...(API_ACCESS_KEY ? { "x-api-key": API_ACCESS_KEY } : {}),
    // Let the browser set the multipart boundary for FormData.
    ...(isForm || body === undefined ? {} : { "Content-Type": "application/json" }),
  };
  // Echo the CSRF token into a header for cookie-authed, state-changing requests.
  if (method !== "GET" && method !== "HEAD") {
    const csrf = csrfToken ?? readCsrfCookie();
    if (csrf) headers["X-CSRF-Token"] = csrf;
  }
  try {
    return await fetch(url, {
      method,
      credentials: "include", // send & receive the httpOnly session cookies
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, NETWORK_ERROR);
  }
}

async function toError(res: Response): Promise<ApiError> {
  // AllExceptionsFilter shape: { statusCode, error, message: string | string[], path, timestamp }
  const data = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
  const message = Array.isArray(data?.message) ? data.message.join(", ") : data?.message;
  return new ApiError(res.status, message || res.statusText || "Request failed");
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const type = res.headers.get("Content-Type") ?? "";
  const text = await res.text();
  if (type.includes("application/json")) return (text ? JSON.parse(text) : undefined) as T;
  return text as T;
}

export function createHttp(store: SessionStore) {
  // One refresh at a time per section; concurrent 401s share it.
  let refreshing: Promise<boolean> | null = null;

  async function refresh(): Promise<boolean> {
    // The refresh token is an httpOnly cookie; the backend reads it and sets a
    // fresh access cookie. The browser swaps the cookies for us — nothing to store,
    // but it returns a rotated CSRF token which we capture for subsequent requests.
    const res = await send("POST", buildUrl("/auth/refresh"), {}).catch(() => null);
    if (!res?.ok) {
      store.clear();
      return false;
    }
    captureCsrf(await res.json().catch(() => null));
    return true;
  }

  async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
    const url = buildUrl(path, query);
    const loggedIn = Boolean(store.get());
    let res = await send(method, url, body);

    if (res.status === 401 && loggedIn && !path.startsWith("/auth/")) {
      const err = await toError(res);
      // Only the JWT guard's 401s mean "token expired". Other 401s are business
      // errors (e.g. "Invalid check-in OTP"): retrying would resend the same
      // input and burn another attempt.
      if (!TOKEN_ERRORS.has(err.message)) throw err;
      refreshing ??= refresh().finally(() => {
        refreshing = null;
      });
      if (!(await refreshing)) throw err;
      res = await send(method, url, body);
    }

    if (!res.ok) throw await toError(res);
    const data = await parse<T>(res);
    captureCsrf(data); // login/signup/firebase responses carry the CSRF token
    return data;
  }

  return {
    get: <T>(path: string, query?: Query) => request<T>("GET", path, undefined, query),
    post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
    put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {}),
    patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body ?? {}),
    delete: <T>(path: string) => request<T>("DELETE", path),
    /** multipart/form-data upload; the backend reads the `file` field. */
    upload: <T>(path: string, file: File, fields: Record<string, string> = {}) => {
      const form = new FormData();
      form.append("file", file);
      for (const [k, v] of Object.entries(fields)) form.append(k, v);
      return request<T>("POST", path, form);
    },
    /** GET a binary response (e.g. a PDF receipt) as a Blob + its Content-Disposition filename. */
    download: async (path: string, query?: Query): Promise<{ blob: Blob; filename: string }> => {
      const url = buildUrl(path, query);
      const loggedIn = Boolean(store.get());
      let res = await send("GET", url);
      if (res.status === 401 && loggedIn && !path.startsWith("/auth/")) {
        const err = await toError(res);
        if (!TOKEN_ERRORS.has(err.message)) throw err;
        refreshing ??= refresh().finally(() => {
          refreshing = null;
        });
        if (!(await refreshing)) throw err;
        res = await send("GET", url);
      }
      if (!res.ok) throw await toError(res);
      const blob = await res.blob();
      const filename = /filename="?([^"]+)"?/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "receipt.pdf";
      return { blob, filename };
    },
    /** Force a token refresh (used by the realtime socket on `auth.expired`). Returns false if there's no session. */
    refreshSession: (): Promise<boolean> => {
      if (!store.get()) return Promise.resolve(false);
      refreshing ??= refresh().finally(() => {
        refreshing = null;
      });
      return refreshing;
    },
  };
}

/**
 * Rehydrate the web session after a reload: returns { phone, role } (and captures
 * the CSRF token) read from the httpOnly cookies via GET /auth/session, or null
 * when signed out. Tries one refresh if the access cookie has expired.
 */
export async function bootstrapSession(): Promise<{ phone: string; role: string } | null> {
  const read = async (): Promise<{ phone: string; role: string } | null> => {
    const res = await send("GET", buildUrl("/auth/session")).catch(() => null);
    if (!res?.ok) return null;
    const d = (await res.json().catch(() => null)) as { phone?: string; role?: string; csrfToken?: string } | null;
    if (!d) return null;
    captureCsrf(d);
    return d.phone && d.role ? { phone: d.phone, role: d.role } : null;
  };
  let d = await read();
  if (!d) {
    const r = await send("POST", buildUrl("/auth/refresh"), {}).catch(() => null);
    if (r?.ok) {
      captureCsrf(await r.json().catch(() => null));
      d = await read();
    }
  }
  return d;
}

/** Save a downloaded Blob to the user's device (browser only). */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface Health {
  status: string;
  postgres: boolean;
  redis: boolean;
}

/** GET /health (public): whether the API, PostgreSQL and Redis are up. */
export async function checkHealth(): Promise<Health> {
  const res = await send("GET", buildUrl("/health"));
  if (!res.ok) throw await toError(res);
  return parse<Health>(res);
}
