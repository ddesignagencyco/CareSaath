"use client";

import { useQuery } from "@tanstack/react-query";
import { FlaskConical, Pill, Plus, Stethoscope, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useAction } from "@shared/api/use-action";
import { Button } from "@shared/ui/button";
import { Card, CardBody, CardHeader } from "@shared/ui/card";
import { Field, Input, Textarea } from "@shared/ui/field";
import { MedicalOrdersView } from "@shared/ui/medical-orders";
import { saveBlob } from "@shared/api/http";
import type { LabTest, Medicine } from "@shared/caregiver-types";
import { medicalOrdersApi } from "@/features/caregiver/lib/api/caregiver";

export function DoctorOrders({ visitId }: { visitId: string }) {
  const t = useTranslations("caregiverB.visit.medicalOrders");
  const queryKey = ["cg-medical-orders", visitId];
  const orders = useQuery({ queryKey, queryFn: () => medicalOrdersApi.list(visitId) });

  const [diagnosis, setDiagnosis] = useState("");
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [labTests, setLabTests] = useState<LabTest[]>([]);

  const download = useAction(
    async (orderId: string) => {
      const { blob, filename } = await medicalOrdersApi.pdf(visitId, orderId);
      saveBlob(blob, filename);
    },
    { invalidate: [], success: null },
  );

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
        {orders.data && orders.data.length > 0 && (
          <MedicalOrdersView
            orders={orders.data}
            onDownload={(id) => download.mutate(id)}
            downloadingId={download.isPending ? download.variables ?? null : null}
          />
        )}

        <div className="space-y-5 rounded-xl border border-dashed border-ink-200 p-4">
          <p className="flex items-center gap-1.5 text-sm font-bold text-ink-800">
            <Stethoscope className="size-4 text-brand-600" /> {t("addTitle")}
          </p>
          <p className="-mt-3 text-xs text-ink-500">{t("hint")}</p>

          <Field label={t("diagnosis")}>
            {(id) => (
              <Textarea
                id={id}
                dir="auto"
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                placeholder={t("diagnosisPlaceholder")}
                className="min-h-20"
              />
            )}
          </Field>

          {/* Datalists for clinical autocomplete and suggestions */}
          <datalist id="med-names-list">
            <option value="Augmentin 625mg" />
            <option value="Panadol 500mg" />
            <option value="Brufen 400mg" />
            <option value="Flagyl 400mg" />
            <option value="Risek 20mg (Omeprazole)" />
            <option value="Ciprofloxacin 500mg" />
            <option value="Azomax 500mg (Azithromycin)" />
            <option value="Paracetamol Syrup" />
            <option value="Arinac Forte" />
            <option value="Gravinate 50mg" />
            <option value="Ponstan 500mg" />
            <option value="Sancos Syrup" />
          </datalist>

          <datalist id="med-dosage-list">
            <option value="1 tablet" />
            <option value="2 tablets" />
            <option value="500 mg" />
            <option value="250 mg" />
            <option value="100 mg" />
            <option value="5 ml (1 tsp)" />
            <option value="10 ml (2 tsp)" />
            <option value="1 sachet" />
            <option value="1 puff" />
            <option value="2 drops" />
            <option value="1 capsule" />
          </datalist>

          <datalist id="med-frequency-list">
            <option value="1-0-1 (Twice daily)" />
            <option value="1-1-1 (Thrice daily)" />
            <option value="1-0-0 (Morning only)" />
            <option value="0-0-1 (Night / Bedtime)" />
            <option value="Once daily (OD)" />
            <option value="Twice daily (BD)" />
            <option value="Three times daily (TDS)" />
            <option value="Four times daily (QDS)" />
            <option value="Every 8 hours" />
            <option value="Every 12 hours" />
            <option value="As needed (SOS / PRN)" />
          </datalist>

          <datalist id="med-duration-list">
            <option value="3 days" />
            <option value="5 days" />
            <option value="7 days" />
            <option value="10 days" />
            <option value="14 days" />
            <option value="1 month" />
            <option value="Ongoing / As directed" />
          </datalist>

          <datalist id="med-instructions-list">
            <option value="Take after meals" />
            <option value="Take before meals" />
            <option value="Take with food" />
            <option value="Take on an empty stomach" />
            <option value="Take at bedtime" />
            <option value="Take with plenty of water" />
            <option value="Dissolve in water before drinking" />
          </datalist>

          <datalist id="lab-names-list">
            <option value="Complete Blood Count (CBC)" />
            <option value="Serum Creatinine" />
            <option value="Blood Sugar Fasting (BSF)" />
            <option value="Blood Sugar Random (BSR)" />
            <option value="HbA1c" />
            <option value="Liver Function Tests (LFT)" />
            <option value="Lipid Profile" />
            <option value="Urine Routine Examination (Urine R/E)" />
            <option value="Serum Electrolytes" />
            <option value="Thyroid Profile (TSH, Free T3, Free T4)" />
            <option value="Chest X-Ray (PA View)" />
            <option value="12-Lead ECG" />
            <option value="Ultrasound Abdomen & Pelvis" />
          </datalist>

          <datalist id="lab-instructions-list">
            <option value="10-12 hours fasting required" />
            <option value="Morning first midstream urine sample" />
            <option value="No special preparation required" />
            <option value="Drink plenty of water before scan (full bladder)" />
          </datalist>

          {/* Medicines section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-800">
                <Pill className="size-4 text-teal-600" /> {t("medicines")}
              </p>
              <span className="text-xs text-ink-400">
                {medicines.length > 0 && `${medicines.length} added`}
              </span>
            </div>

            {medicines.map((m, i) => (
              <div key={i} className="space-y-3 rounded-xl border border-ink-200/80 bg-white p-3.5 shadow-xs">
                <div className="flex items-center justify-between gap-2 border-b border-ink-100 pb-2">
                  <span className="flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold text-brand-700">
                    <Pill className="size-3" />
                    {t("medicineNumber", { num: i + 1 })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMedicines((x) => x.filter((_, j) => j !== i))}
                    aria-label={t("remove")}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-ink-400 transition-colors hover:bg-danger-50 hover:text-danger-600"
                  >
                    <Trash2 className="size-3.5" />
                    <span className="hidden sm:inline">{t("remove")}</span>
                  </button>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-ink-700">{t("medName")}</label>
                  <Input
                    dir="auto"
                    list="med-names-list"
                    value={m.name}
                    onChange={(e) => setMed(i, { name: e.target.value })}
                    placeholder={t("medNamePlaceholder")}
                    aria-label={t("medName")}
                  />
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-ink-700">{t("dosage")}</label>
                    <Input
                      dir="auto"
                      list="med-dosage-list"
                      value={m.dosage ?? ""}
                      onChange={(e) => setMed(i, { dosage: e.target.value })}
                      placeholder={t("dosagePlaceholder")}
                      aria-label={t("dosage")}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-ink-700">{t("frequency")}</label>
                    <Input
                      dir="auto"
                      list="med-frequency-list"
                      value={m.frequency ?? ""}
                      onChange={(e) => setMed(i, { frequency: e.target.value })}
                      placeholder={t("frequencyPlaceholder")}
                      aria-label={t("frequency")}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-ink-700">{t("duration")}</label>
                    <Input
                      dir="auto"
                      list="med-duration-list"
                      value={m.duration ?? ""}
                      onChange={(e) => setMed(i, { duration: e.target.value })}
                      placeholder={t("durationPlaceholder")}
                      aria-label={t("duration")}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-ink-700">{t("instructions")}</label>
                  <Input
                    dir="auto"
                    list="med-instructions-list"
                    value={m.instructions ?? ""}
                    onChange={(e) => setMed(i, { instructions: e.target.value })}
                    placeholder={t("instructionsPlaceholder")}
                    aria-label={t("instructions")}
                  />
                </div>
              </div>
            ))}

            <Button variant="secondary" size="sm" onClick={() => setMedicines((m) => [...m, { name: "" }])}>
              <Plus className="size-4" /> {t("addMedicine")}
            </Button>
          </div>

          {/* Lab Tests section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-800">
                <FlaskConical className="size-4 text-brand-600" /> {t("labTests")}
              </p>
              <span className="text-xs text-ink-400">
                {labTests.length > 0 && `${labTests.length} added`}
              </span>
            </div>

            {labTests.map((l, i) => (
              <div key={i} className="space-y-3 rounded-xl border border-ink-200/80 bg-white p-3.5 shadow-xs">
                <div className="flex items-center justify-between gap-2 border-b border-ink-100 pb-2">
                  <span className="flex items-center gap-1.5 rounded-full bg-accent-50 px-2.5 py-0.5 text-xs font-bold text-accent-700">
                    <FlaskConical className="size-3" />
                    {t("labTestNumber", { num: i + 1 })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setLabTests((x) => x.filter((_, j) => j !== i))}
                    aria-label={t("remove")}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-ink-400 transition-colors hover:bg-danger-50 hover:text-danger-600"
                  >
                    <Trash2 className="size-3.5" />
                    <span className="hidden sm:inline">{t("remove")}</span>
                  </button>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-ink-700">{t("labName")}</label>
                  <Input
                    dir="auto"
                    list="lab-names-list"
                    value={l.name}
                    onChange={(e) => setLab(i, { name: e.target.value })}
                    placeholder={t("labNamePlaceholder")}
                    aria-label={t("labName")}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-ink-700">{t("instructions")}</label>
                  <Input
                    dir="auto"
                    list="lab-instructions-list"
                    value={l.instructions ?? ""}
                    onChange={(e) => setLab(i, { instructions: e.target.value })}
                    placeholder={t("labInstructionsPlaceholder")}
                    aria-label={t("instructions")}
                  />
                </div>
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
