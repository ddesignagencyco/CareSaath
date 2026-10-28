/**
 * Translation messages, one JSON file per namespace and locale. The shared,
 * customer and caregiver files are copied from the web app
 * (CareSath/frontend/src/shared/i18n/messages) so both clients say the same
 * thing; `mobile*` hold strings only the app needs.
 *
 * Urdu is deep-merged over English, so an untranslated key falls back to
 * English instead of showing a raw key.
 */
import apiErrorsEn from './en/apiErrors.json';
import caregiverAEn from './en/caregiverA.json';
import caregiverBEn from './en/caregiverB.json';
import commonEn from './en/common.json';
import customerAEn from './en/customerA.json';
import customerBEn from './en/customerB.json';
import labelsEn from './en/labels.json';
import mobileEn from './en/mobile.json';
import mobileCaregiverEn from './en/mobileCaregiver.json';
import mobileCustomerEn from './en/mobileCustomer.json';
import sharedEn from './en/shared.json';
import apiErrorsUr from './ur/apiErrors.json';
import caregiverAUr from './ur/caregiverA.json';
import caregiverBUr from './ur/caregiverB.json';
import commonUr from './ur/common.json';
import customerAUr from './ur/customerA.json';
import customerBUr from './ur/customerB.json';
import labelsUr from './ur/labels.json';
import mobileUr from './ur/mobile.json';
import mobileCaregiverUr from './ur/mobileCaregiver.json';
import mobileCustomerUr from './ur/mobileCustomer.json';
import sharedUr from './ur/shared.json';

export type Messages = { [key: string]: string | Messages };

const en: Messages = {
  common: commonEn,
  labels: labelsEn,
  shared: sharedEn,
  apiErrors: apiErrorsEn,
  customerA: customerAEn,
  customerB: customerBEn,
  caregiverA: caregiverAEn,
  caregiverB: caregiverBEn,
  mobile: mobileEn,
  mobileCustomer: mobileCustomerEn,
  mobileCaregiver: mobileCaregiverEn,
};

const urOnly: Messages = {
  common: commonUr,
  labels: labelsUr,
  shared: sharedUr,
  apiErrors: apiErrorsUr,
  customerA: customerAUr,
  customerB: customerBUr,
  caregiverA: caregiverAUr,
  caregiverB: caregiverBUr,
  mobile: mobileUr,
  mobileCustomer: mobileCustomerUr,
  mobileCaregiver: mobileCaregiverUr,
};

function deepMerge(base: Messages, over: Messages): Messages {
  const out: Messages = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = base[k];
    out[k] = typeof v === 'object' && typeof b === 'object' ? deepMerge(b, v) : v;
  }
  return out;
}

export const MESSAGES = { en, ur: deepMerge(en, urOnly) };
