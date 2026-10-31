"use client";

import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAction } from "@shared/api/use-action";
import { Card } from "@shared/ui/card";
import { Switch } from "@shared/ui/switch";
import { availabilityApi, profileApi } from "@/features/caregiver/lib/api/caregiver";
import { keys } from "@/features/caregiver/lib/api/keys";
import { useLocationSharing } from "@/features/caregiver/lib/use-live-location";

/**
 * "Available now for emergency visits" — opts the caregiver into the nearby-now
 * (ASAP) search. Turning it on also enables live-location sharing, because the
 * backend only lists them while a fresh GPS fix is coming in. Shows whether they
 * are actually live (acceptingImmediate + fresh fix + not mid-visit).
 */
export function AvailableNowCard() {
  const t = useTranslations("caregiverA.availableNow");
  const [, setSharing] = useLocationSharing();
  const profile = useQuery({ queryKey: keys.profile, queryFn: profileApi.get });
  const on = profile.data?.acceptingImmediate ?? false;
  const live = profile.data?.availableNow ?? false;

  const toggle = useAction((available: boolean) => availabilityApi.setAvailableNow(available), {
    invalidate: [keys.profile],
    success: null,
    onSuccess: (_result, available) => {
      // On → start live-location sharing (the backend only lists a caregiver with a fresh fix).
      // Off → stop it too, so the caregiver isn't tracked once they're no longer available.
      setSharing(available);
    },
  });

  const subtitle = !on ? t("hint") : live ? t("live") : t("needLocation");

  return (
    <Card className="flex items-center gap-4 p-5">
      <span className={clsx("flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors", on ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-400")}>
        <Zap className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-bold text-ink-900">
          {t("title")}
          {on && (
            <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", live ? "bg-success-50 text-success-700" : "bg-accent-50 text-accent-700")}>
              <span className={clsx("size-1.5 rounded-full", live ? "bg-success-500" : "bg-accent-500")} />
              {live ? t("statusLive") : t("statusPaused")}
            </span>
          )}
        </p>
        <p className="text-sm text-ink-500">{subtitle}</p>
        {on && <p className="mt-0.5 text-xs text-ink-400">{t("foregroundHint")}</p>}
      </div>
      <Switch checked={on} onCheckedChange={(v) => toggle.mutate(v)} aria-label={t("title")} disabled={toggle.isPending || !profile.data} />
    </Card>
  );
}
