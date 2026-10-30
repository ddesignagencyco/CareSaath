"use client";

import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Phone, Siren, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PageHeader } from "@shared/page-header";
import { IncidentStatusBadge, PriorityBadge } from "@shared/status";
import { Badge } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import { Card } from "@shared/ui/card";
import { Field, Textarea } from "@shared/ui/field";
import { Select } from "@shared/ui/select";
import { DetailList, EmptyState, ErrorState, FilterTabs, Pagination, TableSkeleton } from "@shared/ui/misc";
import { Drawer } from "@shared/ui/overlay";
import { safetyApi } from "@/features/admin/lib/api/admin";
import { keys, useAction } from "@/features/admin/lib/api/hooks";
import { humanize } from "@shared/lib/format";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels, type Labels } from "@shared/i18n/use-labels";
import type { IncidentPriority, IncidentStatus, SafetyIncident } from "@shared/types";

const PRIORITIES: IncidentPriority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const STATUSES: IncidentStatus[] = ["OPEN", "IN_REVIEW", "RESOLVED"];
const PRIORITY_RANK: Record<IncidentPriority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const LIMIT = 20;

type SafetyT = ReturnType<typeof useTranslations<"adminB.safety">>;

/** Localized enum value for an audit-trail field; unknown values fall back to humanize. */
function eventValue(field: string, value: string, L: Labels): string {
  if (field === "status" && (STATUSES as string[]).includes(value)) return L.incidentStatus(value as IncidentStatus);
  if (field === "priority" && (PRIORITIES as string[]).includes(value)) return L.priority(value as IncidentPriority);
  return humanize(value);
}

/** "status:OPEN->IN_REVIEW,priority:MEDIUM->HIGH" -> readable sentences. */
function describeEvent(action: string, t: SafetyT, L: Labels): string {
  if (action === "note") return t("addedNote");
  return action
    .split(",")
    .map((change) => {
      const [field, transition] = change.split(":");
      const [from, to] = (transition ?? "").split("->");
      const label = field === "status" ? t("status") : field === "priority" ? t("priority") : humanize(field);
      return t("eventChange", { field: label, from: eventValue(field, from ?? "", L), to: eventValue(field, to ?? "", L) });
    })
    .join(" · ");
}

