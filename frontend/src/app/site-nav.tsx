"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@shared/brand";

const NAV_LINKS = [
  { label: "Find care", href: "/customer" },
  { label: "For caregivers", href: "/caregiver" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

/** Light sticky nav shared by the public pages (About, Legal, Contact). */
export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-ink-100/80 bg-white/85 backdrop-blur-lg">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-5 sm:px-8 md:grid md:grid-cols-[1fr_auto_1fr]">
        <Link href="/" aria-label="CareSaath home" className="justify-self-start transition-opacity hover:opacity-90">
          <Logo subtitle="Home care" />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map(({ label, href }) => {
            const active = pathname === href || (href !== "/" && pathname?.startsWith(`${href}/`));
            return (
              <Link
                key={label}
                href={href}
                className={clsx(
                  "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-brand-50 font-semibold text-brand-700"
                    : "text-ink-600 hover:bg-ink-50 hover:text-ink-900",
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-1.5 justify-self-end sm:gap-2">
          <Link
            href="/login"
            className="rounded-full px-3.5 py-2 text-sm font-semibold text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-900 sm:px-4 sm:py-2.5"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-xs shadow-brand-600/20 transition-all hover:bg-brand-700 sm:px-5 sm:py-2.5"
          >
            Sign up
          </Link>
        </div>
      </div>

      <nav
        aria-label="Mobile navigation"
        className="flex items-center justify-center gap-5 border-t border-ink-100/70 bg-white/90 px-5 py-2.5 text-xs font-medium text-ink-600 md:hidden"
      >
        {NAV_LINKS.map(({ label, href }) => {
          const active = pathname === href;
          return (
            <Link
              key={label}
              href={href}
              className={clsx(
                "transition-colors hover:text-ink-900",
                active && "font-semibold text-brand-700",
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
