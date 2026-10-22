/**
 * Fetch wrapper for the NestJS API (`/api/v1`). Each section creates one client
 * bound to its own session store.
 *
 * Access tokens live 15 minutes. On a 401 the client exchanges the refresh
 * token once (POST /auth/refresh, which rotates it), stores the new pair and
 * retries the request; if that fails the session is cleared and the section
 * shell sends the user to its login page.
 */
import type { TokenPair } from "../types";
import type { SessionStore } from "./session";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

/** Mocks are on unless explicitly disabled with NEXT_PUBLIC_USE_MOCKS=false. */
export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS !== "false";

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

async function send(method: string, url: string, token: string | undefined, body?: unknown): Promise<Response> {
  const isForm = body instanceof FormData;
  try {
    return await fetch(url, {
      method,
      headers: {
        // Let the browser set the multipart boundary for FormData.
        ...(isForm || body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
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

  async function refresh(usedRefreshToken: string): Promise<boolean> {
    const current = store.get();
    if (!current) return false;
    // Another tab or request already rotated the pair: just use the new one.
    if (current.refreshToken !== usedRefreshToken) return true;
    const res = await send("POST", buildUrl("/auth/refresh"), undefined, { refreshToken: current.refreshToken }).catch(() => null);
    if (!res?.ok) {
      // A tab may have rotated it while this request was in flight.
      const latest = store.get();
      if (latest && latest.refreshToken !== current.refreshToken) return true;
      store.clear();
      return false;
    }
    const tokens = (await res.json()) as TokenPair;
    store.set({ ...current, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
    return true;
  }

  async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
    const url = buildUrl(path, query);
    const before = store.get();
    let res = await send(method, url, before?.accessToken, body);

    if (res.status === 401 && before?.refreshToken && !path.startsWith("/auth/")) {
      const err = await toError(res);
      // Only the JWT guard's 401s mean "token expired". Other 401s are business
      // errors (e.g. "Invalid check-in OTP"): retrying would resend the same
      // input and burn another attempt.
      if (!TOKEN_ERRORS.has(err.message)) throw err;
      refreshing ??= refresh(before.refreshToken).finally(() => {
        refreshing = null;
      });
      if (!(await refreshing)) throw err;
      res = await send(method, url, store.get()?.accessToken, body);
    }

    if (!res.ok) throw await toError(res);
    return parse<T>(res);
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
  };
}

export interface Health {
  status: string;
  postgres: boolean;
  redis: boolean;
}

/** GET /health (public): whether the API, PostgreSQL and Redis are up. */
export async function checkHealth(): Promise<Health> {
  const res = await send("GET", buildUrl("/health"), undefined);
  if (!res.ok) throw await toError(res);
  return parse<Health>(res);
}
