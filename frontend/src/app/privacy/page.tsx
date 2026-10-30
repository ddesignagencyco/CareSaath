import type { Metadata } from "next";
import { Bullets, LegalShell, Section } from "../legal";

export const metadata: Metadata = {
  title: "Privacy Policy — CareSaath",
  description: "How CareSaath collects, uses and protects your personal and health-related information.",
};

export default function Privacy() {
  return (
    <LegalShell
      title="Privacy Policy"
      updated="October 2026"
      intro="CareSaath connects families with verified home-visiting caregivers. Because home care involves sensitive health information, protecting your data is central to how the service is built. This policy explains what we collect, how we use it, and the choices you have. We will update it as the service grows."
    >
      <Section title="Information we collect">
        <Bullets
          items={[
            "Account details: your phone number (used for OTP sign-in), name and preferred language.",
            "Patient profiles: the patient's name, relationship, date of birth and the basic medical context you choose to add.",
            "Addresses and location: service addresses with a map pin, and the GPS coordinates used to confirm a caregiver's check-in and check-out.",
            "Documents: prescriptions or care plans you upload, and a caregiver&rsquo;s licence and certificate documents.",
            "Bookings and visits: visit schedules, status history, visit notes and your ratings and reviews.",
            "Payment information: the method you choose and transaction references. Card and wallet payments are processed by licensed gateways — we do not store full card numbers.",
          ]}
        />
      </Section>

      <Section title="How we use your information">
        <Bullets
          items={[
            "To provide the service: match you with caregivers, schedule visits and share what a caregiver needs for the visit.",
            "To verify caregivers against the PNC or PMDC register before they can appear to customers.",
            "To process payments and caregiver payouts.",
            "For safety: run OTP and GPS check-in, handle SOS alerts, and manage safety incidents and disputes.",
            "To send you SMS, WhatsApp and push notifications about your visits.",
            "To meet legal, regulatory and audit obligations.",
          ]}
        />
      </Section>

      <Section title="How we protect it">
        <p>
          Patient medical documents and personal data are encrypted in transit and at rest. Access to a patient&rsquo;s details is limited to the
          assigned caregiver and authorised admin staff. Credential approvals, visit check-ins and check-outs, and safety incidents are
          logged with a timestamp and the actor, so sensitive actions are auditable.
        </p>
      </Section>

      <Section title="When we share information">
        <Bullets
          items={[
            "With your assigned caregiver — only what they need to carry out the booked visit.",
            "With payment providers (card, JazzCash, Easypaisa, Raast) to process a transaction you initiate.",
            "With CareSaath admin and compliance staff for verification, safety and dispute handling.",
            "Where required by law or to respond to a safety emergency.",
          ]}
        />
        <p>We do not sell your personal information.</p>
      </Section>

      <Section title="Your choices">
        <Bullets
          items={[
            "View and update your profile, patient profiles, addresses and emergency contacts in the app.",
            "Switch the app language between Urdu and English at any time.",
            "Remove a patient profile or address when it is not tied to an active booking.",
            "Contact us to ask about the data held about you.",
          ]}
        />
      </Section>

      <Section title="Payments and compliance">
        <p>
          Digital payments are handled by licensed gateways in line with State Bank of Pakistan rules. CareSaath follows applicable
          health-data and consumer-protection norms, and verifies caregiver licences before activation.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>
          We may update this policy as CareSaath expands to new cities and features; material changes will be reflected here with a new
          date. Questions about your privacy can be sent to{" "}
          <a href="mailto:privacy@caresaath.pk" className="font-semibold text-brand-700 hover:underline">
            privacy@caresaath.pk
          </a>
          .
        </p>
      </Section>
    </LegalShell>
  );
}
