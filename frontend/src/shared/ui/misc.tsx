"use client";

import clsx from "clsx";
import { useTranslations } from "next-intl";
import { AlertCircle, ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { useHydrated } from "../hooks/use-hydrated";
import { initials } from "../lib/format";
import { Button } from "./button";

export function Avatar({ name, src, size = "md", className }: { name: string; src?: string | null; size?: "sm" | "md" | "lg"; className?: string }) {
  const sizing = { sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-14 text-lg" }[size];
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote presigned URL, not a static asset
      <img
        src={src}
        alt={name}
        className={clsx("shrink-0 rounded-full object-cover", sizing, className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={clsx("inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-800", sizing, className)}
    >
      {initials(name)}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-md bg-ink-100", className)} />;
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  const t = useTranslations("common.states");
  return (
    <div className="space-y-3 p-5" aria-busy="true" aria-label={t("loading")}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <Icon className="size-6" />
      </span>
      <p className="font-semibold text-ink-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useTranslations("common");
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <AlertCircle className="mb-3 size-8 text-danger-600" />
      <p className="font-semibold text-ink-900">{t("states.couldntLoad")}</p>
      <p className="mt-1 text-sm text-ink-500">{error instanceof Error ? error.message : t("states.unexpectedError")}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          {t("actions.tryAgain")}
        </Button>
      )}
    </div>
  );
}

export function Pagination({
  page,
  limit,
  total,
  onPage,
}: {
  page: number;
  limit: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const t = useTranslations("common.pagination");
  const pages = Math.max(1, Math.ceil(total / limit));
  if (total === 0) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-ink-100 px-5 py-3 text-sm text-ink-500">
      <span className="tabular">{t("range", { from, to, total })}</span>
      <div className="flex gap-1">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t("previous")}>
          <ChevronLeft className="rtl:-scale-x-100 size-4" />
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={t("next")}>
          <ChevronRight className="rtl:-scale-x-100 size-4" />
        </Button>
      </div>
    </div>
  );
}

/** Segmented filter tabs, optionally with counts. */
export function FilterTabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
}) {
  // Counts come from queries another component may already have resolved.
  const hydrated = useHydrated();
  return (
    <div
      role="tablist"
      className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-ink-100 bg-white p-1 shadow-card"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={clsx(
              "flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold whitespace-nowrap transition-colors",
              active ? "bg-brand-600 text-white shadow-card" : "text-ink-600 hover:bg-ink-50 hover:text-ink-900",
            )}
          >
            {o.label}
            {hydrated && o.count !== undefined && (
              <span
                className={clsx(
                  "tabular min-w-5 rounded-full px-1.5 text-center text-xs leading-5 font-bold",
                  active ? "bg-white/20 text-white" : "bg-ink-100 text-ink-600",
                )}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function DetailList({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs font-semibold tracking-wide text-ink-500 uppercase">{i.label}</dt>
          <dd className="mt-1 text-sm break-words text-ink-900">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
