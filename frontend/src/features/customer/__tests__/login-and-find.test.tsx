import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { messages } from "@shared/i18n/messages";
import FindCarePage from "@/app/customer/(app)/caregivers/page";
import { mockFetch, renderWithProviders } from "@/test/utils";
import { caregiver, money, router, STORAGE_KEY } from "./fixtures";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace, back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/customer/caregivers",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

const en = messages.en;

const results = {
  items: [
    { ...caregiver, availabilityRules: undefined },
    { ...caregiver, id: "cg2", user: { fullName: "Sadia Malik" }, ratingAverage: "0", ratingCount: 0, specialty: "ELDERLY_CARE", ratePerVisit: 180000 },
  ],
  page: 1,
  limit: 12,
  total: 2,
};

describe("find care page", { timeout: 15_000 }, () => {
  it("renders caregiver cards from /caregivers with string ratings", async () => {
    const f = mockFetch(router({ "GET /caregivers": results }));
    renderWithProviders(<FindCarePage />, { storageKey: STORAGE_KEY });

    const card = (await screen.findByText("Fatima Noor")).closest("a")!;
    expect(card).toHaveAttribute("href", "/customer/caregivers/cg1");
    expect(within(card).getByText("4.8")).toBeInTheDocument();
    expect(within(card).getByLabelText("4.8 out of 5 stars")).toBeInTheDocument();
    expect(within(card).getByText("(43)")).toBeInTheDocument();
    expect(within(card).getByText(money(250000))).toBeInTheDocument();

    const fresh = screen.getByText("Sadia Malik").closest("a")!;
    expect(within(fresh).getByText(en.customerA.bits.newOn)).toBeInTheDocument();
    expect(screen.getByText("2 caregivers")).toBeInTheDocument();

    expect(Object.fromEntries(f.last().url.searchParams)).toEqual({ page: "1", limit: "12" });
    expect(f.last().headers.Authorization).toBeUndefined();
  });

  it("renders in Urdu right-to-left", async () => {
    localStorage.setItem(STORAGE_KEY, "ur");
    mockFetch(router({ "GET /caregivers": results }));
    renderWithProviders(<FindCarePage />, { storageKey: STORAGE_KEY });

    expect(await screen.findByText("Fatima Noor")).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement.dir).toBe("rtl"));
    expect(document.documentElement.lang).toBe("ur");
    expect(screen.getByRole("heading", { name: messages.ur.customerA.find.title })).toBeInTheDocument();
    expect(messages.ur.customerA.find.title).toMatch(/[؀-ۿ]/);
  });
});
