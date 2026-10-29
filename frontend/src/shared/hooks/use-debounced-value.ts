import { useEffect, useState } from "react";

/** Returns `value` after it has stopped changing for `delayMs` (default 350ms) — e.g. to debounce a search box before hitting the API. */
export function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
