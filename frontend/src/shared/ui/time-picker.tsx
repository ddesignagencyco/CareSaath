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

/** Common full-hour slots so customers don't have to dial individual minutes. */
const QUICK_SLOTS = ["08:00", "09:00", "10:00", "11:00", "12:00", "14:00", "16:00", "18:00", "20:00"];

/** Time field with one-tap popular slots; the native field remains for exact times. */
export function QuickTimePicker({
  quickLabel,
  ...props
}: Parameters<typeof TimePicker>[0] & { quickLabel?: string }) {
  const slots = props.min ? QUICK_SLOTS.filter((slot) => slot >= props.min!) : QUICK_SLOTS;
  return (
    <div className="space-y-2">
      <TimePicker {...props} />
      {slots.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={quickLabel}>
          {slots.map((slot) => (
            <button
              key={slot}
              type="button"
              disabled={props.disabled}
              onClick={() => props.onChange(slot)}
              className={clsx(
                "rounded-md border px-2 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                props.value === slot
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-ink-200 bg-white text-ink-600 hover:border-brand-400 hover:bg-brand-50",
              )}
            >
              <span dir="ltr">{slot}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
