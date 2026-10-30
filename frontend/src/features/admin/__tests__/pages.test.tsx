import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiPath, json, mockFetch, renderWithProviders, type RecordedCall } from "@/test/utils";
import * as seed from "./fixtures";
import CaregiversPage from "@/app/admin/(console)/caregivers/page";
import PayoutsPage from "@/app/admin/(console)/payouts/page";
import PromosPage from "@/app/admin/(console)/promos/page";
import ReportsPage from "@/app/admin/(console)/reports/page";
import SettingsPage from "@/app/admin/(console)/settings/page";
import { ADMIN_LOCALE_KEY, signInAdmin } from "./helpers";

vi.mock("next/navigation", async () => {
  const { router } = await import("./helpers");
  return {
    useRouter: () => router,
    usePathname: () => "/admin",
    useSearchParams: () => new URLSearchParams(),
    useParams: () => ({}),
  };
});

const page = <T,>(items: T[]) => ({ items, page: 1, limit: 10, total: items.length });
const render = (ui: React.ReactElement) => renderWithProviders(ui, { storageKey: ADMIN_LOCALE_KEY });
const writes = (calls: RecordedCall[]) => calls.filter((c) => c.method !== "GET");

// Cold first renders of full pages can be slow when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 15_000 });

beforeEach(() => {
  signInAdmin();
});

describe("caregiver verification page", () => {
  const pending = seed.caregivers.find((c) => c.verificationStatus === "PENDING" && c.documents.length > 0)!;

  function api() {
    return mockFetch((c) => {
      if (c.method === "GET" && apiPath(c) === "/admin/caregivers") {
        const status = c.url.searchParams.get("status");
        // Default filter is now "All" (no status param); also serve the pending row then.
        return json(status === "PENDING" || status === null ? page([pending]) : page([]));
      }
      if (c.method === "POST") {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- action routes omit `user`
        const { user, ...record } = pending;
        return json({ ...record, verificationStatus: "APPROVED" }, 201);
      }
      return json({});
    });
  }

  it("lists caregivers from /admin/caregivers and approves from the drawer", async () => {
    const f = api();
    const user = userEvent.setup({ delay: null });
    render(<CaregiversPage />);

    const name = await screen.findByText(pending.user.fullName);
    const listCall = f.calls.find((c) => c.url.searchParams.get("limit") === "10")!;
    expect(Object.fromEntries(listCall.url.searchParams)).toEqual({ page: "1", limit: "10" });

    await user.click(name);
    const drawer = await screen.findByRole("dialog");
    await user.click(within(drawer).getByRole("button", { name: "Approve" }));
    const confirm = await screen.findByRole("dialog", { name: `Approve ${pending.user.fullName}?` });
    await user.click(within(confirm).getByRole("button", { name: "Approve caregiver" }));

    await waitFor(() => expect(writes(f.calls)).toHaveLength(1));
    const post = writes(f.calls)[0];
    expect(post.method).toBe("POST");
    expect(apiPath(post)).toBe(`/admin/caregivers/${pending.id}/approve`);
    expect(post.body).toEqual({});
    expect(await screen.findByText(`${pending.user.fullName} approved`, { exact: false })).toBeInTheDocument();
  });

  it("renders in Urdu (RTL) when the admin locale is ur", async () => {
    localStorage.setItem(ADMIN_LOCALE_KEY, "ur");
    api();
    render(<CaregiversPage />);
    expect(await screen.findByRole("heading", { name: "کیئرگیور کی تصدیق" })).toBeInTheDocument();
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.lang).toBe("ur");
    expect(await screen.findByText(pending.user.fullName)).toBeInTheDocument();
  });
});

describe("payouts page", () => {
  it("reject requires a reason before posting it", async () => {
    const requested = seed.payouts.find((p) => p.status === "REQUESTED")!;
    const f = mockFetch((c) => (c.method === "GET" ? json(page([requested])) : json({ ...requested, status: "REJECTED" }, 201)));
    const user = userEvent.setup({ delay: null });
    render(<PayoutsPage />);

    await screen.findByText(requested.caregiver.user.fullName);
    expect(Object.fromEntries(f.calls[0].url.searchParams)).toEqual({ page: "1", limit: "10" });
    await user.click(screen.getByRole("button", { name: "Reject" }));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Reject payout" });
    expect(confirm).toBeDisabled();

    const reason = within(dialog).getByRole("textbox");
    await user.type(reason, "ab");
    expect(confirm).toBeDisabled();
    await user.click(confirm);
    expect(writes(f.calls)).toHaveLength(0);

    await user.type(reason, "c wrong IBAN");
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    await waitFor(() => expect(writes(f.calls)).toHaveLength(1));
    const post = writes(f.calls)[0];
    expect(apiPath(post)).toBe(`/admin/payouts/${requested.id}/reject`);
    expect(post.body).toEqual({ reason: "abc wrong IBAN" });
  });
});

