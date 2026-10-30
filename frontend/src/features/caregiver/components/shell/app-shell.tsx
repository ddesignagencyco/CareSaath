"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { CalendarClock, PanelLeftClose, PanelLeftOpen, UserRound } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Logo, LogoMark } from "@shared/brand";
import { LanguageToggle } from "@shared/i18n/language-toggle";
import { formatPkMobile } from "@shared/lib/phone";
import { IconButton } from "@shared/ui/button";
import { useSidebarCollapsed } from "@shared/lib/use-sidebar-collapsed";
import { usePermissionPrime } from "@shared/hooks/use-permission-prime";
import { ProfileMenu } from "@shared/ui/profile-menu";
import { PhotoAvatar } from "@/features/caregiver/components/profile-photo";
import { meApi, notificationsApi, profileApi } from "@/features/caregiver/lib/api/caregiver";
import { keys } from "@/features/caregiver/lib/api/keys";
import { getSeenAt, markSeen, SEEN_EVENT, useDescribe } from "@/features/caregiver/lib/notifications";
import { NotificationBell } from "@shared/ui/notification-bell";
import { ApiError, http } from "@/features/caregiver/lib/api/http";
import { session } from "@/features/caregiver/lib/api/session";
import { useRealtime } from "@shared/api/realtime";
import { useLiveLocation } from "@/features/caregiver/lib/use-live-location";
import { CallProvider } from "@shared/chat/call-context";
import { homeFor, refreshTokens, tokenRole, useMe, useSessionRaw, useSignOut } from "@/features/caregiver/lib/auth";
import { useRequestCount, useUnreadCount } from "./counts";
import { isActive, MORE, PRIMARY, SECONDARY, SIDEBAR_GROUPS } from "./nav";

