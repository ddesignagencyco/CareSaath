"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";
import type { CaregiverBookingStatus, PatientRelation, PaymentMethod, PaymentStatus } from "../caregiver-types";
import type {
  CaregiverBadge,
  DisputeStatus,
  DocType,
  IncidentPriority,
  IncidentSource,
  IncidentStatus,
  LicenseBody,
  PayoutAccountType,
  PayoutStatus,
  Specialty,
  UserStatus,
  VerificationStatus,
  VisitStatus,
} from "../types";

/** Translated enum labels (statuses, specialties, councils…). */
export function useLabels() {
  const t = useTranslations("labels");
  return useMemo(
    () => ({
      specialty: (v: Specialty) => t(`specialty.${v}`),
      specialtyHint: (v: Specialty) => t(`specialtyHint.${v}`),
      caregiverBadge: (v: CaregiverBadge) => t(`caregiverBadge.${v}`),
      licenseBody: (v: LicenseBody) => t(`licenseBody.${v}`),
      /** Table sub-lines: "PNC", "PMDC", "Other". */
      licenseBodyShort: (v: LicenseBody) => t(`licenseBodyShort.${v}`),
      verification: (v: VerificationStatus) => t(`verification.${v}`),
      userStatus: (v: UserStatus) => t(`userStatus.${v}`),
      visitAdmin: (v: VisitStatus) => t(`visitAdmin.${v}`),
      licenseBodyOption: (v: LicenseBody) => t(`licenseBodyOption.${v}`),
      licenseBodyHint: (v: LicenseBody) => t(`licenseBodyHint.${v}`),
      docType: (v: DocType) => t(`docType.${v}`),
      visitCaregiver: (v: VisitStatus) => t(`visitCaregiver.${v}`),
      visitCustomer: (v: VisitStatus) => t(`visitCustomer.${v}`),
      timeline: (v: VisitStatus) => t(`timeline.${v}`),
      bookingCustomer: (v: CaregiverBookingStatus) => t(`bookingCustomer.${v}`),
      bookingCaregiver: (v: CaregiverBookingStatus) => t(`bookingCaregiver.${v}`),
      payout: (v: PayoutStatus) => t(`payout.${v}`),
      payoutAccount: (v: PayoutAccountType) => t(`payoutAccount.${v}`),
      priority: (v: IncidentPriority) => t(`priority.${v}`),
      incidentStatus: (v: IncidentStatus) => t(`incidentStatus.${v}`),
      incidentSource: (v: IncidentSource) => t(`incidentSource.${v}`),
      dispute: (v: DisputeStatus) => t(`dispute.${v}`),
      paymentMethod: (v: PaymentMethod) => t(`paymentMethod.${v}`),
      paymentStatus: (v: PaymentStatus) => t(`paymentStatus.${v}`),
      relation: (v: PatientRelation) => t(`relation.${v}`),
      gender: (v: string) => (v === "Female" || v === "Male" || v === "Other" ? t(`gender.${v}`) : v),
      patientLine: (p: { relationship: PatientRelation; gender: string | null }, age: string | null) =>
        [age, p.gender ? (p.gender === "Female" || p.gender === "Male" || p.gender === "Other" ? t(`gender.${p.gender}`) : p.gender) : null, p.relationship === "SELF" ? t("patient.self") : t("patient.family")]
          .filter(Boolean)
          .join(" · "),
    }),
    [t],
  );
}

export type Labels = ReturnType<typeof useLabels>;
