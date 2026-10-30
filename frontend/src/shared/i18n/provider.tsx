"use client";

import { NextIntlClientProvider } from "next-intl";
import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { messages, type Locale } from "./messages";

const EVENT = "caresaath:locale";

interface LocaleControl {
  locale: Locale;
  setLocale: (l: Locale) => void;
}

const LocaleContext = createContext<LocaleControl>({ locale: "en", setLocale: () => {} });

/** Current locale and a setter (persists for the enclosing section). */
export const useLocaleControl = () => useContext(LocaleContext);

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function read(key: string): Locale {
  try {
    return localStorage.getItem(key) === "ur" ? "ur" : "en";
  } catch {
    return "en";
  }
}

/**
 * Provides translations for a section. With `storageKey` the chosen locale is
 * remembered per section (customer and caregiver each have their own); without
 * it the section is English-only (admin). The server always renders English so
 * hydration matches; the stored locale applies right after.
 */
export function LocaleProvider({ storageKey, children }: { storageKey?: string; children: React.ReactNode }) {
  const locale = useSyncExternalStore(subscribe, () => (storageKey ? read(storageKey) : "en"), () => "en" as Locale);

  const setLocale = useCallback(
    (l: Locale) => {
      if (!storageKey) return;
      try {
        localStorage.setItem(storageKey, l);
      } catch {
        // storage unavailable; locale lasts for this page only
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [storageKey],
  );

  // Portals (modals, menus, toasts) render outside this tree, so direction is set on <html>.
  useEffect(() => {
    if (!storageKey) return;
    const html = document.documentElement;
    html.lang = locale;
    html.dir = locale === "ur" ? "rtl" : "ltr";
    return () => {
      html.lang = "en";
      html.dir = "ltr";
    };
  }, [locale, storageKey]);

  const control = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return (
    <LocaleContext.Provider value={control}>
      <NextIntlClientProvider locale={locale} messages={messages[locale]} timeZone="Asia/Karachi">
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}
