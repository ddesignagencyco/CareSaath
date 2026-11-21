import { Suspense } from "react";
import type { Metadata } from "next";
import { fetchEditorialPage } from "@shared/api/editorial";
import { Bullets, EditorialHtml, formatUpdatedDate, LegalShell, Section } from "../legal";

export const metadata: Metadata = {
  title: "Privacy Policy — CareSaath",
  description: "How CareSaath collects, uses and protects your personal and health-related information.",
};

async function PrivacyContent() {
  const page = await fetchEditorialPage("privacy");

  if (page?.content) {
    return (
      <LegalShell
        title={page.title || "Privacy Policy"}
        updated={formatUpdatedDate(page.updatedAt)}
        activeSlug="privacy"
        intro="How CareSaath collects, encrypts, uses, and protects your personal and patient health information across Pakistan."
      >
        <EditorialHtml html={page.content} />
      </LegalShell>
    );
  }

  return (
    <LegalShell
      title="Privacy Policy"
      updated="November 2026"
      activeSlug="privacy"
      intro="CareSaath connects families across Pakistan with verified home-visiting nurses, physiotherapists, and caregivers. Because home healthcare involves sensitive personal and medical information, protecting your privacy is foundational to our platform."
    >
      <Section title="Information we collect">
        <Bullets
          items={[
            "Account details: your phone number (used for OTP sign-in), full name, email address, and preferred language.",
            "Patient profiles: the patient's name, relationship, date of birth, and basic medical context you choose to add.",
            "Addresses and location: service addresses with a map pin, and GPS coordinates used strictly to confirm caregiver check-in, check-out, and SOS safety events.",
            "Documents: prescriptions or care plans you upload, and a caregiver's CNIC, PNC/PMDC licence, and certificate documents.",
            "Bookings and visits: visit schedules, status history, clinical visit notes, and your ratings and reviews.",
            "Payment information: the method you choose and transaction references. Card and wallet payments are processed by licensed gateways — we do not store full card numbers.",
          ]}
        />
      </Section>

      <Section title="How we protect it">
        <p>
          Patient medical documents and personal data are encrypted in transit (TLS 1.3) and at rest (AES-256). Access to a patient&rsquo;s
          details is strictly limited to the assigned caregiver during an active booking and authorised admin compliance staff.
        </p>
      </Section>

      <Section title="When we share information">
        <Bullets
          items={[
            "With your assigned caregiver — only what they need to carry out the booked visit safely.",
            "With licensed payment providers (Card, JazzCash, Easypaisa) to process a transaction you initiate.",
            "With CareSaath admin and compliance staff for verification, safety, and dispute handling.",
            "Where required by Pakistani law or to respond to a safety emergency (such as Rescue 1122).",
          ]}
        />
        <p>We never sell or rent your personal or health information.</p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about your privacy or data rights can be sent to{" "}
          <a href="mailto:info@caresaath.com" className="font-semibold text-brand-700 hover:underline">
            info@caresaath.com
          </a>
          .
        </p>
      </Section>
    </LegalShell>
  );
}

export default function Privacy() {
  return (
    <Suspense
      fallback={
        <LegalShell
          title="Privacy Policy"
          updated="November 2026"
          activeSlug="privacy"
          intro="How CareSaath collects, encrypts, uses, and protects your personal and patient health information across Pakistan."
        >
          <div className="space-y-4">
            <div className="h-6 w-1/3 animate-pulse rounded-lg bg-ink-100" />
            <div className="h-4 w-full animate-pulse rounded bg-ink-100" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-ink-100" />
          </div>
        </LegalShell>
      }
    >
      <PrivacyContent />
    </Suspense>
  );
}
