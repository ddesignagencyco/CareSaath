"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Languages, LogOut, MapPin, RotateCcw } from "lucide-react";
import { Switch } from "@shared/ui/switch";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LanguageToggle } from "@shared/i18n/language-toggle";
import { Card } from "@shared/ui/card";
import { useToast } from "@shared/ui/toast";
import { formatPkMobile } from "@shared/lib/phone";
import { SECONDARY } from "@/features/caregiver/components/shell/nav";
import { PhotoAvatar } from "@/features/caregiver/components/profile-photo";
import { NotificationPrefsCard } from "@shared/notifications/notification-prefs";
import { meApi, notificationsApi, profileApi } from "@/features/caregiver/lib/api/caregiver";
import { keys } from "@/features/caregiver/lib/api/keys";
import { USE_MOCKS } from "@/features/caregiver/lib/api/http";
import { useMe, useSignOut } from "@/features/caregiver/lib/auth";
import { useLocationSharing } from "@/features/caregiver/lib/use-live-location";
import { resetMockDb } from "@/features/caregiver/lib/mock/db";

/** Mobile overflow menu (the desktop sidebar lists these directly). */
export default function MorePage() {
  const me = useMe();
  const profile = useQuery({ queryKey: keys.profile, queryFn: profileApi.get });
  const signOut = useSignOut();
  const client = useQueryClient();
  const toast = useToast();
  const t = useTranslations("caregiverA");
  const tc = useTranslations("common");
  const [shareLocation, setShareLocation] = useLocationSharing();

  return (
    <div className="space-y-5">
      <Card className="flex items-center gap-4 p-5">
        <PhotoAvatar name={me.data?.fullName || t("shell.defaultName")} photoKey={profile.data?.photoKey} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-lg font-extrabold text-ink-900">{me.data?.fullName || " "}</p>
          <p className="tabular text-sm text-ink-500">{me.data ? formatPkMobile(me.data.phone) : " "}</p>
        </div>
      </Card>

      <Card className="divide-y divide-ink-100 overflow-hidden">
        {SECONDARY.map(({ href, labelKey, icon: Icon }) => (
          <Link key={href} href={href} className="flex items-center gap-3 px-5 py-4 text-sm font-semibold text-ink-800 hover:bg-ink-25">
            <Icon className="size-5 text-ink-400" />
            <span className="flex-1">{t(`nav.${labelKey}`)}</span>
            <ChevronRight className="rtl:-scale-x-100 size-4 text-ink-300" />
          </Link>
        ))}
        <div className="flex items-center gap-3 px-5 py-3 text-sm font-semibold text-ink-800">
          <Languages className="size-5 text-ink-400" />
          <span className="flex-1">{tc("language.label")}</span>
          <LanguageToggle onChange={(l) => meApi.update({ preferredLanguage: l === "ur" ? "UR" : "EN" }).catch(() => undefined)} />
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
              <MapPin className="size-4 text-ink-400" /> {t("location.title")}
            </p>
            <p className="mt-1 text-xs text-ink-500">{t("location.hint")}</p>
          </div>
          <Switch checked={shareLocation} onCheckedChange={setShareLocation} aria-label={t("location.title")} />
        </div>
      </Card>

      <NotificationPrefsCard api={{ prefs: notificationsApi.prefs, setPref: notificationsApi.setPref }} />

      <Card className="divide-y divide-ink-100 overflow-hidden">
        {USE_MOCKS && (
          <button
            onClick={() => {
              resetMockDb();
              client.invalidateQueries();
              toast.success(tc("states.demoReset"));
            }}
            className="flex w-full items-center gap-3 px-5 py-4 text-start text-sm font-semibold text-ink-800 hover:bg-ink-25"
          >
            <RotateCcw className="size-5 text-ink-400" /> {tc("actions.resetDemo")}
          </button>
        )}
        <button onClick={signOut} className="flex w-full items-center gap-3 px-5 py-4 text-start text-sm font-semibold text-danger-600 hover:bg-danger-50">
          <LogOut className="size-5" /> {tc("actions.signOut")}
        </button>
      </Card>
    </div>
  );
}
