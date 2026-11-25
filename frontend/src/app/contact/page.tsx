import { ArrowUpRight, Clock, LifeBuoy, Mail, MapPin, MessageCircle, Phone, Siren, Stethoscope } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { DEFAULT_CONTACT_INFO, fetchContactInfo } from "@shared/api/editorial";
import type { ContactInfo } from "@shared/types";
import { SiteFooter } from "../site-footer";
import { SiteNav } from "../site-nav";

export const metadata: Metadata = {
  title: "Contact — CareSaath",
  description: "Reach the CareSaath team for support, caregiver onboarding, safety concerns or partnerships.",
};

function whatsappHref(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  return `https://wa.me/${digits}`;
}

function ContactBody({ info }: { info: ContactInfo }) {
  const channels = [
    {
      icon: LifeBuoy,
      title: "Customer support",
      text: "Questions about a booking, a visit, a refund, or an account.",
      action: { label: info.email, href: `mailto:${info.email}` },
    },
    {
      icon: Stethoscope,
      title: "Caregiver onboarding",
      text: "Join as a nurse or physiotherapist, or ask about PNC/PMDC verification.",
      action: { label: info.caregiverEmail, href: `mailto:${info.caregiverEmail}` },
    },
    {
      icon: Mail,
      title: "Business & press",
      text: "Hospital partnerships, corporate eldercare, media, and general enquiries.",
      action: { label: info.pressEmail, href: `mailto:${info.pressEmail}` },
    },
  ];

  return (
    <>
      {/* Signature CareSaath Inset Deep-Teal Hero Panel with Live Quick-Contact Card */}
      <div className="px-2.5 pt-2.5 sm:px-4 sm:pt-4">
        <section className="relative overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-brand-900 via-brand-800 to-brand-950 text-white sm:rounded-2xl">
          <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-brand-400/15 blur-3xl" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 py-14 sm:px-8 sm:py-18 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl">We&rsquo;re here to help.</h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-brand-100 sm:text-lg">
                Reach the CareSaath team through the channel that fits best. For anything urgent during an active home visit, use the in-app
                SOS tool.
              </p>
            </div>

            {/* Live Direct Contact Glass Card (editable from /admin/editorial) */}
            <div className="grid grid-cols-1 gap-4 rounded-2xl border border-white/15 bg-white/10 p-6 backdrop-blur-md sm:grid-cols-2">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-accent-400">
                  <Phone className="size-4" />
                </span>
                <div>
                  <p className="text-[11px] font-bold tracking-wider text-brand-200 uppercase">Helpline</p>
                  <a href={`tel:${info.phone.replace(/\s+/g, "")}`} className="mt-1 block text-sm font-semibold text-white hover:underline">
                    {info.phone}
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300">
                  <MessageCircle className="size-4" />
                </span>
                <div>
                  <p className="text-[11px] font-bold tracking-wider text-brand-200 uppercase">WhatsApp</p>
                  <a
                    href={whatsappHref(info.whatsapp)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block text-sm font-semibold text-white hover:underline"
                  >
                    {info.whatsapp}
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-accent-400">
                  <MapPin className="size-4" />
                </span>
                <div>
                  <p className="text-[11px] font-bold tracking-wider text-brand-200 uppercase">Head Office</p>
                  <p className="mt-1 text-sm text-brand-50">{info.address}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-accent-400">
                  <Clock className="size-4" />
                </span>
                <div>
                  <p className="text-[11px] font-bold tracking-wider text-brand-200 uppercase">Support Hours</p>
                  <p className="mt-1 text-sm text-brand-50">{info.hours}</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Department Email Cards — aligned strictly to max-w-6xl */}
      <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {channels.map(({ icon: Icon, title, text, action }) => (
            <div
              key={title}
              className="flex flex-col rounded-3xl border border-ink-100 bg-white p-7 shadow-2xs transition-all duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-xl hover:shadow-brand-900/5"
            >
              <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                <Icon className="size-6" strokeWidth={1.75} />
              </span>
              <h2 className="mt-5 text-lg font-bold text-ink-900">{title}</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-500">{text}</p>
              <a
                href={action.href}
                className="group mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800"
              >
                {action.label}
                <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

async function LiveContactBody() {
  const info = await fetchContactInfo();
  return <ContactBody info={info} />;
}

export default function Contact() {
  return (
    <div className="min-h-dvh bg-white text-ink-900">
      <SiteNav />

      <main>
        <Suspense fallback={<ContactBody info={DEFAULT_CONTACT_INFO} />}>
          <LiveContactBody />
        </Suspense>

        {/* Response Standards SLA Strip */}
        <section className="mx-auto max-w-6xl px-5 pb-12 sm:px-8">
          <div className="grid grid-cols-1 gap-4 rounded-3xl border border-ink-100 bg-ink-25/60 p-6 sm:grid-cols-3 sm:p-8">
            <div>
              <p className="text-xs font-bold tracking-wider text-brand-700 uppercase">Active Visit Support</p>
              <p className="mt-1 text-2xl font-extrabold text-ink-900">&lt; 15 mins</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-500">Priority WhatsApp &amp; helpline response for ongoing bookings.</p>
            </div>
            <div className="border-t border-ink-200/70 pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
              <p className="text-xs font-bold tracking-wider text-brand-700 uppercase">Caregiver Onboarding</p>
              <p className="mt-1 text-2xl font-extrabold text-ink-900">24–48 hrs</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-500">Manual verification of CNIC and PNC/PMDC licence documents.</p>
            </div>
            <div className="border-t border-ink-200/70 pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
              <p className="text-xs font-bold tracking-wider text-brand-700 uppercase">Privacy &amp; Compliance</p>
              <p className="mt-1 text-2xl font-extrabold text-ink-900">2 business days</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-500">Dedicated handling for data access, export, and legal requests.</p>
            </div>
          </div>
        </section>

        {/* Emergency Notice */}
        <section className="mx-auto max-w-6xl px-5 pb-16 sm:px-8">
          <div className="flex flex-col gap-4 rounded-3xl border border-accent-200 bg-accent-50/70 p-6 sm:flex-row sm:items-center sm:p-8">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent-500 text-white shadow-sm">
              <Siren className="size-6" strokeWidth={1.75} />
            </span>
            <div>
              <h2 className="text-base font-bold text-ink-900">In a medical emergency</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-600">
                CareSaath is not an emergency dispatch service. During an active visit, tap the in-app SOS button to alert our team and your
                emergency contact. For urgent medical help, call <strong>Rescue 1122</strong> or proceed to the nearest hospital emergency
                room.
              </p>
            </div>
          </div>
        </section>

        {/* Bottom Inset CTA */}
        <div className="px-2.5 pb-6 sm:px-4 sm:pb-10">
          <section className="overflow-hidden rounded-[1.5rem] bg-brand-700 text-white sm:rounded-2xl">
            <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-5 py-12 sm:px-8 md:flex-row md:items-center">
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Ready to book verified home care?</h2>
                <p className="mt-2 text-sm text-brand-100 sm:text-base">
                  Browse PNC &amp; PMDC verified nurses and physiotherapists near you.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/customer"
                  className="inline-flex items-center rounded-full bg-white px-6 py-3.5 text-sm font-bold text-brand-900 transition-colors hover:bg-brand-50"
                >
                  Find care
                </Link>
                <Link
                  href="/about"
                  className="inline-flex items-center rounded-full border border-white/25 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                >
                  About CareSaath
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
