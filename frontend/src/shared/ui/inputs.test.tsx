import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/utils";
import { storeLocale } from "../__tests__/helpers";
import { parsePkMobile } from "../lib/phone";
import { useTranslations } from "next-intl";
import { OtpInput } from "./otp-input";
import { PhoneField } from "./phone-field";
import { MultiSelect, Select } from "./select";

/* ---------------- OtpInput ---------------- */

function Otp({ onComplete = vi.fn(), initial = "" }: { onComplete?: (v: string) => void; initial?: string }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <OtpInput value={v} onChange={setV} onComplete={onComplete} />
      <output data-testid="otp">{v}</output>
    </>
  );
}

const box = (n: number) => screen.getByRole("textbox", { name: `Digit ${n}` });

describe("OtpInput", () => {
  it("renders 6 labelled boxes in an LTR group", () => {
    renderWithProviders(<Otp />);
    const group = screen.getByRole("group", { name: "One-time code" });
    expect(group).toHaveAttribute("dir", "ltr");
    expect(screen.getAllByRole("textbox")).toHaveLength(6);
    expect(box(1)).toHaveAttribute("autocomplete", "one-time-code");
    expect(box(1)).toHaveAttribute("inputmode", "numeric");
  });

  it("typing advances focus and completes after 6 digits", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    renderWithProviders(<Otp onComplete={onComplete} />);
    await user.click(box(1));
    await user.keyboard("12");
    expect(box(3)).toHaveFocus();
    await user.keyboard("3456");
    expect(screen.getByTestId("otp")).toHaveTextContent("123456");
    expect(onComplete).toHaveBeenCalledWith("123456");
  });

  it("ignores non-digits", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Otp />);
    await user.click(box(1));
    await user.keyboard("a-1");
    expect(screen.getByTestId("otp")).toHaveTextContent(/^1$/);
    expect(box(2)).toHaveFocus();
  });

  it("pasting a code fills every box (non-digits stripped) and completes", () => {
    const onComplete = vi.fn();
    renderWithProviders(<Otp onComplete={onComplete} />);
    fireEvent.paste(box(1), { clipboardData: { getData: () => "12 34-56" } });
    expect(screen.getByTestId("otp")).toHaveTextContent("123456");
    expect(onComplete).toHaveBeenCalledWith("123456");
    expect([1, 2, 3, 4, 5, 6].map((n) => (box(n) as HTMLInputElement).value).join("")).toBe("123456");
  });

  it("pasting text without digits does nothing", () => {
    renderWithProviders(<Otp initial="12" />);
    fireEvent.paste(box(1), { clipboardData: { getData: () => "abc" } });
    expect(screen.getByTestId("otp")).toHaveTextContent("12");
  });

  it("backspace clears the box, then the previous one when empty", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Otp initial="123" />);
    await user.click(box(3));
    await user.keyboard("{Backspace}");
    expect(screen.getByTestId("otp")).toHaveTextContent(/^12$/);
    await user.keyboard("{Backspace}");
    expect(screen.getByTestId("otp")).toHaveTextContent(/^1$/);
    expect(box(2)).toHaveFocus();
  });

  it("arrow keys move between boxes", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Otp />);
    await user.click(box(2));
    await user.keyboard("{ArrowRight}");
    expect(box(3)).toHaveFocus();
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(box(1)).toHaveFocus();
  });
});

/* ---------------- PhoneField ---------------- */

function Phone() {
  const [v, setV] = useState("");
  const t = useTranslations("shared.phone");
  const parsed = parsePkMobile(v);
  return <PhoneField value={v} onChange={setV} error={v && !parsed.ok ? t(parsed.code) : null} />;
}

