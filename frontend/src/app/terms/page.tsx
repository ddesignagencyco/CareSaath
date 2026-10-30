import type { Metadata } from "next";
import { Bullets, LegalShell, Section } from "../legal";

export const metadata: Metadata = {
  title: "Terms of Service — CareSaath",
  description: "The terms that govern your use of the CareSaath home-care marketplace.",
};

export default function Terms() {
  return (
    <LegalShell
      title="Terms of Service"
      updated="October 2026"
      intro="These terms govern your use of CareSaath. By creating an account or booking a visit, you agree to them. Please read the safety and liability sections carefully."
    >
      <Section title="What CareSaath is">
        <p>
          CareSaath is a marketplace that connects customers with independent, verified nurses, physiotherapists and caregivers for home
          visits. CareSaath facilitates bookings, payments and safety tooling — it does not itself provide medical care. Clinical care is the
          professional responsibility of the caregiver who attends the visit.
        </p>
      </Section>

      <Section title="Accounts and eligibility">
        <Bullets
          items={[
            "You sign in with your phone number and a one-time password, and are responsible for activity on your account.",
            "You must provide accurate information for yourself and any patient you book on behalf of.",
            "You may book care for a family member, provided you are authorised to share their details.",
          ]}
        />
      </Section>

      <Section title="Caregivers">
        <Bullets
          items={[
            "Caregivers are verified against the PNC or PMDC register and approved by CareSaath before they appear to customers.",
            "Caregivers set their own specialty, service area, availability and rate per visit.",
            "A caregiver may be suspended or deactivated for a policy violation or an unresolved safety complaint.",
          ]}
        />
      </Section>

      <Section title="Bookings, payments and cancellations">
        <Bullets
          items={[
            "You can book a single visit or a recurring schedule, and you will see the rate before you confirm.",
            "Payment can be made in cash on the visit, or by card, JazzCash, Easypaisa or Raast.",
            "CareSaath retains a commission from the visit fee; the rest is paid out to the caregiver.",
            "You may cancel or reschedule a visit within the notice window shown in the app.",
          ]}
        />
      </Section>

      <Section title="Conduct and safety">
        <p>
          Treat caregivers and customers with respect. An in-app SOS button is available during an active visit and alerts the CareSaath
          team and your emergency contact. You can raise a safety concern tied to a specific visit, which is escalated to admin.
        </p>
      </Section>

      <Section title="Disputes">
        <p>
          If something goes wrong with a visit, either party can raise a dispute. CareSaath admin mediates and records a documented decision.
        </p>
      </Section>

      <Section title="Medical emergencies and liability">
        <p>
          CareSaath is not an emergency service. In a medical emergency, call your local emergency services or ambulance (for example 1122)
          and the nearest hospital. CareSaath&rsquo;s role is limited to facilitating the connection, payment and safety tooling between customers
          and caregivers; it does not guarantee medical outcomes, and liability is limited to the extent permitted by applicable Pakistani
          law.
        </p>
      </Section>

      <Section title="Changes, law and contact">
        <p>
          We may update these terms as the service grows; continued use means you accept the current version. These terms are governed by the
          laws of Pakistan. Questions can be sent to{" "}
          <a href="mailto:support@caresaath.pk" className="font-semibold text-brand-700 hover:underline">
            support@caresaath.pk
          </a>
          .
        </p>
      </Section>
    </LegalShell>
  );
}
