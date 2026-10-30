import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { messages } from "@shared/i18n/messages";
import CustomerLoginPage from "@/app/customer/login/page";
import FindCarePage from "@/app/customer/(app)/caregivers/page";
import { apiPath, fakeJwt, mockFetch, renderWithProviders } from "@/test/utils";
import { SESSION_KEY } from "../lib/api/session";
import { caregiver, money, router, STORAGE_KEY } from "./fixtures";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace, back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/customer/caregivers",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

const en = messages.en;

describe("customer login", { timeout: 15_000 }, () => {
  it("rejects a caregiver number: shows the error, revokes the tokens and stays signed out", async () => {
    const user = userEvent.setup({ delay: null });
    const tokens = { accessToken: fakeJwt({ sub: "cg-u", role: "CAREGIVER", type: "access" }), refreshToken: "refresh-cg" };
    const f = mockFetch(
      router({
        "POST /auth/otp/request": { ttlSeconds: 300 },
        "POST /auth/otp/verify": tokens,
        "GET /customer/me": { id: "cg-u", phone: "+923001110002", role: "CAREGIVER", fullName: "Bilal", caregiverProfile: { id: "x", verificationStatus: "APPROVED" } },
        "POST /auth/logout": { ok: true },
      }),
    );
    renderWithProviders(<CustomerLoginPage />, { storageKey: STORAGE_KEY });

    await user.type(screen.getByLabelText(en.shared.phone.label), "3001110002");
    await user.click(screen.getByRole("button", { name: en.shared.login.sendCode }));
    const firstDigit = await screen.findByLabelText(en.shared.otp.digit.replace("{n}", "1"));
    await user.click(firstDigit);
    await user.keyboard("123456");

    expect(await screen.findByText(en.customerA.login.roleCaregiver)).toBeInTheDocument();
    expect(f.calls.map((c) => `${c.method} ${apiPath(c)}`)).toEqual(["POST /auth/otp/request", "POST /auth/otp/verify", "GET /customer/me", "POST /auth/logout"]);
    expect(f.calls[0].body).toEqual({ phone: "+923001110002" });
    expect(f.calls[1].body).toEqual({ phone: "+923001110002", code: "123456" });
    expect(f.last().body).toEqual({ refreshToken: "refresh-cg" });
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(nav.replace).not.toHaveBeenCalled();
  });
});

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
