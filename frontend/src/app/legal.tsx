import clsx from "clsx";
import { Calendar, FileText, Globe, Mail } from "lucide-react";
import Link from "next/link";
import { SiteFooter } from "./site-footer";
import { SiteNav } from "./site-nav";

/** Formats an ISO timestamp from the editorial CMS (e.g. "November 2026"). */
export function formatUpdatedDate(iso: string | null | undefined, fallback = "November 2026"): string {
  if (!iso) return fallback;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString("en-PK", { month: "long", year: "numeric" });
}

const LEGAL_NAV = [
  { slug: "privacy", label: "Privacy Policy", href: "/privacy", desc: "Data & patient confidentiality" },
  { slug: "terms", label: "Terms of Service", href: "/terms", desc: "Platform & booking terms" },
  { slug: "about", label: "About CareSaath", href: "/about", desc: "Verification & safety" },
  { slug: "contact", label: "Contact & Support", href: "/contact", desc: "Reach our compliance team" },
];

/**
 * CareSaath Trust Center shell for legal & policy pages (Privacy, Terms).
 * Uses the signature CareSaath inset deep-teal hero panel and max-w-6xl reading grid.
 */
export function LegalShell({
  title,
  updated,
  intro,
  eyebrow = "Legal & Compliance",
  activeSlug,
  children,
}: {
  title: string;
  updated: string;
  intro?: string;
  eyebrow?: string;
  activeSlug?: "privacy" | "terms";
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-white text-ink-900">
      <SiteNav />

      {/* Signature CareSaath Inset Deep-Teal Hero Panel */}
      <div className="px-2.5 pt-2.5 sm:px-4 sm:pt-4">
        <section className="relative overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-brand-900 via-brand-800 to-brand-950 text-white sm:rounded-2xl">
          <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-brand-400/15 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-16 size-72 rounded-full bg-accent-400/10 blur-3xl" />
          <div className="relative mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl">{title}</h1>
            {intro ? <p className="mt-4 max-w-2xl text-base leading-relaxed text-brand-100 sm:text-lg">{intro}</p> : null}

            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium text-brand-200 sm:text-sm">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="size-3.5 text-accent-400" />
                Last updated <strong className="font-semibold text-white">{updated}</strong>
              </span>
              <span aria-hidden className="text-white/30">·</span>
              <span className="inline-flex items-center gap-1.5">
                <Globe className="size-3.5 text-accent-400" />
                Jurisdiction: <strong className="font-semibold text-white">Islamic Republic of Pakistan</strong>
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* Main Two-Column Reading Container — aligned strictly to max-w-6xl */}
      <main className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[270px_1fr] lg:items-start lg:gap-12">
          {/* Left Sticky Sidebar */}
          <aside className="space-y-5 lg:sticky lg:top-28">
            <div className="rounded-2xl border border-ink-100 bg-ink-25/70 p-4">
              <p className="px-2.5 text-[11px] font-bold tracking-[0.16em] text-ink-400 uppercase">Trust Center</p>
              <nav aria-label="Legal documents" className="mt-3 space-y-1">
                {LEGAL_NAV.map((item) => {
                  const isActive = activeSlug === item.slug;
                  return (
                    <Link
                      key={item.slug}
                      href={item.href}
                      className={clsx(
                        "flex items-start gap-2.5 rounded-xl px-3 py-2.5 transition-all",
                        isActive
                          ? "bg-brand-700 text-white shadow-sm shadow-brand-900/15"
                          : "text-ink-600 hover:bg-white hover:text-ink-900",
                      )}
                    >
                      <FileText className={clsx("mt-0.5 size-4 shrink-0", isActive ? "text-accent-400" : "text-ink-400")} />
                      <div className="min-w-0">
                        <p className={clsx("text-sm", isActive ? "font-semibold text-white" : "font-medium")}>{item.label}</p>
                        <p className={clsx("text-xs", isActive ? "text-brand-100" : "text-ink-400")}>{item.desc}</p>
                      </div>
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="rounded-2xl border border-brand-200/70 bg-brand-50/50 p-5">
              <p className="text-sm font-bold text-ink-900">Data Protection &amp; Legal</p>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-600">
                Need a data export, account deletion, or compliance clarification? Our team replies within 2 business days.
              </p>
              <a
                href="mailto:info@caresaath.com"
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800 hover:underline"
              >
                <Mail className="size-3.5" />
                info@caresaath.com
              </a>
            </div>
          </aside>

          {/* Right Document Surface */}
          <article className="min-w-0 rounded-3xl border border-ink-100 bg-white p-6 shadow-sm shadow-ink-900/[0.03] sm:p-10 lg:p-12">
            <div className="space-y-8">{children}</div>
          </article>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

/**
 * Renders rich HTML edited in the Admin Editorial CMS (TipTap) with CareSaath's
 * refined legal & editorial typography.
 */
export function EditorialHtml({ html }: { html: string }) {
  return (
    <div
      className={
        "space-y-4 text-[15.5px] leading-[1.8] text-ink-600 " +
        "[&>h1]:mt-10 [&>h1]:text-2xl [&>h1]:font-extrabold [&>h1]:tracking-tight [&>h1]:text-ink-900 " +
        "[&>h2]:mt-10 [&>h2]:border-t [&>h2]:border-ink-100 [&>h2]:pt-8 [&>h2]:text-xl [&>h2]:font-bold [&>h2]:tracking-tight [&>h2]:text-ink-900 first:[&>h2]:mt-0 first:[&>h2]:border-t-0 first:[&>h2]:pt-0 " +
        "[&>h3]:mt-7 [&>h3]:text-lg [&>h3]:font-bold [&>h3]:text-ink-900 " +
        "[&>p]:leading-[1.8] [&>p]:text-ink-600 " +
        "[&>ul]:list-disc [&>ul]:space-y-2.5 [&>ul]:pl-5 [&>ul>li]:pl-1.5 [&>ul>li::marker]:text-brand-600 " +
        "[&>ol]:list-decimal [&>ol]:space-y-2.5 [&>ol]:pl-5 [&>ol>li]:pl-1.5 " +
        "[&_strong]:font-semibold [&_strong]:text-ink-900 " +
        "[&_a]:font-semibold [&_a]:text-brand-700 [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-brand-800 " +
        "[&>blockquote]:my-6 [&>blockquote]:rounded-r-xl [&>blockquote]:border-l-4 [&>blockquote]:border-brand-500 [&>blockquote]:bg-brand-50/40 [&>blockquote]:py-3 [&>blockquote]:pr-4 [&>blockquote]:pl-4 [&>blockquote]:italic [&>blockquote]:text-ink-700 " +
        "[&>hr]:my-8 [&>hr]:border-ink-100"
      }
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** A numbered-free section: heading + body. */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-ink-100 pt-8 first:border-t-0 first:pt-0">
      <h2 className="text-xl font-bold tracking-tight text-ink-900">{title}</h2>
      <div className="mt-4 space-y-4 text-[15.5px] leading-[1.8] text-ink-600">{children}</div>
    </section>
  );
}

export function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-brand-600" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
