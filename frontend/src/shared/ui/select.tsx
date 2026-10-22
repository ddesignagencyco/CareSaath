"use client";

import clsx from "clsx";
import { Check, ChevronDown, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import ReactSelect, {
  components,
  type ClassNamesConfig,
  type ClearIndicatorProps,
  type DropdownIndicatorProps,
  type GroupBase,
  type MultiValueRemoveProps,
  type OptionProps,
} from "react-select";

/** Project-wide dropdowns. Use these instead of a native <select>. */
export interface SelectOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

type Opt = SelectOption<string>;

function DropdownIndicator<M extends boolean>(props: DropdownIndicatorProps<Opt, M>) {
  return (
    <components.DropdownIndicator {...props}>
      <ChevronDown
        className={clsx("size-4 text-ink-400 transition-transform", props.selectProps.menuIsOpen && "rotate-180 text-brand-600")}
      />
    </components.DropdownIndicator>
  );
}

function ClearIndicator<M extends boolean>(props: ClearIndicatorProps<Opt, M>) {
  return (
    <components.ClearIndicator {...props}>
      <X className="size-3.5 text-ink-400 hover:text-ink-700" />
    </components.ClearIndicator>
  );
}

function MultiValueRemove(props: MultiValueRemoveProps<Opt, true>) {
  return (
    <components.MultiValueRemove {...props}>
      <X className="size-3" />
    </components.MultiValueRemove>
  );
}

function Option<M extends boolean>(props: OptionProps<Opt, M>) {
  return (
    <components.Option {...props}>
      <span className="flex items-start gap-2">
        <span className="min-w-0 flex-1">
          <span className="block">{props.data.label}</span>
          {props.data.description && <span className="block text-xs font-normal text-ink-500">{props.data.description}</span>}
        </span>
        {props.isSelected && <Check className="mt-0.5 size-4 shrink-0 text-brand-600" />}
      </span>
    </components.Option>
  );
}

function classNames<M extends boolean>(): ClassNamesConfig<Opt, M, GroupBase<Opt>> {
  return {
    control: (s) =>
      clsx(
        "min-h-10 rounded-lg border bg-white px-3 text-sm shadow-card transition-colors",
        s.isDisabled && "bg-ink-50 text-ink-500",
        s.isFocused ? "border-brand-500 ring-2 ring-brand-500/20" : "border-ink-200 hover:border-ink-300",
      ),
    valueContainer: () => "gap-1 py-1",
    placeholder: () => "text-ink-400",
    singleValue: () => "font-medium text-ink-900",
    multiValue: () => "items-center gap-1 rounded-md bg-brand-50 py-0.5 pe-1 ps-2 text-brand-800 ring-1 ring-brand-200",
    multiValueLabel: () => "text-xs font-semibold",
    multiValueRemove: () => "rounded p-0.5 text-brand-600 hover:bg-brand-100 hover:text-brand-900",
    input: () => "text-ink-900",
    indicatorsContainer: () => "gap-1 ps-2",
    menu: () => "mt-1.5 overflow-hidden rounded-xl border border-ink-100 bg-white p-1 shadow-pop",
    menuList: () => "max-h-72",
    option: (s) =>
      clsx(
        "cursor-pointer rounded-lg px-3 py-2 text-sm",
        s.isSelected ? "bg-brand-50 font-semibold text-brand-800" : s.isFocused ? "bg-ink-50 text-ink-900" : "text-ink-700",
      ),
    noOptionsMessage: () => "px-3 py-2 text-sm text-ink-500",
  };
}

interface BaseProps<T extends string> {
  options: SelectOption<T>[];
  inputId?: string;
  placeholder?: string;
  isSearchable?: boolean;
  isDisabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

const common = {
  unstyled: true,
  menuPlacement: "auto" as const,
  styles: { menuPortal: (base: object) => ({ ...base, zIndex: 70 }) },
};

/** Portal so menus aren't clipped inside modals and drawers. */
const portalTarget = () => (typeof document === "undefined" ? undefined : document.body);

export function Select<T extends string>({
  value,
  options,
  onChange,
  inputId,
  placeholder,
  isClearable,
  isSearchable = false,
  isDisabled,
  className,
  "aria-label": ariaLabel,
}: BaseProps<T> & {
  value: T | null | undefined;
  onChange: (value: T | null) => void;
  isClearable?: boolean;
}) {
  // Stable id keeps SSR and client markup in sync.
  const instanceId = useId();
  const t = useTranslations("common.states");
  return (
    <ReactSelect<Opt, false>
      {...common}
      instanceId={instanceId}
      inputId={inputId}
      aria-label={ariaLabel}
      className={className}
      options={options}
      value={options.find((o) => o.value === value) ?? null}
      onChange={(opt) => onChange((opt?.value as T) ?? null)}
      placeholder={placeholder ?? t("select")}
      noOptionsMessage={() => t("noOptions")}
      isClearable={isClearable}
      isSearchable={isSearchable}
      isDisabled={isDisabled}
      menuPortalTarget={portalTarget()}
      components={{ DropdownIndicator, Option, ClearIndicator, IndicatorSeparator: null }}
      classNames={classNames<false>()}
    />
  );
}

export function MultiSelect<T extends string>({
  value,
  options,
  onChange,
  inputId,
  placeholder,
  isSearchable = true,
  isDisabled,
  className,
  "aria-label": ariaLabel,
}: BaseProps<T> & {
  value: T[];
  onChange: (value: T[]) => void;
}) {
  const instanceId = useId();
  const t = useTranslations("common.states");
  return (
    <ReactSelect<Opt, true>
      {...common}
      isMulti
      closeMenuOnSelect={false}
      hideSelectedOptions={false}
      instanceId={instanceId}
      inputId={inputId}
      aria-label={ariaLabel}
      className={className}
      options={options}
      value={options.filter((o) => value.includes(o.value))}
      onChange={(opts) => onChange(opts.map((o) => o.value as T))}
      placeholder={placeholder ?? t("select")}
      noOptionsMessage={() => t("noOptions")}
      isSearchable={isSearchable}
      isDisabled={isDisabled}
      menuPortalTarget={portalTarget()}
      components={{ DropdownIndicator, Option, ClearIndicator, MultiValueRemove, IndicatorSeparator: null }}
      classNames={classNames<true>()}
    />
  );
}
