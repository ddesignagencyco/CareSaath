import { act, render, renderHook, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useHydrated } from "./use-hydrated";
import { useNow } from "./use-now";

function HydratedProbe() {
  return <span data-testid="h">{String(useHydrated())}</span>;
}

function NowProbe({ ms }: { ms?: number }) {
  return <span data-testid="now">{useNow(ms)}</span>;
}

afterEach(() => vi.useRealTimers());

describe("useHydrated", () => {
  it("is false in server HTML", () => {
    expect(renderToString(<HydratedProbe />)).toContain(">false<");
  });

  it("is true once mounted on the client", () => {
    render(<HydratedProbe />);
    expect(screen.getByTestId("h")).toHaveTextContent("true");
  });
});

describe("useNow", () => {
  it("is 0 during server render (unknown time)", () => {
    expect(renderToString(<NowProbe />)).toContain(">0<");
  });

  it("returns the time floored to the interval and ticks", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_500);
    const { result } = renderHook(() => useNow(1000));
    expect(result.current).toBe(10_000);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(11_000);
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current).toBe(14_000);
  });

  it("respects a custom interval and stops ticking on unmount", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { unmount } = render(<NowProbe ms={60_000} />);
    expect(screen.getByTestId("now")).toHaveTextContent("0");
    act(() => vi.advanceTimersByTime(61_000));
    expect(screen.getByTestId("now")).toHaveTextContent("60000");
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
