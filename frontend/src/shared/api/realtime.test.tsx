import { act, renderHook } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionStore } from "./session";
import { useRealtime } from "./realtime";

const socketHolder = vi.hoisted(() => ({ socket: null as unknown }));
vi.mock("socket.io-client", () => ({ io: vi.fn(() => socketHolder.socket) }));

type Handler = (...args: unknown[]) => void;

function makeSocket() {
  const handlers: Record<string, Handler> = {};
  const ioHandlers: Record<string, Handler> = {};
  const socket = {
    handlers,
    ioHandlers,
    on: vi.fn((event: string, cb: Handler) => {
      handlers[event] = cb;
      return socket;
    }),
    io: {
      on: vi.fn((event: string, cb: Handler) => {
        ioHandlers[event] = cb;
      }),
    },
    removeAllListeners: vi.fn(),
    close: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    trigger(event: string, ...args: unknown[]) {
      handlers[event]?.(...args);
    },
  };
  return socket;
}

describe("useRealtime invalidation load", () => {
  let socket: ReturnType<typeof makeSocket>;

  beforeEach(() => {
    socket = makeSocket();
    socketHolder.socket = socket;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setup() {
    const session = createSessionStore("realtime.test");
    session.set({ phone: "+923211234567" });
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const hook = renderHook(() =>
      useRealtime({
        session,
        queryClient,
        notificationsKey: ["notifications"],
        refresh: vi.fn().mockResolvedValue(true),
        enabled: true,
      }),
    );
    return { invalidate, hook, session };
  }

  it("does not invalidate everything on the initial `ready` event", () => {
    const { invalidate, hook, session } = setup();
    expect(socket.handlers["ready"]).toBeUndefined();
    act(() => socket.trigger("ready", { userId: "u-1" }));
    expect(invalidate).not.toHaveBeenCalled();
    hook.unmount();
    session.clear();
  });

  it("coalesces back-to-back entity updates into one global refetch", () => {
    const { invalidate, hook, session } = setup();
    act(() => {
      socket.trigger("entity.updated", { type: "booking" });
      socket.trigger("entity.updated", { type: "visit" });
    });
    expect(invalidate).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(249));
    expect(invalidate).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith();
    hook.unmount();
    session.clear();
  });

  it("keeps chat updates scoped instead of refetching the whole screen", () => {
    const { invalidate, hook, session } = setup();
    act(() => socket.trigger("entity.updated", { type: "chat_message" }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["chat"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["chat-conversations"] });
    expect(invalidate).not.toHaveBeenCalledWith();
    hook.unmount();
    session.clear();
  });
});
