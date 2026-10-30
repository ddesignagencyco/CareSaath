"use client";

import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { CalendarOff, Copy, Plus, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PageHeader } from "@shared/page-header";
import { useAction } from "@shared/api/use-action";
import { Button, IconButton } from "@shared/ui/button";
import { Card, CardHeader } from "@shared/ui/card";
import { Field, Input } from "@shared/ui/field";
import { DatePicker } from "@shared/ui/date-picker";
import { TimePicker } from "@shared/ui/time-picker";
import { ErrorState, Skeleton } from "@shared/ui/misc";
import type { Availability, AvailabilityRuleInput } from "@shared/caregiver-types";
import { useNow } from "@shared/hooks/use-now";
import { availabilityApi } from "@/features/caregiver/lib/api/caregiver";
import { keys } from "@/features/caregiver/lib/api/keys";
import { useFmt } from "@shared/i18n/use-fmt";
import { localDayKey } from "@shared/lib/visit";

/** Display Monday-first; the API uses 0 = Sunday … 6 = Saturday. */
const DAYS = [{ dow: 1 }, { dow: 2 }, { dow: 3 }, { dow: 4 }, { dow: 5 }, { dow: 6 }, { dow: 0 }];

type Win = { start: string; end: string };
type Week = Record<number, Win[]>;

function toWeek(a: Availability): Week {
  const week: Week = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const r of a.rules) week[r.dayOfWeek].push({ start: r.startTime, end: r.endTime });
  return week;
}

/**
 * The API doesn't validate rule items (bad ones cause a 500), so check here:
 * start < end, no overlaps, no duplicate start times on a day.
 */
type DayError = "bothTimes" | "endAfterStart" | "overlap";

function dayError(wins: Win[]): DayError | null {
  const sorted = [...wins].sort((a, b) => a.start.localeCompare(b.start));
  for (const w of sorted) {
    if (!/^\d{2}:\d{2}$/.test(w.start) || !/^\d{2}:\d{2}$/.test(w.end)) return "bothTimes";
    if (w.start >= w.end) return "endAfterStart";
  }
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < sorted[i - 1].end) return "overlap";
  }
  return null;
}

