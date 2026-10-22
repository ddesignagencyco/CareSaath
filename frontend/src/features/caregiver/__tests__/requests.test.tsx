import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiPath, json, mockFetch, renderWithProviders, type RecordedCall } from "@/test/utils";
import RequestsPage from "@/app/caregiver/(app)/requests/page";
import { LOCALE_KEY, requestItem, signInCaregiver } from "./fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/caregiver/requests",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

const page = (items: unknown[]) => json({ items, page: 1, limit: 50, total: items.length });

function backend(respond?: (c: RecordedCall) => Response | undefined) {
  return mockFetch((c) => {
    const custom = respond?.(c);
    if (custom) return custom;
    if (c.method === "GET" && apiPath(c) === "/caregiver/bookings") return page([requestItem()]);
    if (apiPath(c) === "/caregiver/profile") return json({ commissionRate: { percentage: "15.00" } });
    return json({ id: "bk1", status: "CONFIRMED" }, 201);
  });
}

const posts = (f: ReturnType<typeof mockFetch>) => f.calls.filter((c) => c.method === "POST");

beforeEach(() => signInCaregiver());

describe("requests page", () => {
  it("lists pending requests with the earning after commission", async () => {
    const f = backend();
    renderWithProviders(<RequestsPage />, { storageKey: LOCALE_KEY });
    expect(await screen.findByText("Rashida Begum")).toBeInTheDocument();
    expect(Object.fromEntries(f.calls[0].url.searchParams)).toEqual({ status: "REQUESTED", limit: "50" });
    // Rs 2,500 per visit, 15% commission -> Rs 2,125.
    expect(await screen.findByText(/You earn Rs\s?2,125\/visit after 15% commission/)).toBeInTheDocument();
  });

  it("Accept posts to /caregiver/bookings/:id/accept", async () => {
    const user = userEvent.setup();
    const f = backend();
    renderWithProviders(<RequestsPage />, { storageKey: LOCALE_KEY });
    await user.click(await screen.findByRole("button", { name: "Accept" }));
    await vi.waitFor(() => expect(posts(f)).toHaveLength(1));
    expect(apiPath(posts(f)[0])).toBe("/caregiver/bookings/bk1/accept");
    expect(posts(f)[0].body).toEqual({});
    expect(await screen.findByText("Accepted. The visit is now on your schedule.")).toBeInTheDocument();
  });

  it("Decline opens a dialog and sends the chosen reason", async () => {
    const user = userEvent.setup();
    const f = backend();
    renderWithProviders(<RequestsPage />, { storageKey: LOCALE_KEY });
    await user.click(await screen.findByRole("button", { name: "Decline" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Decline this request?")).toBeInTheDocument();
    expect(posts(f)).toHaveLength(0);

    await user.click(within(dialog).getByRole("button", { name: "Too far from my area" }));
    expect(within(dialog).getByRole("textbox")).toHaveValue("Too far from my area");
    await user.click(within(dialog).getByRole("button", { name: "Decline" }));
    await vi.waitFor(() => expect(posts(f)).toHaveLength(1));
    expect(apiPath(posts(f)[0])).toBe("/caregiver/bookings/bk1/decline");
    expect(posts(f)[0].body).toEqual({ reason: "Too far from my area" });
  });

  it("Decline without a reason sends an empty body (reason is optional) and Keep request sends nothing", async () => {
    const user = userEvent.setup();
    const f = backend();
    renderWithProviders(<RequestsPage />, { storageKey: LOCALE_KEY });
    await user.click(await screen.findByRole("button", { name: "Decline" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Keep request" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(posts(f)).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Decline" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox"), "   ");
    await user.click(within(dialog).getByRole("button", { name: "Decline" }));
    await vi.waitFor(() => expect(posts(f)).toHaveLength(1));
    expect(posts(f)[0].body).toEqual({});
  });

  it("shows the backend error when accepting fails", async () => {
    const user = userEvent.setup();
    backend((c) => (c.method === "POST" ? json({ statusCode: 400, message: "Only requested bookings can be accepted" }, 400) : undefined));
    renderWithProviders(<RequestsPage />, { storageKey: LOCALE_KEY });
    await user.click(await screen.findByRole("button", { name: "Accept" }));
    expect(await screen.findByText("Only requested bookings can be accepted")).toBeInTheDocument();
  });

  it("renders in Urdu right-to-left", async () => {
    localStorage.setItem(LOCALE_KEY, "ur");
    backend();
    renderWithProviders(<RequestsPage />, { storageKey: LOCALE_KEY });
    expect(await screen.findByRole("button", { name: "قبول کریں" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "مسترد کریں" })).toBeInTheDocument();
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.lang).toBe("ur");
  });
});
