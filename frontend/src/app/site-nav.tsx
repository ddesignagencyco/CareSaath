import Link from "next/link";
import { Logo } from "@shared/brand";

/** Light sticky nav shared by the About, legal and contact pages. */
export function SiteNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-ink-100/70 bg-white/80 backdrop-blur-md">
      <div className="mx-auto grid h-20 max-w-6xl grid-cols-[1fr_auto_1fr] items-center px-5 sm:px-8">
        <Link href="/" aria-label="CareSaath home" className="justify-self-start">
          <Logo subtitle="Home care" />
        </Link>
        <div className="hidden items-center gap-8 md:flex">
          {[
            { label: "About", href: "/about" },
            { label: "For caregivers", href: "/caregiver" },
            { label: "Contact", href: "/contact" },
          ].map(({ label, href }) => (
            <Link key={label} href={href} className="text-sm font-medium text-ink-500 transition-colors hover:text-ink-900">
              {label}
            </Link>
          ))}
        </div>
        <Link
          href="/login"
          className="justify-self-end inline-flex items-center rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          Login
        </Link>
      </div>
    </header>
  );
}
