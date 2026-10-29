"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, Bandage, HeartHandshake, Stethoscope } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PageHeader } from "@shared/page-header";
import { Button } from "@shared/ui/button";
import { Card } from "@shared/ui/card";
import { Input } from "@shared/ui/field";
import { ErrorState, Skeleton } from "@shared/ui/misc";
import { commissionsApi } from "@/features/admin/lib/api/admin";
import { keys, useAction } from "@/features/admin/lib/api/hooks";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import type { CommissionRate, Specialty } from "@shared/types";

const ICON: Record<Specialty, React.ComponentType<{ className?: string }>> = {
  NURSING: Stethoscope,
  PHYSIOTHERAPY: Activity,
  POST_SURGERY_CARE: Bandage,
  ELDERLY_CARE: HeartHandshake,
  DOCTOR: Stethoscope,
};

const EXAMPLE_FEE = 3000_00; // Rs 3,000 visit, for the worked example

function RateCard({ rate }: { rate: CommissionRate }) {
  const t = useTranslations("adminB.commissions");
  const tc = useTranslations("common.actions");
  const L = useLabels();
  const f = useFmt();
  const [value, setValue] = useState(Number(rate.percentage).toString());
  const pct = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(pct) && pct >= 0 && pct <= 100;
  const dirty = valid && pct !== Number(rate.percentage);
  const Icon = ICON[rate.category];

  const save = useAction(() => commissionsApi.update(rate.category, pct), {
    invalidate: [keys.commissions],
    success: t("saved", { category: L.specialty(rate.category), pct }),
  });

  const commission = valid ? Math.round((EXAMPLE_FEE * pct) / 100) : 0;

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <Icon className="size-5" />
        </span>
        <div>
          <h2 className="font-bold text-ink-900">{L.specialty(rate.category)}</h2>
          <p className="text-xs text-ink-500">{t("effectiveSince", { date: f.date(rate.effectiveFrom) })}</p>
        </div>
      </div>

      <form
        className="mt-5 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty) save.mutate(undefined);
        }}
      >
        <label className="flex-1">
          <span className="mb-1.5 block text-sm font-semibold text-ink-800">{t("platformCommission")}</span>
          <div className="relative">
            <Input
              type="number"
              dir="ltr"
              min={0}
              max={100}
              step={0.5}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="tabular pe-9 text-lg font-bold"
              aria-invalid={!valid}
            />
            <span className="absolute top-1/2 end-3 -translate-y-1/2 font-semibold text-ink-400">%</span>
          </div>
        </label>
        <Button type="submit" disabled={!dirty} loading={save.isPending}>
          {tc("save")}
        </Button>
      </form>
      {!valid && <p className="mt-1.5 text-xs font-medium text-danger-600">{t("invalid")}</p>}

      <p className="mt-4 rounded-lg bg-ink-25 px-3 py-2 text-xs text-ink-600">
        {t.rich("example", {
          fee: f.money(EXAMPLE_FEE),
          platform: f.money(commission),
          caregiver: f.money(EXAMPLE_FEE - commission),
          b: (c) => (
            <b dir="ltr" className="tabular text-ink-900">
              {c}
            </b>
          ),
        })}
      </p>
    </Card>
  );
}

export default function CommissionsPage() {
  const rates = useQuery({ queryKey: keys.commissions, queryFn: commissionsApi.list });
  const t = useTranslations("adminB.commissions");

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
      />
      {rates.isError ? (
        <Card>
          <ErrorState error={rates.error} onRetry={() => rates.refetch()} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {!rates.data
            ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-60 rounded-2xl" />)
            : rates.data.map((r) => <RateCard key={`${r.id}-${r.updatedAt}`} rate={r} />)}
        </div>
      )}
    </>
  );
}
