import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/utils";
import { storeLocale } from "./__tests__/helpers";
import { ReasonDialog } from "./reason-dialog";

function setup(props: Partial<React.ComponentProps<typeof ReasonDialog>> = {}) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  renderWithProviders(
    <ReasonDialog open title="Reject caregiver" confirmLabel="Reject" onConfirm={onConfirm} onClose={onClose} {...props} />,
  );
  return { onConfirm, onClose, user: userEvent.setup() };
}

describe("ReasonDialog", () => {
  it("required reason: confirm stays disabled until 3+ characters, counter updates, reason is trimmed", async () => {
    const { onConfirm, user } = setup({ required: true, maxLength: 200 });
    const confirm = screen.getByRole("button", { name: "Reject" });
    const box = screen.getByLabelText(/Reason/);
    expect(box).toHaveFocus();
    expect(confirm).toBeDisabled();
    expect(screen.getByText("0/200")).toBeInTheDocument();

    await user.type(box, "  ab ");
    expect(confirm).toBeDisabled(); // trimmed length 2
    expect(screen.getByText("5/200")).toBeInTheDocument();
    await user.type(box, "c");
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith("ab c");
  });

  it("optional reason allows an empty note and says so", async () => {
    const { onConfirm, user } = setup({ label: "Note" });
    expect(screen.getByText("0/1000 · optional")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reject" }));
    expect(onConfirm).toHaveBeenCalledWith("");
  });

  it("respects maxLength", async () => {
    const { user } = setup({ maxLength: 5 });
    const box = screen.getByLabelText("Reason");
    await user.type(box, "1234567");
    expect(box).toHaveValue("12345");
  });

  it("cancel clears the draft and closes", async () => {
    const { onClose, user } = setup({ required: true });
    await user.type(screen.getByLabelText(/Reason/), "draft");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("withReason=false hides the note and confirms straight away", async () => {
    const { onConfirm, user } = setup({ withReason: false, required: true, children: <p>Reactivate this account?</p> });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("Reactivate this account?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reject" }));
    expect(onConfirm).toHaveBeenCalledWith("");
  });

  it("loading disables the confirm button", () => {
    setup({ loading: true });
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
  });

  it("is translated in Urdu", () => {
    storeLocale("ur");
    setup({});
    expect(screen.getByRole("button", { name: "منسوخ کریں" })).toBeInTheDocument();
  });
});
