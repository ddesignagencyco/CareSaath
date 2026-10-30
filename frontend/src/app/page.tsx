import {
  Activity,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Check,
  ChevronDown,
  FileText,
  HeartPulse,
  LifeBuoy,
  Lock,
  MapPin,
  Repeat,
  ShieldCheck,
  Siren,
  Stethoscope,
  UserRound,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@shared/brand";
import { HeroVisual } from "./hero-visual";
import { Reveal } from "./reveal";
import { SiteFooter } from "./site-footer";

export const metadata: Metadata = {
  title: "CareSaath — Verified home nursing & physiotherapy in Pakistan",
  description:
    "Book a licence-verified nurse or physiotherapist to visit you at home. Live visit tracking, OTP check-in, SOS safety, and cash or digital payment — in Urdu or English.",
};

const NAV = [
  { label: "About", href: "/about" },
  { label: "For caregivers", href: "/caregiver" },
  { label: "Contact", href: "/contact" },
];

const CHIPS = [
  { icon: HeartPulse, label: "Nursing at home" },
  { icon: Activity, label: "Physiotherapy" },
  { icon: Stethoscope, label: "Post-surgery care" },
  { icon: UserRound, label: "Elderly care" },
];

const SERVICES = [
  { icon: HeartPulse, title: "Nursing at home", text: "Injections, IV drips, wound dressing and post-hospital recovery by registered nurses.", cta: "Find a nurse" },
  { icon: Activity, title: "Physiotherapy", text: "Rehab after surgery, stroke or injury, plus mobility and pain-management sessions.", cta: "Book a session" },
  { icon: Stethoscope, title: "Post-surgery care", text: "Attentive recovery support and dressing changes in the comfort of home.", cta: "Plan care" },
  { icon: UserRound, title: "Elderly care", text: "Daily assistance, mobility help and companionship for older family members.", cta: "Arrange care" },
  { icon: Repeat, title: "Recurring care plans", text: "Book a single visit or a recurring schedule — for example daily for two weeks.", cta: "Set a schedule" },
  { icon: FileText, title: "Prescription-guided visits", text: "Upload a doctor's note or care plan so your caregiver arrives fully prepared.", cta: "Upload & book" },
];

const STEPS = [
  { title: "Find verified care", text: "Search by specialty, city and availability. See each caregiver's licence, experience, ratings and rate per visit." },
  { title: "Book a home visit", text: "Add a patient, address and time window, attach a prescription, and choose a single or recurring booking." },
  { title: "Track, pay & review", text: "Follow the visit live to an OTP check-in, pay in cash or digitally, read the visit note and rate your caregiver." },
];

const SAFETY = [
  { title: "Licence-verified", text: "Checked against the PNC or PMDC register before a caregiver appears." },
  { title: "OTP & GPS check-in", text: "Confirm the right caregiver reached the right address." },
  { title: "SOS during a visit", text: "One tap alerts our team and your emergency contact." },
  { title: "Encrypted & audited", text: "Medical notes and ID are encrypted; every action is logged." },
];

const VERIFY = [
  { icon: BadgeCheck, title: "Credential check", text: "CNIC, licence number and certificates checked against the PNC or PMDC register." },
  { icon: ShieldCheck, title: "Admin approval", text: "No profile goes live to customers until our team has reviewed and approved it." },
  { icon: CalendarClock, title: "Periodic re-verification", text: "Credentials are re-checked on a regular cycle so every active caregiver stays current." },
  { icon: Siren, title: "Accountability", text: "A caregiver can be suspended for a policy violation or an unresolved safety complaint." },
];

const PRICING = [
  { icon: Wallet, title: "See the rate upfront", text: "Each caregiver sets their rate per visit, and you see it before you confirm a booking." },
  { icon: BadgeCheck, title: "Pay your way", text: "Settle in cash on the visit, or by card, JazzCash, Easypaisa or Raast." },
  { icon: CalendarClock, title: "Flexible plans", text: "Book once or on a recurring schedule, and cancel or reschedule within the notice window." },
];

const FAQS = [
  { q: "How soon can a caregiver visit?", a: "Choose your preferred date and time window; the caregiver accepts within a set response window. You can book a single visit or a recurring schedule." },
  { q: "Are my records private?", a: "Yes. Medical notes and ID numbers are encrypted, and visible only to your assigned caregiver and our admin staff." },
  { q: "Can I book long-term care?", a: "Yes — book a recurring schedule, for example daily for two weeks, and manage every visit from one place." },
  { q: "Which areas do you cover?", a: "CareSaath is launching in pilot cities first, with a manually vetted caregiver pool, before expanding." },
  { q: "How do I pay?", a: "Pay in cash on the visit, or digitally by card, JazzCash, Easypaisa or Raast." },
  { q: "What if there's an emergency?", a: "Use the in-app SOS during a visit to alert our team and your emergency contact. For a medical emergency, call 1122 and the nearest hospital." },
];

/** Floating panel: same side gutter, radius and (by default) green background as the hero. */
function Panel({ children, tone = "light" }: { children: React.ReactNode; tone?: "light" | "dark" | "brand" }) {
  if (tone === "light") {
    return (
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">{children}</div>
      </section>
    );
  }
  const bg = "bg-brand-700 text-white";
  return (
    <div className="px-2.5 pt-2.5 sm:px-4 sm:pt-4">
      <section className={`overflow-hidden rounded-[1.5rem] sm:rounded-2xl ${bg}`}>
        <div className="relative mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">{children}</div>
      </section>
    </div>
  );
}

/** Left-aligned section header used across every panel. */
function Head({ eyebrow, title, sub, dark = false }: { eyebrow: string; title: string; sub?: string; dark?: boolean }) {
  return (
    <Reveal className="max-w-2xl">
      <p className={`text-xs font-bold tracking-[0.12em] uppercase ${dark ? "text-accent-400" : "text-brand-700"}`}>{eyebrow}</p>
      <h2 className={`mt-4 text-3xl font-extrabold tracking-tight sm:text-[2.6rem] ${dark ? "text-white" : "text-ink-900"}`}>{title}</h2>
      {sub && <p className={`mt-4 text-[17px] leading-relaxed ${dark ? "text-brand-100" : "text-ink-500"}`}>{sub}</p>}
    </Reveal>
  );
}

export default function Home() {
  return (
    <div className="min-h-dvh bg-white text-ink-900">
      {/* ===== Header + hero: one themed, inset panel ===== */}
      <div className="px-2.5 pt-2.5 sm:px-4 sm:pt-4">
        <section className="relative overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-brand-100 via-brand-50 to-brand-100/80 sm:rounded-2xl">
          <div aria-hidden className="pointer-events-none absolute -top-24 -right-20 size-80 rounded-full bg-accent-200/25 blur-3xl" />
          <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
            {/* Nav */}
            <nav className="grid h-20 grid-cols-[1fr_auto_1fr] items-center">
              <Link href="/" aria-label="CareSaath home" className="justify-self-start">
                <Logo subtitle="Home care" />
              </Link>
              <div className="hidden items-center gap-8 md:flex">
                {NAV.map(({ label, href }) => (
                  <Link key={label} href={href} className="text-sm font-medium text-ink-600 transition-colors hover:text-ink-900">
                    {label}
                  </Link>
                ))}
              </div>
              <div className="flex items-center gap-1 justify-self-end sm:gap-2">
                <Link href="/login" className="rounded-full px-4 py-2.5 text-sm font-semibold text-ink-700 transition-colors hover:text-ink-900">
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex items-center rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
                >
                  Sign up
                </Link>
              </div>
            </nav>

            {/* Hero body */}
            <div className="flex flex-wrap items-center gap-x-14 gap-y-10 pt-4 pb-14 sm:pt-6">
              <div className="flex min-w-0 flex-1 basis-[460px] flex-col gap-7">
                <h1 className="cs-in text-5xl leading-[1.05] font-extrabold tracking-tight text-ink-900 sm:text-6xl">
                  Verified care,
                  <br />
                  <span className="text-brand-600">at your doorstep.</span>
                </h1>
                <p className="cs-in-2 max-w-xl text-lg leading-relaxed text-ink-600">
                  Book a licence-verified nurse or physiotherapist to visit you at home. Gentle, private care for your family — tracked live,
                  without the waiting room.
                </p>

                <div className="cs-in-3 flex flex-wrap gap-3">
                  <Link
                    href="/signup"
                    className="group inline-flex min-h-14 items-center gap-2.5 rounded-full bg-brand-600 px-7 text-base font-semibold text-white transition-colors hover:bg-brand-700"
                  >
                    Find care
                    <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
                  </Link>
                  <Link
                    href="/signup?role=caregiver"
                    className="inline-flex min-h-14 items-center gap-2 rounded-full border border-brand-300 bg-white px-7 text-base font-semibold text-ink-800 transition-colors hover:border-brand-400 hover:text-brand-700"
                  >
                    <Stethoscope className="size-5" />
                    Join as a caregiver
                  </Link>
                </div>

                <ul className="cs-in-3 flex w-full flex-wrap gap-2.5">
                  {CHIPS.map(({ icon: Icon, label }) => (
                    <li key={label} className="flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-sm font-medium whitespace-nowrap text-ink-700 ring-1 ring-brand-100/70">
                      <Icon className="size-[18px] shrink-0 text-brand-600" strokeWidth={1.9} />
                      {label}
                    </li>
                  ))}
                </ul>

                <div className="cs-in-3 flex flex-wrap gap-x-7 gap-y-3 border-t border-brand-200/60 pt-5 text-sm text-ink-600">
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="size-[18px] text-brand-600" strokeWidth={2} />
                    Licence-verified caregivers
                  </span>
                  <span className="flex items-center gap-2">
                    <MapPin className="size-[18px] text-brand-600" strokeWidth={2} />
                    Live visit tracking
                  </span>
                  <span className="flex items-center gap-2">
                    <Lock className="size-[18px] text-brand-600" strokeWidth={2} />
                    Private &amp; encrypted
                  </span>
                </div>
              </div>

              <div className="cs-in-3 relative mx-auto min-w-0 w-full max-w-[460px] flex-1 basis-[420px] lg:-mt-8">
                <HeroVisual className="w-full" />
                <div className="absolute left-0 top-[6%] flex items-center gap-3 rounded-2xl bg-white p-3.5 pe-5 shadow-xl shadow-brand-900/10">
                  <span className="flex size-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                    <Check className="size-5" strokeWidth={2.4} />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-sm font-bold text-ink-900">Visit confirmed</span>
                    <span className="text-[13px] text-ink-500">Today · 9:00 AM at home</span>
                  </span>
                </div>
                <div className="absolute right-0 bottom-[6%] flex items-center gap-3 rounded-2xl bg-brand-950 p-3.5 pe-5 text-white shadow-xl shadow-brand-900/25">
                  <span className="flex size-10 items-center justify-center rounded-full bg-white/10 text-accent-400">
                    <MapPin className="size-5" strokeWidth={2.2} />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-sm font-bold">Nurse on the way</span>
                    <span className="text-[13px] text-brand-100">Tracked live · 1.2 km</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <main>
        {/* ===== Services ===== */}
        <Panel>
          <Head
            eyebrow="Our services"
            title="Complete care, without leaving home"
            sub="From a nursing visit to ongoing physiotherapy and elderly care, verified caregivers bring the care to your living room."
          />
          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map(({ icon: Icon, title, text, cta }, i) => (
              <Reveal key={title} as="div" delay={i * 70} className="flex flex-col gap-3.5 rounded-[1.25rem] bg-brand-50/70 p-7 transition-shadow hover:shadow-md hover:shadow-brand-900/5">
                <span className="flex size-[52px] items-center justify-center rounded-[0.9rem] bg-white text-brand-600 shadow-sm">
                  <Icon className="size-[26px]" strokeWidth={1.9} />
                </span>
                <h3 className="text-xl font-bold text-ink-900">{title}</h3>
                <p className="text-[15px] leading-relaxed text-ink-500">{text}</p>
                <Link href="/signup" className="group mt-auto inline-flex items-center gap-1.5 pt-1 text-sm font-semibold text-brand-700">
                  {cta}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Reveal>
            ))}
          </div>
        </Panel>

        {/* ===== How it works ===== */}
        <Panel>
          <Head eyebrow="How it works" title="Care at home in three simple steps" />
          <ol className="mt-12 grid grid-cols-1 gap-5 lg:grid-cols-3">
            {STEPS.map(({ title, text }, i) => (
              <Reveal as="li" key={title} delay={i * 90} className="flex flex-col gap-3.5 rounded-[1.25rem] bg-brand-50/70 p-8">
                <span className="flex size-12 items-center justify-center rounded-full bg-brand-600 text-lg font-extrabold text-white">{i + 1}</span>
                <h3 className="text-xl font-bold text-ink-900">{title}</h3>
                <p className="text-[15px] leading-relaxed text-ink-500">{text}</p>
              </Reveal>
            ))}
          </ol>
        </Panel>

        {/* ===== Safety band ===== */}
        <Panel tone="dark">
          <div className="flex flex-wrap items-center gap-x-16 gap-y-12">
            <Reveal className="min-w-0 flex-1 basis-[460px]">
              <p className="text-xs font-bold tracking-[0.12em] text-accent-400 uppercase">Built-in safety</p>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-[2.6rem]">Care that&rsquo;s verified, tracked and private</h2>
              <p className="mt-5 text-[17px] leading-relaxed text-brand-100">
                Home care only works if it&rsquo;s safe. CareSaath verifies every caregiver, shows you who is coming, confirms their arrival,
                and keeps help one tap away.
              </p>
              <Link
                href="/about#safety"
                className="group mt-7 inline-flex min-h-14 items-center gap-2 rounded-full bg-accent-500 px-7 text-base font-bold text-brand-950 transition-colors hover:bg-accent-400"
              >
                See how we keep you safe
                <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </Reveal>
            <ul className="grid min-w-0 flex-1 basis-[420px] grid-cols-1 gap-4 sm:grid-cols-2">
              {SAFETY.map(({ title, text }) => (
                <li key={title} className="flex flex-col gap-2 rounded-[1.1rem] bg-white/10 p-6">
                  <strong className="text-lg font-bold">{title}</strong>
                  <span className="text-[15px] leading-relaxed text-brand-100">{text}</span>
                </li>
              ))}
            </ul>
          </div>
        </Panel>

        {/* ===== Verification ===== */}
        <Panel>
          <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-4">
            <Head eyebrow="Our standard" title="Qualified people you can trust at your door" />
            <Link href="/about" className="group inline-flex items-center gap-1.5 pb-1 text-base font-semibold text-brand-700">
              How verification works
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {VERIFY.map(({ icon: Icon, title, text }, i) => (
              <Reveal key={title} as="div" delay={i * 70} className="rounded-[1.25rem] bg-brand-50/70 p-6">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-sm">
                  <Icon className="size-6" strokeWidth={1.9} />
                </span>
                <h3 className="mt-5 text-lg font-bold text-ink-900">{title}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-ink-500">{text}</p>
              </Reveal>
            ))}
          </div>
        </Panel>

        {/* ===== Pricing ===== */}
        <Panel>
          <Head eyebrow="Pricing" title="Clear prices, no surprises" sub="You always see the caregiver's rate before you confirm — and you choose how to pay." />
          <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {PRICING.map(({ icon: Icon, title, text }, i) => (
              <Reveal key={title} as="div" delay={i * 80} className="flex flex-col gap-3.5 rounded-[1.25rem] bg-brand-50/70 p-8">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-sm">
                  <Icon className="size-6" strokeWidth={1.9} />
                </span>
                <h3 className="text-lg font-bold text-ink-900">{title}</h3>
                <p className="text-[15px] leading-relaxed text-ink-500">{text}</p>
              </Reveal>
            ))}
          </div>
        </Panel>

        {/* ===== FAQ ===== */}
        <Panel>
          <div className="flex flex-wrap gap-x-16 gap-y-10">
            <Reveal className="flex-1 basis-[320px]">
              <p className="text-xs font-bold tracking-[0.12em] text-brand-700 uppercase">FAQ</p>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-ink-900 sm:text-[2.6rem]">Questions, answered</h2>
              <p className="mt-4 text-[17px] leading-relaxed text-ink-500">Everything you need to know about booking verified home care.</p>
              <div className="mt-8 rounded-[1.25rem] bg-brand-50/70 p-7">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-sm">
                  <LifeBuoy className="size-6" strokeWidth={1.9} />
                </span>
                <h3 className="mt-5 text-lg font-bold text-ink-900">Still have questions?</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-ink-500">Our care advisors can help you book the right caregiver.</p>
                <Link
                  href="/contact"
                  className="group mt-6 inline-flex min-h-12 items-center gap-2 rounded-full bg-brand-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
                >
                  Contact our team
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </Reveal>
            <div className="flex min-w-0 flex-[2_1_520px] flex-col gap-3">
              {FAQS.map(({ q, a }, i) => (
                <Reveal as="div" key={q} delay={i * 40}>
                  <details className="group rounded-2xl border border-brand-100 bg-brand-50/60 px-6 py-5 open:border-brand-300" {...(i === 0 ? { open: true } : {})}>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-semibold text-ink-900 marker:hidden">
                      {q}
                      <ChevronDown className="size-5 shrink-0 text-brand-600 transition-transform group-open:rotate-180" strokeWidth={2.2} />
                    </summary>
                    <p className="mt-3 text-[15px] leading-relaxed text-ink-500">{a}</p>
                  </details>
                </Reveal>
              ))}
            </div>
          </div>
        </Panel>

        {/* ===== CTA ===== */}
        <Panel tone="brand">
          <Reveal className="flex flex-wrap items-center justify-between gap-x-12 gap-y-7">
            <div className="flex-1 basis-[440px]">
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-[2.4rem]">Need care at home?</h2>
              <p className="mt-3 text-[17px] leading-relaxed text-brand-50">Book a verified caregiver in minutes, or join CareSaath as a nurse or physiotherapist.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/signup" className="inline-flex min-h-14 items-center rounded-full bg-white px-7 text-base font-bold text-brand-700 transition-transform hover:-translate-y-0.5">
                Find care
              </Link>
              <Link href="/signup?role=caregiver" className="inline-flex min-h-14 items-center rounded-full border border-white/40 px-7 text-base font-semibold text-white transition-colors hover:bg-white/10">
                Join as a caregiver
              </Link>
            </div>
          </Reveal>
        </Panel>
      </main>

      <SiteFooter />
    </div>
  );
}
