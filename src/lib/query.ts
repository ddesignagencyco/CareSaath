import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useT } from '../i18n';
import { useToast } from '../components/overlay';

/**
 * A deliberately small stand-in for react-query: a shared cache keyed by
 * arrays, prefix invalidation, refetch when a screen regains focus, and
 * stale data kept on screen while refetching (so a network drop doesn't
 * blank a list). Keys follow the web app (api/<role>/keys.ts).
 */
export type QueryKey = readonly unknown[];

interface Entry {
  data?: unknown;
  error?: unknown;
  status: 'idle' | 'loading' | 'success' | 'error';
  fetching: boolean;
  fetcher?: () => Promise<unknown>;
  promise?: Promise<void>;
  listeners: Set<() => void>;
  /** Monotonic snapshot version for useSyncExternalStore. */
  v: number;
}

const cache = new Map<string, Entry>();
const hash = (key: QueryKey) => JSON.stringify(key);

function entry(h: string): Entry {
  let e = cache.get(h);
  if (!e) {
    e = { status: 'idle', fetching: false, listeners: new Set(), v: 0 };
    cache.set(h, e);
  }
  return e;
}

function emit(e: Entry) {
  e.v++;
  e.listeners.forEach(l => l());
}

function run(e: Entry): Promise<void> {
  if (e.promise || !e.fetcher) return e.promise ?? Promise.resolve();
  e.fetching = true;
  if (e.status === 'idle' || e.status === 'error') e.status = 'loading';
  emit(e);
  e.promise = e
    .fetcher()
    .then(
      data => {
        e.data = data;
        e.error = undefined;
        e.status = 'success';
      },
      error => {
        e.error = error;
        // Keep showing the last good data when a refetch fails.
        e.status = e.data !== undefined ? 'success' : 'error';
      },
    )
    .finally(() => {
      e.fetching = false;
      e.promise = undefined;
      emit(e);
    });
  return e.promise;
}

/** Refetch every query whose key starts with `prefix` (unmounted ones go stale). */
export function invalidate(prefix: QueryKey) {
  const p = hash(prefix).slice(0, -1);
  for (const [h, e] of cache) {
    if (h === hash(prefix) || h.startsWith(`${p},`)) {
      if (e.listeners.size > 0) run(e);
      else cache.delete(h);
    }
  }
}

/** Drop everything (sign-out, demo reset). */
export function clearQueries() {
  cache.clear();
}

export function useQuery<T>(key: QueryKey, fetcher: () => Promise<T>, { enabled = true, refetchOnFocus = true }: { enabled?: boolean; refetchOnFocus?: boolean } = {}) {
  const h = hash(key);
  const e = entry(h);
  e.fetcher = fetcher as () => Promise<unknown>;

  useSyncExternalStore(
    useCallback(
      (l: () => void) => {
        const en = entry(h);
        en.listeners.add(l);
        return () => {
          en.listeners.delete(l);
        };
      },
      [h],
    ),
    () => entry(h).v,
  );

  useEffect(() => {
    if (enabled && entry(h).status === 'idle') run(entry(h));
  }, [h, enabled]);

  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      if (enabled && refetchOnFocus) run(entry(h));
    }, [h, enabled, refetchOnFocus]),
  );

  const refetch = useCallback(() => run(entry(h)), [h]);
  return {
    data: e.data as T | undefined,
    error: e.status === 'error' ? e.error : undefined,
    /** First load with nothing to show yet. */
    isLoading: enabled && (e.status === 'loading' || e.status === 'idle'),
    isFetching: e.fetching,
    refetch,
  };
}

/** Backend error message -> apiErrors key ("Invalid OTP" -> "Invalid_OTP"). */
export const errorKey = (message: string) => message.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/** Backend messages with values in them, so they can't be looked up by key. */
const PAYMENT_REASONS: Record<string, string> = {
  'no payment has been made for this visit yet': 'reasonNoPayment',
  'the card payment has not been completed yet': 'reasonCard',
  'neither the customer nor the caregiver has confirmed the cash payment': 'reasonNeither',
  'the customer has not confirmed handing over the cash': 'reasonCustomer',
  'the caregiver has not confirmed receiving the cash': 'reasonCaregiver',
};

function dynamicError(message: string, t: ReturnType<typeof useT>): string | null {
  // VisitsService.assertWithinRadius
  const far = /^You are about (\d+) m from the visit address; (check-in|check-out) is allowed within (\d+) m$/.exec(message);
  if (far) return t('dynamic.tooFar', { meters: far[1], action: t(far[2] === 'check-in' ? 'dynamic.checkIn' : 'dynamic.checkOut'), radius: far[3] });
  // VisitsService.assertPaymentVerified
  const pay = /^The visit cannot be completed until payment is verified by both sides: (.+)$/.exec(message);
  if (pay) return t('dynamic.paymentNotVerified', { reason: PAYMENT_REASONS[pay[1]] ? t(`dynamic.${PAYMENT_REASONS[pay[1]]}`) : pay[1] });
  return null;
}

/** Translates known backend error messages; unknown ones are shown as sent. */
export function useApiErrorText() {
  const t = useT('apiErrors');
  const common = useT('common.states');
  return useCallback(
    (err: unknown): string => {
      if (!(err instanceof Error) || !err.message) return common('somethingWentWrong');
      const key = errorKey(err.message);
      return key && t.has(key) ? t(key) : (dynamicError(err.message, t) ?? err.message);
    },
    [t, common],
  );
}

/**
 * Mutation that invalidates keys on success and reports the outcome with a
 * toast; mirrors the web's useAction(). `run` never throws.
 */
export function useAction<TVars, TResult>(
  fn: (vars: TVars) => Promise<TResult>,
  opts: {
    invalidate?: QueryKey[];
    success?: string | null | ((result: TResult, vars: TVars) => string);
    onSuccess?: (result: TResult, vars: TVars) => void;
    /** Return true to suppress the default error toast. */
    onError?: (err: Error) => boolean | void;
  } = {},
) {
  const toast = useToast();
  const translate = useApiErrorText();
  const [isPending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const latest = useRef(opts);
  latest.current = opts;
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const runAction = useCallback(
    async (vars: TVars): Promise<TResult | undefined> => {
      // Ignore a second tap while the first call is still running (double booking / payment).
      if (inFlight.current) return undefined;
      inFlight.current = true;
      const o = latest.current;
      setPending(true);
      setError(null);
      try {
        const result = await fn(vars);
        o.invalidate?.forEach(invalidate);
        if (o.success) toast.success(typeof o.success === 'function' ? o.success(result, vars) : o.success);
        o.onSuccess?.(result, vars);
        return result;
      } catch (err) {
        // onError runs first so it can rewrite err.message before translation.
        const suppress = o.onError?.(err as Error) === true;
        const msg = translate(err);
        if (mounted.current) setError(msg);
        if (!suppress) toast.error(msg);
        return undefined;
      } finally {
        inFlight.current = false;
        if (mounted.current) setPending(false);
      }
    },
    [fn, toast, translate],
  );

  return { run: runAction, isPending, error };
}
