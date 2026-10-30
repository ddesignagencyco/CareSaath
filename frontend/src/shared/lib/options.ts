import type { SelectOption } from "../ui/select";
import { DOC_TYPE_LABEL, LICENSE_BODY_LABEL, SPECIALTY_LABEL } from "./format";
import type { DocType, LicenseBody, Specialty } from "../types";

export const SPECIALTY_OPTIONS: SelectOption<Specialty>[] = [
  { value: "NURSING", label: SPECIALTY_LABEL.NURSING, description: "Injections, IV, wound care, vitals" },
  { value: "PHYSIOTHERAPY", label: SPECIALTY_LABEL.PHYSIOTHERAPY, description: "Rehab, mobility, post-stroke therapy" },
  { value: "POST_SURGERY_CARE", label: SPECIALTY_LABEL.POST_SURGERY_CARE, description: "Dressings, drains, recovery support" },
  { value: "ELDERLY_CARE", label: SPECIALTY_LABEL.ELDERLY_CARE, description: "Daily care and companionship" },
  { value: "DOCTOR", label: SPECIALTY_LABEL.DOCTOR, description: "Diagnosis, prescriptions, lab orders" },
];

export const LICENSE_BODY_OPTIONS: SelectOption<LicenseBody>[] = [
  { value: "PNC", label: LICENSE_BODY_LABEL.PNC, description: "Nurses" },
  { value: "PMDC", label: LICENSE_BODY_LABEL.PMDC, description: "Doctors and some allied health" },
  { value: "OTHER", label: "Other professional body", description: "e.g. physiotherapy association" },
];

export const DOC_TYPE_OPTIONS: SelectOption<DocType>[] = (["LICENSE", "CERTIFICATE", "CNIC_COPY", "OTHER"] as DocType[]).map((t) => ({
  value: t,
  label: DOC_TYPE_LABEL[t],
}));

/** Pilot launch is Lahore only for now; add more cities here as the pilot expands. */
export const CITY_OPTIONS: SelectOption<string>[] = ["Lahore"].map((c) => ({ value: c, label: c }));

/** "3520112345671" or partial -> "35201-1234567-1" as the user types. */
export function formatCnic(input: string): string {
  const d = input.replace(/\D/g, "").slice(0, 13);
  if (d.length <= 5) return d;
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
}

export const CNIC_PATTERN = /^\d{5}-\d{7}-\d$/;

/** City centres, used as a default map pin when the device location isn't shared. */
export const CITY_CENTRES: Record<string, { lat: string; lng: string }> = {
  Lahore: { lat: "31.520400", lng: "74.358700" },
  Islamabad: { lat: "33.684400", lng: "73.047900" },
  Rawalpindi: { lat: "33.565100", lng: "73.016900" },
  Karachi: { lat: "24.860700", lng: "67.001100" },
  Faisalabad: { lat: "31.450400", lng: "73.135000" },
  Multan: { lat: "30.157500", lng: "71.524900" },
  Peshawar: { lat: "34.015100", lng: "71.524900" },
  Gujranwala: { lat: "32.187700", lng: "74.194500" },
  Sialkot: { lat: "32.494500", lng: "74.522900" },
};

/**
 * Well-known Lahore areas with approximate centre coordinates. Caregivers pick these as sub-city
 * coverage zones (Option A — no interactive map picker; the chosen area's lat/lng is sent with a radius).
 * Pilot-scale approximations; the default 5 km radius comfortably absorbs the imprecision.
 */
export const LAHORE_AREAS: { value: string; label: string; lat: number; lng: number }[] = [
  { value: "Johar Town", label: "Johar Town", lat: 31.4697, lng: 74.2728 },
  { value: "DHA (Defence)", label: "DHA (Defence)", lat: 31.4704, lng: 74.412 },
  { value: "Gulberg", label: "Gulberg", lat: 31.5204, lng: 74.3587 },
  { value: "Model Town", label: "Model Town", lat: 31.4818, lng: 74.32 },
  { value: "Allama Iqbal Town", label: "Allama Iqbal Town", lat: 31.51, lng: 74.28 },
  { value: "Garden Town", label: "Garden Town", lat: 31.493, lng: 74.314 },
  { value: "Faisal Town", label: "Faisal Town", lat: 31.485, lng: 74.308 },
  { value: "Wapda Town", label: "Wapda Town", lat: 31.43, lng: 74.26 },
  { value: "Bahria Town", label: "Bahria Town", lat: 31.3684, lng: 74.181 },
  { value: "Cantt", label: "Cantt", lat: 31.5497, lng: 74.3936 },
  { value: "Township", label: "Township", lat: 31.458, lng: 74.31 },
  { value: "Samanabad", label: "Samanabad", lat: 31.538, lng: 74.302 },
  { value: "Shadman", label: "Shadman", lat: 31.544, lng: 74.326 },
  { value: "Walled City (Old Lahore)", label: "Walled City (Old Lahore)", lat: 31.582, lng: 74.31 },
];

/** Coverage radius choices (metres) for a sub-city service zone. */
export const SERVICE_RADIUS_OPTIONS: SelectOption<string>[] = [
  { value: "3000", label: "3 km" },
  { value: "5000", label: "5 km" },
  { value: "10000", label: "10 km" },
  { value: "15000", label: "15 km" },
];
