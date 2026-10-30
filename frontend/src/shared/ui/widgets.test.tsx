import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Settings, User } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/utils";
import { storeLocale } from "../__tests__/helpers";
import { ProfileMenu } from "./profile-menu";
import { RespondCountdown } from "./respond-countdown";

afterEach(() => vi.useRealTimers());

describe("RespondCountdown", () => {
  const NOW = new Date("2026-10-22T05:00:00Z").getTime();
  const inMs = (ms: number) => new Date(NOW + ms).toISOString();

  it("counts down mm:ss each second", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    renderWithProviders(<RespondCountdown respondBy={inMs(2 * 60_000 + 5_000)} />);
    expect(screen.getByRole("timer")).toHaveTextContent("2:05 left");
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("timer")).toHaveTextContent("2:04 left");
    act(() => vi.advanceTimersByTime(64_000));
    expect(screen.getByRole("timer")).toHaveTextContent("1:00 left");
  });

  it("shows hours and minutes for long waits", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    renderWithProviders(<RespondCountdown respondBy={inMs(2 * 3_600_000 + 15 * 60_000)} />);
    expect(screen.getByRole("timer")).toHaveTextContent("2h 15m left");
  });

  it("switches to the expired state once the deadline passes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    renderWithProviders(<RespondCountdown respondBy={inMs(1500)} />);
    expect(screen.getByRole("timer")).toHaveTextContent("0:01 left");
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole("timer")).toHaveTextContent("Response time passed");
  });

  it("is translated in Urdu", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    storeLocale("ur");
    renderWithProviders(<RespondCountdown respondBy={inMs(-1)} />);
    expect(screen.getByRole("timer")).toHaveTextContent("جواب کا وقت گزر گیا");
  });
});

describe("ProfileMenu", () => {
  const items = [
    { href: "/customer/profile", label: "Profile", icon: User },
    { href: "/customer/settings", label: "Settings", icon: Settings },
  ];

  it("opens with name, phone and items, and signs out", async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn();
    renderWithProviders(<ProfileMenu name="Amina Khan" phone="+92 300 1234567" role="Customer" items={items} onSignOut={onSignOut} />);
    const trigger = screen.getByRole("button", { name: /Amina Khan/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).toBeNull();

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("menu");
    expect(menu).toHaveTextContent("+92 300 1234567");
    expect(screen.getByRole("menuitem", { name: "Profile" })).toHaveAttribute("href", "/customer/profile");
    expect(screen.getByRole("menuitem", { name: "Settings" })).toHaveAttribute("href", "/customer/settings");
    expect(screen.getByRole("menuitem", { name: "Profile" })).not.toHaveAttribute("target");

    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on Escape and outside click", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <ProfileMenu name="Ali" phone="p" role="Admin" onSignOut={() => {}} />
        <p>outside</p>
      </>,
    );
    await user.click(screen.getByRole("button", { name: /Ali/ }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Ali/ }));
    await user.click(screen.getByText("outside"));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("uses a custom avatar and Urdu sign-out", async () => {
    storeLocale("ur");
    const user = userEvent.setup();
    renderWithProviders(<ProfileMenu name="Ali" phone="p" role="r" onSignOut={() => {}} renderAvatar={(s) => <span>avatar-{s}</span>} />);
    expect(screen.getByText("avatar-sm")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Ali/ }));
    expect(screen.getByText("avatar-md")).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
    expect(screen.getByRole("menuitem")).not.toHaveTextContent("Sign out");
  });
});
