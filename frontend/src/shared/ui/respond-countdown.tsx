"use client";

import clsx from "clsx";
import { Timer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useNow } from "../hooks/use-now";

/** Time left to respond to a booking request (respondBy). */
export function RespondCountdown({ respondBy, className }: { respondBy: string; className?: string }) {
  const now = useNow(1000);
  const t = useTranslations("shared.countdown");
  if (!now) return null;
  const left = new Date(respondBy).getTime() - now;
  const expired = left <= 0;
  const mins = Math.floor(Math.max(0, left) / 60_000);
  const secs = Math.floor((Math.max(0, left) % 60_000) / 1000);
  const urgent = !expired && left < 15 * 60_000;
  return (
    <span
      className={clsx(
        "tabular inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold",
        expired ? "bg-ink-100 text-ink-600" : urgent ? "bg-danger-50 text-danger-700" : "bg-accent-50 text-accent-700",
        className,
      )}
      role="timer"
    >
      <Timer className="size-3.5" />
      {expired
        ? t("passed")
        : t("left", { time: mins >= 60 ? t("hours", { h: Math.floor(mins / 60), m: mins % 60 }) : `${mins}:${String(secs).padStart(2, "0")}` })}
    </span>
  );
}
