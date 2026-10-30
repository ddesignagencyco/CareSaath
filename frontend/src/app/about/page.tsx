import { ArrowRight, BadgeCheck, FlaskConical, Globe, Languages, Lock, MapPin, ShieldCheck, Siren, Stethoscope, UserRound, Users, Video, Wallet } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { Reveal } from "../reveal";
import { SiteFooter } from "../site-footer";
import { SiteNav } from "../site-nav";

export const metadata: Metadata = {
  title: "About CareSaath — Verified home care for Pakistan",
  description:
    "CareSaath is a two-sided marketplace connecting families with licence-verified nurses and physiotherapists for home visits. Learn how verification, safety and payments work.",
};

const AUDIENCES = [
  { icon: Users, title: "Customers & families", text: "Book a verified caregiver for yourself or a family member, track the visit, and pay in cash or digitally." },
  { icon: Stethoscope, title: "Nurses & physiotherapists", text: "Set your rates, service area and availability, accept the requests that suit you, and withdraw your earnings." },
  { icon: ShieldCheck, title: "Platform & compliance", text: "Our team verifies every credential, handles safety and disputes, and keeps the marketplace trustworthy." },
];

const VERIFY = [
  { title: "Credential check", text: "Each caregiver submits their CNIC, licence number and certificates, checked against the PNC or PMDC register." },
  { title: "Admin approval", text: "No profile goes live to customers until our team has reviewed the documents and approved it." },
  { title: "Periodic re-verification", text: "Credentials are re-checked on a regular cycle so every active caregiver stays current." },
  { title: "Accountability", text: "A caregiver can be suspended or deactivated for a policy violation or an unresolved safety complaint." },
];

const SAFETY = [
  { icon: UserRound, title: "Know who's coming", text: "The caregiver's name and photo are shown to you before the visit begins." },
  { icon: Siren, title: "SOS during a visit", text: "An in-app emergency button alerts our team and your emergency contact, with a clear escalation path for a medical emergency." },
  { icon: Lock, title: "Encrypted health data", text: "Medical documents and personal data are encrypted, with access limited to the assigned caregiver and admin." },
  { icon: BadgeCheck, title: "Full audit trail", text: "Every credential approval, check-in, check-out and safety incident is logged with a timestamp." },
];

const PAKISTAN = [
  { icon: Languages, title: "Urdu & English", text: "The whole app works in both languages, switchable any time." },
  { icon: Wallet, title: "Local payments", text: "Cash on the visit, card, JazzCash, Easypaisa or Raast." },
  { icon: MapPin, title: "Pilot cities first", text: "Launching in one to two cities with a manually vetted caregiver pool before scaling." },
  { icon: Globe, title: "Fast on any network", text: "Search is built to load quickly, even on a 3G connection." },
];

const FUTURE = [
  { icon: BadgeCheck, title: "Recurring-care plans", text: "Subscriptions for chronic or long-term patients." },
  { icon: FlaskConical, title: "Home lab collection", text: "Diagnostic sample pick-up alongside nursing visits." },
  { icon: Video, title: "Doctor teleconsults", text: "An add-on consultation when a visit needs a doctor's input." },
  { icon: Users, title: "Family dashboard", text: "Monitor an elderly relative's care remotely." },
];

