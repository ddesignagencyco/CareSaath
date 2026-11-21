import { Mail, MessageCircle, Phone } from "lucide-react";
import Link from "next/link";
import { LogoMark } from "@shared/brand";
import { Year } from "./year";

const COLUMNS = [
  {
    heading: "Explore",
    links: [
      { label: "Find care", href: "/customer" },
      { label: "For caregivers", href: "/caregiver" },
      { label: "Safety & SOS", href: "/about#safety" },
      { label: "Create account", href: "/signup" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About CareSaath", href: "/about" },
      { label: "Contact & support", href: "/contact" },
      { label: "Sign in", href: "/login" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
    ],
  },
];

const DIRECT_LINKS = [
  { icon: Mail, label: "Email CareSaath", href: "mailto:info@caresaath.com" },
  { icon: Phone, label: "Call Helpline", href: "tel:+9242111227372" },
  { icon: MessageCircle, label: "WhatsApp Support", href: "https://wa.me/923002273728", external: true },
];

/** Shared footer for the public pages. */
export function SiteFooter() {
  return (
    <footer className="border-t border-ink-100 bg-ink-25/50">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          {/* Brand + real direct contact channels */}
          <div className="max-w-sm">
            <Link href="/" className="inline-flex items-center gap-3">
              <LogoMark className="size-9" />
              <p className="text-lg font-bold text-ink-900">
                Care<span className="text-brand-600">Saath</span>
              </p>
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-ink-500">
              Verified home nursing and physiotherapy across Pakistan — booked, tracked and paid from one app, in Urdu or English.
            </p>
            <div className="mt-6 flex items-center gap-2.5">
              {DIRECT_LINKS.map(({ icon: Icon, label, href, external }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  title={label}
                  {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
                  className="flex size-10 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-600 shadow-2xs transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                >
                  <Icon className="size-[18px]" strokeWidth={1.75} />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {COLUMNS.map(({ heading, links }) => (
            <div key={heading}>
              <h3 className="text-xs font-bold tracking-[0.15em] text-ink-400 uppercase">{heading}</h3>
              <ul className="mt-4 space-y-3">
                {links.map(({ label, href }) => (
                  <li key={label}>
                    <Link href={href} className="text-sm font-medium text-ink-600 transition-colors hover:text-brand-700">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-14 flex flex-col gap-3 border-t border-ink-200/70 pt-6 text-xs text-ink-400 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © <Year fallback={2026} /> CareSaath. All rights reserved.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/privacy" className="transition-colors hover:text-ink-700">
              Privacy
            </Link>
            <span aria-hidden>·</span>
            <Link href="/terms" className="transition-colors hover:text-ink-700">
              Terms
            </Link>
            <span aria-hidden>·</span>
            <span>Home nursing &amp; physiotherapy · Pakistan</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
