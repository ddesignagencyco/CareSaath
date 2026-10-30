"use client";

import clsx from "clsx";
import { Languages } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLocaleControl } from "./provider";
import type { Locale } from "./messages";

/**
 * One-tap English ⇄ اردو switch. `onChange` lets a signed-in section also
 * save the choice to the user's profile (PATCH /customer/me preferredLanguage).
 */
export function LanguageToggle({ className, onChange }: { className?: string; onChange?: (l: Locale) => void }) {
  const { locale, setLocale } = useLocaleControl();
  const t = useTranslations("common.language");
  const next: Locale = locale === "ur" ? "en" : "ur";
  return (
    <button
      type="button"
      onClick={() => {
        setLocale(next);
        onChange?.(next);
      }}
      aria-label={t("switchTo", { language: t(next) })}
      title={t("switchTo", { language: t(next) })}
      className={clsx(
        "inline-flex h-9 items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3 text-sm font-semibold text-ink-700 shadow-card transition-colors hover:border-brand-300 hover:text-brand-700",
        className,
      )}
    >
      <Languages className="size-4" />
      <span lang={next} className={next === "ur" ? "leading-none" : undefined}>
        {t(next)}
      </span>
    </button>
  );
}
