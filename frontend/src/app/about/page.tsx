import { ArrowRight, BadgeCheck, FlaskConical, Stethoscope, Users, Video } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { fetchEditorialPage } from "@shared/api/editorial";
import { EditorialHtml, formatUpdatedDate } from "../legal";
import { SiteFooter } from "../site-footer";
import { SiteNav } from "../site-nav";

export const metadata: Metadata = {
  title: "About — Verified home care for Pakistan",
  description:
    "CareSaath connects families across Pakistan with licence-verified nurses and physiotherapists for home visits. Learn how verification, safety and payments work.",
};

async function AboutEditorialBody() {
  const editorial = await fetchEditorialPage("about");

  return (
    <section id="safety" className="scroll-mt-24 mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[260px_1fr] lg:items-start lg:gap-12">
        {/* Clean Governance Sidebar — zero repeated feature bullets */}
        <aside className="space-y-5 lg:sticky lg:top-28">
          <div className="rounded-2xl border border-ink-100 bg-ink-25/70 p-5">
            <p className="text-[11px] font-bold tracking-[0.16em] text-ink-400 uppercase">Trust &amp; Legal</p>
            <p className="mt-2 text-xs leading-relaxed text-ink-500">
              Updated {formatUpdatedDate(editorial?.updatedAt)} by the CareSaath compliance team.
            </p>
            <div className="mt-4 flex flex-col gap-2.5 border-t border-ink-200/70 pt-4">
              <Link href="/privacy" className="text-sm font-semibold text-brand-700 hover:underline">
                Privacy Policy →
              </Link>
              <Link href="/terms" className="text-sm font-semibold text-brand-700 hover:underline">
                Terms of Service →
              </Link>
              <Link href="/contact" className="text-sm font-semibold text-brand-700 hover:underline">
                Contact CareSaath →
              </Link>
            </div>
          </div>
        </aside>

        {/* Single Authoritative Live CMS Article (Zero Duplication) */}
        <article className="min-w-0 rounded-3xl border border-ink-100 bg-white p-6 shadow-sm shadow-ink-900/[0.03] sm:p-10 lg:p-12">
          {editorial?.content ? (
            <EditorialHtml html={editorial.content} />
          ) : (
            <div className="space-y-4 text-[15.5px] leading-[1.8] text-ink-600">
              <h2 className="text-xl font-bold text-ink-900">Trusted Home Healthcare for Pakistani Families</h2>
              <p>
                CareSaath connects families with licence-verified nurses, physiotherapists, and medical attendants for safe in-home care.
              </p>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}

export default function About() {
  return (
    <div className="min-h-dvh bg-white text-ink-900">
      <SiteNav />

      <main>
        {/* Signature CareSaath Inset Deep-Teal Hero Panel with Branded Photography */}
        <div className="px-2.5 pt-2.5 sm:px-4 sm:pt-4">
          <section className="relative overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-brand-900 via-brand-800 to-brand-950 text-white sm:rounded-2xl">
            <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-brand-400/15 blur-3xl" />
            <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-16 size-72 rounded-full bg-accent-400/10 blur-3xl" />

            <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 py-14 sm:px-8 sm:py-18 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
              <div>
                <h1 className="text-3xl leading-[1.08] font-extrabold tracking-tight text-white sm:text-5xl">
                  Trusted home care, built for Pakistani families.
                </h1>
                <p className="mt-5 text-base leading-relaxed text-brand-100 sm:text-lg">
                  We connect patients and families with licence-verified nurses, physiotherapists, and post-surgery caregivers — combining
                  hospital-grade credential verification with the warmth and privacy of home.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    href="/customer"
                    className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-bold text-brand-900 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-brand-50"
                  >
                    Find care
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  <Link
                    href="/caregiver"
                    className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur-xs transition-colors hover:bg-white/15"
                  >
                    <Stethoscope className="size-4 text-accent-400" />
                    Join as a caregiver
                  </Link>
                </div>
              </div>

              {/* Branded Photorealistic Home Physiotherapy Photo */}
              <div className="relative overflow-hidden rounded-2xl shadow-2xl shadow-brand-950/40 ring-1 ring-white/15">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/about-physio-care.jpg"
                  alt="A CareSaath verified Pakistani physiotherapist assisting a recovering patient with mobility exercises at home"
                  className="aspect-[16/10] w-full object-cover"
                />
              </div>
            </div>
          </section>
        </div>

        {/* Live Editorial CMS Content (Single Authoritative Source — Zero Duplication) */}
        <Suspense
          fallback={
            <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
              <div className="h-64 animate-pulse rounded-3xl bg-ink-50" />
            </div>
          }
        >
          <AboutEditorialBody />
        </Suspense>

        {/* Clinical Roadmap — unique vision strip */}
        <section className="border-t border-ink-100 bg-ink-25/50">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <div className="max-w-2xl">
              <p className="text-xs font-bold tracking-[0.16em] text-brand-600 uppercase">Roadmap</p>
              <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">Where CareSaath is headed.</h2>
            </div>
            <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: BadgeCheck, title: "Chronic Care Plans", text: "Monthly managed nursing and vitals subscriptions for senior patients." },
                { icon: FlaskConical, title: "Home Lab Collection", text: "Partner diagnostic sample pick-up alongside scheduled nursing visits." },
                { icon: Video, title: "Doctor Teleconsults", text: "On-demand physician review when a home visit requires clinical escalation." },
                { icon: Users, title: "Overseas Family View", text: "Let family members abroad track a parent's visits, vitals, and receipts live." },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title} className="rounded-2xl border border-ink-100 bg-white p-6 shadow-2xs">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <Icon className="size-5" strokeWidth={1.85} />
                  </span>
                  <h3 className="mt-4 text-base font-bold text-ink-900">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Bottom Inset CTA Panel */}
        <div className="px-2.5 pb-6 sm:px-4 sm:pb-10">
          <section className="mx-auto overflow-hidden rounded-[1.5rem] bg-brand-700 text-white sm:rounded-2xl">
            <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-5 py-12 sm:px-8 md:flex-row md:items-center">
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Care for your family, at home.</h2>
                <p className="mt-2 text-sm text-brand-100 sm:text-base">
                  Book a verified nurse or physiotherapist in minutes, with upfront PKR rates.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-bold text-brand-900 transition-colors hover:bg-brand-50"
                >
                  Get started
                  <ArrowRight className="size-4" />
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex items-center rounded-full border border-white/25 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                >
                  Contact team
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
