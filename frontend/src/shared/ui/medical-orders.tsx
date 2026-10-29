"use client";

import { ClipboardList, Pill, TestTube } from "lucide-react";
import { useTranslations } from "next-intl";
import type { MedicalOrder } from "@shared/caregiver-types";
import { useFmt } from "@shared/i18n/use-fmt";

/**
 * Read-only render of a doctor's medical orders (diagnosis, prescription, lab
 * tests) for a visit. The caller supplies the Card + heading; this is the body.
 */
export function MedicalOrdersView({ orders }: { orders: MedicalOrder[] }) {
  const t = useTranslations("shared.medicalOrders");
  const f = useFmt();
  if (orders.length === 0) return null;
  return (
    <div className="space-y-6">
      {orders.map((o) => (
        <div key={o.id} className="space-y-4">
          <p className="text-xs text-ink-500">{t("recordedOn", { date: f.dateTime(o.createdAt) })}</p>
          {o.diagnosis && (
            <section>
              <p className="mb-1 flex items-center gap-1.5 text-xs font-bold tracking-wide text-ink-500 uppercase">
                <ClipboardList className="size-3.5" /> {t("diagnosis")}
              </p>
              <p dir="auto" className="text-sm leading-relaxed whitespace-pre-line text-ink-800">{o.diagnosis}</p>
            </section>
          )}
          {o.medicines.length > 0 && (
            <section>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold tracking-wide text-ink-500 uppercase">
                <Pill className="size-3.5" /> {t("medicines")}
              </p>
              <ul className="space-y-2">
                {o.medicines.map((m, i) => (
                  <li key={i} className="rounded-lg border border-ink-100 bg-ink-50/40 p-3">
                    <p dir="auto" className="text-sm font-semibold text-ink-900">{m.name}</p>
                    {(m.dosage || m.frequency || m.duration) && (
                      <p className="text-xs text-ink-600">{[m.dosage, m.frequency, m.duration].filter(Boolean).join(" · ")}</p>
                    )}
                    {m.instructions && <p dir="auto" className="mt-1 text-xs text-ink-500">{m.instructions}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {o.labTests.length > 0 && (
            <section>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold tracking-wide text-ink-500 uppercase">
                <TestTube className="size-3.5" /> {t("labTests")}
              </p>
              <ul className="space-y-2">
                {o.labTests.map((lt, i) => (
                  <li key={i} className="rounded-lg border border-ink-100 bg-ink-50/40 p-3">
                    <p dir="auto" className="text-sm font-semibold text-ink-900">{lt.name}</p>
                    {lt.instructions && <p dir="auto" className="mt-1 text-xs text-ink-500">{lt.instructions}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ))}
    </div>
  );
}
