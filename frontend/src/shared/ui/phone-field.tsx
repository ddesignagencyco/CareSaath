"use client";

import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { parsePkMobile, sanitizePhoneInput } from "../lib/phone";
import { Input } from "./field";

export function PakistanFlag() {
  return (
    <svg viewBox="0 0 30 20" className="h-3.5 w-[21px] rounded-[2px] shadow-[0_0_0_1px_rgb(0_0_0/0.08)]" aria-hidden>
      <rect width="30" height="20" fill="#01411c" />
      <rect width="7.5" height="20" fill="#fff" />
      <circle cx="19.5" cy="10" r="5.4" fill="#fff" />
      <circle cx="21" cy="8.9" r="4.6" fill="#01411c" />
      <path d="m22.6 6.3.55 1.5 1.6.05-1.27.98.45 1.53-1.33-.9-1.33.9.45-1.53-1.27-.98 1.6-.05z" fill="#fff" />
    </svg>
  );
}

/** Pakistani mobile input (+92 prefix, strict validation via parsePkMobile). */
export function PhoneField({
  id = "phone",
  label,
  value,
  onChange,
  error,
  onBlur,
  autoFocus,
}: {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  onBlur?: () => void;
  autoFocus?: boolean;
}) {
  const t = useTranslations("shared.phone");
  const valid = parsePkMobile(value).ok;
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold text-ink-800">
        {label ?? t("label")}
      </label>
      {/* Phone numbers always read left to right, even in Urdu. */}
      <div className="relative" dir="ltr">
        <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center gap-2 border-e border-ink-200 pe-3 ps-3.5 text-sm font-semibold text-ink-600">
          <PakistanFlag /> +92
        </span>
        <Input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="300 1234567"
          maxLength={17}
          className="tabular h-12 ps-[5.5rem] text-base font-semibold"
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          value={value}
          onBlur={onBlur}
          onChange={(e) => onChange(sanitizePhoneInput(e.target.value))}
          autoFocus={autoFocus}
        />
        {valid && <CheckCircle2 className="absolute top-1/2 end-3.5 size-5 -translate-y-1/2 text-success-600" aria-hidden />}
      </div>
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-danger-600">
          {error}
        </p>
      )}
    </div>
  );
}