function WeeklyEditor({ initial }: { initial: Availability }) {
  const t = useTranslations("caregiverB.availability.weekly");
  const f = useFmt();
  const [week, setWeek] = useState<Week>(() => toWeek(initial));
  const [dirty, setDirty] = useState(false);

  const update = (dow: number, wins: Win[]) => {
    setWeek((w) => ({ ...w, [dow]: wins }));
    setDirty(true);
  };
  const errors = Object.fromEntries(DAYS.map((d) => [d.dow, dayError(week[d.dow])]));
  const valid = Object.values(errors).every((e) => !e);

  const save = useAction(
    () => {
      const rules: AvailabilityRuleInput[] = DAYS.flatMap((d) =>
        week[d.dow].map((w) => ({ dayOfWeek: d.dow, startTime: w.start, endTime: w.end })),
      );
      return availabilityApi.put(rules);
    },
    { invalidate: [keys.availability], success: t("saved"), onSuccess: () => setDirty(false) },
  );

  const copyMonday = () => {
    setWeek((w) => ({ ...w, 2: [...w[1]], 3: [...w[1]], 4: [...w[1]], 5: [...w[1]] }));
    setDirty(true);
  };

  return (
    <Card>
      <CardHeader
        title={t("title")}
        description={t("description")}
        action={
          <Button size="sm" variant="ghost" onClick={copyMonday} disabled={week[1].length === 0}>
            <Copy className="size-4" /> {t("copyMonday")}
          </Button>
        }
      />
      <ul className="mt-3 divide-y divide-ink-100 border-t border-ink-100">
        {DAYS.map(({ dow }) => {
          const name = f.dayOfWeekLong(dow);
          const wins = week[dow];
          const on = wins.length > 0;
          return (
            <li key={dow} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start">
              <label className="flex w-40 shrink-0 cursor-pointer items-center gap-3 pt-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={t("dayAvailable", { day: name })}
                  onClick={() => update(dow, on ? [] : [{ start: "09:00", end: "17:00" }])}
                  className={clsx("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-brand-600" : "bg-ink-200")}
                >
                  <span className={clsx("absolute top-0.5 start-0.5 size-5 rounded-full bg-white shadow transition-transform", on && "translate-x-5 rtl:-translate-x-5")} />
                </button>
                <span className={clsx("font-semibold", on ? "text-ink-900" : "text-ink-400")}>{name}</span>
              </label>
              <div className="flex-1 space-y-2">
                {!on ? (
                  <p className="pt-2 text-sm text-ink-400">{t("unavailable")}</p>
                ) : (
                  wins.map((w, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <TimePicker
                        aria-label={t("windowStart", { day: name, n: i + 1 })}
                        value={w.start}
                        className="w-32"
                        onChange={(v) => update(dow, wins.map((x, j) => (j === i ? { ...x, start: v } : x)))}
                      />
                      <span className="text-ink-400">–</span>
                      <TimePicker
                        aria-label={t("windowEnd", { day: name, n: i + 1 })}
                        value={w.end}
                        className="w-32"
                        min={w.start || undefined}
                        onChange={(v) => update(dow, wins.map((x, j) => (j === i ? { ...x, end: v } : x)))}
                      />
                      <IconButton label={t("removeWindow")} onClick={() => update(dow, wins.filter((_, j) => j !== i))}>
                        <X className="size-4" />
                      </IconButton>
                    </div>
                  ))
                )}
                {errors[dow] && <p className="text-xs font-medium text-danger-600">{t(`errors.${errors[dow]}`)}</p>}
              </div>
              {on && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="self-start"
                  onClick={() => {
                    const last = wins[wins.length - 1];
                    update(dow, [...wins, { start: last?.end ?? "09:00", end: last ? "20:00" : "17:00" }]);
                  }}
                >
                  <Plus className="size-4" /> {t("addWindow")}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="sticky bottom-20 flex items-center justify-between gap-3 rounded-b-2xl border-t border-ink-100 bg-white/95 px-5 py-3 backdrop-blur lg:bottom-0">
        <p className="text-xs text-ink-500">{dirty ? t("unsaved") : t("allSaved")}</p>
        <Button disabled={!dirty || !valid} loading={save.isPending} onClick={() => save.mutate(undefined)}>
          {t("save")}
        </Button>
      </div>
    </Card>
  );
}

function BlockedDates({ blocks }: { blocks: Availability["blocks"] }) {
  const t = useTranslations("caregiverB.availability.timeOff");
  const f = useFmt();
  const now = useNow(60_000);
  const today = now ? localDayKey(now) : "";
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const error = start && end && end < start ? t("endBeforeStart") : null;

  const add = useAction(() => availabilityApi.addBlock({ startDate: start, endDate: end || start, reason: reason.trim() || undefined }), {
    invalidate: [keys.availability],
    success: t("blocked"),
    onSuccess: () => {
      setStart("");
      setEnd("");
      setReason("");
    },
  });
  const remove = useAction((id: string) => availabilityApi.deleteBlock(id), { invalidate: [keys.availability], success: t("removed") });

  return (
    <Card>
      <CardHeader title={t("title")} description={t("description")} />
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("from")}>
            {(id) => <DatePicker id={id} min={today} value={start} onChange={setStart} />}
          </Field>
          <Field label={t("to")} error={error}>
            {(id) => <DatePicker id={id} min={start || today} value={end} onChange={setEnd} />}
          </Field>
          <Field label={t("reason")} hint={t("reasonHint")} className="sm:col-span-2">
            {(id) => <Input id={id} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPlaceholder")} />}
          </Field>
        </div>
        <Button variant="secondary" disabled={!start || !!error} loading={add.isPending} onClick={() => add.mutate(undefined)}>
          <CalendarOff className="size-4" /> {t("block")}
        </Button>

        {blocks.length > 0 && (
          <ul className="space-y-2 border-t border-ink-100 pt-4">
            {blocks.map((b) => (
              <li key={b.id} className="flex items-center gap-3 rounded-xl bg-ink-25 p-3">
                <CalendarOff className="size-4 shrink-0 text-ink-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-900">
                    {f.longDay(b.startDate)}
                    {b.endDate !== b.startDate && ` → ${f.longDay(b.endDate)}`}
                  </p>
                  {b.reason && <p dir="auto" className="truncate text-xs text-ink-500">{b.reason}</p>}
                </div>
                <IconButton label={t("removeBlock")} onClick={() => remove.mutate(b.id)} className="hover:text-danger-600">
                  <Trash2 className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

export default function AvailabilityPage() {
  const t = useTranslations("caregiverB.availability");
  const f = useFmt();
  const availability = useQuery({ queryKey: keys.availability, queryFn: availabilityApi.get });
  const a = availability.data;
  const summary = a
    ? DAYS.filter((d) => a.rules.some((r) => r.dayOfWeek === d.dow))
        .map((d) => f.dayOfWeek(d.dow))
        .join(f.locale === "ur" ? "، " : ", ")
    : "";

  return (
    <>
      <PageHeader
        title={t("title")}
        description={
          a && a.rules.length > 0
            ? t("summary", { days: summary, time: f.time([...a.rules].sort((x, y) => x.startTime.localeCompare(y.startTime))[0].startTime) })
            : t("emptySummary")
        }
      />
      {availability.isError ? (
        <Card>
          <ErrorState error={availability.error} onRetry={() => availability.refetch()} />
        </Card>
      ) : !a ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.5fr_1fr]">
          <WeeklyEditor key={a.rules.map((r) => r.id).join()} initial={a} />
          <BlockedDates blocks={a.blocks} />
        </div>
      )}
    </>
  );
}
