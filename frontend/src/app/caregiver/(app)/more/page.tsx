"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Languages, LogOut, MapPin, Maximize2 } from "lucide-react";
import { Switch } from "@shared/ui/switch";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { LanguageToggle } from "@shared/i18n/language-toggle";
import { Card } from "@shared/ui/card";
import { formatPkMobile } from "@shared/lib/phone";
import { SECONDARY } from "@/features/caregiver/components/shell/nav";
import { PhotoAvatar, usePhotoUrl } from "@/features/caregiver/components/profile-photo";
import { PhotoViewer } from "@shared/ui/photo-viewer";
import { NotificationPrefsCard } from "@shared/notifications/notification-prefs";
import { meApi, notificationsApi, profileApi } from "@/features/caregiver/lib/api/caregiver";
import { keys } from "@/features/caregiver/lib/api/keys";
import { useMe, useSignOut } from "@/features/caregiver/lib/auth";
import { useLocationSharing } from "@/features/caregiver/lib/use-live-location";

/** Mobile overflow menu (the desktop sidebar lists these directly). */
export default function MorePage() {
  const me = useMe();
  const profile = useQuery({ queryKey: keys.profile, queryFn: profileApi.get });
  const signOut = useSignOut();
  const t = useTranslations("caregiverA");
  const tc = useTranslations("common");
  const tp = useTranslations("common.photo");
  const photoUrl = usePhotoUrl(profile.data?.photoKey ?? null);
  const [viewOpen, setViewOpen] = useState(false);
  const [shareLocation, setShareLocation] = useLocationSharing();

  return (
    <div className="space-y-5">
      <Card className="flex items-center gap-4 p-5">
        <div className="relative shrink-0">
          <PhotoAvatar name={me.data?.fullName || t("shell.defaultName")} photoKey={profile.data?.photoKey} size="lg" />
          {photoUrl && (
            <button
              type="button"
              onClick={() => setViewOpen(true)}
              aria-label={tp("view")}
              title={tp("view")}
              className="absolute -start-1 -bottom-1 flex size-7 items-center justify-center rounded-full bg-white text-ink-700 ring-2 ring-brand-600 hover:bg-ink-50"
            >
              <Maximize2 className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
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
        <button onClick={signOut} className="flex w-full items-center gap-3 px-5 py-4 text-start text-sm font-semibold text-danger-600 hover:bg-danger-50">
          <LogOut className="size-5" /> {tc("actions.signOut")}
        </button>
      </Card>

      {viewOpen && photoUrl && (
        <PhotoViewer
          src={photoUrl}
          name={me.data?.fullName || t("shell.defaultName")}
          onClose={() => setViewOpen(false)}
        />
      )}
    </div>
  );
}
