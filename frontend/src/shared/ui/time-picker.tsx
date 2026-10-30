"use client";

import clsx from "clsx";

const CONTROL =
  "h-10 w-full rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 shadow-card transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-500";

/** Project-wide time field — a native `<input type="time">`. Value is "HH:mm". */
export function TimePicker({
  id,
  value,
  onChange,
  min,
  step = 5,
  placeholder,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** Earliest selectable time, "HH:mm". */
  min?: string;
  /** Slot granularity in minutes (default 5); native inputs use seconds. */
  step?: number;
  /** Ignored by native time inputs; kept for call-site compatibility. */
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
        type="time"
        value={value}
        min={min}
        step={step * 60}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        className={CONTROL}
      />
    </div>
  );
}
