import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/utils";
import { storeLocale } from "./__tests__/helpers";
import {
  DisputeStatusBadge,
  IncidentStatusBadge,
  PayoutStatusBadge,
  PriorityBadge,
  UserStatusBadge,
  VerificationBadge,
  VisitStatusBadge,
} from "./status";

const BADGES = () => (
  <>
    <VerificationBadge status="PENDING" />
    <UserStatusBadge status="SUSPENDED" />
    <PriorityBadge priority="CRITICAL" />
    <IncidentStatusBadge status="IN_REVIEW" />
    <DisputeStatusBadge status="RESOLVED" />
    <PayoutStatusBadge status="PAID" />
    <VisitStatusBadge status="CANCELLED" />
  </>
);

describe("status badges", () => {
  it("English labels", () => {
    renderWithProviders(<BADGES />);
    for (const text of ["Pending", "Account suspended", "Critical", "In review", "Resolved", "Paid", "Visit cancelled"]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });

  it("Urdu labels", () => {
    storeLocale("ur");
    renderWithProviders(<BADGES />);
    expect(screen.getByText("زیرِ غور")).toBeInTheDocument();
    expect(screen.getByText("اکاؤنٹ معطل")).toBeInTheDocument();
    expect(screen.queryByText("Pending")).toBeNull();
    expect(screen.queryByText("Account suspended")).toBeNull();
  });

  it("tone follows the status (completed is success, cancelled danger)", () => {
    const { rerender } = renderWithProviders(<VisitStatusBadge status="COMPLETED" />);
    expect(screen.getByText("Visit completed")).toHaveClass("bg-success-50");
    rerender(<VisitStatusBadge status="CANCELLED" />);
    expect(screen.getByText("Visit cancelled")).toHaveClass("bg-danger-50");
    rerender(<VisitStatusBadge status="EN_ROUTE" />);
    expect(screen.getByText("Visit en route")).toHaveClass("bg-info-50");
    rerender(<VerificationBadge status="APPROVED" />);
    expect(screen.getByText("Approved")).toHaveClass("bg-success-50");
  });
});
