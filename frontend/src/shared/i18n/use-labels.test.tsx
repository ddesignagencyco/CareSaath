import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { providers, storeLocale } from "../__tests__/helpers";
import { useLabels, type Labels } from "./use-labels";

function labels(locale: "en" | "ur"): Labels {
  storeLocale(locale);
  return renderHook(() => useLabels(), { wrapper: providers().Wrapper }).result.current;
}

const VISIT = ["REQUESTED", "CONFIRMED", "DECLINED", "CANCELLED", "EN_ROUTE", "CHECKED_IN", "IN_PROGRESS", "CHECKED_OUT", "COMPLETED"] as const;
const BOOKING = ["REQUESTED", "CONFIRMED", "DECLINED", "CANCELLED", "COMPLETED"] as const;
const LICENSE = ["PNC", "PMDC", "OTHER"] as const;
const SPECIALTY = ["NURSING", "PHYSIOTHERAPY", "POST_SURGERY_CARE", "ELDERLY_CARE"] as const;

/** Every getter with every value of its enum. */
const CASES: [keyof Labels, readonly string[]][] = [
  ["specialty", SPECIALTY],
  ["specialtyHint", SPECIALTY],
  ["licenseBody", LICENSE],
  ["licenseBodyShort", LICENSE],
  ["licenseBodyOption", LICENSE],
  ["licenseBodyHint", LICENSE],
  ["verification", ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]],
  ["userStatus", ["ACTIVE", "SUSPENDED", "DEACTIVATED"]],
  ["visitAdmin", VISIT],
  ["visitCaregiver", VISIT],
  ["visitCustomer", VISIT],
  ["timeline", VISIT],
  ["docType", ["LICENSE", "CERTIFICATE", "CNIC_COPY", "OTHER"]],
  ["bookingCustomer", BOOKING],
  ["bookingCaregiver", BOOKING],
  ["payout", ["REQUESTED", "PROCESSING", "PAID", "REJECTED"]],
  ["payoutAccount", ["BANK", "MOBILE_WALLET"]],
  ["priority", ["LOW", "MEDIUM", "HIGH", "CRITICAL"]],
  ["incidentStatus", ["OPEN", "IN_REVIEW", "RESOLVED"]],
  ["incidentSource", ["CUSTOMER_COMPLAINT", "CAREGIVER_REPORT", "SOS"]],
  ["dispute", ["OPEN", "RESOLVED"]],
  ["paymentMethod", ["CASH", "CARD", "JAZZCASH", "EASYPAISA"]],
  ["paymentStatus", ["PENDING", "PAID", "FAILED", "REFUNDED"]],
  ["relation", ["SELF", "FAMILY_MEMBER"]],
  ["gender", ["Female", "Male", "Other"]],
];

describe.each(["en", "ur"] as const)("useLabels (%s)", (locale) => {
  it.each(CASES)("%s returns a real label for every value", (getter, values) => {
    // next-intl reports missing messages through console.error.
    const errors = vi.spyOn(console, "error");
    const L = labels(locale);
    const fn = L[getter] as (v: string) => string;
    for (const v of values) {
      const text = fn(v);
      expect(typeof text).toBe("string");
      expect(text.length).toBeGreaterThan(0);
      // next-intl falls back to the dotted key path when a message is missing.
      expect(text).not.toContain(`${getter}.`);
    }
    expect(errors).not.toHaveBeenCalled();
  });
});

describe("useLabels values", () => {
  it("English spot checks", () => {
    const L = labels("en");
    expect(L.verification("PENDING")).toBe("Pending");
    expect(L.licenseBodyShort("OTHER")).toBe("Other");
    expect(L.licenseBody("PNC")).toBe("Pakistan Nursing Council");
    expect(L.visitCustomer("EN_ROUTE")).toBe("Caregiver on the way");
    expect(L.paymentMethod("JAZZCASH")).toBe("JazzCash");
  });

  it("Urdu spot checks", () => {
    const L = labels("ur");
    expect(L.verification("PENDING")).toBe("زیرِ غور");
    expect(L.licenseBodyShort("OTHER")).toBe("دیگر");
    expect(L.licenseBodyShort("PNC")).toBe("PNC");
    expect(L.specialty("NURSING")).toBe("نرسنگ");
  });

  it("a missing message is detectable (guards the per-enum check above)", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const L = labels("en");
    expect(L.specialty("BOGUS" as never)).toContain("specialty.BOGUS");
    expect(errors).toHaveBeenCalled();
  });

  it("gender passes unknown values through; patientLine joins age, gender and relation", () => {
    const L = labels("en");
    expect(L.gender("Female")).toBe("Female");
    expect(L.gender("Non-binary")).toBe("Non-binary");
    expect(L.patientLine({ relationship: "SELF", gender: "Male" }, "70 yrs")).toBe("70 yrs · Male · Booked by self");
    expect(L.patientLine({ relationship: "FAMILY_MEMBER", gender: null }, null)).toBe("Family member");
  });
});
