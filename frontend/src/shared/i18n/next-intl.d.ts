import type { Locale, Messages } from "./messages";

// Type-safe translation keys: a key missing from the English files fails tsc.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}
