"use client";

import { useQuery } from "@tanstack/react-query";
import { MapPinned } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useAction } from "@shared/api/use-action";
import { Button } from "@shared/ui/button";
import { Card, CardBody, CardHeader } from "@shared/ui/card";
import { Field } from "@shared/ui/field";
import { Skeleton } from "@shared/ui/misc";
import { MultiSelect, Select } from "@shared/ui/select";
import { LAHORE_AREAS, SERVICE_RADIUS_OPTIONS } from "@shared/lib/options";
import type { CaregiverServiceArea, ServiceAreaInput } from "@shared/caregiver-types";
import { profileApi } from "@/features/caregiver/lib/api/caregiver";
import { keys } from "@/features/caregiver/lib/api/keys";

const AREA_OPTIONS = LAHORE_AREAS.map((a) => ({ value: a.value, label: a.label }));

/**
 * Sub-city coverage zones (Option A — predefined Lahore areas, no map picker).
 * Each chosen area is sent as { city, label, lat, lng, radiusMeters } to
 * PUT /caregiver/service-areas. An empty selection means "all of Lahore".
 */
export function ServiceAreasCard() {
  const t = useTranslations("caregiverA.serviceAreas");
  const areasQ = useQuery({ queryKey: keys.serviceAreas, queryFn: profileApi.serviceAreas });

  return (
    <Card>
      <CardHeader title={t("title")} description={t("description")} />
      <CardBody>
        {!areasQ.data ? (
          <div className="space-y-3">
            <Skeleton className="h-10 rounded-lg" />
            <Skeleton className="h-10 rounded-lg" />
          </div>
        ) : (
          // Keyed on the saved data so the form re-seeds after a save (no set-state-in-effect).
          <ServiceAreasForm key={areasQ.data.map((a) => `${a.label}:${a.radiusMeters}`).join("|")} initial={areasQ.data} />
        )}
      </CardBody>
    </Card>
  );
}

function ServiceAreasForm({ initial }: { initial: CaregiverServiceArea[] }) {
  const t = useTranslations("caregiverA.serviceAreas");
  const savedValues = initial.map((a) => a.label).filter((l): l is string => !!l && AREA_OPTIONS.some((o) => o.value === l));
  const [selected, setSelected] = useState<string[]>(savedValues);
  const [radius, setRadius] = useState<string>(String(initial[0]?.radiusMeters ?? 5000));

  const save = useAction(
    () => {
      const areas: ServiceAreaInput[] = selected.map((v) => {
        const a = LAHORE_AREAS.find((x) => x.value === v)!;
        return { city: "Lahore", label: a.label, lat: a.lat, lng: a.lng, radiusMeters: Number(radius) };
      });
      return profileApi.setServiceAreas(areas);
    },
    { invalidate: [keys.serviceAreas], success: t("saved") },
  );

  const radiusLabel = SERVICE_RADIUS_OPTIONS.find((o) => o.value === radius)?.label ?? radius;

  return (
    <div className="space-y-4">
      <Field label={t("areasLabel")} hint={t("areasHint")}>
        {(id) => <MultiSelect inputId={id} value={selected} onChange={setSelected} options={AREA_OPTIONS} placeholder={t("areasPlaceholder")} />}
      </Field>

      {selected.length > 0 && (
        <Field label={t("radiusLabel")} hint={t("radiusHint")}>
          {(id) => (
            <Select<string> inputId={id} value={radius} isSearchable={false} onChange={(v) => v && setRadius(v)} options={SERVICE_RADIUS_OPTIONS} />
          )}
        </Field>
      )}

      <p className="flex items-start gap-2 rounded-xl bg-brand-50/60 p-4 text-sm text-brand-800">
        <MapPinned className="mt-0.5 size-4 shrink-0 text-brand-600" />
        {selected.length > 0 ? t("summary", { radius: radiusLabel, areas: selected.join(", ") }) : t("wholeCity")}
      </p>

      <Button loading={save.isPending} onClick={() => save.mutate(undefined)}>
        {t("save")}
      </Button>
    </div>
  );
}
