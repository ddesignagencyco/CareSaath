"use client";

import "react-day-picker/style.css";

import clsx from "clsx";
import { Calendar } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { DayPicker, type Matcher } from "react-day-picker";
import { useTranslations } from "next-intl";
import { useFmt } from "@shared/i18n/use-fmt";

/** "YYYY-MM-DD" → local Date (midnight), avoiding the UTC shift of `new Date(iso)`. */
function parse(value?: string): Date | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Brand theming for react-day-picker's CSS variables (its base stylesheet handles layout). */
const THEME = {
  "--rdp-accent-color": "var(--color-brand-600)",
  "--rdp-accent-background-color": "var(--color-brand-50)",
  "--rdp-today-color": "var(--color-brand-700)",
  "--rdp-day-width": "2.4rem",
  "--rdp-day-height": "2.4rem",
  "--rdp-day_button-border-radius": "0.5rem",
  "--rdp-selected-border": "none",
} as CSSProperties;

/** Project-wide date field. Use instead of a native `<input type="date">`. Value is "YYYY-MM-DD". */
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
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const f = useFmt();
  const ts = useTranslations("common.states");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = parse(value);
  const fromDate = parse(min);
  const toDate = parse(max);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const disabledMatchers: Matcher[] = [];
  if (fromDate) disabledMatchers.push({ before: fromDate });
  if (toDate) disabledMatchers.push({ after: toDate });

  // Bound the month/year dropdowns: use min/max when given, else a wide range (covers DOB).
  const thisYear = new Date().getFullYear();
  const startMonth = fromDate ?? new Date(thisYear - 100, 0);
  const endMonth = toDate ?? new Date(thisYear + 2, 11);

  return (
    <div className={clsx("relative", className)} ref={ref}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          "flex h-10 w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 text-start text-sm shadow-card transition-colors",
          open ? "border-brand-500 ring-2 ring-brand-500/20" : "border-ink-200 hover:border-ink-300",
          disabled && "cursor-not-allowed bg-ink-50 text-ink-500",
        )}
      >
        <span className={clsx("truncate", selected ? "font-medium text-ink-900" : "text-ink-400")}>
          {selected ? f.dateLong(value) : (placeholder ?? ts("selectDate"))}
        </span>
        <Calendar className="size-4 shrink-0 text-ink-400" />
      </button>

      {open && !disabled && (
        <div className="absolute z-50 mt-1.5 rounded-xl border border-ink-100 bg-white p-2 shadow-pop" style={THEME}>
          <DayPicker
            mode="single"
            required
            dir={f.locale === "ur" ? "rtl" : "ltr"}
            captionLayout="dropdown"
            selected={selected}
            defaultMonth={selected ?? undefined}
            startMonth={startMonth}
            endMonth={endMonth}
            disabled={disabledMatchers}
            onSelect={(d) => {
              if (d) {
                onChange(toISO(d));
                setOpen(false);
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