describe("PhoneField", () => {
  it("sanitises input, reads LTR and wires up the label", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Phone />);
    const input = screen.getByLabelText("Mobile number");
    expect(input).toHaveAttribute("type", "tel");
    expect(input.parentElement).toHaveAttribute("dir", "ltr");
    await user.type(input, "03ab00-12x");
    expect(input).toHaveValue("0300-12");
  });

  it("shows a translated error code and links it with aria-describedby", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Phone />);
    const input = screen.getByLabelText("Mobile number");
    await user.type(input, "0400 1234567");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Enter a mobile number (starts with 03)");
    await user.clear(input);
    await user.type(input, "0300 1234567");
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByText(/Enter a mobile number/)).toBeNull();
  });

  it("errors are translated in Urdu while the field stays LTR", async () => {
    storeLocale("ur");
    const user = userEvent.setup();
    renderWithProviders(<Phone />);
    const input = screen.getByRole("textbox");
    await user.type(input, "0400 1234567");
    expect(screen.getByText("موبائل نمبر درج کریں (03 سے شروع ہو)")).toBeInTheDocument();
    expect(input.parentElement).toHaveAttribute("dir", "ltr");
  });

  it("uses a custom label when given", () => {
    renderWithProviders(<PhoneField label="Caregiver phone" value="" onChange={() => {}} />);
    expect(screen.getByLabelText("Caregiver phone")).toBeInTheDocument();
  });
});

/* ---------------- Select (react-select) ---------------- */

const OPTIONS = [
  { value: "LHR", label: "Lahore", description: "Punjab" },
  { value: "KHI", label: "Karachi" },
];

function City({ clearable }: { clearable?: boolean }) {
  const [v, setV] = useState<string | null>(null);
  return (
    <>
      <Select aria-label="City" value={v} onChange={setV} options={OPTIONS} isClearable={clearable} />
      <output data-testid="city">{String(v)}</output>
    </>
  );
}

describe("Select", () => {
  it("is a react-select combobox, never a native <select>", () => {
    const { container } = renderWithProviders(<City />);
    expect(container.querySelector("select")).toBeNull();
    expect(screen.getByRole("combobox", { name: "City" })).toBeInTheDocument();
  });

  it("shows the translated placeholder and picks an option", async () => {
    const user = userEvent.setup();
    renderWithProviders(<City />);
    expect(screen.getByText("Select…")).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "City" }));
    expect(screen.getByText("Punjab")).toBeInTheDocument(); // option description
    await user.click(screen.getByText("Karachi"));
    expect(screen.getByTestId("city")).toHaveTextContent("KHI");
    expect(screen.getByText("Karachi")).toBeInTheDocument();
    expect(document.querySelector("select")).toBeNull();
  });

  it("can be cleared back to null", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<City clearable />);
    await user.click(screen.getByRole("combobox", { name: "City" }));
    await user.click(screen.getByText("Lahore"));
    expect(screen.getByTestId("city")).toHaveTextContent("LHR");
    // react-select's clear indicator listens to mousedown.
    const clear = container.querySelector("svg.lucide-x")!.parentElement!;
    fireEvent.mouseDown(clear, { button: 0 });
    expect(screen.getByTestId("city")).toHaveTextContent("null");
  });

  it("translates placeholder and 'no options' in Urdu", async () => {
    storeLocale("ur");
    const user = userEvent.setup();
    renderWithProviders(<Select aria-label="شہر" value={null} onChange={() => {}} options={OPTIONS} isSearchable />);
    expect(screen.getByText("منتخب کریں…")).toBeInTheDocument();
    await user.type(screen.getByRole("combobox"), "zzz");
    expect(screen.getByText("کوئی آپشن نہیں")).toBeInTheDocument();
  });

  it("MultiSelect toggles several values", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    function Multi() {
      const [v, setV] = useState<string[]>([]);
      return (
        <MultiSelect
          aria-label="Cities"
          value={v}
          options={OPTIONS}
          onChange={(next) => {
            setV(next);
            onChange(next);
          }}
        />
      );
    }
    renderWithProviders(<Multi />);
    await user.click(screen.getByRole("combobox", { name: "Cities" }));
    await user.click(screen.getByText("Lahore"));
    expect(onChange).toHaveBeenLastCalledWith(["LHR"]);
    if (!screen.queryByText("Karachi")) await user.click(screen.getByRole("combobox", { name: "Cities" }));
    await user.click(screen.getByText("Karachi"));
    expect(onChange).toHaveBeenLastCalledWith(["LHR", "KHI"]);
  });
});
