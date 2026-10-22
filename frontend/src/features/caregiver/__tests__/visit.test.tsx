import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaregiverVisitDetail } from "@shared/caregiver-types";
import { apiPath, json, mockFetch, renderWithProviders, type RecordedCall } from "@/test/utils";
import VisitDetailPage from "@/app/caregiver/(app)/visits/[id]/page";
import { LOCALE_KEY, signInCaregiver, visitDetail } from "./fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/caregiver/visits/v1",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: "v1" }),
}));

function backend(detail: CaregiverVisitDetail, respond?: (c: RecordedCall) => Response | undefined) {
  return mockFetch((c) => {
    const custom = respond?.(c);
    if (custom) return custom;
    if (apiPath(c) === "/auth/refresh") return json({ accessToken: "A2", refreshToken: "r2" }, 201);
    if (c.method === "GET" && apiPath(c) === "/caregiver/visits/v1") return json(detail);
    if (apiPath(c) === "/caregiver/visits/v1/check-in-otp") return json({ ttlSeconds: 600, sentTo: "+923211234567" }, 201);
    return json({ ...detail }, 201);
  });
}

const posts = (f: ReturnType<typeof mockFetch>) => f.calls.filter((c) => c.method !== "GET" && apiPath(c) !== "/auth/refresh");

function renderPage() {
  return renderWithProviders(<VisitDetailPage />, { storageKey: LOCALE_KEY });
}

beforeEach(() => signInCaregiver());

describe("visit flow: next action per status", () => {
  it("CONFIRMED shows Start travel (not check-in) and posts en-route", async () => {
    const user = userEvent.setup();
    const f = backend(visitDetail({ status: "CONFIRMED" }));
    renderPage();
    const start = await screen.findByRole("button", { name: "Start travel" });
    expect(screen.queryByText("Arrived? Check in")).not.toBeInTheDocument();
    await user.click(start);
    await vi.waitFor(() => expect(posts(f)).toHaveLength(1));
    expect(apiPath(posts(f)[0])).toBe("/caregiver/visits/v1/en-route");
    expect(posts(f)[0].body).toEqual({});
  });

  it("EN_ROUTE shows check-in; OTP check-in sends {method:'OTP', code}", async () => {
    const user = userEvent.setup();
    const f = backend(visitDetail({ status: "EN_ROUTE" }));
    renderPage();
    expect(await screen.findByText("Arrived? Check in")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start travel" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Family's code" }));
    await user.click(screen.getByRole("button", { name: "Send code to family" }));
    const digit = await screen.findByLabelText("Digit 1");
    expect(apiPath(posts(f)[0])).toBe("/caregiver/visits/v1/check-in-otp");
    expect(screen.getByText(/Code sent to/)).toBeInTheDocument();

    fireEvent.change(digit, { target: { value: "123456" } });
    await vi.waitFor(() => expect(posts(f)).toHaveLength(2));
    expect(apiPath(posts(f)[1])).toBe("/caregiver/visits/v1/check-in");
    expect(posts(f)[1].body).toEqual({ method: "OTP", code: "123456" });
  });

  it("a wrong family code shows the error inline instead of signing out", async () => {
    const user = userEvent.setup();
    backend(visitDetail({ status: "EN_ROUTE" }), (c) =>
      apiPath(c) === "/caregiver/visits/v1/check-in" ? json({ statusCode: 401, message: "Invalid check-in OTP" }, 401) : undefined,
    );
    renderPage();
    await user.click(await screen.findByRole("tab", { name: "Family's code" }));
    await user.click(screen.getByRole("button", { name: "Send code to family" }));
    fireEvent.change(await screen.findByLabelText("Digit 1"), { target: { value: "000000" } });
    expect(await screen.findByText("Invalid check-in OTP")).toBeInTheDocument();
    expect(screen.getByLabelText("Digit 1")).toHaveValue("");
  });

  describe("GPS check-in", () => {
    afterEach(() => {
      Reflect.deleteProperty(navigator, "geolocation");
    });

    it("sends lat/lng as numbers", async () => {
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: { getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: 31.5163, longitude: 74.3435, accuracy: 10 } } as GeolocationPosition) },
      });
      const user = userEvent.setup();
      const f = backend(visitDetail({ status: "EN_ROUTE" }));
      renderPage();
      await user.click(await screen.findByRole("button", { name: "Check in with my location" }));
      await vi.waitFor(() => expect(posts(f)).toHaveLength(1));
      expect(posts(f)[0].body).toEqual({ method: "GPS", lat: 31.5163, lng: 74.3435 });
    });

    it("without geolocation shows a message and offers the family code; nothing is sent", async () => {
      const user = userEvent.setup();
      const f = backend(visitDetail({ status: "EN_ROUTE" }));
      renderPage();
      await user.click(await screen.findByRole("button", { name: "Check in with my location" }));
      expect(await screen.findByText("This browser can't share your location.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Use the family's code" })).toBeInTheDocument();
      expect(posts(f)).toHaveLength(0);
    });
  });

  it("CHECKED_OUT note step requires text and sends only {summary}", async () => {
    const user = userEvent.setup();
    const f = backend(visitDetail({ status: "CHECKED_OUT", checkInAt: "2026-10-22T04:00:00.000Z", checkOutAt: "2026-10-22T04:50:00.000Z" }));
    renderPage();
    const note = await screen.findByRole("textbox", { name: "Visit note" });
    const submit = screen.getByRole("button", { name: "Submit & complete visit" });
    expect(submit).toBeDisabled();
    await user.type(note, "   ");
    expect(submit).toBeDisabled();
    await user.click(submit);
    expect(posts(f)).toHaveLength(0);

    await user.clear(note);
    await user.type(note, "  BP 130/85, insulin 14 units  ");
    expect(submit).toBeEnabled();
    await user.click(submit);
    await vi.waitFor(() => expect(posts(f)).toHaveLength(1));
    expect(apiPath(posts(f)[0])).toBe("/caregiver/visits/v1/note");
    expect(posts(f)[0].body).toEqual({ summary: "BP 130/85, insulin 14 units" });
  });
});

