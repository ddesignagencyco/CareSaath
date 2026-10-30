"use client";

import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import { healthApi } from "@/features/admin/lib/api/admin";
import { API_BASE_URL, ApiError } from "@/features/admin/lib/api/http";

type HealthState = "checking" | "healthy" | "degraded" | "unreachable";

/**
 * Small status pill for GET /health. The API answers 200 {postgres, redis}
 * when everything is up and 503 "PostgreSQL unavailable" / "Redis unavailable"
 * otherwise; a network error means the API itself is down.
 */
export function ApiHealthPill() {
  const t = useTranslations("adminA.shell.health");
  const health = useQuery({
    queryKey: ["a-health"],
    queryFn: healthApi.check,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  let state: HealthState = "checking";
  let detail = "";
  if (health.data) {
    const down = [!health.data.postgres && t("postgres"), !health.data.redis && t("redis")].filter(Boolean) as string[];
    state = down.length === 0 ? "healthy" : "degraded";
    detail = down.length === 0 ? t("detailHealthy") : t("detailDegraded", { services: down.join(", ") });
  } else if (health.error) {
    const err = health.error;
    if (err instanceof ApiError && err.status !== 0) {
      state = "degraded";
      const down = [/postgres/i.test(err.message) && t("postgres"), /redis/i.test(err.message) && t("redis")].filter(Boolean) as string[];
      detail = down.length > 0 ? t("detailDegraded", { services: down.join(", ") }) : err.message;
    } else {
      state = "unreachable";
      detail = t("detailUnreachable", { url: API_BASE_URL });
    }
  }

  return (
    <span
      role="status"
      title={detail || undefined}
      className={clsx(
        "hidden items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 sm:inline-flex",
        state === "healthy" && "bg-success-50 text-success-700 ring-success-600/20",
        state === "degraded" && "bg-warning-50 text-warning-700 ring-warning-600/30",
        state === "unreachable" && "bg-danger-50 text-danger-700 ring-danger-600/30",
        state === "checking" && "bg-ink-50 text-ink-500 ring-ink-200",
      )}
    >
      <span
        aria-hidden
        className={clsx(
          "size-2 rounded-full",
          state === "healthy" && "bg-success-600",
          state === "degraded" && "bg-warning-600",
          state === "unreachable" && "bg-danger-600",
          state === "checking" && "animate-pulse bg-ink-300",
        )}
      />
      {t(state)}
      {detail && <span className="sr-only">. {detail}</span>}
    </span>
  );
}
