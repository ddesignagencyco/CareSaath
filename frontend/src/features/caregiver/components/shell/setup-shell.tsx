"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Logo } from "@shared/brand";
import { LanguageToggle } from "@shared/i18n/language-toggle";
import { Button } from "@shared/ui/button";
import { meApi } from "@/features/caregiver/lib/api/caregiver";
import { ApiError } from "@/features/caregiver/lib/api/http";
import { homeFor, useMe, useSessionRaw, useSignOut } from "@/features/caregiver/lib/auth";

/**
 * Layout for onboarding and the verification status page: signed-in users
 * who aren't approved caregivers yet. Approved caregivers go to the app.
 */
export function SetupShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { raw, hydrated } = useSessionRaw();
  const me = useMe();
  const signOut = useSignOut();
  const t = useTranslations("caregiverA.shell");
  const tc = useTranslations("common.actions");

  const unauthorized = me.error instanceof ApiError && me.error.status === 401;
  useEffect(() => {
    if (unauthorized) signOut();
  }, [unauthorized, signOut]);

  useEffect(() => {
    if (!hydrated) return;
    if (!raw) router.replace("/caregiver/login");
    else if (me.data && homeFor(me.data) === "/caregiver") router.replace("/caregiver");
  }, [hydrated, raw, me.data, router]);

  if (hydrated && !raw) return null;

  return (
    <div className="min-h-dvh bg-ink-25">
      <header className="sticky top-0 z-20 border-b border-ink-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Logo subtitle={t("subtitle")} />
          <div className="flex items-center gap-2">
            <LanguageToggle onChange={(l) => meApi.update({ preferredLanguage: l === "ur" ? "UR" : "EN" }).catch(() => undefined)} />
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="size-4" /> {tc("signOut")}
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
