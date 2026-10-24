"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Bell, CalendarCheck2, CircleUserRound, Home, MapPin, PanelLeftClose, PanelLeftOpen, Phone, Scale, Search, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useSyncExternalStore } from "react";
import { Logo, LogoMark } from "@shared/brand";
import { LanguageToggle } from "@shared/i18n/language-toggle";
import { useSidebarCollapsed } from "@shared/lib/use-sidebar-collapsed";
import { formatPkMobile } from "@shared/lib/phone";
import { IconButton } from "@shared/ui/button";
import { ProfileMenu } from "@shared/ui/profile-menu";
import { meApi, notificationsApi } from "@/features/customer/lib/api/customer";
import { ApiError, USE_MOCKS } from "@/features/customer/lib/api/http";
import { keys } from "@/features/customer/lib/api/keys";
import { useMe, useSessionRaw, useSignOut } from "@/features/customer/lib/auth";
import { getSeenAt, markSeen, SEEN_EVENT, useDescribe } from "@/features/customer/lib/labels";
import { NotificationBell } from "@shared/ui/notification-bell";

/** Message key under customerA.shell. */
type NavLabel =
  | "nav.home"
  | "nav.findCare"
  | "nav.bookings"
  | "nav.account"
  | "items.patients"
  | "items.addresses"
  | "items.contacts"
  | "items.payments"
  | "items.disputes"
  | "items.notifications"
  | "items.profile";