export default function About() {
  return (
    <div className="min-h-dvh bg-white text-ink-900">
      <SiteNav />

      <main>
        {/* Intro */}
        <section className="mx-auto max-w-3xl px-5 pt-20 pb-16 text-center sm:px-8 sm:pt-28">
          <p className="cs-in text-xs font-semibold tracking-[0.25em] text-brand-600 uppercase">About CareSaath</p>
          <h1 className="cs-in-1 mt-6 text-4xl leading-[1.08] font-semibold tracking-tight text-ink-900 sm:text-5xl">
            Trusted home care, built for Pakistani families.
          </h1>
          <p className="cs-in-2 mt-6 text-lg leading-relaxed text-ink-500">
            CareSaath connects patients and families with verified home-visiting nurses, physiotherapists and post-surgery caregivers. We
            facilitate home visits and the trust around them — we do not ourselves provide medical care.
          </p>
        </section>

        {/* What it is */}
        <section className="border-y border-ink-100 bg-ink-25/40">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <Reveal>
              <h2 className="text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">A marketplace where every profile is verified.</h2>
              <p className="mt-5 text-lg leading-relaxed text-ink-500">
                CareSaath is a two-sided marketplace: a customer app, a caregiver panel and an admin console. Unlike a general services app,
                every caregiver profile carries a verified professional credential before it can ever be booked.
              </p>
            </Reveal>
            <div className="grid gap-5 sm:grid-cols-3">
              {AUDIENCES.map(({ icon: Icon, title, text }, i) => (
                <Reveal key={title} as="div" delay={i * 80} className="rounded-2xl border border-ink-100 bg-white p-6">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <Icon className="size-5" strokeWidth={1.75} />
                  </span>
                  <h3 className="mt-4 font-semibold text-ink-900">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{text}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Verification */}
        <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
          <Reveal className="max-w-2xl">
            <p className="text-xs font-semibold tracking-[0.2em] text-brand-600 uppercase">Verification</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">How we verify every caregiver.</h2>
          </Reveal>
          <div className="mt-12 grid grid-cols-1 gap-x-12 gap-y-10 sm:grid-cols-2">
            {VERIFY.map(({ title, text }, i) => (
              <Reveal key={title} as="div" delay={i * 80} className="flex gap-5 border-t border-ink-100 pt-6">
                <span className="text-lg font-semibold text-brand-300 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3 className="text-lg font-semibold text-ink-900">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Safety */}
        <section id="safety" className="scroll-mt-24 border-y border-ink-100 bg-ink-25/40">
          <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
            <Reveal className="max-w-2xl">
              <p className="text-xs font-semibold tracking-[0.2em] text-brand-600 uppercase">Safety &amp; emergencies</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">Care you can trust at the door.</h2>
            </Reveal>
            <div className="mt-12 grid grid-cols-1 gap-x-10 gap-y-10 sm:grid-cols-2">
              {SAFETY.map(({ icon: Icon, title, text }, i) => (
                <Reveal key={title} as="div" delay={i * 80} className="flex gap-5">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent-50 text-accent-600">
                    <Icon className="size-6" strokeWidth={1.75} />
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold text-ink-900">{title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Built for Pakistan */}
        <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
          <Reveal className="max-w-2xl">
            <p className="text-xs font-semibold tracking-[0.2em] text-brand-600 uppercase">Built for Pakistan</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">Made for how care really happens here.</h2>
          </Reveal>
          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PAKISTAN.map(({ icon: Icon, title, text }, i) => (
              <Reveal key={title} as="div" delay={i * 80} className="rounded-2xl border border-ink-100 bg-white p-6">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                  <Icon className="size-6" strokeWidth={1.75} />
                </span>
                <h3 className="mt-5 text-lg font-semibold text-ink-900">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{text}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* What's next */}
        <section className="border-t border-ink-100 bg-ink-25/40">
          <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
            <Reveal className="max-w-2xl">
              <p className="text-xs font-semibold tracking-[0.2em] text-brand-600 uppercase">What&rsquo;s next</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">Where CareSaath is headed.</h2>
            </Reveal>
            <div className="mt-12 grid grid-cols-1 gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
              {FUTURE.map(({ icon: Icon, title, text }, i) => (
                <Reveal key={title} as="div" delay={i * 70} className="border-t border-ink-200/70 pt-6">
                  <Icon className="size-6 text-ink-900" strokeWidth={1.75} />
                  <h3 className="mt-5 font-semibold text-ink-900">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{text}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-3xl px-5 py-24 text-center sm:px-8">
          <Reveal>
            <h2 className="text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">Care for your family, at home.</h2>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/customer"
                className="group inline-flex items-center gap-2 rounded-full bg-brand-600 px-8 py-4 text-base font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-brand-700"
              >
                Find care
                <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link href="/caregiver" className="group inline-flex items-center gap-2 text-base font-semibold text-ink-700 transition-colors hover:text-brand-700">
                Join as a caregiver
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </Reveal>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
