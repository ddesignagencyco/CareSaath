import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { messages } from "@shared/i18n/messages";
import { apiPath, json, mockFetch, renderWithProviders } from "@/test/utils";
import { PaymentPanel, ReviewPanel } from "../components/visit-panels";
import { router, signIn, STORAGE_KEY, visitDetail } from "./fixtures";

const en = messages.en.customerB;

beforeEach(signIn);

describe("PaymentPanel", { timeout: 15_000 }, () => {
  it("offers Cash and Card, posts {visitId, method: CASH} (no amount)", async () => {
    const user = userEvent.setup({ delay: null });
    const f = mockFetch(
      router({
        "GET /customer/payments": { items: [], page: 1, limit: 100, total: 0 },
        "POST /customer/payments": json({ id: "pay1", visitId: "v1", method: "CASH", status: "PENDING", amount: 250000 }, 201),
      }),
    );
    renderWithProviders(<PaymentPanel visit={visitDetail()} />, { storageKey: STORAGE_KEY });

    await user.click(await screen.findByRole("button", { name: en.payment.payNow }));
    const dialog = screen.getByRole("dialog", { name: en.payment.modalTitle });
    const methods = within(dialog).getAllByRole("radio");
    expect(methods).toHaveLength(4);
    const cash = within(dialog).getByRole("radio", { name: new RegExp(en.payment.methodCash) });
    const card = within(dialog).getByRole("radio", { name: new RegExp(en.payment.methodCard) });
    expect(cash).toBeEnabled();
    expect(cash).toHaveAttribute("aria-checked", "true");
    expect(card).toBeEnabled();
    // The mobile-wallet methods are still disabled until their gateway lands.
    for (const m of methods.filter((x) => x !== cash && x !== card)) {
      expect(m).toBeDisabled();
      expect(m).toHaveTextContent(en.payment.comingSoon);
    }

    await user.click(within(dialog).getByRole("button", { name: en.payment.payCash }));
    await waitFor(() => expect(f.calls.some((c) => c.method === "POST")).toBe(true));
    const post = f.calls.find((c) => c.method === "POST")!;
    expect(apiPath(post)).toBe("/customer/payments");
    expect(post.body).toEqual({ visitId: "v1", method: "CASH" });
    expect(await screen.findByText(en.payment.cashToast)).toBeInTheDocument();
  });

  it("Card posts {method: CARD} and hands off to the hosted checkout", async () => {
    const user = userEvent.setup({ delay: null });
    const f = mockFetch(
      router({
        "GET /customer/payments": { items: [], page: 1, limit: 100, total: 0 },
        "POST /customer/payments": json(
          { payment: { id: "pay2", visitId: "v1", method: "CARD", status: "PENDING", amount: 250000 }, checkoutUrl: "https://checkout.stripe.test/session_abc" },
          201,
        ),
      }),
    );
    renderWithProviders(<PaymentPanel visit={visitDetail()} />, { storageKey: STORAGE_KEY });

    await user.click(await screen.findByRole("button", { name: en.payment.payNow }));
    const dialog = screen.getByRole("dialog", { name: en.payment.modalTitle });
    await user.click(within(dialog).getByRole("radio", { name: new RegExp(en.payment.methodCard) }));
    await user.click(within(dialog).getByRole("button", { name: /Pay/ }));

    await waitFor(() => expect(f.calls.some((c) => c.method === "POST")).toBe(true));
    expect(f.calls.find((c) => c.method === "POST")!.body).toEqual({ visitId: "v1", method: "CARD" });
    // The redirecting toast only renders on the gateway (checkoutUrl) branch.
    expect(await screen.findByText(en.payment.redirecting)).toBeInTheDocument();
  });
});

describe("ReviewPanel", { timeout: 15_000 }, () => {
  it("requires a star rating, then posts {rating, comment}", async () => {
    const user = userEvent.setup({ delay: null });
    const f = mockFetch(router({ "POST /customer/visits/v1/review": json({ id: "r1", rating: 4 }, 201) }));
    renderWithProviders(<ReviewPanel visit={visitDetail({ status: "COMPLETED" })} caregiverName="Fatima Noor" />, { storageKey: STORAGE_KEY });

    expect(screen.getByText("How was Fatima's care?")).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: en.review.submit });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText(en.review.comment), "  Very caring  ");
    expect(submit).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: "4 stars" }));
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() => expect(f.calls).toHaveLength(1));
    expect(f.last().body).toEqual({ rating: 4, comment: "Very caring" });
    expect(await screen.findByText(en.review.success)).toBeInTheDocument();
  });

  it("omits an empty comment", async () => {
    const user = userEvent.setup({ delay: null });
    const f = mockFetch(router({ "POST /customer/visits/v1/review": json({ id: "r1", rating: 5 }, 201) }));
    renderWithProviders(<ReviewPanel visit={visitDetail({ status: "COMPLETED" })} caregiverName="Fatima Noor" />, { storageKey: STORAGE_KEY });
    await user.click(screen.getByRole("radio", { name: "5 stars" }));
    await user.click(screen.getByRole("button", { name: en.review.submit }));
    await waitFor(() => expect(f.calls).toHaveLength(1));
    expect(f.last().body).toEqual({ rating: 5 });
  });

  it("is hidden until the visit is completed", () => {
    mockFetch();
    renderWithProviders(<ReviewPanel visit={visitDetail({ status: "IN_PROGRESS" })} caregiverName="Fatima Noor" />, { storageKey: STORAGE_KEY });
    expect(screen.queryByRole("button", { name: en.review.submit })).not.toBeInTheDocument();
  });
});
