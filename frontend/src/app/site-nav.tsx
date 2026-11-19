import Link from "next/link";
import { Logo } from "@shared/brand";

/** Light sticky nav shared by the About, legal and contact pages. */
export function SiteNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-ink-100/70 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-5 sm:px-8 md:grid md:grid-cols-[1fr_auto_1fr]">
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
        <div className="flex items-center gap-1 justify-self-end sm:gap-2">
          <Link href="/login" className="rounded-full px-3 py-2 text-sm font-semibold text-ink-700 transition-colors hover:text-ink-900 sm:px-4 sm:py-2.5">
            Log in
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 sm:px-5 sm:py-2.5"
          >
            Sign up
          </Link>
        </div>
      </div>
      <nav aria-label="Primary" className="flex items-center justify-center gap-6 border-t border-ink-100/60 px-5 py-2 text-xs font-medium text-ink-600 md:hidden">
        <Link href="/about" className="hover:text-ink-900">About</Link>
        <Link href="/caregiver" className="hover:text-ink-900">For caregivers</Link>
        <Link href="/contact" className="hover:text-ink-900">Contact</Link>
      </nav>
    </header>
  );
}
