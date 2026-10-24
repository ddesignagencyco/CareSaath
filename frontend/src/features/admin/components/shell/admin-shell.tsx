"use client";

import clsx from "clsx";
import { Menu, PanelLeftClose, PanelLeftOpen, Settings2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { LanguageToggle } from "@shared/i18n/language-toggle";
import { IconButton } from "@shared/ui/button";
import { useQuery } from "@tanstack/react-query";
import { authApi, meApi } from "@/features/admin/lib/api/admin";
import { USE_MOCKS } from "@/features/admin/lib/api/http";
import { decodeToken, session } from "@/features/admin/lib/api/session";
import { formatPkMobile } from "@shared/lib/phone";
import { ProfileMenu } from "@shared/ui/profile-menu";
import { useSidebarCollapsed } from "@shared/lib/use-sidebar-collapsed";
import { Sidebar } from "./sidebar";

const SESSION_EVENT = "caresaath:admin-session";

const noopSubscribe = () => () => {};
/**
 * Re-read the session whenever the store changes (sign-in, background token
 * refresh, or a failed refresh clearing it) and when another tab changes it.
 */
function subscribeSession(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === session.key) onChange();
  };
  window.addEventListener(SESSION_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(SESSION_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}
function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Client-side guard: only an ADMIN access token may see the console. */
function useAdminSession() {
  const raw = useSyncExternalStore(subscribeSession, () => readStorage(session.key), () => null);
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!raw) return { hydrated, current: null };
  const current = session.get();
  const payload = current ? decodeToken(current.accessToken) : null;
  return { hydrated, current: payload?.role === "ADMIN" ? current : null };
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { hydrated, current } = useAdminSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, toggleCollapsed] = useSidebarCollapsed("caresaath.admin.sidebarCollapsed");
  const t = useTranslations("adminA.shell");
  const tNav = useTranslations("common.nav");
  const tStates = useTranslations("common.states");

  useEffect(() => {
    if (hydrated && !current) router.replace("/login?next=/admin");
  }, [hydrated, current, router]);

  // The admin's own name (the token carries no name; /customer/me is the shared profile route).
  const me = useQuery({ queryKey: ["a-me"], queryFn: meApi.get, enabled: !!current, staleTime: 300_000 });

  // Close the mobile menu after navigation.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMenuOpen(false);
  }

  // Server prerender (and hydration) renders the full shell so Next can
  // validate the page segment; once on the client, unauthenticated visitors
  // see nothing while being redirected to /login.
  if (hydrated && !current) return null;

  async function logout() {
    const refresh = session.get()?.refreshToken;
    session.clear();
    if (refresh) await authApi.logout(refresh).catch(() => undefined);
    // Full navigation (not router.replace) so the client router cache can't
    // restore the previous login screen with a stale phone/OTP still filled in.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- deliberate hard reload to drop all client state on signout
    window.location.assign("/login");
  }

  return (
    <div className={clsx("min-h-screen transition-[padding] duration-200 ease-out", collapsed ? "lg:ps-20" : "lg:ps-64")}>
      <aside
        className={clsx(
          "fixed inset-y-0 start-0 z-30 hidden overflow-hidden border-e border-ink-100 bg-white transition-[width] duration-200 ease-out lg:block",
          collapsed ? "w-20" : "w-64",
        )}
      >
        <Sidebar collapsed={collapsed} />
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink-900/40" onClick={() => setMenuOpen(false)} aria-hidden />
          <aside className="relative h-full w-72 max-w-[85vw] bg-white shadow-pop">
            <IconButton label={t("closeMenu")} className="absolute top-4 end-3" onClick={() => setMenuOpen(false)}>
              <X className="size-5" />
            </IconButton>
            <Sidebar onNavigate={() => setMenuOpen(false)} />
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-ink-100 bg-white/85 px-4 backdrop-blur sm:px-6">
        <IconButton label={t("openMenu")} className="lg:hidden" onClick={() => setMenuOpen(true)}>
          <Menu className="size-5" />
        </IconButton>
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
        {USE_MOCKS && (
          <span className="hidden rounded-full bg-accent-50 px-3 py-1 text-xs font-semibold text-accent-700 ring-1 ring-accent-400/30 sm:inline">
            {tStates("mockBadge")}
          </span>
        )}
        <LanguageToggle />
        <div className="border-s border-ink-100 ps-2">
          <ProfileMenu
            name={me.data?.fullName || t("adminName")}
            phone={current ? formatPkMobile(current.phone) : ""}
            role={t("role")}
            items={[{ href: "/admin/settings", label: t("platformSettings"), icon: Settings2 }]}
            onSignOut={logout}
          />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
