import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/utils";
import { storeLocale } from "../__tests__/helpers";
import type { SosResult } from "../caregiver-types";
import { FileViewer } from "./file-viewer";
import { Drawer, Modal } from "./overlay";
import { SosDialog } from "./sos-dialog";
import { useToast } from "./toast";

afterEach(() => vi.useRealTimers());

/* ---------------- Modal / Drawer ---------------- */

describe("Modal", () => {
  it("renders an accessible dialog in a portal and closes via Escape and the close button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = renderWithProviders(
      <Modal open onClose={onClose} title="Edit address" description="Change where we visit" footer={<button>Save</button>}>
        <input aria-label="Street" autoFocus />
      </Modal>,
    );
    const dialog = screen.getByRole("dialog", { name: "Edit address" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(container).not.toContainElement(dialog); // portalled to <body>
    expect(screen.getByText("Change where we visit")).toBeInTheDocument();
    expect(screen.getByLabelText("Street")).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("closes when the backdrop is clicked, and unlocks scrolling when closed", () => {
    const onClose = vi.fn();
    const { rerender } = renderWithProviders(<Modal open onClose={onClose} title="T" />);
    fireEvent.click(document.querySelector(".fixed.inset-0 > [aria-hidden]")!);
    expect(onClose).toHaveBeenCalled();
    rerender(<Modal open={false} onClose={onClose} title="T" />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("ignores Escape while closed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(<Modal open={false} onClose={onClose} title="T" />);
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Drawer has a translated close button", async () => {
    storeLocale("ur");
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(
      <Drawer open onClose={onClose} title="Details">
        body
      </Drawer>,
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("Details");
    const close = screen.getAllByRole("button")[0];
    await user.click(close);
    expect(onClose).toHaveBeenCalled();
  });
});

/* ---------------- Toast ---------------- */

function ToastButtons() {
  const toast = useToast();
  return (
    <>
      <button onClick={() => toast.success("Saved")}>ok</button>
      <button onClick={() => toast.error("Failed")}>bad</button>
    </>
  );
}

describe("Toast", () => {
  it("shows success and error toasts that can be dismissed", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ToastButtons />);
    await user.click(screen.getByText("ok"));
    await user.click(screen.getByText("bad"));
    const toasts = screen.getAllByRole("status");
    expect(toasts.map((t) => t.textContent)).toEqual(["Saved", "Failed"]);
    await user.click(within(toasts[0]).getByRole("button", { name: "Dismiss" }));
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("Failed");
  });

  it("auto-dismisses after 4.5 s", () => {
    vi.useFakeTimers();
    renderWithProviders(<ToastButtons />);
    fireEvent.click(screen.getByText("ok"));
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(4400));
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByRole("status")).toBeNull();
  });
});

/* ---------------- FileViewer ---------------- */

describe("FileViewer (signed URLs must never leak)", () => {
  function view(load: () => Promise<{ url: string; mimeType?: string }>, mimeType?: string) {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const onClose = vi.fn();
    const r = renderWithProviders(<FileViewer id="doc-1" title="License" description="PNC" mimeType={mimeType} load={load} onClose={onClose} />);
    return { ...r, open, onClose };
  }
  const noLinks = () => {
    expect(document.querySelectorAll("a")).toHaveLength(0);
    expect(document.querySelector('[target="_blank"]')).toBeNull();
    expect(document.querySelector("[download]")).toBeNull();
  };

  it("renders an image with zoom controls and no links", async () => {
    const user = userEvent.setup();
    const { open } = view(async () => ({ url: "https://files.test/doc.png?sig=SECRET", mimeType: "image/png" }));
    const img = await screen.findByRole("img", { name: "License" });
    expect(img).toHaveAttribute("src", "https://files.test/doc.png?sig=SECRET");
    expect(screen.getByText("Confidential: view only")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByText("150%")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Fit to screen" }));
    expect(screen.getByText("100%")).toBeInTheDocument();
    noLinks();
    expect(open).not.toHaveBeenCalled();
    expect(document.body.innerHTML.match(/SECRET/g)).toHaveLength(1); // only the <img src>
  });

  it("treats data:image URLs as images even if the record says PDF", async () => {
    view(async () => ({ url: "data:image/png;base64,AAAA" }), "application/pdf");
    expect(await screen.findByRole("img", { name: "License" })).toBeInTheDocument();
  });

  it("renders a PDF in an iframe with the toolbar hidden, no zoom, no links", async () => {
    const { open } = view(async () => ({ url: "https://files.test/doc.pdf?sig=S" }), "application/pdf");
    const frame = await screen.findByTitle("License");
    expect(frame.tagName).toBe("IFRAME");
    expect(frame).toHaveAttribute("src", "https://files.test/doc.pdf?sig=S#toolbar=0&navpanes=0&view=FitH");
    expect(screen.queryByRole("group", { name: "Zoom" })).toBeNull();
    noLinks();
    expect(open).not.toHaveBeenCalled();
  });

  it("shows an error state with retry when the URL can't be fetched", async () => {
    const user = userEvent.setup();
    const load = vi.fn().mockRejectedValueOnce(new Error("Document not found")).mockResolvedValue({ url: "https://f.test/x.png", mimeType: "image/png" });
    const { open } = view(load);
    expect(await screen.findByText("Document not found")).toBeInTheDocument();
    noLinks();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("img", { name: "License" })).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
    expect(open).not.toHaveBeenCalled();
  });

  it("closes with the close button", async () => {
    const user = userEvent.setup();
    const { onClose } = view(() => new Promise(() => {}));
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});

/* ---------------- SosDialog ---------------- */

const SOS_RESULT = { incident: {}, notifiedAdmins: 2, notifiedContacts: 1 } as unknown as SosResult;

describe("SosDialog", () => {
  it("sends the trimmed note, then shows who was notified", async () => {
    const user = userEvent.setup();
    const send = vi.fn().mockResolvedValue(SOS_RESULT);
    const onClose = vi.fn();
    renderWithProviders(<SosDialog description="Visit with Amina" contact={{ label: "Family", phone: "+923001234567" }} send={send} onClose={onClose} />);
    expect(screen.getByRole("dialog", { name: "Send an SOS alert?" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Rescue 1122/ })).toHaveAttribute("href", "tel:1122");
    expect(screen.getByRole("link", { name: /Family/ })).toHaveAttribute("href", "tel:+923001234567");

    await user.type(screen.getByLabelText("What's happening?"), "  Patient fell  ");
    await user.click(screen.getByRole("button", { name: /Send SOS now/ }));
    expect(send).toHaveBeenCalledWith("Patient fell");
    expect(await screen.findByRole("dialog", { name: "Help is being alerted" })).toBeInTheDocument();
    expect(screen.getByText(/2 safety team members and 1 emergency contact notified/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("sends undefined for an empty note; failure toasts and keeps the form", async () => {
    const user = userEvent.setup();
    const send = vi.fn().mockRejectedValue(new Error("x"));
    renderWithProviders(<SosDialog description="d" send={send} onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: /Send SOS now/ }));
    expect(send).toHaveBeenCalledWith(undefined);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Couldn't send SOS"));
    expect(screen.getByRole("dialog", { name: "Send an SOS alert?" })).toBeInTheDocument();
  });

  it("cancel closes without sending", async () => {
    const user = userEvent.setup();
    const send = vi.fn();
    const onClose = vi.fn();
    renderWithProviders(<SosDialog description="d" send={send} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
