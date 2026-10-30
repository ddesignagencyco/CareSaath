"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Scale } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PageHeader } from "@shared/page-header";
import { ReasonDialog } from "@shared/reason-dialog";
import { DisputeStatusBadge, PriorityBadge, VisitStatusBadge } from "@shared/status";
import { Button } from "@shared/ui/button";
import { Card } from "@shared/ui/card";
import { Field, Input } from "@shared/ui/field";
import { Avatar, EmptyState, ErrorState, FilterTabs, Pagination, TableSkeleton } from "@shared/ui/misc";
import { Select } from "@shared/ui/select";
import { disputesApi } from "@/features/admin/lib/api/admin";
import { keys, useAction } from "@/features/admin/lib/api/hooks";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import type { Dispute, DisputeStatus, IncidentPriority } from "@shared/types";

const LIMIT = 10;
const PRIORITIES: IncidentPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function Party({ label, user }: { label: string; user: Dispute["raisedBy"] }) {
  const tl = useTranslations("labels");
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar name={user.fullName} size="sm" />
      <div className="min-w-0">
        <p className="text-[11px] font-bold tracking-wide text-ink-400 uppercase">{label}</p>
        <p className="truncate text-sm font-semibold text-ink-900">
          {user.fullName} <span className="font-normal text-ink-500">· {tl(`role.${user.role}`)}</span>
        </p>
      </div>
    </div>
  );
}

export default function DisputesPage() {
  const [status, setStatus] = useState<DisputeStatus | "ALL">("ALL");
  const [priorityFilter, setPriorityFilter] = useState<IncidentPriority | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [resolving, setResolving] = useState<Dispute | null>(null);
  const [comp, setComp] = useState("");
  const t = useTranslations("adminB.disputes");
  const L = useLabels();
  const f = useFmt();

  const list = useQuery({
    queryKey: [...keys.disputes, "list", status, priorityFilter, page],
    queryFn: () =>
      disputesApi.list({ ...(status === "ALL" ? {} : { status }), ...(priorityFilter === "ALL" ? {} : { priority: priorityFilter }), page, limit: LIMIT }),
  });

  const resolve = useAction(({ id, note, compensation }: { id: string; note: string; compensation?: number }) => disputesApi.resolve(id, note, compensation), {
    invalidate: [keys.disputes],
    success: t("resolved"),
    onSuccess: () => {
      setResolving(null);
      setComp("");
    },
  });
  const changePriority = useAction(({ id, priority }: { id: string; priority: IncidentPriority }) => disputesApi.setPriority(id, priority), {
    invalidate: [keys.disputes],
    success: t("priorityUpdated"),
  });
  const assign = useAction((id: string) => disputesApi.assign(id), {
    invalidate: [keys.disputes],
    success: t("assigned"),
  });

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <FilterTabs
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { value: "ALL", label: t("all") },
            { value: "OPEN", label: L.dispute("OPEN") },
            { value: "RESOLVED", label: L.dispute("RESOLVED") },
          ]}
        />
        <div className="w-44">
          <Select<IncidentPriority | "ALL">
            isSearchable={false}
            value={priorityFilter}
            onChange={(v) => {
              if (v) {
                setPriorityFilter(v);
                setPage(1);
              }
            }}
            options={[{ value: "ALL", label: t("allPriorities") }, ...PRIORITIES.map((p) => ({ value: p, label: L.priority(p) }))]}
          />
        </div>
      </div>

      {list.isError ? (
        <Card>
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        </Card>
      ) : !list.data ? (
        <Card>
          <TableSkeleton />
        </Card>
      ) : list.data.items.length === 0 ? (
        <Card>
          <EmptyState icon={Scale} title={status === "ALL" ? t("empty") : status === "OPEN" ? t("emptyOpen") : t("emptyResolved")} />
        </Card>
      ) : (
        <div className="space-y-4">
          {list.data.items.map((d) => (
            <Card key={d.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <DisputeStatusBadge status={d.status} />
                  {d.priority && <PriorityBadge priority={d.priority} />}
                  <VisitStatusBadge status={d.visit.status} />
                  <span className="text-xs text-ink-500">
                    {t.rich("visitRef", {
                      visit: d.visit.id,
                      booking: d.visit.bookingId,
                      id: (c) => <span dir="ltr">{c}</span>,
                    })}
                  </span>
                </div>
                <span className="text-xs text-ink-500">{t("raised", { when: f.relativeTime(d.createdAt) })}</span>
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Party label={t("raisedBy")} user={d.raisedBy} />
                <ArrowRight className="rtl:-scale-x-100 hidden size-4 shrink-0 text-ink-300 sm:block" />
                <Party label={t("against")} user={d.againstUser} />
              </div>

              <p dir="auto" className="mt-4 rounded-xl bg-ink-25 p-4 text-sm leading-relaxed text-ink-800">{d.description}</p>

              {d.status === "RESOLVED" ? (
                <div className="mt-4 rounded-xl border border-success-600/20 bg-success-50 p-4">
                  <p className="text-xs font-bold tracking-wide text-success-700 uppercase">
                    {t("resolution", { when: f.dateTime(d.resolvedAt) })}
                  </p>
                  <p dir="auto" className="mt-1 text-sm text-ink-800">{d.resolutionNote}</p>
                  {d.compensationAmount != null && d.compensationAmount > 0 && (
                    <p className="mt-2 text-sm font-semibold text-success-800">{t("compensationPaid", { amount: f.money(d.compensationAmount) })}</p>
                  )}
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <div className="w-40">
                    <Select<IncidentPriority>
                      isSearchable={false}
                      value={d.priority ?? "MEDIUM"}
                      onChange={(v) => v && changePriority.mutate({ id: d.id, priority: v })}
                      options={PRIORITIES.map((p) => ({ value: p, label: L.priority(p) }))}
                    />
                  </div>
                  {d.assignedAdmin ? (
                    <span className="text-xs text-ink-500">{t("assignedTo", { name: d.assignedAdmin.fullName })}</span>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => assign.mutate(d.id)}>
                      {t("assignToMe")}
                    </Button>
                  )}
                  <Button className="ms-auto" onClick={() => setResolving(d)}>{t("resolveDispute")}</Button>
                </div>
              )}
            </Card>
          ))}
          <Pagination page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={setPage} />
        </div>
      )}

      {resolving && (
        <ReasonDialog
          open
          onClose={() => {
            setResolving(null);
            setComp("");
          }}
          title={t("resolveDispute")}
          description={t("versus", { a: resolving.raisedBy.fullName, b: resolving.againstUser.fullName })}
          label={t("decisionLabel")}
          placeholder={t("decisionPlaceholder")}
          required
          maxLength={2000}
          confirmLabel={t("resolveAndNotify")}
          loading={resolve.isPending}
          onConfirm={(note) => resolve.mutate({ id: resolving.id, note, compensation: comp ? Math.round(Number(comp) * 100) : undefined })}
        >
          <Field label={t("compensationLabel")} hint={t("compensationHint")}>
            {(id) => (
              <Input id={id} type="number" inputMode="numeric" min={0} value={comp} onChange={(e) => setComp(e.target.value)} placeholder="0" />
            )}
          </Field>
        </ReasonDialog>
      )}
    </>
  );
}
