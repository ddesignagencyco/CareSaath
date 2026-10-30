"use client";

import { useQuery } from "@tanstack/react-query";
import { BadgePercent, Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PageHeader } from "@shared/page-header";
import { Badge, type Tone } from "@shared/ui/badge";
import { Button, IconButton } from "@shared/ui/button";
import { Card } from "@shared/ui/card";
import { Field, Input } from "@shared/ui/field";
import { DatePicker } from "@shared/ui/date-picker";
import { Select } from "@shared/ui/select";
import { EmptyState, ErrorState } from "@shared/ui/misc";
import { Modal } from "@shared/ui/overlay";
import { DataTable } from "@shared/ui/data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { promosApi } from "@/features/admin/lib/api/admin";
import { keys, useAction } from "@/features/admin/lib/api/hooks";
import { formatMoney } from "@shared/lib/format";
import { useFmt } from "@shared/i18n/use-fmt";
import type { CreatePromoInput, PromoCode, PromoDiscountType } from "@shared/types";

type PromoStateKey = "paused" | "expired" | "usedUp" | "scheduled" | "live";

function promoState(p: PromoCode): { key: PromoStateKey; tone: Tone } {
  const now = Date.now();
  if (!p.active) return { key: "paused", tone: "neutral" };
  if (new Date(p.validTo).getTime() < now) return { key: "expired", tone: "neutral" };
  if (p.maxUses !== null && p.usesCount >= p.maxUses) return { key: "usedUp", tone: "warning" };
  if (new Date(p.validFrom).getTime() > now) return { key: "scheduled", tone: "info" };
  return { key: "live", tone: "success" };
}

const toDateInput = (iso: string) => iso.slice(0, 10);

interface FormState {
  code: string;
  discountType: PromoDiscountType;
  /** Percent (1–100) or rupees for FIXED; converted to paisa on submit. */
  amount: string;
  validFrom: string;
  validTo: string;
  maxUses: string;
  active: boolean;
}

function PromoForm({ promo, onClose }: { promo: PromoCode | null; onClose: () => void }) {
  const t = useTranslations("adminB.promos.form");
  const tc = useTranslations("common.actions");
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState<FormState>(() =>
    promo
      ? {
          code: promo.code,
          discountType: promo.discountType,
          amount: String(promo.discountType === "FIXED" ? promo.discountValue / 100 : promo.discountValue),
          validFrom: toDateInput(promo.validFrom),
          validTo: toDateInput(promo.validTo),
          maxUses: promo.maxUses?.toString() ?? "",
          active: promo.active,
        }
      : { code: "", discountType: "PERCENT", amount: "10", validFrom: today, validTo: "", maxUses: "", active: true },
  );
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

  const amount = Number(f.amount);
  const errors = {
    code: !promo && !/^[A-Z0-9]{3,24}$/.test(f.code) ? t("errCode") : null,
    amount:
      !Number.isFinite(amount) || amount < 1
        ? t("errMin")
        : f.discountType === "PERCENT" && amount > 100
          ? t("errMaxPercent")
          : null,
    validTo: !f.validTo ? t("errRequired") : f.validTo <= f.validFrom ? t("errAfterStart") : null,
    maxUses: f.maxUses
      ? !Number.isInteger(Number(f.maxUses)) || Number(f.maxUses) < 1
        ? t("errWholeNumber")
        : null
      : // PATCH can't clear a limit (an omitted maxUses is left unchanged).
        promo && promo.maxUses !== null
        ? t("errCantClearMaxUses")
        : null,
  };
  const valid = Object.values(errors).every((e) => !e);

  const payload = (): CreatePromoInput => ({
    code: f.code,
    discountType: f.discountType,
    discountValue: f.discountType === "FIXED" ? Math.round(amount * 100) : Math.round(amount),
    validFrom: new Date(`${f.validFrom}T00:00:00`).toISOString(),
    validTo: new Date(`${f.validTo}T23:59:59`).toISOString(),
    maxUses: f.maxUses ? Number(f.maxUses) : undefined,
    active: f.active,
  });

  const save = useAction(
    () => {
      const body = payload();
      if (!promo) return promosApi.create(body);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- code is immutable after creation
      const { code, ...update } = body;
      return promosApi.update(promo.id, update);
    },
    {
      invalidate: [keys.promos],
      success: promo ? t("updated", { code: promo.code }) : t("created", { code: f.code }),
      onSuccess: onClose,
    },
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={promo ? t("editTitle", { code: promo.code }) : t("newTitle")}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate(undefined)}>
            {promo ? tc("saveChanges") : t("createCode")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("code")} required error={f.code ? errors.code : null} hint={promo ? t("codeHintEdit") : t("codeHintNew")} className="sm:col-span-2">
          {(id) => (
            <Input
              id={id}
              dir="ltr"
              value={f.code}
              disabled={!!promo}
              maxLength={24}
              placeholder="WELCOME10"
              className="tabular font-bold tracking-wider uppercase"
              onChange={(e) => set("code", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            />
          )}
        </Field>
        <Field label={t("discountType")} required>
          {(id) => (
            <Select<PromoDiscountType>
              inputId={id}
              value={f.discountType}
              onChange={(v) => v && set("discountType", v)}
              options={[
                { value: "PERCENT", label: t("percentage"), description: t("percentageHint") },
                { value: "FIXED", label: t("fixed"), description: t("fixedHint") },
              ]}
            />
          )}
        </Field>
        <Field label={f.discountType === "PERCENT" ? t("percentOff") : t("rupeesOff")} required error={errors.amount}>
          {(id) => <Input id={id} type="number" dir="ltr" min={1} value={f.amount} onChange={(e) => set("amount", e.target.value)} className="tabular" />}
        </Field>
        <Field label={t("validFrom")} required>
          {(id) => <DatePicker id={id} value={f.validFrom} onChange={(v) => set("validFrom", v)} />}
        </Field>
        <Field label={t("validUntil")} required error={f.validTo ? errors.validTo : null}>
          {(id) => <DatePicker id={id} value={f.validTo} min={f.validFrom} onChange={(v) => set("validTo", v)} />}
        </Field>
        <Field label={t("maxUses")} error={errors.maxUses} hint={t("maxUsesHint")}>
          {(id) => <Input id={id} type="number" dir="ltr" min={1} value={f.maxUses} onChange={(e) => set("maxUses", e.target.value)} className="tabular" />}
        </Field>
        {/* Spacer matches the sibling Field's label height so the toggle lines up with the Max uses input (hidden when stacked on mobile). */}
        <div className="space-y-1.5">
          <span aria-hidden className="hidden select-none text-sm font-semibold sm:block">&nbsp;</span>
          <label className="flex h-10 cursor-pointer items-center gap-3 rounded-lg border border-ink-200 bg-white px-3 shadow-card">
            <input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} className="size-4 accent-brand-600" />
            <span className="text-sm font-semibold text-ink-800">{t("active")}</span>
          </label>
        </div>
      </div>
    </Modal>
  );
}

