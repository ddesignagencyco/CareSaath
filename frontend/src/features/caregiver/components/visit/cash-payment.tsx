"use client";

import { Banknote, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useAction } from "@shared/api/use-action";
import { Button } from "@shared/ui/button";
import { Card, CardBody, CardHeader } from "@shared/ui/card";
import { Modal } from "@shared/ui/overlay";
import type { CaregiverVisitDetail } from "@shared/caregiver-types";
import { useFmt } from "@shared/i18n/use-fmt";
import { paymentsApi } from "@/features/caregiver/lib/api/caregiver";
import { keys } from "@/features/caregiver/lib/api/keys";

/** Cash can be handed over once the caregiver is at the home. */
const CASH_STATUSES: readonly CaregiverVisitDetail["status"][] = ["CHECKED_IN", "IN_PROGRESS", "CHECKED_OUT", "COMPLETED"];

/**
 * "Confirm cash received" (POST /caregiver/payments/:id/confirm-cash).
 * Needs the visit's payment id, which GET /caregiver/visits/:id doesn't return
 * yet — so this renders nothing against today's backend (see caregiver-types).
 */
export function CashPayment({ visit }: { visit: CaregiverVisitDetail }) {
  const t = useTranslations("caregiverB.cash");
  const tc = useTranslations("common.actions");
  const f = useFmt();
  const [confirming, setConfirming] = useState(false);
  const payment = visit.payments?.find((p) => p.method === "CASH" && (p.status === "PENDING" || p.status === "PAID"));
  const confirm = useAction(() => paymentsApi.confirmCash(payment!.id), {
    invalidate: [["cg-visit", visit.id], keys.earnings],
    success: t("confirmedToast"),
    onSuccess: () => setConfirming(false),
  });

  if (!payment || !CASH_STATUSES.includes(visit.status)) return null;

  return (
    <Card>
      <CardHeader title={t("title")} />
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-2 text-sm text-ink-600">
            <Banknote className="size-4 text-ink-400" /> {t("amountLabel")}
          </span>
          <span className="tabular text-lg font-extrabold text-ink-900">{f.money(payment.amount)}</span>
        </div>
        {payment.status === "PAID" ? (
          <p className="flex items-center gap-2 rounded-lg bg-success-50 px-3 py-2 text-sm font-semibold text-success-700">
            <Check className="size-4 shrink-0" /> {payment.paidAt ? t("receivedAt", { time: f.dateTime(payment.paidAt) }) : t("received")}
          </p>
        ) : (
          <>
            <p className="text-sm text-ink-500">{t("pendingHint")}</p>
            <Button className="w-full" onClick={() => setConfirming(true)}>
              <Banknote className="size-4" /> {t("confirm")}
            </Button>
          </>
        )}
      </CardBody>
      {confirming && (
        <Modal
          open
          onClose={() => setConfirming(false)}
          title={t("confirmTitle")}
          description={t("confirmDescription", { amount: f.money(payment.amount) })}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                {tc("cancel")}
              </Button>
              <Button loading={confirm.isPending} onClick={() => confirm.mutate(undefined)}>
                {t("confirmYes")}
              </Button>
            </>
          }
        >
          <p className="text-sm text-ink-600">{t("confirmNote")}</p>
        </Modal>
      )}
    </Card>
  );
}
