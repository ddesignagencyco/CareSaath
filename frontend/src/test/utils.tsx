import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import { vi } from "vitest";
import { LocaleProvider } from "@shared/i18n/provider";
import { ToastProvider } from "@shared/ui/toast";

/**
 * Render with the same providers the app uses: React Query (no retries),
 * translations (per-section locale storage key) and toasts.
 */
export function renderWithProviders(
  ui: React.ReactElement,
  { storageKey = "caresaath.test.locale", ...options }: RenderOptions & { storageKey?: string } = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>
      <LocaleProvider storageKey={storageKey}>
        <ToastProvider>{children}</ToastProvider>
      </LocaleProvider>
    </QueryClientProvider>
  );
  return { client, ...render(ui, { wrapper: Wrapper, ...options }) };
}

export interface RecordedCall {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body: unknown;
}

type Responder = (call: RecordedCall) => Response | Promise<Response>;

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

/**
 * Replace global fetch. Every request is recorded (method, parsed URL, headers,
 * JSON-decoded body or the FormData itself); `respond` decides the response
 * (default: 200 `{}`).
 */
export function mockFetch(respond: Responder = () => json({})) {
  const calls: RecordedCall[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>));
    let body: unknown = init.body;
    if (typeof init.body === "string") body = JSON.parse(init.body);
    const call: RecordedCall = { method: init.method ?? "GET", url: new URL(String(input)), headers, body };
    calls.push(call);
    return respond(call);
  });
  vi.stubGlobal("fetch", fn);
  return { calls, fn, last: () => calls[calls.length - 1] };
}

/** Path relative to the API base, e.g. "/customer/bookings". */
export const apiPath = (call: RecordedCall) => call.url.pathname.replace(/^\/api\/v1/, "");

/** A syntactically valid (unsigned) JWT carrying `payload`. */
export function fakeJwt(payload: Record<string, unknown>): string {
  const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc(payload)}.sig`;
}
