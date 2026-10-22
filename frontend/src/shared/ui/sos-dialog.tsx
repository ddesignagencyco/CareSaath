"use client";

import { useMutation } from "@tanstack/react-query";
import { Phone, Siren } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { formatPkMobile } from "../lib/phone";
import type { SosResult } from "../caregiver-types";
import { Button } from "./button";
import { Field, Textarea } from "./field";
import { Modal } from "./overlay";
import { useToast } from "./toast";

/** Pakistan emergency numbers. */
const EMERGENCY = [
  { key: "rescue", number: "1122" },
  { key: "police", number: "15" },
  { key: "edhi", number: "115" },
] as const;

export interface SosContact {
  label: string;
  phone: string;
}

/** SOS alert for an active visit (POST /sos), plus one-tap emergency calls. */
export function SosDialog({
  description,
  contact,
  send,
  onClose,
}: {
  description: string;
  /** Extra person to call directly (the family, or the caregiver). */
  contact?: SosContact;
  send: (note: string | undefined) => Promise<SosResult>;
  onClose: () => void;
}) {
  const toast = useToast();
  const t = useTranslations("shared.sos");
  const tc = useTranslations("common.actions");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<SosResult | null>(null);
  const sos = useMutation({
    mutationFn: () => send(note.trim() || undefined),
    onSuccess: setResult,
    onError: () => toast.error(t("failed")),
  });

  const numbers = (
    <div>
      <p className="mb-2 text-xs font-bold tracking-wide text-ink-500 uppercase">{t("callDirectly")}</p>
      <div className="grid grid-cols-2 gap-2">
        {EMERGENCY.map((e) => (
          <a key={e.number} href={`tel:${e.number}`} className="flex items-center gap-2.5 rounded-xl border border-ink-200 p-3 hover:bg-ink-50">
            <Phone className="size-4 text-danger-600" />
            <span>
              <span className="block text-sm font-bold text-ink-900">{t(e.key)}</span>
              <span className="block text-xs text-ink-500">{t(`${e.key}Note`)}</span>
            </span>
          </a>
        ))}
        {contact && (
          <a href={`tel:${contact.phone}`} className="flex items-center gap-2.5 rounded-xl border border-ink-200 p-3 hover:bg-ink-50">
            <Phone className="size-4 text-brand-600" />
            <span>
              <span className="block text-sm font-bold text-ink-900">{contact.label}</span>
              <span className="tabular block text-xs text-ink-500">{formatPkMobile(contact.phone)}</span>
            </span>
          </a>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={result ? t("sentTitle") : t("title")}
      description={result ? undefined : description}
      footer={
        result ? (
          <Button onClick={onClose}>{tc("done")}</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              {tc("cancel")}
            </Button>
            <Button variant="danger" size="lg" loading={sos.isPending} onClick={() => sos.mutate()}>
              <Siren className="size-4" /> {t("send")}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-4">
          <p className="rounded-xl bg-danger-50 p-4 text-sm font-semibold text-danger-700">
            {t("result", { admins: result.notifiedAdmins, contacts: result.notifiedContacts })}
          </p>
          {numbers}
        </div>
      ) : (
        <div className="space-y-4">
          <Field label={t("whatsHappening")} hint={t("hint")}>
            {(id) => <Textarea id={id} value={note} maxLength={2000} rows={3} onChange={(e) => setNote(e.target.value)} placeholder={t("placeholder")} />}
          </Field>
          {numbers}
        </div>
      )}
    </Modal>
  );
}