interface NavItem {
  href: string;
  label: NavLabel;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV: NavItem[] = [
  { href: "/customer", label: "nav.home", icon: Home },
  { href: "/customer/caregivers", label: "nav.findCare", icon: Search },
  { href: "/customer/bookings", label: "nav.bookings", icon: CalendarCheck2 },
  { href: "/customer/account", label: "nav.account", icon: CircleUserRound },
];

/** Desktop sidebar sections; on phones the family/account pages live under the Account tab. */
const SIDEBAR_GROUPS: { label?: "groups.care" | "groups.family" | "groups.account"; items: NavItem[] }[] = [
  { items: [NAV[0]] },
  { label: "groups.care", items: [NAV[1], NAV[2]] },
  {
    label: "groups.family",
    items: [
      { href: "/customer/account/patients", label: "items.patients", icon: Users },
      { href: "/customer/account/addresses", label: "items.addresses", icon: MapPin },
      { href: "/customer/account/contacts", label: "items.contacts", icon: Phone },
    ],
  },
  {
    label: "groups.account",
    items: [
      { href: "/customer/account/payments", label: "items.payments", icon: Wallet },
      { href: "/customer/account/disputes", label: "items.disputes", icon: Scale },
      { href: "/customer/notifications", label: "items.notifications", icon: Bell },
      { ...NAV[3], label: "items.profile" },
    ],
  },
];

const isActive = (pathname: string, href: string) =>
  href === "/customer" ? pathname === "/customer" : pathname === href || pathname.startsWith(`${href}/`);

function subscribeSeen(onChange: () => void) {
  window.addEventListener(SEEN_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SEEN_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function useUnread(enabled: boolean) {
  const seenAt = useSyncExternalStore(subscribeSeen, getSeenAt, () => "");
  const list = useQuery({
    queryKey: [...keys.notifications, "list"],
    queryFn: () => notificationsApi.list({ limit: 50 }),
    refetchInterval: 30_000,
    enabled,
  });
  return (list.data?.items ?? []).filter((n) => n.channel === "PUSH" && !n.readAt && n.createdAt > seenAt).length;
}

/**
 * Signed-in customer layout. Renders on the server (pages show skeletons);
 * on the client, visitors without a session go to /customer/login.
 */
export function CustomerShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("customerA.shell");
  const tn = useTranslations("common.nav");
  const ts = useTranslations("common.states");
  const cn = useTranslations("customerA.notifications");
  const describe = useDescribe();
  const { raw, hydrated } = useSessionRaw();
  const me = useMe();
  const signOut = useSignOut();
  const unread = useUnread(!!me.data);
  const qc = useQueryClient();
  const [collapsed, toggleCollapsed] = useSidebarCollapsed("caresaath.customer.sidebarCollapsed");

  // GET /customer/me has no role guard, so a non-customer session (e.g. a stale
  // caregiver token in this storage key) is caught here by role.
  const unauthorized =
    (me.error instanceof ApiError && (me.error.status === 401 || me.error.status === 403)) || (!!me.data && me.data.role !== "CUSTOMER");
  useEffect(() => {
    if (unauthorized) signOut();
  }, [unauthorized, signOut]);
  useEffect(() => {
    if (hydrated && !raw) router.replace("/login?next=/customer");
  }, [hydrated, raw, router]);

  if (hydrated && !raw) return null;

  const name = me.data?.fullName || t("fallbackName");
  const phone = me.data ? formatPkMobile(me.data.phone) : "";

  return (
    <div className={clsx("min-h-dvh transition-[padding] duration-200 ease-out", collapsed ? "lg:ps-20" : "lg:ps-64")}>
      <aside
        className={clsx(
          "fixed inset-y-0 start-0 z-30 hidden flex-col overflow-hidden border-e border-ink-100 bg-white transition-[width] duration-200 ease-out lg:flex",
          collapsed ? "w-20" : "w-64",
        )}
      >
        <div className={clsx("flex h-16 shrink-0 items-center", collapsed ? "justify-center" : "px-5")}>
          {collapsed ? <LogoMark className="size-9" /> : <Logo subtitle={t("product")} />}
        </div>
        <nav aria-label={tn("main")} className={clsx("flex-1 overflow-x-hidden overflow-y-auto pt-4 pb-6", collapsed ? "space-y-3 px-2" : "space-y-6 px-3")}>
          {SIDEBAR_GROUPS.map((group, gi) => (
            <div key={gi}>
              {group.label &&
                (collapsed ? (
                  <hr className="mx-3 mb-3 border-ink-100" />
                ) : (
                  <p className="mb-1.5 px-3 text-[11px] font-bold tracking-[0.12em] text-ink-400 uppercase">{t(group.label)}</p>
                ))}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                // "Account" stays highlighted only on its own page; its sub-pages have their own entries.
                const active = item.href === "/customer/account" ? pathname === item.href : isActive(pathname, item.href);
                const Icon = item.icon;
                const count = item.href === "/customer/notifications" ? unread : 0;
                const label = t(item.label);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      aria-label={collapsed ? label : undefined}
                      title={collapsed ? (count ? t("navCount", { label, count }) : label) : undefined}
                      className={clsx(
                        "group relative flex items-center rounded-lg text-sm font-semibold transition-colors",
                        collapsed ? "mx-auto size-11 justify-center" : "gap-3 px-3 py-2",
                        active ? "bg-brand-50 text-brand-800" : "text-ink-600 hover:bg-ink-50 hover:text-ink-900",
                      )}
                    >
                      <Icon className={clsx("size-[18px]", active ? "text-brand-600" : "text-ink-400 group-hover:text-ink-600")} />
                      {!collapsed && <span className="flex-1">{label}</span>}
                      {count > 0 &&
                        (collapsed ? (
                          <span className="absolute top-1.5 end-1.5 size-2.5 rounded-full bg-danger-600 ring-2 ring-white" aria-hidden />
                        ) : (
                          <span className="tabular min-w-[18px] rounded-full bg-danger-600 px-1 text-center text-[10px] leading-[18px] font-bold text-white">
                            {count > 9 ? "9+" : count}
                          </span>
                        ))}
                    </Link>
                  </li>
                );
              })}
            </ul>
            </div>
          ))}
        </nav>
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-ink-100 bg-white/90 px-4 backdrop-blur sm:px-6 lg:h-16">
        <Link href="/customer" className="lg:hidden" aria-label={tn("home")}>
          <LogoMark className="size-8" />
        </Link>
        <div className="hidden lg:block">
          <IconButton label={collapsed ? tn("expandSidebar") : tn("collapseSidebar")} aria-expanded={!collapsed} onClick={toggleCollapsed}>
            {collapsed ? <PanelLeftOpen className="rtl:-scale-x-100 size-5" /> : <PanelLeftClose className="rtl:-scale-x-100 size-5" />}
          </IconButton>
        </div>
        <div className="flex-1" />
        {USE_MOCKS && (
          <span className="hidden rounded-full bg-accent-50 px-3 py-1 text-xs font-semibold text-accent-700 ring-1 ring-accent-400/30 sm:inline">
            {ts("mockBadge")}
          </span>
        )}
        <LanguageToggle onChange={(l) => meApi.update({ preferredLanguage: l === "ur" ? "UR" : "EN" }).catch(() => undefined)} />
        <NotificationBell
          queryKey={[...keys.notifications, "list"]}
          queryFn={() => notificationsApi.list({ limit: 50 })}
          describe={describe}
          seenEvent={SEEN_EVENT}
          getSeenAt={getSeenAt}
          markSeen={markSeen}
          markRead={(before) =>
            notificationsApi
              .markRead({ before })
              .then(() => qc.invalidateQueries({ queryKey: keys.notifications }))
              .catch(() => undefined)
          }
          allHref="/customer/notifications"
          labels={{
            title: cn("title"),
            empty: cn("empty"),
            viewAll: tn("viewAll"),
            idle: tn("notifications"),
            withCount: (n) => tn("notificationsNew", { count: n }),
          }}
        />
        <div className="hidden border-s border-ink-100 ps-2 lg:block">
          <ProfileMenu
            name={name}
            phone={phone}
            role={t("role")}
            items={[
              { href: "/customer/account/patients", label: t("items.patients"), icon: Users },
              { href: "/customer/account/addresses", label: t("items.addresses"), icon: MapPin },
              { href: "/customer/account/payments", label: t("items.payments"), icon: Wallet },
            ]}
            onSignOut={signOut}
          />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1680px] px-4 pt-5 pb-28 sm:px-6 lg:px-8 lg:pt-8 lg:pb-12">{children}</main>

      <nav aria-label={tn("main")} className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <ul className="mx-auto grid max-w-md grid-cols-4">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href) || (item.href === "/customer/bookings" && pathname.startsWith("/customer/visits"));
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={clsx("flex flex-col items-center gap-1 pt-2.5 pb-2 text-[11px] font-semibold transition-colors", active ? "text-brand-700" : "text-ink-500")}
                >
                  <span className={clsx("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-brand-50")}>
                    <Icon className="size-5" />
                  </span>
                  {t(item.label)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
