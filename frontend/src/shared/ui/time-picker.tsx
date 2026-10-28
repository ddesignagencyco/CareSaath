"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useFmt } from "@shared/i18n/use-fmt";
import { Select } from "./select";

/** Every "HH:mm" slot of the day in `step`-minute increments. */
function slots(step: number): string[] {
  const out: string[] = [];
  for (let m = 0; m < 24 * 60; m += step) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}

/** Project-wide time field (a react-select of slots). Use instead of a native `<input type="time">`. Value is "HH:mm". */
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
  /** Earliest selectable time, "HH:mm" — earlier slots are hidden. */
  min?: string;
  /** Slot granularity in minutes (default 5). */
  step?: number;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const f = useFmt();
  const ts = useTranslations("common.states");
  const options = useMemo(() => {
    let list = slots(step);
    if (min) list = list.filter((s) => s >= min);
    // Keep the current value selectable even if it is off-grid or before `min`.
    if (value && !list.includes(value)) list = [...list, value].sort();
    return list.map((s) => ({ value: s, label: f.time(s) }));
  }, [step, min, value, f]);

  return (
    <Select<string>
      inputId={id}
      options={options}
      value={value || null}
      onChange={(v) => onChange(v ?? "")}
      isSearchable
      placeholder={placeholder ?? ts("selectTime")}
      isDisabled={disabled}
      className={className}
      aria-label={ariaLabel}
    />
  );
}
