import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useTranslations } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { LanguageToggle } from "./language-toggle";
import { LocaleProvider, useLocaleControl } from "./provider";

const KEY = "caresaath.customer.locale";

function Probe() {
  const { locale } = useLocaleControl();
  const t = useTranslations("common.actions");
  return (
    <p data-testid="probe">
      {locale}:{t("cancel")}
    </p>
  );
}

describe("LocaleProvider + LanguageToggle", () => {
  it("defaults to English, LTR", () => {
    render(
      <LocaleProvider storageKey={KEY}>
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByTestId("probe")).toHaveTextContent("en:Cancel");
    expect(document.documentElement.lang).toBe("en");
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("applies a stored Urdu choice to <html lang dir> and the messages", () => {
    localStorage.setItem(KEY, "ur");
    render(
      <LocaleProvider storageKey={KEY}>
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByTestId("probe")).toHaveTextContent("ur:منسوخ کریں");
    expect(document.documentElement.lang).toBe("ur");
    expect(document.documentElement.dir).toBe("rtl");
  });

  it("toggling persists to the section key, flips direction and reports the new locale", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <LocaleProvider storageKey={KEY}>
        <LanguageToggle onChange={onChange} />
        <Probe />
      </LocaleProvider>,
    );
    const toggle = screen.getByRole("button", { name: "Switch language to اردو" });
    expect(toggle).toHaveTextContent("اردو");

    await user.click(toggle);
    expect(localStorage.getItem(KEY)).toBe("ur");
    expect(onChange).toHaveBeenLastCalledWith("ur");
    expect(document.documentElement.dir).toBe("rtl");
    expect(screen.getByTestId("probe")).toHaveTextContent(/^ur:/);

    // Now offers English (label in Urdu).
    const back = screen.getByRole("button", { name: /English/ });
    await user.click(back);
    expect(localStorage.getItem(KEY)).toBe("en");
    expect(onChange).toHaveBeenLastCalledWith("en");
    expect(document.documentElement.dir).toBe("ltr");
    expect(document.documentElement.lang).toBe("en");
  });

  it("resets <html> to en/ltr when the section unmounts", () => {
    localStorage.setItem(KEY, "ur");
    const { unmount } = render(
      <LocaleProvider storageKey={KEY}>
        <Probe />
      </LocaleProvider>,
    );
    expect(document.documentElement.dir).toBe("rtl");
    unmount();
    expect(document.documentElement.lang).toBe("en");
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("without a storageKey (admin) stays English and ignores toggles", async () => {
    const user = userEvent.setup();
    localStorage.setItem(KEY, "ur");
    render(
      <LocaleProvider>
        <LanguageToggle />
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByTestId("probe")).toHaveTextContent("en:Cancel");
    await user.click(screen.getByRole("button", { name: "Switch language to اردو" }));
    expect(screen.getByTestId("probe")).toHaveTextContent("en:Cancel");
    expect(document.documentElement.dir).toBe("ltr");
    expect(localStorage.getItem(KEY)).toBe("ur"); // untouched
  });

  it("each section keeps its own locale", () => {
    localStorage.setItem("caresaath.caregiver.locale", "ur");
    render(
      <LocaleProvider storageKey={KEY}>
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByTestId("probe")).toHaveTextContent(/^en:/);
  });
});
