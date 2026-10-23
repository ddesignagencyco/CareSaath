import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiPath, fakeJwt, json, mockFetch } from "@/test/utils";
import { renderWithProviders } from "@/test/utils";
import { ApiHealthPill } from "@/features/admin/components/shell/api-health";
import { AdminShell } from "@/features/admin/components/shell/admin-shell";
import { session } from "@/features/admin/lib/api/session";
import LoginPage from "@/app/admin/login/page";
import { ADMIN_LOCALE_KEY, router, signInAdmin } from "./helpers";

vi.mock("next/navigation", async () => {
  const { router } = await import("./helpers");
  return {
    useRouter: () => router,
    usePathname: () => "/admin",
    useSearchParams: () => new URLSearchParams(),
    useParams: () => ({}),
  };
});

// Cold first renders of full pages can be slow when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 15_000 });

beforeEach(() => {
  Object.values(router).forEach((fn) => fn.mockReset());
});

describe("admin login", () => {
  async function signIn(role: string) {
    const f = mockFetch((c) => {
      if (apiPath(c) === "/auth/otp/request") return json({ ttlSeconds: 300 });
      if (apiPath(c) === "/auth/otp/verify")
        return json({ accessToken: fakeJwt({ sub: "u1", role, phone: c.body && (c.body as { phone: string }).phone, type: "access" }), refreshToken: "R-new" });
      return json({ ok: true });
    });
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<LoginPage />, { storageKey: ADMIN_LOCALE_KEY });
    await user.click(screen.getByLabelText("Mobile number"));
    await user.paste("3001234567");
    await user.click(screen.getByRole("button", { name: /Send verification code/ }));
    await user.click(await screen.findByLabelText("Digit 1"));
    await user.paste("123456");
    return f;
  }

  it("rejects a non-ADMIN account: revokes the session and shows the error", async () => {
    const f = await signIn("CUSTOMER");
    expect(await screen.findByText("This number is not registered as a CareSaath admin.")).toBeInTheDocument();
    const verify = f.calls.find((c) => apiPath(c) === "/auth/otp/verify")!;
    expect(verify.body).toEqual({ phone: "+923001234567", code: "123456" });
    const logout = f.calls.find((c) => apiPath(c) === "/auth/logout");
    expect(logout?.method).toBe("POST");
    expect(logout?.body).toEqual({ refreshToken: "R-new" });
    expect(session.get()).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("stores the session and enters the console for an ADMIN", async () => {
    const f = await signIn("ADMIN");
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin"));
    expect(session.get()).toMatchObject({ refreshToken: "R-new", phone: "+923001234567" });
    expect(f.calls.some((c) => apiPath(c) === "/auth/logout")).toBe(false);
  });
});

describe("admin shell", () => {
  it("redirects to /admin/login when the session is cleared", async () => {
    mockFetch(() => json({ status: "ok", postgres: true, redis: true }));
    signInAdmin();
    renderWithProviders(
      <AdminShell>
        <p>Console content</p>
      </AdminShell>,
      { storageKey: ADMIN_LOCALE_KEY },
    );
    expect(screen.getByText("Console content")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();

    act(() => session.clear()); // dispatches caresaath:admin-session
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login?next=/admin"));
    expect(screen.queryByText("Console content")).not.toBeInTheDocument();
  });

  it("does not render the console for a non-admin token", async () => {
    mockFetch(() => json({ status: "ok", postgres: true, redis: true }));
    session.set({ accessToken: fakeJwt({ sub: "c1", role: "CUSTOMER", type: "access" }), refreshToken: "R", phone: "+923001234567" });
    renderWithProviders(
      <AdminShell>
        <p>Console content</p>
      </AdminShell>,
    );
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login?next=/admin"));
    expect(screen.queryByText("Console content")).not.toBeInTheDocument();
  });
});

describe("API health pill", () => {
  it.each([
    ["healthy", () => json({ status: "ok", postgres: true, redis: true }), "API connected", "API, database and cache are all up."],
    ["degraded (200, redis down)", () => json({ status: "ok", postgres: true, redis: false }), "API degraded", "Down: Cache (Redis)"],
    ["degraded (503)", () => json({ statusCode: 503, message: "PostgreSQL unavailable" }, 503), "API degraded", "Down: Database (PostgreSQL)"],
  ])("%s", async (_name, respond, label, detail) => {
    const f = mockFetch(respond);
    renderWithProviders(<ApiHealthPill />);
    const pill = screen.getByRole("status");
    expect(pill).toHaveTextContent("Checking API…");
    await waitFor(() => expect(pill).toHaveTextContent(label));
    expect(pill).toHaveAttribute("title", detail);
    expect(apiPath(f.last())).toBe("/health");
  });

  it("unreachable when the network fails", async () => {
    mockFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    renderWithProviders(<ApiHealthPill />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("API unreachable"));
    expect(screen.getByRole("status")).toHaveAttribute("title", "Cannot reach the API at http://api.test/api/v1");
  });
});
