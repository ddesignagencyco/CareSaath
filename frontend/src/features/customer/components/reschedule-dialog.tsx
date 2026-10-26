"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useAction } from "@shared/api/use-action";
import { useNow } from "@shared/hooks/use-now";
import { useFmt } from "@shared/i18n/use-fmt";
import { localDayKey } from "@shared/lib/visit";
import { Button } from "@shared/ui/button";
import { Field, Input } from "@shared/ui/field";
import { Modal } from "@shared/ui/overlay";
import type { Visit } from "@shared/caregiver-types";
import { bookingsApi } from "@/features/customer/lib/api/customer";
import { keys } from "@/features/customer/lib/api/keys";

/** Move one not-yet-started visit (the API cancels it and creates a replacement). */
export function RescheduleDialog({ bookingId, visit, onClose, onDone }: { bookingId: string; visit: Visit; onClose: () => void; onDone?: (v: Visit) => void }) {
  const t = useTranslations("customerB.reschedule");
  const f = useFmt();
  const now = useNow(60_000);
  const today = now ? localDayKey(now) : "";
  const nowHHmm = now ? ((d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`)(new Date(now)) : "";
  const [date, setDate] = useState(visit.scheduledDate.slice(0, 10));
  const [from, setFrom] = useState(visit.timeWindowStart);
  const [to, setTo] = useState(visit.timeWindowEnd);
  const error = !date
    ? t("errNoDate")
    : date < today
      ? t("errPast")
      : date === today && !!nowHHmm && from <= nowHHmm
        ? t("errPastTime")
        : from >= to
          ? t("errEndBeforeStart")
          : null;
  const unchanged = date === visit.scheduledDate.slice(0, 10) && from === visit.timeWindowStart && to === visit.timeWindowEnd;

  const save = useAction(() => bookingsApi.reschedule(bookingId, { visitId: visit.id, newDate: date, timeWindowStart: from, timeWindowEnd: to }), {
    invalidate: [keys.bookings, keys.visit],
    success: t("success"),
    onSuccess: (v) => {
      onDone?.(v);
      onClose();
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={t("title")}
      description={t("currently", { day: f.longDay(visit.scheduledDate), time: f.timeWindow(visit.timeWindowStart, visit.timeWindowEnd) })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("keep")}
          </Button>
          <Button disabled={!!error || unchanged} loading={save.isPending} onClick={() => save.mutate(undefined)}>
            {t("submit")}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label={t("newDate")} className="sm:col-span-3">
          {(id) => <Input id={id} type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        <Field label={t("arriveBetween")}>
          {(id) => <Input id={id} type="time" value={from} onChange={(e) => setFrom(e.target.value)} className="tabular" />}
        </Field>
        <Field label={t("and")}>
          {(id) => <Input id={id} type="time" value={to} onChange={(e) => setTo(e.target.value)} className="tabular" />}
        </Field>
        {error && <p className="text-sm font-medium text-danger-600 sm:col-span-3">{error}</p>}
      </div>
    </Modal>
  );
}
