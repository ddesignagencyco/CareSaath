import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiPath, json, mockFetch, renderWithProviders } from "@/test/utils";
import EarningsPage from "@/app/caregiver/(app)/earnings/page";
import { LOCALE_KEY, signInCaregiver } from "./fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/caregiver/earnings",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

const T = "2026-10-01T05:00:00.000Z";
const account = { id: "pa1", caregiverId: "cg", type: "MOBILE_WALLET", provider: "JazzCash", accountTitle: "Fatima Noor", accountNumber: "****0011", createdAt: T, updatedAt: T };

function backend(availableAmount = 5000_00) {
  return mockFetch((c) => {
    switch (`${c.method} ${apiPath(c)}`) {
      case "GET /caregiver/earnings":
        return json({ availableAmount, availableCount: 2, pendingAmount: 0, pendingCount: 0, lifetimeEarnings: 9000_00, lifetimeCommission: 1000_00, lifetimeVisits: 4, recentPayoutRequests: [] });
      case "GET /caregiver/payout-accounts":
        return json([account]);
      case "GET /caregiver/payouts":
        return json({ items: [], page: 1, limit: 20, total: 0 });
      default:
        return json({ id: "po1", status: "REQUESTED" }, 201);
    }
  });
}

const posts = (f: ReturnType<typeof mockFetch>) => f.calls.filter((c) => c.method === "POST");

beforeEach(() => signInCaregiver());

describe("payout request", () => {
  it("validates amount ≤ available balance and sends {payoutAccountId, amount} in paisa", async () => {
    const user = userEvent.setup();
    const f = backend();
    renderWithProviders(<EarningsPage />, { storageKey: LOCALE_KEY });
    await screen.findByText("JazzCash");
    const withdraw = screen.getByRole("button", { name: "Withdraw" });
    await vi.waitFor(() => expect(withdraw).toBeEnabled());
    await user.click(withdraw);

    const dialog = await screen.findByRole("dialog");
    const amount = within(dialog).getByLabelText("Amount (Rs)");
    expect(amount).toHaveValue(5000);

    fireEvent.change(amount, { target: { value: "6000" } });
    expect(within(dialog).getByText(/You can withdraw up to Rs\s?5,000/)).toBeInTheDocument();
    const submit = within(dialog).getByRole("button", { name: "Request payout" });
    expect(submit).toBeDisabled();
    await user.click(submit);

    fireEvent.change(amount, { target: { value: "0" } });
    expect(within(dialog).getByText("Enter an amount of at least Rs 1")).toBeInTheDocument();
    expect(posts(f)).toHaveLength(0);

    fireEvent.change(amount, { target: { value: "1500" } });
    await user.click(within(dialog).getByRole("button", { name: /Request Rs\s?1,500/ }));
    await vi.waitFor(() => expect(posts(f)).toHaveLength(1));
    expect(apiPath(posts(f)[0])).toBe("/caregiver/payouts");
    expect(posts(f)[0].body).toEqual({ payoutAccountId: "pa1", amount: 150000 });
  });

  it("disables Withdraw when the balance is under Rs 1", async () => {
    backend(50);
    renderWithProviders(<EarningsPage />, { storageKey: LOCALE_KEY });
    await screen.findByText("JazzCash");
    expect(screen.getByRole("button", { name: "Withdraw" })).toBeDisabled();
  });
});
