"use client";

import clsx from "clsx";
import { useTranslations } from "next-intl";
import { useRef } from "react";

/** Segmented one-time-code input: auto-advance, backspace, arrows and paste. */
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  invalid,
  disabled,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  length?: number;
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const t = useTranslations("shared.otp");
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  const focus = (i: number) => refs.current[Math.max(0, Math.min(length - 1, i))]?.focus();

  function commit(next: string) {
    const clean = next.replace(/\D/g, "").slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
  }

  function setAt(i: number, d: string) {
    const arr = [...digits];
    arr[i] = d;
    commit(arr.join(""));
  }

  return (
    <div className="flex justify-between gap-2 sm:gap-3" role="group" aria-label={t("group")} dir="ltr">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={t("digit", { n: i + 1 })}
          aria-invalid={invalid}
          maxLength={1}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const typed = e.target.value.replace(/\D/g, "");
            if (!typed) return;
            // Autofill / fast typing can deliver several digits into one box.
            if (typed.length > 1) {
              commit(digits.slice(0, i).join("") + typed);
              focus(i + typed.length);
              return;
            }
            setAt(i, typed);
            focus(i + 1);
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace") {
              e.preventDefault();
              if (d) setAt(i, "");
              else if (i > 0) {
                setAt(i - 1, "");
                focus(i - 1);
              }
            } else if (e.key === "ArrowLeft") focus(i - 1);
            else if (e.key === "ArrowRight") focus(i + 1);
          }}
          onPaste={(e) => {
            e.preventDefault();
            const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
            if (!pasted) return;
            commit(pasted);
            focus(pasted.length);
          }}
          className={clsx(
            "tabular aspect-square w-full min-w-0 rounded-xl border bg-white text-center text-2xl font-extrabold text-ink-900 shadow-card transition-all outline-none",
            "focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15",
            invalid ? "border-danger-500 bg-danger-50/40" : d ? "border-brand-300 bg-brand-50/40" : "border-ink-200",
            disabled && "opacity-60",
          )}
        />
      ))}
    </div>
  );
}
