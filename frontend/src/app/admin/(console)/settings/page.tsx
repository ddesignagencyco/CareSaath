"use client";

import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { Switch } from "@shared/ui/switch";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PageHeader } from "@shared/page-header";
import { Badge } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import { Card, CardHeader } from "@shared/ui/card";
import { Input } from "@shared/ui/field";
import { ErrorState, TableSkeleton } from "@shared/ui/misc";
import { configApi } from "@/features/admin/lib/api/admin";
import { keys, useAction } from "@/features/admin/lib/api/hooks";
import type { PlatformConfigItem } from "@shared/types";

type Unit = "minutes" | "seconds" | "days" | "meters" | "strikes";
type Group = "bookings" | "security" | "data" | "performance" | "other";
type TitleKey =
  | "respondWindow"
  | "cancelNotice"
  | "otpTtl"
  | "checkinOtpTtl"
  | "notificationRetention"
  | "searchCache"
  | "immediateRespond"
  | "immediateDistance"
  | "strikeThreshold"
  | "geofence"
  | "lateGrace"
  | "requirePayment";

/** Title keys, units and grouping for the known config keys (labels live in adminB.settings). */
const META: Record<string, { title: TitleKey; unit?: Unit; group: Group; kind?: "boolean" }> = {
  "booking.respondWindowMinutes": { title: "respondWindow", unit: "minutes", group: "bookings" },
  "booking.cancelNoticeMinutes": { title: "cancelNotice", unit: "minutes", group: "bookings" },
  "booking.immediateRespondWindowMinutes": { title: "immediateRespond", unit: "minutes", group: "bookings" },
  "booking.immediateMaxDistanceMeters": { title: "immediateDistance", unit: "meters", group: "bookings" },
  "otp.ttlSeconds": { title: "otpTtl", unit: "seconds", group: "security" },
  "otp.checkinTtlSeconds": { title: "checkinOtpTtl", unit: "seconds", group: "security" },
  "caregiver.strikeThreshold": { title: "strikeThreshold", unit: "strikes", group: "security" },
  "visit.geofenceRadiusMeters": { title: "geofence", unit: "meters", group: "security" },
  "visit.lateArrivalGraceMinutes": { title: "lateGrace", unit: "minutes", group: "security" },
  "visit.requirePaymentBeforeComplete": { title: "requirePayment", group: "security", kind: "boolean" },
  "retention.notificationDays": { title: "notificationRetention", unit: "days", group: "data" },
  "search.cacheTtlSeconds": { title: "searchCache", unit: "seconds", group: "performance" },
};

function humanDuration(value: number, unit: Unit | null, t: ReturnType<typeof useTranslations<"adminB.settings">>): string | null {
  if (unit === "minutes" && value >= 60) return t("hours", { n: +(value / 60).toFixed(1) });
  if (unit === "seconds" && value >= 60) return t("mins", { n: +(value / 60).toFixed(1) });
  return null;
}

function ConfigRow({ item }: { item: PlatformConfigItem }) {
  const t = useTranslations("adminB.settings");
  const tc = useTranslations("common.actions");
  const known = META[item.key];
  const meta = { title: known ? t(`titles.${known.title}`) : item.key, unit: known?.unit ? t(`units.${known.unit}`) : "" };
  const [value, setValue] = useState(String(item.value));
  const num = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(num) && num >= 0;
  const dirty = valid && num !== item.value;

  const save = useAction((v: number) => configApi.set(item.key, v), {
    invalidate: [keys.config],
    success: (_r, v) =>
      known?.kind === "boolean"
        ? t("savedToggle", { title: meta.title, state: v ? t("on") : t("off") })
        : t("saved", { title: meta.title, value: v, unit: meta.unit }).trim(),
  });

  const reset = useAction(() => configApi.reset(item.key), {
    invalidate: [keys.config],
    success: t("resetDone", { title: meta.title }),
  });

  const friendly = valid ? humanDuration(num, known?.unit ?? null, t) : null;

  if (known?.kind === "boolean") {
    const on = item.value === 1;
    return (
      <li className="flex items-center justify-between gap-3 px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-ink-900">{meta.title}</p>
            {item.overridden ? <Badge tone="brand">{t("custom")}</Badge> : <Badge>{t("default")}</Badge>}
          </div>
          <p dir="auto" className="mt-0.5 text-sm text-ink-500">{item.description}</p>
        </div>
        <Switch checked={on} onCheckedChange={(v) => save.mutate(v ? 1 : 0)} disabled={save.isPending} aria-label={meta.title} />
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-ink-900">{meta.title}</p>
          {item.overridden ? <Badge tone="brand">{t("custom")}</Badge> : <Badge>{t("default")}</Badge>}
        </div>
        <p dir="auto" className="mt-0.5 text-sm text-ink-500">{item.description}</p>
        <p className="mt-1 font-mono text-[11px] text-ink-400">
          <span dir="ltr">{item.key}</span> · {t("defaultValue", { value: item.envDefault })}
        </p>
      </div>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty) save.mutate(num);
        }}
      >
        <div className="relative w-40">
          <Input
            type="number"
            dir="ltr"
            min={0}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="tabular pe-16 font-semibold"
            aria-label={meta.title}
            aria-invalid={!valid}
          />
          <span className="pointer-events-none absolute top-1/2 end-3 -translate-y-1/2 text-xs text-ink-400">{meta.unit}</span>
        </div>
        <span className="tabular w-14 text-xs text-ink-500">{friendly && t("approx", { value: friendly })}</span>
        {item.overridden && item.value !== item.envDefault && (
          <Button
            variant="ghost"
            size="sm"
            title={t("reset", { value: item.envDefault })}
            loading={reset.isPending}
            onClick={() => {
              setValue(String(item.envDefault));
              reset.mutate(undefined);
            }}
          >
            <RotateCcw className="size-3.5" />
          </Button>
        )}
        <Button type="submit" size="sm" disabled={!dirty} loading={save.isPending}>
          {tc("save")}
        </Button>
      </form>
    </li>
  );
}

export default function SettingsPage() {
  const config = useQuery({ queryKey: keys.config, queryFn: configApi.list });
  const t = useTranslations("adminB.settings");

  const groups = new Map<Group, PlatformConfigItem[]>();
  for (const item of config.data ?? []) {
    const group = META[item.key]?.group ?? "other";
    groups.set(group, [...(groups.get(group) ?? []), item]);
  }

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
      />
      {config.isError ? (
        <Card>
          <ErrorState error={config.error} onRetry={() => config.refetch()} />
        </Card>
      ) : !config.data ? (
        <Card>
          <TableSkeleton rows={4} />
        </Card>
      ) : (
        <div className="space-y-6">
          {[...groups].map(([group, items]) => (
            <Card key={group}>
              <CardHeader title={t(`groups.${group}`)} className="pb-2" />
              <ul className="divide-y divide-ink-100">
                {items.map((item) => (
                  <ConfigRow key={`${item.key}-${item.value}`} item={item} />
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
