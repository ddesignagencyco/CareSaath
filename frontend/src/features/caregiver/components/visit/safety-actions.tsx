"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useAction } from "@shared/api/use-action";
import { Button } from "@shared/ui/button";
import { Field, Textarea } from "@shared/ui/field";
import { Modal } from "@shared/ui/overlay";
import { Select } from "@shared/ui/select";
import type { IncidentPriority } from "@shared/types";
import { useLabels } from "@shared/i18n/use-labels";
import { disputesApi, safetyApi } from "@/features/caregiver/lib/api/caregiver";
import { SosDialog as SharedSosDialog } from "@shared/ui/sos-dialog";
import { keys } from "@/features/caregiver/lib/api/keys";
import { getPosition } from "@shared/lib/geo";

export function SosDialog({ visitId, familyPhone, onClose }: { visitId: string; familyPhone?: string | null; onClose: () => void }) {
  const t = useTranslations("caregiverB.safety");
  // Start locating as soon as the dialog opens; the alert never waits for it.
  const coords = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    getPosition()
      .then((p) => {
        coords.current = { lat: p.lat, lng: p.lng };
      })
      .catch(() => undefined);
  }, []);
  return (
    <SharedSosDialog
      description={t("sosDescription")}
      contact={familyPhone ? { label: t("family"), phone: familyPhone } : undefined}
      send={(note) =>
        safetyApi.sos({
          visitId,
          note,
          // SosDto types these as strings (no validator); send them as such.
          ...(coords.current ? { latitude: coords.current.lat.toFixed(6), longitude: coords.current.lng.toFixed(6) } : {}),
        })
      }
      onClose={onClose}
    />
  );
}

const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const satisfies readonly IncidentPriority[];

export function ReportIssueDialog({ visitId, onClose }: { visitId: string; onClose: () => void }) {
  const t = useTranslations("caregiverB.safety");
  const tc = useTranslations("common.actions");
  const L = useLabels();
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<IncidentPriority>("MEDIUM");
  const report = useAction(() => safetyApi.report({ visitId, description: description.trim(), priority }), {
    invalidate: [keys.safety],
    success: t("reportSent"),
    onSuccess: onClose,
  });
  const options = PRIORITIES.map((value) => ({ value, label: L.priority(value), description: t(`priorityHint.${value}`) }));
  return (
    <Modal
      open
      onClose={onClose}
      title={t("reportTitle")}
      description={t("reportDescription")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button loading={report.isPending} disabled={description.trim().length < 3} onClick={() => report.mutate(undefined)}>
            {t("sendReport")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t("howSerious")}>
          {(id) => <Select inputId={id} value={priority} onChange={(v) => v && setPriority(v)} options={options} />}
        </Field>
        <Field label={t("whatHappened")} required hint={`${description.length}/4000`}>
          {(id) => <Textarea id={id} value={description} maxLength={4000} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
      </div>
    </Modal>
  );
}

export function DisputeDialog({ visitId, onClose }: { visitId: string; onClose: () => void }) {
  const t = useTranslations("caregiverB.safety");
  const tc = useTranslations("common.actions");
  const [description, setDescription] = useState("");
  const raise = useAction(() => disputesApi.raise({ visitId, description: description.trim() }), {
    invalidate: [keys.disputes],
    success: t("disputeRaised"),
    onSuccess: onClose,
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={t("disputeTitle")}
      description={t("disputeDescription")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button loading={raise.isPending} disabled={description.trim().length < 5} onClick={() => raise.mutate(undefined)}>
            {t("raiseDispute")}
          </Button>
        </>
      }
    >
      <Field label={t("describeProblem")} required hint={t("disputeHint", { count: description.length })}>
        {(id) => <Textarea id={id} value={description} maxLength={4000} rows={5} onChange={(e) => setDescription(e.target.value)} />}
      </Field>
    </Modal>
  );
}