function IncidentDrawer({
  incident,
  onClose,
  onChange,
}: {
  incident: SafetyIncident;
  onClose: () => void;
  onChange: (next: SafetyIncident) => void;
}) {
  const [status, setStatus] = useState<IncidentStatus>(incident.status);
  const [priority, setPriority] = useState<IncidentPriority>(incident.priority);
  const [note, setNote] = useState("");
  const t = useTranslations("adminB.safety");
  const tl = useTranslations("labels");
  const L = useLabels();
  const f = useFmt();

  const update = useAction(
    () =>
      safetyApi.update(incident.id, {
        status: status !== incident.status ? status : undefined,
        priority: priority !== incident.priority ? priority : undefined,
        note: note.trim() || undefined,
      }),
    {
      invalidate: [keys.incidents],
      success: t("updated"),
      onSuccess: (result) => {
        // PATCH returns the bare incident row (no reportedBy/assignedAdmin/
        // events): keep ours and add the audit event locally until the list
        // refetch brings the real one.
        const changes = [
          result.status !== incident.status && `status:${incident.status}->${result.status}`,
          result.priority !== incident.priority && `priority:${incident.priority}->${result.priority}`,
        ].filter(Boolean);
        onChange({
          ...incident,
          ...result,
          assignedAdmin:
            incident.assignedAdmin ?? (result.assignedAdminId ? { id: result.assignedAdminId, fullName: t("you") } : null),
          events: [
            ...incident.events,
            {
              id: `local-${result.updatedAt}`,
              incidentId: incident.id,
              actorId: result.assignedAdminId ?? "",
              action: changes.length > 0 ? changes.join(",") : "note",
              note: note.trim() || null,
              at: result.updatedAt,
            },
          ],
        });
        setNote("");
      },
    },
  );

  const dirty = status !== incident.status || priority !== incident.priority || note.trim().length > 0;

  return (
    <Drawer
      open
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          {incident.source === "SOS" && <Siren className="size-5 text-danger-600" />}
          {L.incidentSource(incident.source)}
        </span>
      }
      subtitle={t("reportedSubtitle", { when: f.dateTime(incident.createdAt), id: incident.id })}
      footer={
        <Button onClick={() => update.mutate(undefined)} disabled={!dirty} loading={update.isPending}>
          {t("saveUpdate")}
        </Button>
      }
    >
      <div className="space-y-7">
        <div className="flex flex-wrap gap-2">
          <PriorityBadge priority={incident.priority} />
          <IncidentStatusBadge status={incident.status} />
        </div>

        <p dir="auto" className="rounded-xl border border-ink-100 bg-ink-25 p-4 text-sm leading-relaxed text-ink-800">{incident.description}</p>

        <DetailList
          items={[
            {
              label: t("reportedBy"),
              value: (
                <span>
                  {incident.reportedBy.fullName} <span className="text-ink-500">({tl(`role.${incident.reportedBy.role}`)})</span>
                </span>
              ),
            },
            {
              label: t("contact"),
              value: (
                <a href={`tel:${incident.reportedBy.phone}`} className="tabular inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:underline">
                  <Phone className="size-3.5" /> <span dir="ltr">{f.phone(incident.reportedBy.phone)}</span>
                </a>
              ),
            },
            { label: t("visit"), value: incident.visitId ? <span dir="ltr">{incident.visitId}</span> : t("noVisit") },
            { label: t("assignedTo"), value: incident.assignedAdmin?.fullName ?? t("unassigned") },
          ]}
        />

        {incident.status !== "RESOLVED" && (
          <section className="space-y-4 rounded-xl border border-ink-100 p-4">
            <h3 className="text-sm font-bold text-ink-900">{t("triage")}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("status")}>
                {(id) => (
                  <Select
                    inputId={id}
                    value={status}
                    onChange={(v) => v && setStatus(v)}
                    options={STATUSES.map((s) => ({ value: s, label: L.incidentStatus(s) }))}
                  />
                )}
              </Field>
              <Field label={t("priority")}>
                {(id) => (
                  <Select
                    inputId={id}
                    value={priority}
                    onChange={(v) => v && setPriority(v)}
                    options={PRIORITIES.map((p) => ({ value: p, label: L.priority(p) }))}
                  />
                )}
              </Field>
            </div>
            <Field label={t("escalationNote")} hint={t("escalationHint")}>
              {(id) => (
                <Textarea id={id} dir="auto" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder={t("escalationPlaceholder")} />
              )}
            </Field>
          </section>
        )}

        <section>
          <h3 className="mb-3 text-sm font-bold text-ink-900">{t("auditTrail")}</h3>
          <ol className="relative space-y-4 border-s-2 border-ink-100 ps-5">
            <li className="relative">
              <span className="absolute top-1 -start-[27px] size-3 rounded-full border-2 border-white bg-ink-300" />
              <p className="text-sm font-semibold text-ink-800">{t("incidentReported")}</p>
              <p className="text-xs text-ink-500">{f.dateTime(incident.createdAt)}</p>
            </li>
            {incident.events.map((ev) => (
              <li key={ev.id} className="relative">
                <span className="absolute top-1 -start-[27px] size-3 rounded-full border-2 border-white bg-brand-500" />
                <p className="text-sm font-semibold text-ink-800">{describeEvent(ev.action, t, L)}</p>
                {ev.note && <p dir="auto" className="mt-1 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-700">{ev.note}</p>}
                <p className="mt-1 text-xs text-ink-500">{f.dateTime(ev.at)}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </Drawer>
  );
}

export default function SafetyPage() {
  const [status, setStatus] = useState<IncidentStatus | "ALL">("ALL");
  const [priority, setPriority] = useState<IncidentPriority | "">("");
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<SafetyIncident | null>(null);
  const t = useTranslations("adminB.safety");
  const tl = useTranslations("labels");
  const L = useLabels();
  const f = useFmt();

  const list = useQuery({
    queryKey: [...keys.incidents, "list", status, priority, page],
    queryFn: () =>
      safetyApi.list({
        status: status === "ALL" ? undefined : status,
        priority: priority || undefined,
        page,
        limit: LIMIT,
      }),
    refetchInterval: 30_000,
  });

  // API orders oldest-first; surface the most severe within the page.
  const items = [...(list.data?.items ?? [])].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  // Prefer the fresh row from the list (real audit events) once it has caught up.
  const fresh = picked ? items.find((i) => i.id === picked.id) : undefined;
  const selected = fresh && fresh.updatedAt >= picked!.updatedAt ? fresh : picked;
  const setSelected = setPicked;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <FilterTabs
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { value: "ALL", label: t("all") },
            { value: "OPEN", label: L.incidentStatus("OPEN") },
            { value: "IN_REVIEW", label: L.incidentStatus("IN_REVIEW") },
            { value: "RESOLVED", label: L.incidentStatus("RESOLVED") },
          ]}
        />
        <div className="w-48">
          <Select
            aria-label={t("filterPriority")}
            placeholder={t("allPriorities")}
            isClearable
            value={priority || null}
            onChange={(v) => {
              setPriority(v && v !== "ALL" ? v : "");
              setPage(1);
            }}
            options={[{ value: "ALL", label: t("allPriorities") }, ...PRIORITIES.map((p) => ({ value: p, label: L.priority(p) }))]}
          />
        </div>
      </div>

      <Card>
        {list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : !list.data ? (
          <TableSkeleton />
        ) : items.length === 0 ? (
          <EmptyState icon={ShieldCheck} title={t("emptyTitle")} description={t("emptyDescription")} />
        ) : (
          <>
            <ul className="divide-y divide-ink-100">
              {items.map((inc) => (
                <li key={inc.id}>
                  <button
                    onClick={() => setSelected(inc)}
                    className={clsx(
                      "flex w-full items-start gap-4 px-5 py-4 text-start transition-colors hover:bg-brand-50/40",
                      inc.priority === "CRITICAL" && inc.status !== "RESOLVED" && "border-s-4 border-danger-600 bg-danger-50/50 ps-4",
                    )}
                  >
                    <span
                      className={clsx(
                        "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl",
                        inc.source === "SOS" ? "bg-danger-600 text-white" : "bg-ink-100 text-ink-600",
                      )}
                    >
                      {inc.source === "SOS" ? <Siren className="size-5" /> : <ShieldCheck className="size-5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink-900">{L.incidentSource(inc.source)}</span>
                        <PriorityBadge priority={inc.priority} />
                        <IncidentStatusBadge status={inc.status} />
                      </span>
                      <span dir="auto" className="mt-1 line-clamp-2 block text-sm text-ink-600">{inc.description}</span>
                      <span className="mt-1.5 block text-xs text-ink-500">
                        {inc.reportedBy.fullName} · {tl(`role.${inc.reportedBy.role}`)} · {f.relativeTime(inc.createdAt)}
                        {inc.assignedAdmin && <> · {t("assignedToName", { name: inc.assignedAdmin.fullName })}</>}
                      </span>
                    </span>
                    {inc.events.length > 0 && (
                      <span className="hidden sm:block">
                      <Badge tone="neutral">
                        {t("updates", { count: inc.events.length })}
                      </Badge>
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <Pagination page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={setPage} />
          </>
        )}
      </Card>

      {selected && (
        <IncidentDrawer key={selected.id + selected.updatedAt} incident={selected} onClose={() => setSelected(null)} onChange={setSelected} />
      )}
    </>
  );
}
