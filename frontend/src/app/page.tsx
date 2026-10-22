import { ArrowRight, HeartHandshake, LayoutDashboard, Stethoscope } from "lucide-react";
import Link from "next/link";
import { Logo } from "@shared/brand";

const SECTIONS = [
  {
    href: "/customer",
    title: "Customer",
    text: "Find and book verified nurses and physiotherapists for home visits.",
    icon: HeartHandshake,
  },
  {
    href: "/caregiver",
    title: "Caregiver",
    text: "Manage requests, visits, availability and earnings.",
    icon: Stethoscope,
  },
  {
    href: "/admin",
    title: "Admin console",
    text: "Verify caregivers, handle safety, payouts and platform settings.",
    icon: LayoutDashboard,
  },
];

/** Entry point listing the three sections of the web app. */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-4 py-12 sm:px-6">
      <Logo subtitle="Home care" />
      <h1 className="mt-10 text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">Verified care, delivered home.</h1>
      <p lang="ur" dir="rtl" className="mt-2 self-start text-xl text-brand-700">
        گھر پر قابلِ اعتماد دیکھ بھال
      </p>
      <ul className="mt-10 grid grid-cols-1 gap-3">
        {SECTIONS.map(({ href, title, text, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="group flex items-center gap-4 rounded-2xl border border-ink-100 bg-white p-5 shadow-card transition-colors hover:border-brand-300"
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Icon className="size-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-ink-900">{title}</span>
                <span className="block text-sm text-ink-500">{text}</span>
              </span>
              <ArrowRight className="rtl:-scale-x-100 size-5 text-ink-300 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 group-hover:text-brand-600" />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
