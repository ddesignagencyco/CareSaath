"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { NotificationChannel, NotificationPref } from "@shared/caregiver-types";
import { Card, CardBody, CardHeader } from "@shared/ui/card";
import { Skeleton } from "@shared/ui/misc";
import { Switch } from "@shared/ui/switch";

/** PUSH first (the in-app feed), then the outbound channels. */
const CHANNELS: NotificationChannel[] = ["PUSH", "SMS", "WHATSAPP", "EMAIL"];

export interface NotificationPrefsApi {
  prefs: () => Promise<NotificationPref[]>;
  setPref: (channel: NotificationChannel, enabled: boolean) => Promise<NotificationPref[]>;
}

/**
 * Per-channel notification opt-in/out (GET/PATCH /notifications/preferences).
 * Shared by the customer and caregiver apps; each passes its own http-bound api.
 */
export function NotificationPrefsCard({ api }: { api: NotificationPrefsApi }) {
  const t = useTranslations("shared.notificationPrefs");
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notification-prefs"], queryFn: api.prefs });
  const m = useMutation({
    mutationFn: ({ channel, enabled }: { channel: NotificationChannel; enabled: boolean }) => api.setPref(channel, enabled),
    onSuccess: (data) => qc.setQueryData(["notification-prefs"], data),
  });
  const byChannel = new Map((q.data ?? []).map((p) => [p.channel, p.enabled]));

  return (
    <Card>
      <CardHeader title={t("title")} description={t("description")} />
      <CardBody>
        {!q.data ? (
          <div className="space-y-3">
            <Skeleton className="h-10 rounded-lg" />
            <Skeleton className="h-10 rounded-lg" />
          </div>
        ) : (
          <ul className="divide-y divide-ink-100">
            {CHANNELS.map((c) => (
              <li key={c} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink-900">{t(`channels.${c}.label`)}</p>
                  <p className="text-xs text-ink-500">{t(`channels.${c}.hint`)}</p>
                </div>
                <Switch
                  checked={byChannel.get(c) ?? true}
                  disabled={m.isPending}
                  onCheckedChange={(enabled) => m.mutate({ channel: c, enabled })}
                  aria-label={t(`channels.${c}.label`)}
                />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-ink-500">{t("sosNote")}</p>
      </CardBody>
    </Card>
  );
}
