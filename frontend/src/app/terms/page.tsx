import { Suspense } from "react";
import type { Metadata } from "next";
import { fetchEditorialPage } from "@shared/api/editorial";
import { Bullets, EditorialHtml, formatUpdatedDate, LegalShell, Section } from "../legal";

export const metadata: Metadata = {
  title: "Terms of Service — CareSaath",
  description: "The terms that govern your use of the CareSaath home-care marketplace.",
};

async function TermsContent() {
  const page = await fetchEditorialPage("terms");

  if (page?.content) {
    return (
      <LegalShell
        title={page.title || "Terms of Service"}
        updated={formatUpdatedDate(page.updatedAt)}
        activeSlug="terms"
        intro="The terms, safety protocols, and responsibilities governing verified home-care bookings on CareSaath."
      >
        <EditorialHtml html={page.content} />
      </LegalShell>
    );
  }

  return (
    <LegalShell
      title="Terms of Service"
      updated="November 2026"
      activeSlug="terms"
      intro="These Terms of Service govern your use of CareSaath across Pakistan. By creating an account or booking a visit, you agree to them. Please read the safety and liability sections carefully."
    >
      <Section title="What CareSaath is">
        <p>
          CareSaath is a marketplace that connects customers with independent, verified nurses, physiotherapists, and caregivers for home
          visits. CareSaath facilitates bookings, payments, and safety tooling — it does not itself practise medicine. Clinical care is the
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

      <Section title="Medical emergencies and liability">
        <p>
          CareSaath is not an emergency service. In a life-threatening medical emergency, call your local emergency services (Rescue 1122)
          and proceed to the nearest hospital. These terms are governed by the laws of Pakistan. Questions can be sent to{" "}
          <a href="mailto:info@caresaath.com" className="font-semibold text-brand-700 hover:underline">
            info@caresaath.com
          </a>
          .
        </p>
      </Section>
    </LegalShell>
  );
}

export default function Terms() {
  return (
    <Suspense
      fallback={
        <LegalShell
          title="Terms of Service"
          updated="November 2026"
          activeSlug="terms"
          intro="The terms, safety protocols, and responsibilities governing verified home-care bookings on CareSaath."
        >
          <div className="space-y-4">
            <div className="h-6 w-1/3 animate-pulse rounded-lg bg-ink-100" />
            <div className="h-4 w-full animate-pulse rounded bg-ink-100" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-ink-100" />
          </div>
        </LegalShell>
      }
    >
      <TermsContent />
    </Suspense>
  );
}
