"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus, Stethoscope, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useAction } from "@shared/api/use-action";
import { Button } from "@shared/ui/button";
import { Card, CardBody, CardHeader } from "@shared/ui/card";
import { Field, Input, Textarea } from "@shared/ui/field";
import { MedicalOrdersView } from "@shared/ui/medical-orders";
import type { LabTest, Medicine } from "@shared/caregiver-types";
import { medicalOrdersApi } from "@/features/caregiver/lib/api/caregiver";

/**
 * Doctor-only panel on the visit detail: shows prior medical orders and a form
 * to record a new diagnosis / prescription / lab-test order. Rendered only when
 * the booking's service is DOCTOR, so the save always targets a doctor profile.
 */
export function DoctorOrders({ visitId }: { visitId: string }) {
  const t = useTranslations("caregiverB.visit.medicalOrders");
  const queryKey = ["cg-medical-orders", visitId];
  const orders = useQuery({ queryKey, queryFn: () => medicalOrdersApi.list(visitId) });

  const [diagnosis, setDiagnosis] = useState("");
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [labTests, setLabTests] = useState<LabTest[]>([]);

  const meds = medicines.map((m) => ({ ...m, name: m.name.trim() })).filter((m) => m.name);
  const labs = labTests.map((l) => ({ ...l, name: l.name.trim() })).filter((l) => l.name);
  const diag = diagnosis.trim();
  const canSave = !!diag || meds.length > 0 || labs.length > 0;

  const save = useAction(
    () =>
      medicalOrdersApi.create(visitId, {
        diagnosis: diag || undefined,
        medicines: meds.length ? meds : undefined,
        labTests: labs.length ? labs : undefined,
      }),
    {
      invalidate: [queryKey],
      success: t("saved"),
      onSuccess: () => {
        setDiagnosis("");
        setMedicines([]);
        setLabTests([]);
      },
    },
  );

  const setMed = (i: number, patch: Partial<Medicine>) => setMedicines((m) => m.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setLab = (i: number, patch: Partial<LabTest>) => setLabTests((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <Card>
      <CardHeader title={t("title")} />
      <CardBody className="space-y-6">
        {orders.data && orders.data.length > 0 && <MedicalOrdersView orders={orders.data} />}

        <div className="space-y-5 rounded-xl border border-dashed border-ink-200 p-4">
          <p className="flex items-center gap-1.5 text-sm font-bold text-ink-800">
            <Stethoscope className="size-4 text-brand-600" /> {t("addTitle")}
          </p>
          <p className="-mt-3 text-xs text-ink-500">{t("hint")}</p>

          <Field label={t("diagnosis")}>
            {(id) => (
              <Textarea id={id} dir="auto" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder={t("diagnosisPlaceholder")} className="min-h-20" />
            )}
          </Field>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-ink-800">{t("medicines")}</p>
            {medicines.map((m, i) => (
              <div key={i} className="space-y-2 rounded-lg bg-ink-50/50 p-3">
                <div className="flex items-center gap-2">
                  <Input dir="auto" value={m.name} onChange={(e) => setMed(i, { name: e.target.value })} placeholder={t("medName")} aria-label={t("medName")} />
                  <button type="button" onClick={() => setMedicines((x) => x.filter((_, j) => j !== i))} aria-label={t("remove")} className="shrink-0 rounded-lg p-2 text-ink-400 hover:bg-ink-100 hover:text-danger-600">
                    <X className="size-4" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Input dir="auto" value={m.dosage ?? ""} onChange={(e) => setMed(i, { dosage: e.target.value })} placeholder={t("dosage")} aria-label={t("dosage")} />
                  <Input dir="auto" value={m.frequency ?? ""} onChange={(e) => setMed(i, { frequency: e.target.value })} placeholder={t("frequency")} aria-label={t("frequency")} />
                  <Input dir="auto" value={m.duration ?? ""} onChange={(e) => setMed(i, { duration: e.target.value })} placeholder={t("duration")} aria-label={t("duration")} />
                </div>
                <Input dir="auto" value={m.instructions ?? ""} onChange={(e) => setMed(i, { instructions: e.target.value })} placeholder={t("instructions")} aria-label={t("instructions")} />
              </div>
            ))}
            <Button variant="secondary" size="sm" onClick={() => setMedicines((m) => [...m, { name: "" }])}>
              <Plus className="size-4" /> {t("addMedicine")}
            </Button>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-ink-800">{t("labTests")}</p>
            {labTests.map((l, i) => (
              <div key={i} className="space-y-2 rounded-lg bg-ink-50/50 p-3">
                <div className="flex items-center gap-2">
                  <Input dir="auto" value={l.name} onChange={(e) => setLab(i, { name: e.target.value })} placeholder={t("labName")} aria-label={t("labName")} />
                  <button type="button" onClick={() => setLabTests((x) => x.filter((_, j) => j !== i))} aria-label={t("remove")} className="shrink-0 rounded-lg p-2 text-ink-400 hover:bg-ink-100 hover:text-danger-600">
                    <X className="size-4" />
                  </button>
                </div>
                <Input dir="auto" value={l.instructions ?? ""} onChange={(e) => setLab(i, { instructions: e.target.value })} placeholder={t("instructions")} aria-label={t("instructions")} />
              </div>
            ))}
            <Button variant="secondary" size="sm" onClick={() => setLabTests((l) => [...l, { name: "" }])}>
              <Plus className="size-4" /> {t("addLabTest")}
            </Button>
          </div>

          <Button onClick={() => save.mutate(undefined)} loading={save.isPending} disabled={!canSave} className="w-full">
            {t("save")}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
