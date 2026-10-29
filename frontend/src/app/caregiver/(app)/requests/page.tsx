"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { CalendarDays, Check, Clock3, Inbox, MapPin, Repeat, X, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PageHeader } from "@shared/page-header";
import { useAction } from "@shared/api/use-action";
import { Badge } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import { Card } from "@shared/ui/card";
import { Field, Textarea } from "@shared/ui/field";
import { EmptyState, ErrorState, FilterTabs, TableSkeleton } from "@shared/ui/misc";
import { DataTable } from "@shared/ui/data-table";
import { Select } from "@shared/ui/select";
import type { ColumnDef } from "@tanstack/react-table";
import { Modal } from "@shared/ui/overlay";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import type { CaregiverBookingListItem } from "@shared/caregiver-types";
import { RespondCountdown } from "@shared/ui/respond-countdown";
import { bookingsApi, profileApi } from "@/features/caregiver/lib/api/caregiver";
import { keys } from "@/features/caregiver/lib/api/keys";
import { useNow } from "@shared/hooks/use-now";

const DECLINE_REASONS = ["notAvailable", "tooFar", "outsideSpecialty", "fullyBooked"] as const;

function DeclineDialog({ booking, onClose }: { booking: CaregiverBookingListItem; onClose: () => void }) {
  const t = useTranslations("caregiverA.requests.decline");
  const [reason, setReason] = useState("");
  const qc = useQueryClient();
  const decline = useAction(() => bookingsApi.decline(booking.id, reason.trim() || undefined), {
    invalidate: [keys.bookings, keys.visits],
    success: t("success"),
    onSuccess: onClose,
    // If the request is already gone (customer cancelled/another caregiver took it), drop the stale card.
    onError: () => {
      qc.invalidateQueries({ queryKey: keys.bookings });
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={t("title")}
      description={t("description", { name: booking.patient.name, count: booking.visits.length })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("keep")}
          </Button>
          <Button variant="danger" loading={decline.isPending} onClick={() => decline.mutate(undefined)}>
            {t("confirm")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {DECLINE_REASONS.map((k) => t(`reasons.${k}`)).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className={clsx(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                reason === r ? "border-brand-500 bg-brand-50 text-brand-800" : "border-ink-200 text-ink-600 hover:bg-ink-50",
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <Field label={t("reasonLabel")} hint={t("reasonHint", { count: reason.length })}>
          {(id) => <Textarea id={id} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />}
        </Field>
      </div>
    </Modal>
  );
}

function RequestCard({ booking, commissionPct, priorVisits }: { booking: CaregiverBookingListItem; commissionPct: number | null; priorVisits: number }) {
  const now = useNow(60_000);
  const t = useTranslations("caregiverA.requests.card");
  const f = useFmt();
  const L = useLabels();
  const [declining, setDeclining] = useState(false);
  const qc = useQueryClient();
  const accept = useAction(() => bookingsApi.accept(booking.id), {
    invalidate: [keys.bookings, keys.visits],
    success: t("accepted", { count: booking.visits.length }),
    // If the request is already gone (customer cancelled/another caregiver took it), drop the stale card.
    onError: () => {
      qc.invalidateQueries({ queryKey: keys.bookings });
    },
  });
  const perVisit = booking.rateSnapshot - booking.discountAmount;
  // Mirror the backend split exactly (caregiverAmount = amount − round(amount·pct/100)).
  const youEarn = commissionPct !== null ? perVisit - Math.round((perVisit * commissionPct) / 100) : null;
  const recurring = booking.type === "RECURRING" && booking.recurrenceRule;

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 bg-accent-50/50 px-5 py-3">
        <RespondCountdown respondBy={booking.respondBy} />
        <span className="text-xs text-ink-500">{t("requested", { time: f.relativeTime(booking.createdAt) })}</span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-lg font-extrabold text-ink-900">{booking.patient.name}</p>
            <p className="text-sm text-ink-500">
              {L.specialty(booking.serviceType)} · {booking.patient.relationship === "SELF" ? t("bookedByPatient") : t("bookedByFamily")}
            </p>
            {priorVisits > 0 ? (
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700 ring-1 ring-brand-200">
                <Repeat className="size-3.5" /> {t("returning", { count: priorVisits })}
              </span>
            ) : (
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-ink-50 px-2 py-0.5 text-xs font-bold text-ink-600 ring-1 ring-ink-200">
                {t("newCustomer")}
              </span>
            )}
            {booking.isImmediate && (
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-danger-50 px-2 py-0.5 text-xs font-bold text-danger-700 ring-1 ring-danger-200">
                <Zap className="size-3.5" /> {t("asap")}
              </span>
            )}
          </div>
          <div className="shrink-0 text-end">
            <p className="tabular text-lg font-extrabold text-ink-900">{f.money(perVisit)}</p>
            <p className="text-xs text-ink-500">{t("perVisit")}</p>
          </div>
        </div>

        <dl className="mt-4 grid gap-2.5 text-sm sm:grid-cols-2">
          <div className="flex items-start gap-2.5">
            <CalendarDays className="mt-0.5 size-4 shrink-0 text-ink-400" />
            <dd className="text-ink-700">
              {recurring ? (
                <>
                  <span className="font-semibold">{t("visitCount", { count: booking.visits.length })}</span> · {f.weekdays(booking.recurrenceRule!.weekdays)}
                  <br />
                  <span className="text-ink-500">
                    {f.relativeDay(booking.startDate, now)} → {f.relativeDay(booking.endDate, now)}
                  </span>
                </>
              ) : (
                <span className="font-semibold">{f.relativeDay(booking.startDate, now)}</span>
              )}
            </dd>
          </div>
          <div className="flex items-start gap-2.5">
            <Clock3 className="mt-0.5 size-4 shrink-0 text-ink-400" />
            <dd className="tabular font-semibold text-ink-700">{f.timeWindow(booking.timeWindowStart, booking.timeWindowEnd)}</dd>
          </div>
          <div className="flex items-start gap-2.5 sm:col-span-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-ink-400" />
            <dd dir="auto" className="text-ink-700">
              {booking.address.addressLine}, {booking.address.city}
            </dd>
          </div>
        </dl>

        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          {recurring && (
            <Badge tone="brand">
              <Repeat className="size-3" /> {t("recurringCare")}
            </Badge>
          )}
          {booking.discountAmount > 0 && <Badge tone="accent">{t("promo", { amount: f.money(booking.discountAmount) })}</Badge>}
          {youEarn !== null && (
            <Badge tone="success">
              {t("youEarn", { amount: f.money(youEarn), pct: commissionPct ?? 0 })}
            </Badge>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-ink-100 bg-ink-25 px-5 py-3">
        <Button variant="secondary" size="lg" onClick={() => setDeclining(true)} disabled={accept.isPending}>
          <X className="size-4" /> {t("decline")}
        </Button>
        <Button size="lg" loading={accept.isPending} onClick={() => accept.mutate(undefined)}>
          {!accept.isPending && <Check className="size-4" />} {t("accept")}
        </Button>
      </div>
      {declining && <DeclineDialog booking={booking} onClose={() => setDeclining(false)} />}
    </Card>
  );
}

const HISTORY_STATUSES = ["CONFIRMED", "COMPLETED", "DECLINED", "CANCELLED"] as const;

export default function RequestsPage() {
  const t = useTranslations("caregiverA.requests");
  const th = useTranslations("caregiverA.requests.history");
  const f = useFmt();
  const L = useLabels();
  const now = useNow(60_000);
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const pending = useQuery({
    queryKey: [...keys.bookings, "list", "REQUESTED"],
    queryFn: () => bookingsApi.list({ status: "REQUESTED", limit: 50 }),
    refetchInterval: 30_000,
  });
  // Fetched for both tabs: the history table and the per-customer prior-visit count on request cards.
  const all = useQuery({ queryKey: [...keys.bookings, "list", "all"], queryFn: () => bookingsApi.list({ limit: 50 }) });
  const profile = useQuery({ queryKey: keys.profile, queryFn: profileApi.get });
  const pct = profile.data ? Number(profile.data.commissionRate.percentage) : null;

  const items = [...(pending.data?.items ?? [])].sort((a, b) => a.respondBy.localeCompare(b.respondBy));
  const history = (all.data?.items ?? []).filter((b) => b.status !== "REQUESTED");

  // Completed visits this caregiver has already done per customer — drives the "returning / new" badge.
  const priorByCustomer = (all.data?.items ?? []).reduce<Record<string, number>>((m, b) => {
    const done = b.visits.filter((v) => v.status === "COMPLETED").length;
    if (done) m[b.customerId] = (m[b.customerId] ?? 0) + done;
    return m;
  }, {});

  const historyColumns: ColumnDef<CaregiverBookingListItem, unknown>[] = [
    {
      id: "patient",
      header: th("columns.patient"),
      accessorFn: (b) => b.patient.name,
      cell: ({ getValue }) => <span className="font-semibold text-ink-900">{getValue() as string}</span>,
    },
    {
      id: "schedule",
      header: th("columns.schedule"),
      meta: { className: "hidden sm:table-cell" },
      accessorFn: (b) => b.startDate,
      cell: ({ row }) => <span className="text-ink-700">{th("line", { count: row.original.visits.length, day: f.relativeDay(row.original.startDate, now) })}</span>,
    },
    {
      id: "status",
      header: th("columns.status"),
      accessorKey: "status",
      filterFn: "equalsString",
      cell: ({ row }) => (
        <Badge tone={row.original.status === "CONFIRMED" ? "success" : row.original.status === "DECLINED" ? "neutral" : "danger"} dot>
          {L.bookingCaregiver(row.original.status)}
        </Badge>
      ),
    },
  ];

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="mb-4">
        <FilterTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "pending", label: t("tabs.waiting"), count: pending.data?.total },
            { value: "history", label: t("tabs.responded") },
          ]}
        />
      </div>

      {tab === "pending" ? (
        pending.isError ? (
          <Card>
            <ErrorState error={pending.error} onRetry={() => pending.refetch()} />
          </Card>
        ) : !pending.data ? (
          <Card>
            <TableSkeleton rows={3} />
          </Card>
        ) : items.length === 0 ? (
          <Card>
            <EmptyState icon={Inbox} title={t("caughtUp")} description={t("caughtUpHint")} />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {items.map((b) => (
              <RequestCard key={b.id} booking={b} commissionPct={pct} priorVisits={priorByCustomer[b.customerId] ?? 0} />
            ))}
          </div>
        )
      ) : all.data && history.length === 0 ? (
        <Card>
          <EmptyState icon={Inbox} title={t("noResponses")} />
        </Card>
      ) : (
        <DataTable
          columns={historyColumns}
          data={history}
          loading={!all.data}
          searchPlaceholder={th("searchPlaceholder")}
          emptyText={th("noResults")}
          toolbar={(table) => {
            const col = table.getColumn("status");
            const val = (col?.getFilterValue() as string) ?? "ALL";
            return (
              <Select<string>
                className="w-44"
                value={val}
                isSearchable={false}
                onChange={(v) => col?.setFilterValue(!v || v === "ALL" ? undefined : v)}
                options={[{ value: "ALL", label: th("allStatuses") }, ...HISTORY_STATUSES.map((s) => ({ value: s, label: L.bookingCaregiver(s) }))]}
              />
            );
          }}
        />
      )}
    </>
  );
}
