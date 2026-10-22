"use client";

import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useToast } from "../ui/toast";

/**
 * Mutation that invalidates the given keys on success and reports the
 * outcome with a toast. API errors surface the backend's message.
 */
export function useAction<TVars, TResult>(
  fn: (vars: TVars) => Promise<TResult>,
  {
    invalidate,
    success,
    onSuccess,
    onError,
  }: {
    invalidate: QueryKey[];
    success: string | null | ((result: TResult, vars: TVars) => string);
    onSuccess?: (result: TResult, vars: TVars) => void;
    /** Return true to suppress the default error toast. */
    onError?: (err: Error) => boolean | void;
  },
) {
  const client = useQueryClient();
  const toast = useToast();
  const translateError = useApiErrorText();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result, vars) => {
      invalidate.forEach((queryKey) => client.invalidateQueries({ queryKey }));
      if (success) toast.success(typeof success === "function" ? success(result, vars) : success);
      onSuccess?.(result, vars);
    },
    onError: (err) => {
      if (onError?.(err) === true) return;
      toast.error(translateError(err));
    },
  });
}

/** Key for a backend error message in the apiErrors namespace ("Invalid OTP" -> "Invalid_OTP"). */
export const errorKey = (message: string) => message.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");

/** Translates known backend error messages; unknown ones are shown as sent. */
export function useApiErrorText() {
  const t = useTranslations("apiErrors");
  const common = useTranslations("common.states");
  return (err: unknown): string => {
    if (!(err instanceof Error) || !err.message) return common("somethingWentWrong");
    const key = errorKey(err.message);
    return key && t.has(key as never) ? t(key as never) : err.message;
  };
}
