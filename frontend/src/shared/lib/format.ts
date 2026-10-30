import type {
  DocType,
  IncidentSource,
  LicenseBody,
  PayoutAccountType,
  Specialty,
} from "../types";

const pkr = new Intl.NumberFormat("en-PK", {
  style: "currency",
  currency: "PKR",
  maximumFractionDigits: 0,
});

/** API money is integer paisa; display whole rupees. */
export function formatMoney(paisa: number): string {
  return pkr.format(paisa / 100);
}

export function formatCompactMoney(paisa: number): string {
  const rupees = paisa / 100;
  if (rupees >= 1_000_000) return `Rs ${(rupees / 1_000_000).toFixed(1)}M`;
  if (rupees >= 1_000) return `Rs ${(rupees / 1_000).toFixed(1)}K`;
  return `Rs ${rupees.toFixed(0)}`;
}

export function formatPercent(ratio: number, digits = 1): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

/** Days from now until `iso`; negative when in the past. */
export function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** "IN_REVIEW" -> "In review" */
export function humanize(value: string): string {
  const s = value.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const SPECIALTY_LABEL: Record<Specialty, string> = {
  NURSING: "Nursing",
  PHYSIOTHERAPY: "Physiotherapy",
  POST_SURGERY_CARE: "Post-surgery care",
  ELDERLY_CARE: "Elderly care",
  DOCTOR: "Doctor",
};

export const LICENSE_BODY_LABEL: Record<LicenseBody, string> = {
  PNC: "Pakistan Nursing Council",
  PMDC: "Pakistan Medical & Dental Council",
  OTHER: "Other body",
};

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  LICENSE: "Professional license",
  CERTIFICATE: "Certificate",
  CNIC_COPY: "CNIC copy",
  OTHER: "Other document",
};

export const INCIDENT_SOURCE_LABEL: Record<IncidentSource, string> = {
  CUSTOMER_COMPLAINT: "Customer complaint",
  CAREGIVER_REPORT: "Caregiver report",
  SOS: "SOS alert",
};

export const PAYMENT_METHOD_LABEL: Record<"CASH" | "CARD" | "JAZZCASH" | "EASYPAISA", string> = {
  CASH: "Cash",
  CARD: "Card",
  JAZZCASH: "JazzCash",
  EASYPAISA: "Easypaisa",
};

export const PAYOUT_ACCOUNT_LABEL: Record<PayoutAccountType, string> = {
  BANK: "Bank account",
  MOBILE_WALLET: "Mobile wallet",
};
