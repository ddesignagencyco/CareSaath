import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * False during SSR and hydration, true afterwards. Use it to hold back values
 * that can already be in the client cache when a late-hydrating boundary
 * hydrates (e.g. a count another component fetched first), which would
 * otherwise differ from the server HTML.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}
