"use client";

import clsx from "clsx";

const CONTROL =
  "h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 shadow-card transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-500";

/** Project-wide date field — a native `<input type="date">`. Value is "YYYY-MM-DD". */
export function DatePicker({
  id,
  value,
  onChange,
  min,
  max,
  placeholder,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** Earliest selectable date, "YYYY-MM-DD". */
  min?: string;
  /** Latest selectable date, "YYYY-MM-DD". */
  max?: string;
  /** Ignored by native date inputs; kept for call-site compatibility. */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  void placeholder;
  return (
    <div className={clsx("relative", className)}>
      <input
        id={id}
        type="date"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        className={CONTROL}
      />
    </div>
  );
}
