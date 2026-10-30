import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages, type Locale } from "@shared/i18n/messages";
import BookPage from "@/app/customer/(app)/caregivers/[id]/book/page";
import { apiPath, json, mockFetch, renderWithProviders } from "@/test/utils";
import { address, caregiver, patient, router, signIn, STORAGE_KEY } from "./fixtures";

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace, back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/customer/caregivers/cg1/book",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: "cg1" }),
}));

beforeEach(() => {
  // Only Date is faked ("today" = Thu 22 Oct 2026, Karachi) so user-event timers still run.
  vi.useFakeTimers({ now: new Date("2026-10-22T09:00:00+05:00"), toFake: ["Date"] });
  signIn();
});
afterEach(() => vi.useRealTimers());

function setup(locale: Locale = "en", createResponse: () => Response = () => json({ id: "bk-new" }, 201)) {
  if (locale === "ur") localStorage.setItem(STORAGE_KEY, "ur");
  const f = mockFetch(
    router({
      "GET /caregivers/cg1": caregiver,
      "GET /customer/patients": [patient],
      "GET /customer/addresses": [address],
      "POST /customer/bookings": createResponse,
    }),
  );
  const user = userEvent.setup({ delay: null });
  renderWithProviders(<BookPage />, { storageKey: STORAGE_KEY });
  const M = messages[locale];
  const b = M.customerA.book;
  const cont = () => screen.getByRole("button", { name: M.common.actions.continue });
  const field = (label: string) => screen.getByLabelText(new RegExp(`^${label}`));
  const bookingPosts = () => f.calls.filter((c) => c.method === "POST" && apiPath(c) === "/customer/bookings");
  return { f, user, M, b, cont, field, bookingPosts };
}

async function pickPatientAndAddress(s: ReturnType<typeof setup>) {
  expect(s.cont()).toBeDisabled();
  await s.user.click(await screen.findByRole("radio", { name: /Rashida Begum/ }));
  expect(s.cont()).toBeEnabled();
  await s.user.click(s.cont());

  expect(s.cont()).toBeDisabled();
  await s.user.click(await screen.findByRole("radio", { name: /House 42/ }));
  await s.user.click(s.cont());
}

// Multi-step UI flows; the first render in a worker is slow on cold start.
describe("booking flow", { timeout: 15_000 }, () => {
  it("can't continue without a patient, an address or a valid time window; sends a SINGLE booking with endDate = startDate", async () => {
    const s = setup();
    await pickPatientAndAddress(s);

    // When: nothing chosen yet.
    expect(s.cont()).toBeDisabled();
    fireEvent.change(s.field(s.b.when.date), { target: { value: "2026-10-26" } });
    fireEvent.change(s.field(s.b.when.arriveBetween), { target: { value: "12:00" } });
    expect(screen.getByText(s.b.errors.endTime)).toBeInTheDocument();
    expect(s.cont()).toBeDisabled();
    fireEvent.change(s.field(s.b.when.arriveBetween), { target: { value: "10:00" } });
    fireEvent.change(s.field(s.b.when.date), { target: { value: "2026-10-20" } });
    expect(screen.getByText(s.b.errors.past)).toBeInTheDocument();
    expect(s.cont()).toBeDisabled();
    fireEvent.change(s.field(s.b.when.date), { target: { value: "2026-10-26" } });
    expect(s.cont()).toBeEnabled();
    await s.user.click(s.cont());

    expect(screen.getByRole("heading", { name: s.b.review.title })).toBeInTheDocument();
    await s.user.click(screen.getByRole("button", { name: s.b.send }));

    await waitFor(() => expect(s.bookingPosts()).toHaveLength(1));
    expect(s.bookingPosts()[0].body).toEqual({
      patientId: "p1",
      caregiverId: "cg1",
      addressId: "a1",
      type: "SINGLE",
      startDate: "2026-10-26",
      endDate: "2026-10-26",
      timeWindowStart: "10:00",
      timeWindowEnd: "11:00",
    });
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/customer/bookings/bk-new"));
  });

  it("recurring requires weekdays; sends integer weekdays and an uppercased promo code", async () => {
    const s = setup();
    await pickPatientAndAddress(s);

    await s.user.click(screen.getByRole("radio", { name: s.b.when.recurring }));
    fireEvent.change(s.field(s.b.when.from), { target: { value: "2026-10-26" } });
    expect(screen.getByText(s.b.errors.chooseEnd)).toBeInTheDocument();
    fireEvent.change(s.field(s.b.when.until), { target: { value: "2026-11-08" } });
    expect(s.cont()).toBeEnabled();

    // Mon–Fri are preselected; clear them all.
    for (const btn of screen.getAllByRole("button", { pressed: true })) await s.user.click(btn);
    expect(screen.getByText(s.b.errors.pickDay)).toBeInTheDocument();
    expect(s.cont()).toBeDisabled();

    const days = screen.getAllByRole("button", { pressed: false });
    expect(days).toHaveLength(7);
    await s.user.click(days[2]); // Wednesday (ISO 3)
    await s.user.click(days[0]); // Monday (ISO 1)
    expect(s.cont()).toBeEnabled();
    await s.user.click(s.cont());

    fireEvent.change(screen.getByLabelText(s.b.review.promo), { target: { value: "welcome-10" } });
    await s.user.click(screen.getByRole("button", { name: s.b.send }));

    await waitFor(() => expect(s.bookingPosts()).toHaveLength(1));
    expect(s.bookingPosts()[0].body).toEqual({
      patientId: "p1",
      caregiverId: "cg1",
      addressId: "a1",
      type: "RECURRING",
      startDate: "2026-10-26",
      endDate: "2026-11-08",
      timeWindowStart: "10:00",
      timeWindowEnd: "11:00",
      weekdays: [1, 3],
      promoCode: "WELCOME10",
    });
  });

  it("shows an invalid promo error from the API under the promo field, translated (Urdu)", async () => {
    const s = setup("ur", () => json({ statusCode: 400, message: "Promo code is not valid" }, 400));
    await pickPatientAndAddress(s);
    fireEvent.change(s.field(s.b.when.date), { target: { value: "2026-10-26" } });
    await s.user.click(s.cont());

    const promo = screen.getByLabelText(s.b.review.promo);
    fireEvent.change(promo, { target: { value: "NOPE" } });
    await s.user.click(screen.getByRole("button", { name: s.b.send }));

    const error = await screen.findByText(s.M.apiErrors.Promo_code_is_not_valid);
    expect(error).toHaveTextContent("پرومو کوڈ درست نہیں ہے");
    // Rendered by the promo Field (the input now sits in a flex row with the Apply button), not as a toast.
    expect(promo.parentElement?.parentElement).toContainElement(error);
    expect(nav.replace).not.toHaveBeenCalled();

    // Editing the code clears the error.
    fireEvent.change(promo, { target: { value: "NOPEX" } });
    expect(screen.queryByText(s.M.apiErrors.Promo_code_is_not_valid)).not.toBeInTheDocument();
  });
});
