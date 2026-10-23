import { ArrowUpRight, LifeBuoy, Mail, Siren, Stethoscope } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { Reveal } from "../reveal";
import { SiteFooter } from "../site-footer";
import { SiteNav } from "../site-nav";

export const metadata: Metadata = {
  title: "Contact — CareSaath",
  description: "Reach the CareSaath team for support, caregiver onboarding, safety concerns or partnerships.",
};

const CHANNELS = [
  {
    icon: LifeBuoy,
    title: "Customer support",
    text: "Questions about a booking, a visit or a payment.",
    action: { label: "support@caresaath.pk", href: "mailto:support@caresaath.pk" },
  },
  {
    icon: Stethoscope,
    title: "Caregiver onboarding",
    text: "Join as a nurse or physiotherapist, or ask about verification.",
    action: { label: "caregivers@caresaath.pk", href: "mailto:caregivers@caresaath.pk" },
  },
  {
    icon: Mail,
    title: "Business & press",
    text: "Partnerships, media and general enquiries.",
    action: { label: "hello@caresaath.pk", href: "mailto:hello@caresaath.pk" },
  },
];

export default function Contact() {
  return (
    <div className="min-h-dvh bg-white text-ink-900">
      <SiteNav />

      <main>
        <section className="mx-auto max-w-3xl px-5 pt-16 pb-12 text-center sm:px-8 sm:pt-24">
          <p className="cs-in text-xs font-semibold tracking-[0.2em] text-brand-600 uppercase">Contact</p>
          <h1 className="cs-in-1 mt-4 text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">We&rsquo;re here to help.</h1>
          <p className="cs-in-2 mt-6 text-lg leading-relaxed text-ink-500">
            Reach the CareSaath team through the channel that fits. For anything during an active visit, use the in-app help and SOS tools.
          </p>
        </section>

        <section className="mx-auto max-w-5xl px-5 pb-12 sm:px-8">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {CHANNELS.map(({ icon: Icon, title, text, action }, i) => (
              <Reveal
                key={title}
                as="div"
                delay={i * 80}
                className="flex flex-col rounded-2xl border border-ink-100 bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-xl hover:shadow-brand-900/5"
              >
                <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                  <Icon className="size-6" strokeWidth={1.75} />
                </span>
                <h2 className="mt-5 text-lg font-semibold text-ink-900">{title}</h2>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-500">{text}</p>
                <a href={action.href} className="group mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700">
                  {action.label}
                  <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </a>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Emergency notice */}
        <section className="mx-auto max-w-5xl px-5 pb-24 sm:px-8">
          <Reveal className="flex flex-col gap-4 rounded-2xl border border-accent-200 bg-accent-50/60 p-6 sm:flex-row sm:items-center">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent-500 text-white">
              <Siren className="size-6" strokeWidth={1.75} />
            </span>
            <div>
              <h2 className="font-semibold text-ink-900">In a medical emergency</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-600">
                CareSaath is not an emergency service. During a visit, use the in-app SOS button to alert our team and your emergency
                contact. For urgent medical help, call your local emergency services or ambulance (for example 1122) and the nearest
                hospital.
              </p>
            </div>
          </Reveal>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-3xl px-5 pb-24 text-center sm:px-8">
          <Reveal>
            <h2 className="text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">Ready to book care?</h2>
            <div className="mt-7 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/customer"
                className="inline-flex items-center rounded-full bg-brand-600 px-8 py-4 text-base font-semibold text-white transition-colors hover:bg-brand-700"
              >
                Find care
              </Link>
              <Link href="/about" className="text-base font-semibold text-ink-700 transition-colors hover:text-brand-700">
                Learn about CareSaath
              </Link>
            </div>
          </Reveal>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