describe("cash payment card", () => {
  const pendingCash = { id: "pay1", method: "CASH" as const, status: "PENDING" as const, amount: 2500_00, caregiverAmount: 2125_00, paidAt: null };

  it("is hidden when the API returns no payments (today's backend)", async () => {
    backend(visitDetail({ status: "CHECKED_IN", checkInAt: "2026-10-22T04:00:00.000Z" }));
    renderPage();
    expect(await screen.findByText("Visit in progress")).toBeInTheDocument();
    expect(screen.queryByText("Cash payment")).not.toBeInTheDocument();
  });

  it("is hidden for card payments and before check-in", async () => {
    backend(visitDetail({ status: "CONFIRMED", payments: [pendingCash] }));
    const { unmount } = renderPage();
    await screen.findByRole("button", { name: "Start travel" });
    expect(screen.queryByText("Cash payment")).not.toBeInTheDocument();
    unmount();

    backend(visitDetail({ status: "CHECKED_IN", checkInAt: "2026-10-22T04:00:00.000Z", payments: [{ ...pendingCash, method: "CARD" }] }));
    renderPage();
    await screen.findByText("Visit in progress");
    expect(screen.queryByText("Cash payment")).not.toBeInTheDocument();
  });

  it("shows for a pending CASH payment and confirms after the dialog", async () => {
    const user = userEvent.setup();
    const f = backend(visitDetail({ status: "CHECKED_IN", checkInAt: "2026-10-22T04:00:00.000Z", payments: [pendingCash] }));
    renderPage();
    expect(await screen.findByText("Cash payment")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm cash received" }));
    const dialog = await screen.findByRole("dialog");
    expect(posts(f)).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "Yes, I received it" }));
    await vi.waitFor(() => expect(posts(f)).toHaveLength(1));
    expect(apiPath(posts(f)[0])).toBe("/caregiver/payments/pay1/confirm-cash");
    expect(posts(f)[0].body).toEqual({});
  });
});

describe("medical context", () => {
  it("shows readable medical context", async () => {
    backend(visitDetail());
    renderPage();
    expect(await screen.findByText("Type 2 diabetes, insulin twice daily.")).toBeInTheDocument();
  });

  it("never shows undecryptable iv:tag:data ciphertext", async () => {
    const cipher = "q83vEjRWeJA=:3q2+7wAAAAAAAAAAAAAAAA==:c2VjcmV0IG1lZGljYWw=";
    const base = visitDetail();
    backend({ ...base, booking: { ...base.booking, patient: { ...base.booking.patient, medicalContext: cipher } } });
    renderPage();
    expect(await screen.findByText("Medical details couldn't be loaded. Ask the family before starting care.")).toBeInTheDocument();
    expect(screen.queryByText(cipher)).not.toBeInTheDocument();
  });

  it("text with colons that isn't ciphertext is still shown", async () => {
    const text = "BP: 130/85: check daily";
    const base = visitDetail();
    backend({ ...base, booking: { ...base.booking, patient: { ...base.booking.patient, medicalContext: text } } });
    renderPage();
    expect(await screen.findByText(text)).toBeInTheDocument();
  });
});

describe("Urdu", () => {
  it("renders the visit page right-to-left with Urdu actions", async () => {
    localStorage.setItem(LOCALE_KEY, "ur");
    backend(visitDetail({ status: "CONFIRMED" }));
    renderPage();
    expect(await screen.findByRole("button", { name: "روانہ ہوں" })).toBeInTheDocument();
    expect(screen.getByText("جانے کے لیے تیار ہیں؟")).toBeInTheDocument();
    expect(document.documentElement.dir).toBe("rtl");
  });
});
