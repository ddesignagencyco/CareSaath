/**
 * Fetch wrapper for the NestJS API (`/api/v1`). Each section creates one client
 * bound to its own session store.
 *
 * Access tokens live 15 minutes. On a 401 the client exchanges the refresh
 * token once (POST /auth/refresh, which rotates it), stores the new pair and
 * retries the request; if that fails the session is cleared and the section
 * shell sends the user to its login page.
 */
import type { TokenPair } from "./types";
import { API_BASE_URL, USE_MOCKS } from "./config";
import type { SessionStore } from "./session";
import ReactNativeBlobUtil from "react-native-blob-util";

export { API_BASE_URL, USE_MOCKS };

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

/** RN's URL polyfill has no working searchParams, so build the query by hand. */
function buildUrl(path: string, query?: Query): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query ?? {}) as [string, unknown][]) {
    if (value !== undefined && value !== null && value !== "") parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return `${API_BASE_URL}${path}${parts.length ? `?${parts.join("&")}` : ""}`;
}

/** A picked file as React Native's FormData expects it. */
export interface UploadFile {
  uri: string;
  name: string;
  type: string;
  size: number;
}

/** Extra request options for raw uploads (resumable chunks). */
interface SendInit {
  headers?: Record<string, string>;
  /** Aborting it (pause) rejects with ApiError(0) like a dropped connection. */
  signal?: AbortSignal;
}

async function send(method: string, url: string, token: string | undefined, body?: unknown, init: SendInit = {}): Promise<Response> {
  const isForm = body instanceof FormData;
  const isBlob = typeof Blob !== "undefined" && body instanceof Blob;
  // No response in 20 s (3G stall) counts as a network error instead of spinning forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), isForm || isBlob ? 60_000 : 20_000);
  const onAbort = () => controller.abort();
  init.signal?.addEventListener("abort", onAbort);
  try {
    return await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        // Let fetch set the multipart boundary for FormData.
        ...(isForm || isBlob || body === undefined ? {} : { "Content-Type": "application/json" }),
        // ngrok's free tunnel shows an HTML warning page unless this is set.
        "ngrok-skip-browser-warning": "1",
        ...init.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : isForm || isBlob ? (body as FormData | Blob) : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, NETWORK_ERROR);
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", onAbort);
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
    // Another request already rotated the pair: just use the new one.
    if (current.refreshToken !== usedRefreshToken) return true;
    const res = await send("POST", buildUrl("/auth/refresh"), undefined, { refreshToken: current.refreshToken }).catch(() => null);
    if (!res?.ok) {
      // Another request may have rotated it while this request was in flight.
      const latest = store.get();
      if (latest && latest.refreshToken !== current.refreshToken) return true;
      store.clear();
      return false;
    }
    const tokens = (await res.json()) as TokenPair;
    store.set({ ...current, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
    return true;
  }

  async function request<T>(method: string, path: string, body?: unknown, query?: Query, init?: SendInit): Promise<T> {
    const url = buildUrl(path, query);
    const before = store.get();
    let res = await send(method, url, before?.accessToken, body, init);

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
      res = await send(method, url, store.get()?.accessToken, body, init);
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
    upload: <T>(path: string, file: UploadFile, fields: Record<string, string> = {}) => {
      const form = new FormData();
      // RN FormData accepts a { uri, name, type } descriptor in place of a Blob.
      form.append("file", { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
      for (const [k, v] of Object.entries(fields)) form.append(k, v);
      return request<T>("POST", path, form);
    },
    /**
     * Downloads a file the API streams (PDF receipts) into the app cache and
     * opens it in the phone's viewer. Same token refresh as other calls.
     */
    openFile: async (path: string, fileName: string, mime = "application/pdf"): Promise<void> => {
      const dest = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${fileName}`;
      const get = (token?: string) =>
        ReactNativeBlobUtil.config({ path: dest, overwrite: true }).fetch("GET", buildUrl(path), {
          "ngrok-skip-browser-warning": "1",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        });
      const before = store.get();
      let res = await get(before?.accessToken).catch(() => {
        throw new ApiError(0, NETWORK_ERROR);
      });
      if (res.info().status === 401 && before?.refreshToken) {
        refreshing ??= refresh(before.refreshToken).finally(() => {
          refreshing = null;
        });
        if (await refreshing) res = await get(store.get()?.accessToken);
      }
      const status = res.info().status;
      if (status >= 400) {
        // Error bodies are JSON ({ message }); they were written to the file.
        let message = "Request failed";
        try {
          const data = JSON.parse(await ReactNativeBlobUtil.fs.readFile(dest, "utf8")) as { message?: string | string[] };
          message = Array.isArray(data.message) ? data.message.join(", ") : data.message ?? message;
        } catch {
          // not JSON
        }
        await ReactNativeBlobUtil.fs.unlink(dest).catch(() => undefined);
        throw new ApiError(status, message);
      }
      await ReactNativeBlobUtil.android.actionViewIntent(dest, mime);
    },
    /** Raw bytes with extra headers, e.g. one chunk of a resumable upload. */
    raw: <T>(method: string, path: string, body: Blob, headers: Record<string, string>, signal?: AbortSignal) =>
      request<T>(method, path, body, undefined, { headers, signal }),
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