describe("promo form", () => {
  it("blocks PERCENT > 100 and validTo not after validFrom, then creates a valid code", async () => {
    const f = mockFetch((c) => (c.method === "GET" ? json([]) : json({ id: "pr1", ...(c.body as object) }, 201)));
    const user = userEvent.setup({ delay: null });
    render(<PromosPage />);

    await user.click(await screen.findByRole("button", { name: /New promo code/ }));
    const dialog = await screen.findByRole("dialog");
    const create = within(dialog).getByRole("button", { name: "Create code" });

    await user.type(within(dialog).getByLabelText(/^Code/), "save50");
    const amount = within(dialog).getByLabelText(/Percent off/);
    await user.clear(amount);
    await user.type(amount, "150");
    fireEvent.change(within(dialog).getByLabelText(/Valid from/), { target: { value: "2026-11-10" } });
    fireEvent.change(within(dialog).getByLabelText(/Valid until/), { target: { value: "2026-11-10" } });

    expect(within(dialog).getByText("Cannot exceed 100%")).toBeInTheDocument();
    expect(within(dialog).getByText("Must be after the start date")).toBeInTheDocument();
    expect(create).toBeDisabled();
    await user.click(create);

    await user.clear(amount);
    await user.type(amount, "50");
    expect(within(dialog).queryByText("Cannot exceed 100%")).not.toBeInTheDocument();
    expect(create).toBeDisabled(); // dates still invalid
    expect(writes(f.calls)).toHaveLength(0);

    fireEvent.change(within(dialog).getByLabelText(/Valid until/), { target: { value: "2026-11-30" } });
    expect(create).toBeEnabled();
    await user.click(create);
    await waitFor(() => expect(writes(f.calls)).toHaveLength(1));
    const post = writes(f.calls)[0];
    expect(apiPath(post)).toBe("/admin/promos");
    // Asia/Karachi (UTC+5): local day bounds.
    expect(post.body).toEqual({
      code: "SAVE50",
      discountType: "PERCENT",
      discountValue: 50,
      validFrom: "2026-11-09T19:00:00.000Z",
      validTo: "2026-11-30T18:59:59.000Z",
      active: true,
    });
  });
});

describe("settings page", () => {
  it("saves the numeric value to PUT /admin/config/:key", async () => {
    const item = seed.platformConfig.find((c) => c.key === "booking.respondWindowMinutes")!;
    const f = mockFetch((c) => (c.method === "GET" ? json(seed.platformConfig) : json({ ...item, value: 45 })));
    const user = userEvent.setup({ delay: null });
    render(<SettingsPage />);

    const input = await screen.findByRole("spinbutton", { name: "Caregiver response window" });
    const save = within(input.closest("form")!).getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    await user.clear(input);
    await user.type(input, item.value === 45 ? "46" : "45");
    await user.click(save);

    await waitFor(() => expect(writes(f.calls)).toHaveLength(1));
    const put = writes(f.calls)[0];
    expect(put.method).toBe("PUT");
    expect(apiPath(put)).toBe("/admin/config/booking.respondWindowMinutes");
    expect(put.body).toEqual({ value: item.value === 45 ? 46 : 45 });
    expect(typeof (put.body as { value: unknown }).value).toBe("number");
  });
});

describe("reports page", () => {
  it("downloads <type>-report.csv with a UTF-8 BOM", async () => {
    mockFetch(() => new Response("id,amount\n1,600", { headers: { "Content-Type": "text/csv" } }));
    let blob: Blob | null = null;
    const create = vi.fn((b: Blob) => {
      blob = b;
      return "blob:report";
    });
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {});
    const user = userEvent.setup({ delay: null });
    render(<ReportsPage />);

    // Cards are ordered payments, payouts, bookings, caregivers.
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Payments", "Payouts", "Bookings", "Caregivers"]);
    await user.click(screen.getAllByRole("button", { name: /Download CSV/ })[1]);
    await waitFor(() => expect(click).toHaveBeenCalled());
    const anchor = click.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.download).toBe("payouts-report.csv");
    const bytes = new Uint8Array(await blob!.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toBe("id,amount\n1,600");
  });
});
