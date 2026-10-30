/**
 * Translation messages, one JSON file per namespace and locale.
 *
 * - common / labels / shared / apiErrors: design system and cross-section text
 * - adminA / adminB / caregiverA / caregiverB / customerA / customerB: section screens
 *
 * Urdu is deep-merged over English, so any untranslated key falls back to
 * English instead of showing a raw key.
 */
import adminAEn from "./en/adminA.json";
import adminBEn from "./en/adminB.json";
import apiErrorsEn from "./en/apiErrors.json";
import caregiverAEn from "./en/caregiverA.json";
import caregiverBEn from "./en/caregiverB.json";
import commonEn from "./en/common.json";
import customerAEn from "./en/customerA.json";
import customerBEn from "./en/customerB.json";
import labelsEn from "./en/labels.json";
import sharedEn from "./en/shared.json";
import adminAUr from "./ur/adminA.json";
import adminBUr from "./ur/adminB.json";
import apiErrorsUr from "./ur/apiErrors.json";
import caregiverAUr from "./ur/caregiverA.json";
import caregiverBUr from "./ur/caregiverB.json";
import commonUr from "./ur/common.json";
import customerAUr from "./ur/customerA.json";
import customerBUr from "./ur/customerB.json";
import labelsUr from "./ur/labels.json";
import sharedUr from "./ur/shared.json";

export type Locale = "en" | "ur";

export const en = {
  common: commonEn,
  labels: labelsEn,
  shared: sharedEn,
  apiErrors: apiErrorsEn,
  adminA: adminAEn,
  adminB: adminBEn,
  caregiverA: caregiverAEn,
  caregiverB: caregiverBEn,
  customerA: customerAEn,
  customerB: customerBEn,
};

export type Messages = typeof en;

type Json = { [key: string]: Json } | string;

function deepMerge(base: Json, over: Json): Json {
  if (typeof base === "string" || typeof over === "string") return over ?? base;
  const out: { [key: string]: Json } = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = k in base ? deepMerge(base[k], v) : v;
  return out;
}

const ur = deepMerge(en as unknown as Json, {
  common: commonUr,
  labels: labelsUr,
  shared: sharedUr,
  apiErrors: apiErrorsUr,
  adminA: adminAUr,
  adminB: adminBUr,
  caregiverA: caregiverAUr,
  caregiverB: caregiverBUr,
  customerA: customerAUr,
  customerB: customerBUr,
} as unknown as Json) as unknown as Messages;

export const messages: Record<Locale, Messages> = { en, ur };
