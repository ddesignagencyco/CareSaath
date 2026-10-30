"use client";

import { useSyncExternalStore } from "react";

/**
 * Current time, re-rendering every `intervalMs`. Returns 0 during server
 * prerender (Next 16 rejects Date.now() there), so callers treat 0 as
 * "unknown" and render a neutral fallback.
 */
export function useNow(intervalMs = 1000): number {
  return useSyncExternalStore(
    (onChange) => {
      const id = setInterval(onChange, intervalMs);
      return () => clearInterval(id);
    },
    () => Math.floor(Date.now() / intervalMs) * intervalMs,
    () => 0,
  );
}
