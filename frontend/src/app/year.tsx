"use client";

import { useNow } from "@shared/hooks/use-now";

/** Current year for the footer. Next 16 forbids `new Date()` during prerender,
 *  so this renders a client value (0 snapshot → a stable fallback). */
export function Year({ fallback }: { fallback: number }) {
  const now = useNow(60_000);
  return <>{now ? new Date(now).getFullYear() : fallback}</>;
}
