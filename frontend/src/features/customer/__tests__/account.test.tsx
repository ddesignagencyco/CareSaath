import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@shared/i18n/messages";
import AddressesPage from "@/app/customer/(app)/account/addresses/page";
import PaymentsPage from "@/app/customer/(app)/account/payments/page";
import { apiPath, json, mockFetch, renderWithProviders } from "@/test/utils";
import { PatientForm } from "../components/forms";
import { address, money, patient, payment, router, signIn, STORAGE_KEY } from "./fixtures";

const en = messages.en.customerB;
const actions = messages.en.common.actions;

beforeEach(signIn);

describe("PatientForm", { timeout: 15_000 }, () => {
  it("blocks an empty name or a future date of birth, then posts only the filled fields", async () => {
    const user = userEvent.setup({ delay: null });
    const f = mockFetch(router({ "POST /customer/patients": json({ ...patient, id: "p9" }, 201) }));
    const onClose = vi.fn();
    const onSaved = vi.fn();
    renderWithProviders(<PatientForm patient={null} onClose={onClose} onSaved={onSaved} />, { storageKey: STORAGE_KEY });

    const submit = screen.getByRole("button", { name: en.patientForm.addSubmit });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText(new RegExp(`^${en.patientForm.fullName}`)), "  Rashida Begum ");
    expect(submit).toBeEnabled();

    const dob = screen.getByLabelText(en.patientForm.dob);
    fireEvent.change(dob, { target: { value: "2999-01-01" } });
    expect(screen.getByText(en.patientForm.dobFuture)).toBeInTheDocument();
    expect(submit).toBeDisabled();
    fireEvent.change(dob, { target: { value: "1950-03-01" } });
    expect(submit).toBeEnabled();

    await user.click(screen.getByRole("radio", { name: en.patientForm.myself }));
    await user.click(submit);

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(f.calls).toHaveLength(1);
    expect(f.last().body).toEqual({ name: "Rashida Begum", relationship: "SELF", dateOfBirth: "1950-03-01" });
    expect(onClose).toHaveBeenCalled();
  });

  it("never prefills or saves back an undecryptable medical context", async () => {
    const user = userEvent.setup({ delay: null });
    const f = mockFetch(router({ "PATCH /customer/patients/p1": patient }));
    const encrypted = { ...patient, medicalContext: "q1w2e3r4t5y6u7i8:ZmFrZXRhZw==:Y2lwaGVydGV4dA==" };
    renderWithProviders(<PatientForm patient={encrypted} onClose={vi.fn()} />, { storageKey: STORAGE_KEY });

    expect(screen.getByLabelText(en.patientForm.medical)).toHaveValue("");
    expect(screen.getByText(en.patientForm.medicalUnreadable)).toBeInTheDocument();
    expect(screen.queryByText(/ZmFrZXRhZw/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: actions.save }));
    await waitFor(() => expect(f.calls).toHaveLength(1));
    expect(f.last().method).toBe("PATCH");
    expect(f.last().body).not.toHaveProperty("medicalContext");
  });
});

describe("Addresses page", { timeout: 15_000 }, () => {
  it("shows the friendly message when an address in use can't be deleted", async () => {
    const user = userEvent.setup({ delay: null });
    const f = mockFetch(
      router({
        "GET /customer/addresses": [address],
        "DELETE /customer/addresses/a1": json({ statusCode: 404, message: "Address is referenced by existing bookings and cannot be deleted" }, 404),
      }),
    );
    renderWithProviders(<AddressesPage />, { storageKey: STORAGE_KEY });

    await user.click(await screen.findByRole("button", { name: en.addresses.removeLabel }));
    // Deletion is now behind a confirmation dialog.
    const dialog = await screen.findByRole("dialog", { name: en.addresses.removeConfirmTitle });
    await user.click(within(dialog).getByRole("button", { name: en.addresses.removeConfirm }));
    expect(await screen.findByText(en.addresses.hasBookings)).toBeInTheDocument();
    expect(screen.queryByText(/referenced by existing bookings/)).not.toBeInTheDocument();
    expect(f.calls.filter((c) => c.method === "DELETE").map(apiPath)).toEqual(["/customer/addresses/a1"]);
  });
});

describe("Payments page", { timeout: 15_000 }, () => {
  it("filters by status and opens the receipt from GET /customer/payments/:id", async () => {
    const user = userEvent.setup({ delay: null });
    const f = mockFetch(
      router({
        "GET /customer/payments": { items: [payment], page: 1, limit: 15, total: 1 },
        "GET /customer/payments/pay1": { ...payment, gatewayRef: null },
      }),
    );
    renderWithProviders(<PaymentsPage />, { storageKey: STORAGE_KEY });

    await user.click(await screen.findByText(/Visit for Rashida Begum/));
    const dialog = await screen.findByRole("dialog", { name: en.payments.receipt.title });
    expect(await within(dialog).findByText(money(212500))).toBeInTheDocument();
    expect(within(dialog).getByText(money(250000))).toBeInTheDocument();
    expect(within(dialog).getByText(money(37500))).toBeInTheDocument();
    expect(within(dialog).getByText(en.payments.cashDue)).toBeInTheDocument();
    expect(within(dialog).getByText(en.payments.receipt.pendingCash)).toBeInTheDocument();
    expect(within(dialog).getByText(en.payments.receipt.notPaidYet)).toBeInTheDocument();
    expect(within(dialog).getByText("pay1")).toBeInTheDocument();
    expect(f.calls.some((c) => apiPath(c) === "/customer/payments/pay1")).toBe(true);

    await user.click(within(dialog).getByRole("button", { name: actions.close }));
  });
});
