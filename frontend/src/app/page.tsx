import {
  Activity,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  ChevronDown,
  FileText,
  HeartPulse,
  LifeBuoy,
  Lock,
  MapPin,
  Repeat,
  Siren,
  Stethoscope,
  UserRound,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { HeroVisual } from "./hero-visual";
import { Reveal } from "./reveal";
import { SiteFooter } from "./site-footer";
import { SiteNav } from "./site-nav";

export const metadata: Metadata = {
  title: { absolute: "CareSaath — Verified home nursing & physiotherapy in Pakistan" },
  description:
    "Book a licence-verified nurse or physiotherapist to visit you at home. Live visit tracking, OTP check-in, SOS safety, and cash or digital payment — in Urdu or English.",
};

const SERVICES = [
  {
    icon: HeartPulse,
    title: "Nursing at home",
    text: "Injections, IV drips, wound dressing, vitals monitoring, and post-hospital care by PNC-registered nurses.",
    cta: "Find a nurse",
    href: "/customer",
  },
  {
    icon: Activity,
    title: "Physiotherapy",
    text: "Rehabilitation after surgery, stroke, or orthopedic injury, plus mobility and pain-management sessions.",
    cta: "Book a session",
    href: "/customer",
  },
  {
    icon: Stethoscope,
    title: "Doctor home visits",
    text: "PMDC-verified physicians for in-home checkups, follow-ups, prescriptions, and clinical assessments.",
    cta: "Book a doctor",
    href: "/customer",
  },
  {
    icon: FileText,
    title: "Post-surgery care",
    text: "Attentive clinical recovery support, dressing changes, and prescription-guided care at home.",
    cta: "Plan recovery",
    href: "/customer",
  },
  {
    icon: UserRound,
    title: "Elderly care",
    text: "Compassionate daily assistance, mobility support, and companionship for senior family members.",
    cta: "Arrange care",
    href: "/customer",
  },
  {
    icon: Repeat,
    title: "Immediate & recurring visits",
    text: "Book a nearby caregiver available now, a scheduled single visit, or a recurring weekly care plan.",
    cta: "Schedule care",
    href: "/signup",
  },
];

const STEPS = [
  {
    num: "01",
    title: "Choose a verified caregiver",
    text: "Browse nurses and physiotherapists by specialty, city, and availability. Inspect PNC/PMDC credentials, ratings, and transparent PKR rates upfront.",
  },
  {
    num: "02",
    title: "Book & share care context",
    text: "Select the patient profile, pin your home address, attach a doctor's prescription if needed, and confirm a single or recurring schedule.",
  },
  {
    num: "03",
    title: "Live OTP check-in & flexible payment",
    text: "Track arrival live, confirm doorstep check-in with a secure OTP, read visit notes after completion, and pay in cash or digitally.",
  },
];

const SAFETY = [
  {
    icon: BadgeCheck,
    title: "PNC & PMDC verified",
    text: "Every CNIC, professional licence, and certificate is manually verified against official registers before activation.",
  },
  {
    icon: MapPin,
    title: "GPS & OTP doorstep check-in",
    text: "Real-time geofencing and one-time passcodes verify the right caregiver arrived at the right home.",
  },
  {
    icon: Siren,
    title: "One-tap in-app SOS",
    text: "Instant emergency alert notifies our safety desk and your designated emergency contact during any active visit.",
  },
  {
    icon: Lock,
    title: "AES-256 encrypted records",
    text: "Prescriptions, visit notes, and identity documents are encrypted in transit and at rest with full audit logging.",
  },
];

const PRICING = [
  {
    icon: Wallet,
    title: "Upfront PKR rates",
    text: "See the exact per-visit fee and any promo code discount before confirming — with downloadable PDF receipts.",
  },
  {
    icon: BadgeCheck,
    title: "Pay your way",
    text: "Settle in Cash on the visit or pay digitally via Card, JazzCash, or Easypaisa.",
  },
  {
    icon: CalendarClock,
    title: "Single, immediate & recurring",
    text: "Book a nearby caregiver available now, a one-off visit, or a recurring weekly schedule.",
  },
];

const PAYMENT_RAILS = ["Cash on Visit", "Card", "JazzCash", "Easypaisa"];

const FAQS = [
  {
    q: "How soon can a caregiver visit?",
    a: "Choose an immediate 'Available Now' nearby caregiver for urgent visits, or book a scheduled single or recurring weekly care plan.",
  },
  {
    q: "How are caregivers verified on CareSaath?",
    a: "Every nurse, physiotherapist, doctor, and caregiver submits their CNIC, PNC or PMDC licence number, and certificates for manual admin review before their profile goes live.",
  },
  {
    q: "Can I message or call my assigned caregiver?",
    a: "Yes. CareSaath includes built-in in-app chat, audio/video calls, prescription uploads, and clinical visit notes for every booking.",
  },
  {
    q: "Are my medical records and prescriptions private?",
    a: "Yes. Sensitive records, CNICs, and prescriptions are encrypted at rest and visible only to your assigned caregiver during an active booking and authorised admin staff.",
  },
  {
    q: "How do I pay for a visit?",
    a: "Pay in Cash upon visit completion, or digitally by Card, JazzCash, or Easypaisa — with automatic PDF receipts.",
  },
  {
    q: "What if there is a medical emergency during a visit?",
    a: "Use the in-app SOS button to alert the CareSaath safety desk and your emergency contact immediately. For life-threatening emergencies, call Rescue 1122 and proceed to the nearest hospital.",
  },
];

export default function Home() {
  return (
    <div className="min-h-dvh bg-white text-ink-900">
      <SiteNav />

      {/* ===== Executive Deep-Teal Inset Hero Panel ===== */}
      <div className="px-2.5 pt-2.5 sm:px-4 sm:pt-4">
        <section className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 text-white sm:rounded-3xl">
          <div aria-hidden className="pointer-events-none absolute -top-28 -right-24 size-[28rem] rounded-full bg-brand-400/15 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-20 size-80 rounded-full bg-accent-400/10 blur-3xl" />

          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 py-14 sm:px-8 sm:py-18 lg:grid-cols-[1.08fr_0.92fr] lg:gap-14 lg:py-20">
            {/* Left Copy */}
            <div className="flex flex-col">
              <h1 className="cs-in text-4xl leading-[1.06] font-extrabold tracking-tight text-white sm:text-5xl lg:text-[3.5rem]">
                Verified clinical care,{" "}
                <span className="bg-gradient-to-r from-brand-200 to-accent-400 bg-clip-text text-transparent">
                  at your doorstep.
                </span>
              </h1>

              <p className="cs-in-2 mt-5 max-w-xl text-base leading-relaxed text-brand-100 sm:text-lg">
                Book a licence-verified nurse or physiotherapist to visit your home across Pakistan. Gentle, private care for your family —
                tracked live with OTP check-in and SOS protection.
              </p>

              <div className="cs-in-3 mt-8 flex flex-wrap gap-3.5">
                <Link
                  href="/customer"
                  className="group inline-flex min-h-13 items-center gap-2 rounded-full bg-white px-7 text-sm font-bold text-brand-950 shadow-lg shadow-brand-950/20 transition-all hover:-translate-y-0.5 hover:bg-brand-50 sm:text-base"
                >
                  Find a caregiver
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/signup?role=caregiver"
                  className="inline-flex min-h-13 items-center gap-2 rounded-full border border-white/25 bg-white/10 px-6 text-sm font-semibold text-white backdrop-blur-xs transition-colors hover:bg-white/15 sm:text-base"
                >
                  <Stethoscope className="size-4 text-accent-400" />
                  Join as a caregiver
                </Link>
              </div>

              {/* Crisp Proof Bar — distinct value highlights, no overlap with Safety section */}
              <div className="cs-in-3 mt-10 grid grid-cols-3 gap-4 border-t border-white/15 pt-6">
                <div>
                  <p className="text-lg font-extrabold text-white sm:text-xl">Upfront PKR</p>
                  <p className="mt-0.5 text-xs text-brand-200">Clear per-visit rates</p>
                </div>
                <div>
                  <p className="text-lg font-extrabold text-white sm:text-xl">Same-Day</p>
                  <p className="mt-0.5 text-xs text-brand-200">Single or recurring visits</p>
                </div>
                <div>
                  <p className="text-lg font-extrabold text-white sm:text-xl">Urdu &amp; EN</p>
                  <p className="mt-0.5 text-xs text-brand-200">Full bilingual app</p>
                </div>
              </div>
            </div>

            {/* Right Photorealistic Hero Image */}
            <div className="cs-in-3">
              <HeroVisual />
            </div>
          </div>
        </section>
      </div>

      <main>
        {/* ===== Services Grid (Crisp Elevated White Cards) ===== */}
        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <Reveal className="max-w-2xl">
              <p className="text-xs font-bold tracking-[0.16em] text-brand-600 uppercase">Our Services</p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
                Hospital-grade care, in the comfort of home.
              </h2>
              <p className="mt-3 text-base leading-relaxed text-ink-500 sm:text-lg">
                From post-operative nursing to stroke physiotherapy and daily eldercare, verified professionals come directly to you.
              </p>
            </Reveal>
            <Link
              href="/customer"
              className="group inline-flex items-center gap-1.5 text-sm font-bold text-brand-700 hover:text-brand-800"
            >
              Browse verified caregivers
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map(({ icon: Icon, title, text, cta, href }, i) => (
              <Reveal
                key={title}
                as="div"
                delay={i * 60}
                className="group flex flex-col rounded-3xl border border-ink-100 bg-white p-7 shadow-2xs transition-all duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-xl hover:shadow-brand-900/5"
              >
                <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-white">
                  <Icon className="size-6" strokeWidth={1.85} />
                </span>
                <h3 className="mt-5 text-lg font-bold text-ink-900">{title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-500">{text}</p>
                <Link
                  href={href}
                  className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800"
                >
                  {cta}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ===== Photographic Split: How It Works (Real Elderly Care Photo + Timeline) ===== */}
        <section className="border-y border-ink-100 bg-ink-25/60">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-2 lg:gap-16">
            <Reveal className="relative overflow-hidden rounded-3xl shadow-xl shadow-ink-900/10 ring-1 ring-ink-200/70">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/landing-elderly-care.jpg"
                alt="A Pakistani home-care nurse reviewing a daily medication schedule with a smiling elderly patient at home"
                className="aspect-[4/3] w-full object-cover"
              />
            </Reveal>

            <div>
              <Reveal>
                <p className="text-xs font-bold tracking-[0.16em] text-brand-600 uppercase">How It Works</p>
                <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
                  Book trusted home care in three simple steps.
                </h2>
              </Reveal>

              <ol className="mt-8 space-y-6">
                {STEPS.map(({ num, title, text }, i) => (
                  <Reveal as="li" key={num} delay={i * 80} className="flex gap-4">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-700 text-sm font-extrabold text-white shadow-sm">
                      {num}
                    </span>
                    <div className="pt-0.5">
                      <h3 className="text-base font-bold text-ink-900 sm:text-lg">{title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-ink-500">{text}</p>
                    </div>
                  </Reveal>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ===== Unified Deep-Teal Safety & Clinical Verification Panel (Zero Duplication) ===== */}
        <div className="px-2.5 pt-8 sm:px-4 sm:pt-12">
          <section className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-brand-900 via-brand-800 to-brand-950 text-white sm:rounded-3xl">
            <div aria-hidden className="pointer-events-none absolute -top-20 -right-20 size-80 rounded-full bg-accent-400/10 blur-3xl" />
            <div className="relative mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
              <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[0.95fr_1.05fr]">
                {/* Left: Verified Clinical Team Photo + Intro */}
                <Reveal>
                  <p className="text-xs font-bold tracking-[0.16em] text-accent-400 uppercase">Safety &amp; Verification</p>
                  <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                    Every profile vetted before they reach your door.
                  </h2>
                  <p className="mt-4 text-base leading-relaxed text-brand-100">
                    Home care only works when trust is built into every step — from manual PNC/PMDC licence verification to real-time GPS
                    check-in and one-tap SOS escalation.
                  </p>

                  <div className="mt-7 overflow-hidden rounded-2xl shadow-xl shadow-brand-950/35 ring-1 ring-white/15">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/images/landing-verified-team.jpg"
                      alt="Verified Pakistani registered nurse and physiotherapist in teal clinical scrubs with official ID lanyards"
                      className="aspect-[16/10] w-full object-cover"
                    />
                  </div>

                  <Link
                    href="/about#safety"
                    className="group mt-7 inline-flex min-h-12 items-center gap-2 rounded-full bg-accent-500 px-6 text-sm font-bold text-brand-950 transition-colors hover:bg-accent-400"
                  >
                    Read our verification standards
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                </Reveal>

                {/* Right: 4 Crisp Glass Safety Cards */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {SAFETY.map(({ icon: Icon, title, text }) => (
                    <div
                      key={title}
                      className="flex flex-col rounded-2xl border border-white/12 bg-white/8 p-6 backdrop-blur-xs transition-colors hover:bg-white/12"
                    >
                      <span className="flex size-11 items-center justify-center rounded-xl bg-white/12 text-accent-400">
                        <Icon className="size-5" strokeWidth={1.9} />
                      </span>
                      <h3 className="mt-4 text-base font-bold text-white">{title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-brand-100">{text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* ===== Transparent Pricing & Pakistani Payment Rails ===== */}
        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <Reveal className="max-w-2xl">
              <p className="text-xs font-bold tracking-[0.16em] text-brand-600 uppercase">Transparent Pricing</p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
                Clear PKR rates, local payment options.
              </h2>
              <p className="mt-3 text-base leading-relaxed text-ink-500">
                Always see the caregiver&rsquo;s exact per-visit fee before you confirm — and settle in cash or digitally.
              </p>
            </Reveal>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_RAILS.map((rail) => (
                <span
                  key={rail}
                  className="rounded-full border border-ink-200 bg-ink-25 px-3.5 py-1.5 text-xs font-semibold text-ink-700"
                >
                  {rail}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {PRICING.map(({ icon: Icon, title, text }, i) => (
              <Reveal
                key={title}
                as="div"
                delay={i * 70}
                className="flex flex-col rounded-3xl border border-ink-100 bg-white p-7 shadow-2xs"
              >
                <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                  <Icon className="size-6" strokeWidth={1.85} />
                </span>
                <h3 className="mt-5 text-lg font-bold text-ink-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">{text}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ===== For Nurses & Physiotherapists Spotlight ===== */}
        <section className="border-t border-ink-100 bg-white">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <Reveal className="flex flex-col justify-between gap-8 rounded-3xl border border-brand-200/70 bg-gradient-to-br from-brand-50 via-white to-accent-50/40 p-7 sm:p-10 lg:flex-row lg:items-center">
              <div className="max-w-xl">
                <p className="text-xs font-bold tracking-[0.16em] text-brand-700 uppercase">For Clinicians</p>
                <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
                  Are you a licensed nurse or physiotherapist?
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-ink-600 sm:text-base">
                  Build an independent home-care practice on your own schedule with verified families and direct digital payouts.
                </p>
                <div className="mt-6">
                  <Link
                    href="/signup?role=caregiver"
                    className="group inline-flex items-center gap-2 rounded-full bg-brand-700 px-6 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-brand-800"
                  >
                    Apply as a caregiver
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </div>
              <ul className="grid flex-1 grid-cols-1 gap-3 text-sm text-ink-700 sm:grid-cols-2">
                {[
                  "Manage weekly schedule & Available Now status",
                  "Select your preferred city & service areas",
                  "Direct Bank, JazzCash & Easypaisa payouts",
                  "In-app chat, calls, visit notes & prescriptions",
                ].map((perk) => (
                  <li key={perk} className="flex items-start gap-2.5 rounded-2xl bg-white/95 px-4 py-3.5 shadow-2xs ring-1 ring-ink-100">
                    <BadgeCheck className="mt-0.5 size-4 shrink-0 text-brand-600" />
                    <span className="font-medium">{perk}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        {/* ===== FAQ Section ===== */}
        <section className="border-t border-ink-100 bg-ink-25/50">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
            <div className="grid grid-cols-1 gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
              <Reveal className="lg:sticky lg:top-28">
                <p className="text-xs font-bold tracking-[0.16em] text-brand-600 uppercase">FAQ</p>
                <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">Questions, answered.</h2>
                <p className="mt-3 text-base leading-relaxed text-ink-500">
                  Everything you need to know about booking verified home nursing and physiotherapy on CareSaath.
                </p>

                <div className="mt-8 rounded-3xl border border-ink-100 bg-white p-6 shadow-2xs">
                  <span className="flex size-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                    <LifeBuoy className="size-5" strokeWidth={1.9} />
                  </span>
                  <h3 className="mt-4 text-base font-bold text-ink-900">Still have questions?</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-500">
                    Our care advisors can help you choose the right nurse or physiotherapist.
                  </p>
                  <Link
                    href="/contact"
                    className="group mt-5 inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
                  >
                    Contact our team
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </Reveal>

              <div className="space-y-3">
                {FAQS.map(({ q, a }, i) => (
                  <Reveal as="div" key={q} delay={i * 40}>
                    <details
                      className="group rounded-2xl border border-ink-100 bg-white px-6 py-5 shadow-2xs transition-colors open:border-brand-300"
                      {...(i === 0 ? { open: true } : {})}
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-bold text-ink-900 marker:hidden">
                        {q}
                        <ChevronDown
                          className="size-5 shrink-0 text-brand-600 transition-transform group-open:rotate-180"
                          strokeWidth={2.2}
                        />
                      </summary>
                      <p className="mt-3 text-sm leading-relaxed text-ink-500">{a}</p>
                    </details>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ===== Executive Final CTA Panel ===== */}
        <div className="px-2.5 py-6 sm:px-4 sm:py-10">
          <section className="overflow-hidden rounded-[1.75rem] bg-brand-700 text-white sm:rounded-3xl">
            <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 px-5 py-14 sm:px-8 md:flex-row md:items-center">
              <div className="max-w-xl">
                <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Need trusted care at home?</h2>
                <p className="mt-3 text-base leading-relaxed text-brand-100 sm:text-lg">
                  Book a verified nurse or physiotherapist in minutes, or join CareSaath to offer your clinical services across Pakistan.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/customer"
                  className="inline-flex min-h-13 items-center gap-2 rounded-full bg-white px-7 text-sm font-bold text-brand-900 shadow-sm transition-transform hover:-translate-y-0.5 sm:text-base"
                >
                  Find care
                  <ArrowRight className="size-4" />
                </Link>
                <Link
                  href="/signup?role=caregiver"
                  className="inline-flex min-h-13 items-center rounded-full border border-white/30 px-7 text-sm font-semibold text-white transition-colors hover:bg-white/10 sm:text-base"
                >
                  Join as a caregiver
                </Link>
              </div>
            </div>
          </section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
