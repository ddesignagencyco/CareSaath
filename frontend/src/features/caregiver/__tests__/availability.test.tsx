import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiPath, json, mockFetch, renderWithProviders } from "@/test/utils";
import AvailabilityPage from "@/app/caregiver/(app)/availability/page";
import { LOCALE_KEY, signInCaregiver } from "./fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/caregiver/availability",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

const availability = {
  rules: [
    { id: "r1", caregiverId: "cg", dayOfWeek: 1, startTime: "09:00", endTime: "12:00" },
    { id: "r2", caregiverId: "cg", dayOfWeek: 0, startTime: "10:00", endTime: "14:00" },
  ],
  blocks: [],
};

function backend() {
  return mockFetch((c) => (c.method === "GET" ? json(availability) : json(availability)));
}

const writes = (f: ReturnType<typeof mockFetch>) => f.calls.filter((c) => c.method !== "GET");

beforeEach(() => signInCaregiver());

describe("weekly availability editor", () => {
  it("blocks overlapping windows without sending a request, then saves {rules} with dayOfWeek 0–6 and HH:mm", async () => {
    const user = userEvent.setup();
    const f = backend();
    renderWithProviders(<AvailabilityPage />, { storageKey: LOCALE_KEY });

    const save = await screen.findByRole("button", { name: "Save hours" });
    expect(save).toBeDisabled(); // nothing changed yet

    // Monday is the only weekday on, so its "Add window" is the first one.
    await user.click(screen.getAllByRole("button", { name: "Add window" })[0]);
    const start2 = screen.getByLabelText("Monday window 2 start");
    expect(start2).toHaveValue("12:00");

    fireEvent.change(start2, { target: { value: "11:00" } });
    expect(screen.getByText("Time windows overlap")).toBeInTheDocument();
    expect(save).toBeDisabled();
    await user.click(save);
    expect(writes(f)).toHaveLength(0);

    fireEvent.change(start2, { target: { value: "13:30" } });
    expect(screen.queryByText("Time windows overlap")).not.toBeInTheDocument();
    expect(save).toBeEnabled();
    await user.click(save);
    await vi.waitFor(() => expect(writes(f)).toHaveLength(1));
    const put = writes(f)[0];
    expect(put.method).toBe("PUT");
    expect(apiPath(put)).toBe("/caregiver/availability");
    expect(put.body).toEqual({
      rules: [
        { dayOfWeek: 1, startTime: "09:00", endTime: "12:00" },
        { dayOfWeek: 1, startTime: "13:30", endTime: "20:00" },
        { dayOfWeek: 0, startTime: "10:00", endTime: "14:00" },
      ],
    });
  });

  it("rejects an end time before the start time", async () => {
    const f = backend();
    renderWithProviders(<AvailabilityPage />, { storageKey: LOCALE_KEY });
    fireEvent.change(await screen.findByLabelText("Monday window 1 end"), { target: { value: "08:00" } });
    expect(screen.getByText("End time must be after start time")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save hours" })).toBeDisabled();
    expect(writes(f)).toHaveLength(0);
  });

  it("turning a day on adds a 09:00–17:00 window (Saturday = 6)", async () => {
    const user = userEvent.setup();
    const f = backend();
    renderWithProviders(<AvailabilityPage />, { storageKey: LOCALE_KEY });
    await user.click(await screen.findByRole("switch", { name: "Saturday available" }));
    await user.click(screen.getByRole("button", { name: "Save hours" }));
    await vi.waitFor(() => expect(writes(f)).toHaveLength(1));
    expect((writes(f)[0].body as { rules: unknown[] }).rules).toContainEqual({ dayOfWeek: 6, startTime: "09:00", endTime: "17:00" });
  });
});
