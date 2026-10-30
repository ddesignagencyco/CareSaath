import { act, renderHook, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { providers, storeLocale } from "../__tests__/helpers";
import { ApiError } from "./http";
import { errorKey, useAction, useApiErrorText } from "./use-action";

describe("errorKey", () => {
  it.each([
    ["Invalid OTP", "Invalid_OTP"],
    ["Too many attempts, request a new OTP", "Too_many_attempts_request_a_new_OTP"],
    ["Cannot reach the server. Check your connection.", "Cannot_reach_the_server_Check_your_connection"],
    ["  --x--  ", "x"],
    ["!!!", ""],
  ])("%j -> %j", (msg, key) => expect(errorKey(msg)).toBe(key));
});

describe("useApiErrorText", () => {
  const translate = (locale: "en" | "ur") => {
    storeLocale(locale);
    return renderHook(() => useApiErrorText(), { wrapper: providers().Wrapper }).result.current;
  };

  it("translates a known backend message in Urdu", () => {
    expect(translate("ur")(new Error("Invalid OTP"))).toBe("کوڈ درست نہیں ہے");
    expect(translate("en")(new Error("Invalid OTP"))).toBe("Invalid OTP");
  });

  it("passes unknown messages through unchanged", () => {
    expect(translate("ur")(new Error("Brand new backend error"))).toBe("Brand new backend error");
  });

  it("gives the generic message for non-Errors and empty messages", () => {
    expect(translate("en")("boom")).toBe("Something went wrong");
    expect(translate("en")(new Error(""))).toBe("Something went wrong");
    expect(translate("ur")(null)).toBe("کچھ غلط ہو گیا");
  });
});

describe("useAction", () => {
  function setup<R>(fn: (v: string) => Promise<R>, opts: Partial<Parameters<typeof useAction<string, R>>[1]> = {}) {
    const { client, Wrapper } = providers();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const hook = renderHook(() => useAction(fn, { invalidate: [["a"], ["b", 1]], success: "Saved", ...opts }), { wrapper: Wrapper });
    return { invalidate, hook };
  }

  it("invalidates every key and shows the success toast", async () => {
    const onSuccess = vi.fn();
    const { invalidate, hook } = setup(async (v) => `${v}!`, { onSuccess });
    await act(() => hook.result.current.mutateAsync("x"));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["a"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["b", 1] });
    expect(onSuccess).toHaveBeenCalledWith("x!", "x");
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });

  it("success can be computed from the result, or null for no toast", async () => {
    const a = setup(async (v) => v.length, { success: (n, v) => `${v} has ${n}` });
    await act(() => a.hook.result.current.mutateAsync("abc"));
    expect(screen.getByRole("status")).toHaveTextContent("abc has 3");
    a.hook.unmount();

    const b = setup(async () => 1, { success: null });
    await act(() => b.hook.result.current.mutateAsync("x"));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("error toast shows the translated API message and nothing is invalidated", async () => {
    storeLocale("ur");
    const { invalidate, hook } = setup(async () => {
      throw new ApiError(400, "Invalid OTP");
    });
    act(() => hook.result.current.mutate("x"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("کوڈ درست نہیں ہے"));
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("onError returning true suppresses the toast", async () => {
    const onError = vi.fn(() => true);
    const { hook } = setup(async () => {
      throw new Error("Visit not found");
    }, { onError });
    act(() => hook.result.current.mutate("x"));
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "Visit not found" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("onError returning nothing keeps the toast", async () => {
    const { hook } = setup(async () => {
      throw new Error("Visit not found");
    }, { onError: () => {} });
    act(() => hook.result.current.mutate("x"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Visit not found"));
  });
});
