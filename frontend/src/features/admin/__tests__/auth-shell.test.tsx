import { act, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiPath, json, mockFetch, setSessionCookies } from "@/test/utils";
import { renderWithProviders } from "@/test/utils";
import { ApiHealthPill } from "@/features/admin/components/shell/api-health";
import { AdminShell } from "@/features/admin/components/shell/admin-shell";
import { session } from "@/features/admin/lib/api/session";
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

  it("does not render the console for a non-admin session", async () => {
    mockFetch(() => json({ status: "ok", postgres: true, redis: true }));
    // Signed in, but the cs_session role cookie is CUSTOMER, not ADMIN.
    session.set({ phone: "+923001234567" });
    setSessionCookies("CUSTOMER");
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
