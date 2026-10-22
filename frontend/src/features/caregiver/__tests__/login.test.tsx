import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Me } from "@shared/caregiver-types";
import { apiPath, fakeJwt, json, mockFetch, renderWithProviders } from "@/test/utils";
import LoginPage from "@/app/caregiver/login/page";
import { session } from "../lib/api/session";
import { LOCALE_KEY } from "./fixtures";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/caregiver/login",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

function backend(me: Partial<Me>) {
  return mockFetch((c) => {
    switch (apiPath(c)) {
      case "/auth/otp/request":
        return json({ ttlSeconds: 300 }, 201);
      case "/auth/otp/verify":
        return json({ accessToken: fakeJwt({ sub: "u1", role: me.role, type: "access" }), refreshToken: "r1" }, 201);
      case "/customer/me":
        return json({ id: "u1", phone: "+923001110011", fullName: "", preferredLanguage: "EN", status: "ACTIVE", caregiverProfile: null, ...me });
      default:
        return json({ statusCode: 404, message: "Not found" }, 404);
    }
  });
}

async function signIn() {
  const user = userEvent.setup();
  renderWithProviders(<LoginPage />, { storageKey: LOCALE_KEY });
  await user.type(screen.getByLabelText("Mobile number"), "3001110011");
  await user.click(screen.getByRole("button", { name: /send verification code/i }));
  const first = await screen.findByLabelText("Digit 1");
  fireEvent.change(first, { target: { value: "123456" } });
}

describe("caregiver login", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an ADMIN number with the admin error and clears the session", async () => {
    const f = backend({ role: "ADMIN" });
    await signIn();
    expect(await screen.findByText("Admin accounts can't use the caregiver app.")).toBeInTheDocument();
    expect(f.calls.find((c) => apiPath(c) === "/auth/otp/verify")?.body).toEqual({ phone: "+923001110011", code: "123456" });
    expect(session.get()).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("routes an approved caregiver to the dashboard", async () => {
    backend({ role: "CAREGIVER", caregiverProfile: { id: "cg", verificationStatus: "APPROVED" } });
    await signIn();
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith("/caregiver"));
    expect(session.get()?.phone).toBe("+923001110011");
  });

  it("routes a new number (no caregiver profile) to onboarding", async () => {
    backend({ role: "CUSTOMER", caregiverProfile: null });
    await signIn();
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith("/caregiver/onboarding"));
  });
});