function CountBadge({ count, className }: { count?: number; className?: string }) {
  if (!count) return null;
  return (
    <span
      className={clsx(
        "tabular min-w-[18px] rounded-full bg-danger-600 px-1 text-center text-[10px] leading-[18px] font-bold text-white ring-2 ring-white",
        className,
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

/**
 * Signed-in caregiver layout. Renders on the server (pages show skeletons)
 * so Next can validate segments; on the client it routes users who aren't
 * approved caregivers to login, onboarding or the verification status page.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { raw, hydrated } = useSessionRaw();
  const me = useMe();
  const signOut = useSignOut();
  const client = useQueryClient();
  const approved = me.data?.caregiverProfile?.verificationStatus === "APPROVED";
  useRealtime({ session, queryClient: client, notificationsKey: keys.notifications, refresh: () => http.refreshSession(), enabled: !!me.data });
  // Share live location (for immediate/ASAP bookings) while an approved caregiver has the app open.
  useLiveLocation(approved);
  // Ask for notification + location permission up front (on first tap) so visits + alerts work live.
  usePermissionPrime({ warmLocation: approved });
  // Only for the avatar photo; pages share this cache entry.
  const profile = useQuery({ queryKey: keys.profile, queryFn: profileApi.get, enabled: approved });
  const requests = useRequestCount(approved);
  const unread = useUnreadCount(approved);
  const [collapsed, toggleCollapsed] = useSidebarCollapsed("caresaath.caregiver.sidebarCollapsed");
  const t = useTranslations("caregiverA");
  const tNav = useTranslations("common.nav");
  const describe = useDescribe();

  // Session no longer valid (expired or unknown user): start again at login.
  const unauthorized = me.error instanceof ApiError && me.error.status === 401;
  useEffect(() => {
    if (unauthorized) signOut();
  }, [unauthorized, signOut]);

  useEffect(() => {
    if (!hydrated) return;
    if (!raw) {
      router.replace("/login?next=/caregiver");
      return;
    }
    if (!me.data) return;
    const home = homeFor(me.data);
    if (home !== "/caregiver") {
      router.replace(home);
      return;
    }
    // Profile exists but the token predates registration (it still says
    // CUSTOMER and caregiver routes answer 403): refresh it, then refetch.
    if (tokenRole() !== "CAREGIVER") {
      refreshTokens()
        .then(() => client.invalidateQueries())
        .catch(() => undefined);
    }
  }, [hydrated, raw, me.data, router, client]);

  if (hydrated && (!raw || (me.data && !approved))) return null;

  const name = me.data?.fullName || t("shell.defaultName");
  const phone = me.data ? formatPkMobile(me.data.phone) : "";

  return (
    <CallProvider session={session} enabled={approved}>
    <div className={clsx("min-h-dvh transition-[padding] duration-200 ease-out", collapsed ? "lg:ps-20" : "lg:ps-64")}>
      {/* Desktop sidebar */}
      <aside
        className={clsx(
          "fixed inset-y-0 start-0 z-30 hidden flex-col overflow-hidden border-e border-ink-100 bg-white transition-[width] duration-200 ease-out lg:flex",
          collapsed ? "w-20" : "w-64",
        )}
      >
        <div className={clsx("flex h-16 shrink-0 items-center", collapsed ? "justify-center" : "px-5")}>
          {collapsed ? <LogoMark className="size-9" /> : <Logo subtitle={t("shell.subtitle")} />}
        </div>
        <nav aria-label={tNav("main")} className={clsx("flex-1 overflow-x-hidden overflow-y-auto pt-4 pb-6", collapsed ? "space-y-3 px-2" : "space-y-6 px-3")}>
          {SIDEBAR_GROUPS.map((group, gi) => (
            <div key={gi}>
              {group.labelKey &&
                (collapsed ? (
                  <hr className="mx-3 mb-3 border-ink-100" />
                ) : (
                  <p className="mb-1.5 px-3 text-[11px] font-bold tracking-[0.12em] text-ink-400 uppercase">{t(`nav.groups.${group.labelKey}`)}</p>
                ))}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                const label = t(`nav.${item.labelKey}`);
                const count = item.href === "/caregiver/requests" ? requests : item.href === "/caregiver/notifications" ? unread : undefined;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      aria-label={collapsed ? label : undefined}
                      title={collapsed ? (count ? t("nav.withCount", { label, count }) : label) : undefined}
                      className={clsx(
                        "group relative flex items-center rounded-lg text-sm font-semibold transition-colors",
                        collapsed ? "mx-auto size-11 justify-center" : "gap-3 px-3 py-2",
                        active ? "bg-brand-50 text-brand-800" : "text-ink-600 hover:bg-ink-50 hover:text-ink-900",
                      )}
                    >
                      <Icon className={clsx("size-[18px]", active ? "text-brand-600" : "text-ink-400 group-hover:text-ink-600")} />
                      {!collapsed && <span className="flex-1">{label}</span>}
                      {!collapsed && <CountBadge count={count} />}
                      {collapsed && !!count && (
                        <span className="absolute top-1.5 end-1.5 size-2.5 rounded-full bg-danger-600 ring-2 ring-white" aria-hidden />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
            </div>
          ))}
        </nav>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-ink-100 bg-white/90 px-4 backdrop-blur sm:px-6 lg:h-16">
        <Link href="/caregiver" className="lg:hidden" aria-label={tNav("home")}>
          <LogoMark className="size-8" />
        </Link>
        <div className="hidden lg:block">
          <IconButton
            label={collapsed ? tNav("expandSidebar") : tNav("collapseSidebar")}
            aria-expanded={!collapsed}
            onClick={toggleCollapsed}
          >
            {collapsed ? <PanelLeftOpen className="rtl:-scale-x-100 size-5" /> : <PanelLeftClose className="rtl:-scale-x-100 size-5" />}
          </IconButton>
        </div>
        <div className="flex-1" />
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
              .then(() => client.invalidateQueries({ queryKey: keys.notifications }))
              .catch(() => undefined)
          }
          allHref="/caregiver/notifications"
          labels={{
            title: t("notifications.title"),
            empty: t("notifications.empty"),
            viewAll: tNav("viewAll"),
            idle: tNav("notifications"),
            withCount: (n) => tNav("notificationsNew", { count: n }),
          }}
        />
        <div className="hidden border-s border-ink-100 ps-2 lg:block">
          <ProfileMenu
            name={name}
            phone={phone}
            role={t("shell.role")}
            items={[
              { href: "/caregiver/profile", label: t("nav.profile"), icon: UserRound },
              { href: "/caregiver/availability", label: t("nav.availability"), icon: CalendarClock },
            ]}
            onSignOut={signOut}
            renderAvatar={(size) => <PhotoAvatar name={name} photoKey={profile.data?.photoKey} size={size} />}
          />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1680px] px-4 pt-5 pb-28 sm:px-6 lg:px-8 lg:pt-8 lg:pb-12">{children}</main>

      {/* Mobile bottom navigation */}
      <nav
        aria-label={tNav("main")}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {[...PRIMARY, MORE].map((item) => {
            const active =
              item.href === "/caregiver/more"
                ? isActive(pathname, "/caregiver/more") || SECONDARY.some((s) => isActive(pathname, s.href))
                : isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "relative flex flex-col items-center gap-1 pt-2.5 pb-2 text-[11px] font-semibold transition-colors",
                    active ? "text-brand-700" : "text-ink-500",
                  )}
                >
                  <span className={clsx("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-brand-50")}>
                    <Icon className="size-5" />
                  </span>
                  {t(`nav.${item.labelKey}`)}
                  {item.href === "/caregiver/requests" && <CountBadge count={requests} className="absolute top-1.5 start-1/2 ms-2" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
    </CallProvider>
  );
}