export default function PromosPage() {
  const promos = useQuery({ queryKey: keys.promos, queryFn: promosApi.list });
  const [editing, setEditing] = useState<PromoCode | "new" | null>(null);
  const t = useTranslations("adminB.promos");
  const fmt = useFmt();
  const discountText = (p: Pick<PromoCode, "discountType" | "discountValue">) =>
    p.discountType === "PERCENT" ? t("percentOff", { value: p.discountValue }) : t("amountOff", { amount: formatMoney(p.discountValue) });

  const toggle = useAction((p: PromoCode) => promosApi.update(p.id, { active: !p.active }), {
    invalidate: [keys.promos],
    success: (r) => (r.active ? t("activated", { code: r.code }) : t("paused", { code: r.code })),
  });

  const states = [...new Set((promos.data ?? []).map((p) => promoState(p).key))];
  const columns: ColumnDef<PromoCode, unknown>[] = [
    {
      accessorKey: "code",
      header: t("colCode"),
      cell: ({ row }) => (
        <span dir="ltr" className="tabular rounded-md border border-dashed border-brand-300 bg-brand-50 px-2 py-1 font-bold tracking-wider text-brand-800">{row.original.code}</span>
      ),
    },
    { id: "discount", header: t("colDiscount"), accessorFn: (p) => discountText(p), cell: ({ getValue }) => <span className="font-semibold text-ink-900">{getValue() as string}</span> },
    {
      id: "validity",
      header: t("colValidity"),
      meta: { className: "hidden md:table-cell" },
      accessorFn: (p) => p.validFrom,
      cell: ({ row }) => <span className="text-ink-700">{t("validityRange", { from: fmt.date(row.original.validFrom), to: fmt.date(row.original.validTo) })}</span>,
    },
    {
      id: "usage",
      header: t("colUsage"),
      meta: { className: "hidden sm:table-cell" },
      enableSorting: false,
      cell: ({ row }) => {
        const p = row.original;
        const usage = p.maxUses ? Math.min(1, p.usesCount / p.maxUses) : null;
        return (
          <div>
            <p dir="ltr" className="tabular text-ink-800 rtl:text-end">
              {p.usesCount.toLocaleString("en-US")}
              <span className="text-ink-400"> / {p.maxUses?.toLocaleString("en-US") ?? "∞"}</span>
            </p>
            {usage !== null && (
              <div className="mt-1 h-1.5 w-24 rounded-full bg-ink-100">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${usage * 100}%` }} />
              </div>
            )}
          </div>
        );
      },
    },
    {
      id: "status",
      header: t("colStatus"),
      accessorFn: (p) => promoState(p).key,
      filterFn: "equalsString",
      cell: ({ row }) => {
        const s = promoState(row.original);
        return (
          <Badge tone={s.tone} dot>
            {t(`state.${s.key}`)}
          </Badge>
        );
      },
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      meta: { className: "text-end" },
      cell: ({ row }) => {
        const p = row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            <Button size="sm" variant="ghost" loading={toggle.isPending && toggle.variables?.id === p.id} onClick={() => toggle.mutate(p)}>
              {p.active ? t("pause") : t("activate")}
            </Button>
            <IconButton label={t("editCode", { code: p.code })} onClick={() => setEditing(p)}>
              <Pencil className="size-4" />
            </IconButton>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" /> {t("newPromo")}
          </Button>
        }
      />

      {promos.isError ? (
        <Card>
          <ErrorState error={promos.error} onRetry={() => promos.refetch()} />
        </Card>
      ) : promos.data && promos.data.length === 0 ? (
        <Card>
          <EmptyState icon={BadgePercent} title={t("empty")} />
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={promos.data ?? []}
          loading={!promos.data}
          searchPlaceholder={t("search")}
          emptyText={t("noResults")}
          toolbar={
            states.length > 1
              ? (table) => {
                  const col = table.getColumn("status");
                  const val = (col?.getFilterValue() as string) ?? "ALL";
                  return (
                    <Select<string>
                      className="w-44"
                      value={val}
                      isSearchable={false}
                      onChange={(v) => col?.setFilterValue(!v || v === "ALL" ? undefined : v)}
                      options={[{ value: "ALL", label: t("allStates") }, ...states.map((s) => ({ value: s, label: t(`state.${s}`) }))]}
                    />
                  );
                }
              : undefined
          }
        />
      )}

      {editing && <PromoForm promo={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
