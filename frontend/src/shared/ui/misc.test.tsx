import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/utils";
import { LocaleProvider } from "../i18n/provider";
import { storeLocale } from "../__tests__/helpers";
import { BrandLoader, PageLoader } from "./brand-loader";
import { EmptyState, ErrorState, FilterTabs, Pagination, TableSkeleton } from "./misc";

const TABS = [
  { value: "all", label: "All", count: 12 },
  { value: "open", label: "Open", count: 3 },
  { value: "closed", label: "Closed" },
] as const;

describe("FilterTabs", () => {
  it("marks the active tab and reports clicks", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<FilterTabs value="open" onChange={onChange} options={[...TABS]} />);
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Open/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /All/ })).toHaveAttribute("aria-selected", "false");
    await user.click(screen.getByRole("tab", { name: "Closed" }));
    expect(onChange).toHaveBeenCalledWith("closed");
  });

  it("shows counts after hydration", () => {
    renderWithProviders(<FilterTabs value="all" onChange={() => {}} options={[...TABS]} />);
    expect(screen.getByRole("tab", { name: /^All/ })).toHaveTextContent(/^All\s*12$/);
    expect(screen.getByRole("tab", { name: /^Open/ })).toHaveTextContent(/^Open\s*3$/);
    expect(screen.getByRole("tab", { name: /^Closed/ })).toHaveTextContent(/^Closed$/);
  });

  it("holds counts back in server HTML so hydration matches", () => {
    const html = renderToString(<FilterTabs value="all" onChange={() => {}} options={[...TABS]} />);
    expect(html).toContain("All");
    expect(html).not.toContain("12");
    expect(html).not.toContain(">3<");
  });
});

describe("Pagination", () => {
  it("shows the range and pages forwards/backwards", async () => {
    const user = userEvent.setup();
    const onPage = vi.fn();
    renderWithProviders(<Pagination page={2} limit={10} total={25} onPage={onPage} />);
    expect(screen.getByText("11–20 of 25")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous page" }));
    expect(onPage).toHaveBeenLastCalledWith(1);
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPage).toHaveBeenLastCalledWith(3);
  });

  it("disables previous on the first page and next on the last", () => {
    const { rerender } = renderWithProviders(<Pagination page={1} limit={10} total={25} onPage={() => {}} />);
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();
    rerender(<Pagination page={3} limit={10} total={25} onPage={() => {}} />);
    expect(screen.getByText("21–25 of 25")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  it("renders nothing when there are no rows", () => {
    renderWithProviders(<Pagination page={1} limit={10} total={0} onPage={() => {}} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("ErrorState / EmptyState / TableSkeleton", () => {
  it("ErrorState shows the error message and retries", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderWithProviders(<ErrorState error={new Error("Network down")} onRetry={onRetry} />);
    expect(screen.getByText("Couldn't load this data")).toBeInTheDocument();
    expect(screen.getByText("Network down")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("ErrorState without an Error or retry handler", () => {
    renderWithProviders(<ErrorState error="nope" />);
    expect(screen.getByText("Unexpected error")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("ErrorState in Urdu", () => {
    storeLocale("ur");
    renderWithProviders(<ErrorState error={null} onRetry={() => {}} />);
    expect(screen.getByRole("button", { name: "دوبارہ کوشش کریں" })).toBeInTheDocument();
  });

  it("EmptyState shows title and optional description", () => {
    const { rerender } = renderWithProviders(<EmptyState title="No visits" description="Book your first visit" />);
    expect(screen.getByText("No visits")).toBeInTheDocument();
    expect(screen.getByText("Book your first visit")).toBeInTheDocument();
    rerender(<EmptyState title="Nothing" />);
    expect(screen.getByText("Nothing")).toBeInTheDocument();
    expect(screen.queryByText("Book your first visit")).toBeNull();
  });

  it("TableSkeleton is announced as busy loading", () => {
    renderWithProviders(<TableSkeleton rows={2} />);
    expect(screen.getByLabelText("Loading")).toHaveAttribute("aria-busy", "true");
  });
});

describe("BrandLoader", () => {
  it("is an image with an accessible label", () => {
    renderWithProviders(<BrandLoader />);
    expect(screen.getByRole("img", { name: "Loading" })).toBeInTheDocument();
  });

  it("accepts a custom (translated) label", () => {
    renderWithProviders(<BrandLoader label="لوڈ ہو رہا ہے" />);
    expect(screen.getByRole("img", { name: "لوڈ ہو رہا ہے" })).toBeInTheDocument();
  });

  it("PageLoader shows one loader and hides the decorative wordmark", () => {
    renderWithProviders(
      <LocaleProvider>
        <PageLoader fullScreen />
      </LocaleProvider>,
    );
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getByText("Saath").parentElement).toHaveAttribute("aria-hidden", "true");
  });
});
