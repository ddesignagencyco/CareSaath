"use client";

import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import {
  BadgePercent,
  BarChart3,
  CalendarClock,
  CreditCard,
  FileSpreadsheet,
  Percent,
  Phone,
  Scale,
  ScrollText,
  Settings2,
  ShieldAlert,
  UserCheck,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { Logo, LogoMark } from "@shared/brand";
import { CAN_ADMIN_PAYMENTS, CAN_AUDIT_LOG, CAN_CALL_LOGS, caregiversApi, disputesApi, payoutsApi, safetyApi } from "@/features/admin/lib/api/admin";
import { keys } from "@/features/admin/lib/api/hooks";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
  urgent?: boolean;
}

/** Badge counts come from `total` on page-size-1 list calls. */
function useNavCounts() {
  const opts = { refetchInterval: 60_000 };
  const pending = useQuery({
    queryKey: [...keys.caregivers, "count", "PENDING"],
    queryFn: () => caregiversApi.list({ status: "PENDING", limit: 1 }),
    ...opts,
  });
  const incidents = useQuery({
    queryKey: [...keys.incidents, "count", "OPEN"],
    queryFn: () => safetyApi.list({ status: "OPEN", limit: 1 }),
    ...opts,
  });
  const disputes = useQuery({
    queryKey: [...keys.disputes, "count", "OPEN"],
    queryFn: () => disputesApi.list({ status: "OPEN", limit: 1 }),
    ...opts,
  });
  const payouts = useQuery({
    queryKey: [...keys.payouts, "count", "REQUESTED"],
    queryFn: () => payoutsApi.list({ status: "REQUESTED", limit: 1 }),
    ...opts,
  });
  return {
    pending: pending.data?.total,
    incidents: incidents.data?.total,
    disputes: disputes.data?.total,
    payouts: payouts.data?.total,
  };
}

export function Sidebar({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
  const pathname = usePathname();
  const counts = useNavCounts();
  const t = useTranslations("adminA");
  const tNav = useTranslations("common.nav");

  const groups: { label?: string; items: NavItem[] }[] = [
    { items: [{ href: "/admin", label: t("nav.overview"), icon: BarChart3 }] },
    {
      label: t("nav.groups.caregivers"),
      items: [
        { href: "/admin/caregivers", label: t("nav.verification"), icon: UserCheck, count: counts.pending },
        { href: "/admin/reverification", label: t("nav.reverification"), icon: CalendarClock },
      ],
    },
    {
      label: t("nav.groups.trust"),
      items: [
        { href: "/admin/safety", label: t("nav.safety"), icon: ShieldAlert, count: counts.incidents, urgent: true },
        { href: "/admin/disputes", label: t("nav.disputes"), icon: Scale, count: counts.disputes },
        ...(CAN_CALL_LOGS ? [{ href: "/admin/call-logs", label: t("nav.callLogs"), icon: Phone }] : []),
      ],
    },
    {
      label: t("nav.groups.finance"),
      items: [
        { href: "/admin/payouts", label: t("nav.payouts"), icon: Wallet, count: counts.payouts },
        ...(CAN_ADMIN_PAYMENTS ? [{ href: "/admin/payments", label: t("nav.payments"), icon: CreditCard }] : []),
        { href: "/admin/commissions", label: t("nav.commissions"), icon: Percent },
        { href: "/admin/promos", label: t("nav.promos"), icon: BadgePercent },
        { href: "/admin/reports", label: t("nav.reports"), icon: FileSpreadsheet },
      ],
    },
    {
      label: t("nav.groups.platform"),
      items: [
        { href: "/admin/settings", label: t("nav.settings"), icon: Settings2 },
        ...(CAN_AUDIT_LOG ? [{ href: "/admin/audit-logs", label: t("nav.auditLogs"), icon: ScrollText }] : []),
      ],
    },
  ];

  return (
    <nav className="flex h-full flex-col" aria-label={tNav("main")}>
      <div className={clsx("flex h-16 items-center", collapsed ? "justify-center" : "px-5")}>
        {collapsed ? <LogoMark className="size-9" /> : <Logo subtitle={t("shell.logoSubtitle")} />}
      </div>
      <div className={clsx("flex-1 overflow-x-hidden overflow-y-auto pt-4 pb-6", collapsed ? "space-y-3 px-2" : "space-y-6 px-3")}>
        {groups.map((g, gi) => (
          <div key={gi}>
            {g.label &&
              (collapsed ? (
                gi > 0 && <hr className="mx-3 mb-3 border-ink-100" />
              ) : (
                <p className="mb-1.5 px-3 text-[11px] font-bold tracking-[0.12em] text-ink-400 uppercase">{g.label}</p>
              ))}
            <ul className="space-y-0.5">
              {g.items.map((item) => {
                const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      aria-label={collapsed ? item.label : undefined}
                      title={collapsed ? (item.count ? t("nav.withCount", { label: item.label, count: item.count }) : item.label) : undefined}
                      className={clsx(
                        "group relative flex items-center rounded-lg text-sm font-semibold transition-colors",
                        collapsed ? "size-11 justify-center mx-auto" : "gap-3 px-3 py-2",
                        active ? "bg-brand-50 text-brand-800" : "text-ink-600 hover:bg-ink-50 hover:text-ink-900",
                      )}
                    >
                      <Icon className={clsx("size-[18px]", active ? "text-brand-600" : "text-ink-400 group-hover:text-ink-600")} />
                      {!collapsed && <span className="flex-1">{item.label}</span>}
                      {!!item.count && collapsed && (
                        <span
                          className={clsx(
                            "absolute top-1.5 end-1.5 size-2.5 rounded-full ring-2 ring-white",
                            item.urgent ? "bg-danger-600" : "bg-accent-500",
                          )}
                          aria-hidden
                        />
                      )}
                      {!!item.count && !collapsed && (
                        <span
                          className={clsx(
                            "tabular min-w-5 rounded-full px-1.5 text-center text-xs leading-5 font-bold",
                            item.urgent ? "bg-danger-600 text-white" : "bg-accent-100 text-accent-700",
                          )}
                        >
                          {item.count}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
