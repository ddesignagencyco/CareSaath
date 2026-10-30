import { SiteFooter } from "./site-footer";
import { SiteNav } from "./site-nav";

/** Page shell for text-heavy legal/info pages (Privacy, Terms). */
export function LegalShell({ title, updated, intro, children }: { title: string; updated: string; intro: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-white text-ink-900">
      <SiteNav />
      <main className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-20">
        <p className="text-xs font-semibold tracking-[0.2em] text-brand-600 uppercase">Legal</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">{title}</h1>
        <p className="mt-3 text-sm text-ink-400">Last updated {updated}</p>
        <p className="mt-6 text-lg leading-relaxed text-ink-600">{intro}</p>
        <div className="mt-12 space-y-10">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}

/** A numbered-free section: heading + body. */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-ink-100 pt-8">
      <h2 className="text-xl font-semibold tracking-tight text-ink-900">{title}</h2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-ink-600">{children}</div>
    </section>
  );
}

export function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-400" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
