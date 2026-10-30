import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LocaleProvider } from "@shared/i18n/provider";
import { ToastProvider } from "@shared/ui/toast";

/** Storage key used by `renderWithProviders` (default) and the hook wrappers below. */
export const TEST_LOCALE_KEY = "caresaath.test.locale";

/** Persist a locale for the test section before rendering. */
export function storeLocale(locale: "en" | "ur") {
  localStorage.setItem(TEST_LOCALE_KEY, locale);
}

/**
 * Wrapper for renderHook: React Query (no retries) + LocaleProvider (test key) + toasts.
 * Pass a client to inspect it afterwards.
 */
export function providers(client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <LocaleProvider storageKey={TEST_LOCALE_KEY}>
          <ToastProvider>{children}</ToastProvider>
        </LocaleProvider>
      </QueryClientProvider>
    );
  }
  return { client, Wrapper };
}

/** Strip Intl's (narrow) no-break spaces so assertions can use plain spaces. */
export const plain = (s: string | null | undefined) => (s ?? "").replace(/[  ]/g, " ");

/** LTR isolate markers (U+2066 … U+2069). */
export const LRI = "⁦";
export const PDI = "⁩";
