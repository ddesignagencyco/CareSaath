"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Banknote, Pencil, Plus, Smartphone, Trash2, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PageHeader } from "@shared/page-header";
import { useAction } from "@shared/api/use-action";
import { PayoutStatusBadge } from "@shared/status";
import { Button, IconButton } from "@shared/ui/button";
import { Card, CardHeader } from "@shared/ui/card";
import { Field, Input } from "@shared/ui/field";
import { EmptyState, ErrorState, Skeleton, TableSkeleton } from "@shared/ui/misc";
import { Modal } from "@shared/ui/overlay";
import { Select } from "@shared/ui/select";
import { saveBlob } from "@shared/api/http";
import { formatMoney } from "@shared/lib/format";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import type { PayoutAccount } from "@shared/types";
import type { CaregiverPayoutRequest } from "@shared/caregiver-types";
import { PayoutAccountForm } from "@/features/caregiver/components/earnings/payout-account-form";
import { ApiError, USE_MOCKS } from "@/features/caregiver/lib/api/http";
import { moneyApi } from "@/features/caregiver/lib/api/caregiver";
import { keys } from "@/features/caregiver/lib/api/keys";

/** A payout history row, with Phase 15 confirm-received / report-not-received when TRANSFERRED. */
function PayoutRow({ p }: { p: CaregiverPayoutRequest }) {
  const t = useTranslations("caregiverB.earnings");
  const tc = useTranslations("common.actions");
  const f = useFmt();
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState("");
  const confirm = useAction(() => moneyApi.confirmPayoutReceived(p.id), {
    invalidate: [keys.earnings, [...keys.payouts, "list"]],
    success: t("history.confirmedToast"),
  });
  const report = useAction(() => moneyApi.reportPayoutNotReceived(p.id, note.trim()), {
    invalidate: [[...keys.payouts, "list"]],
    success: t("history.reportedToast"),
    onSuccess: () => {
      setReporting(false);
      setNote("");
    },
  });
  const receipt = useAction(
    async () => {
      const { blob, filename } = await moneyApi.payoutReceipt(p.id);
      saveBlob(blob, filename);
    },
    { invalidate: [], success: null },
  );
  const showActions = p.status === "TRANSFERRED" && !p.caregiverConfirmedAt;
  const canReceipt = !USE_MOCKS && (p.status === "PAID" || p.status === "TRANSFERRED");
  return (
    <li className="flex flex-col gap-2 px-5 py-3.5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="tabular font-bold text-ink-900">{formatMoney(p.amount)}</p>
          <p className="truncate text-xs text-ink-500">
            {p.payoutAccount.provider} <span dir="ltr">{p.payoutAccount.accountNumber}</span> · {t("history.requested", { date: f.date(p.requestedAt) })}
            {p.processedAt && ` · ${p.status === "PAID" ? t("history.paid", { date: f.date(p.processedAt) }) : t("history.closed", { date: f.date(p.processedAt) })}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PayoutStatusBadge status={p.status} />
          {canReceipt && (
            <Button size="sm" variant="ghost" loading={receipt.isPending} onClick={() => receipt.mutate(undefined)}>
              {t("history.receipt")}
            </Button>
          )}
        </div>
      </div>
      {showActions &&
        (p.issueReportedAt ? (
          <p className="text-xs font-semibold text-accent-700">{t("history.reported")}</p>
        ) : reporting ? (
          <div className="space-y-2">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("history.reportPlaceholder")} maxLength={500} />
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setReporting(false)}>
                {tc("cancel")}
              </Button>
              <Button size="sm" loading={report.isPending} disabled={!note.trim()} onClick={() => report.mutate(undefined)}>
                {t("history.reportNot")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setReporting(true)}>
              {t("history.reportNot")}
            </Button>
            <Button size="sm" loading={confirm.isPending} onClick={() => confirm.mutate(undefined)}>
              {t("history.confirmReceived")}
            </Button>
          </div>
        ))}
    </li>
  );
}

function RequestPayout({ available, accounts, onClose }: { available: number; accounts: PayoutAccount[]; onClose: () => void }) {
  const t = useTranslations("caregiverB.earnings.withdraw");
  const tc = useTranslations("common.actions");
  const L = useLabels();
  // Keep exact paisa: available can be a non-round rupee value (e.g. 46750 → "467.5").
  const [rupees, setRupees] = useState(String(available / 100));
  const [accountId, setAccountId] = useState<string | null>(accounts[0]?.id ?? null);
  const amount = Math.round(Number(rupees) * 100);
  const error =
    !rupees || !Number.isFinite(amount) || amount < 100
      ? t("minAmount")
      : amount > available
        ? t("maxAmount", { amount: formatMoney(available) })
        : null;

  const request = useAction(() => moneyApi.requestPayout({ payoutAccountId: accountId!, amount }), {
    invalidate: [keys.earnings, keys.payouts],
    success: t("requested", { amount: formatMoney(amount) }),
    onSuccess: onClose,
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={t("title")}
      description={t("available", { amount: formatMoney(available) })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button disabled={!!error || !accountId} loading={request.isPending} onClick={() => request.mutate(undefined)}>
            {error ? t("requestPayout") : t("requestAmount", { amount: formatMoney(amount) })}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t("amount")} error={rupees ? error : null}>
          {(id) => (
            <div className="relative" dir="ltr">
              <span className="pointer-events-none absolute top-1/2 start-3 -translate-y-1/2 text-sm font-semibold text-ink-400">Rs</span>
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                dir="ltr"
                min={1}
                className="tabular h-12 ps-10 text-lg font-bold"
                value={rupees}
                onChange={(e) => setRupees(e.target.value)}
              />
            </div>
          )}
        </Field>
        <div className="flex gap-2">
          {[0.5, 1].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setRupees(String(Math.round(available * f) / 100))}
              className="rounded-full border border-ink-200 px-3 py-1 text-xs font-semibold text-ink-600 hover:bg-ink-50"
            >
              {f === 1 ? t("full") : t("half")}
            </button>
          ))}
        </div>
        <Field label={t("sendTo")}>
          {(id) => (
            <Select
              inputId={id}
              value={accountId}
              onChange={setAccountId}
              options={accounts.map((a) => ({
                value: a.id,
                label: `${a.provider} ${a.accountNumber}`,
                description: `${L.payoutAccount(a.type)} · ${a.accountTitle}`,
              }))}
            />
          )}
        </Field>
        <p className="text-xs text-ink-500">{t("note")}</p>
      </div>
    </Modal>
  );
}

function AccountCard({ account, onEdit }: { account: PayoutAccount; onEdit: () => void }) {
  const t = useTranslations("caregiverB.earnings.accounts");
  const L = useLabels();
  const Icon = account.type === "BANK" ? Banknote : Smartphone;
  const remove = useAction(() => moneyApi.deleteAccount(account.id), {
    invalidate: [keys.accounts],
    success: t("removed"),
    onError: (err) => {
      // The API returns a 500 (FK constraint) for accounts with payout history.
      if (err instanceof ApiError && err.status === 500) {
        err.message = t("removeBlocked");
      }
    },
  });
  return (
    <li className="flex items-center gap-3 rounded-xl border border-ink-100 p-3.5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-ink-900">
          {account.provider}{" "}
          <span dir="ltr" className="tabular font-medium text-ink-500">
            {account.accountNumber}
          </span>
        </p>
        <p className="truncate text-xs text-ink-500">
          {L.payoutAccount(account.type)} · {account.accountTitle}
        </p>
      </div>
      <IconButton label={t("edit", { provider: account.provider })} onClick={onEdit}>
        <Pencil className="size-4" />
      </IconButton>
      <IconButton label={t("remove", { provider: account.provider })} onClick={() => remove.mutate(undefined)} disabled={remove.isPending} className="hover:text-danger-600">
        <Trash2 className="size-4" />
      </IconButton>
    </li>
  );
}

export default function EarningsPage() {
  const t = useTranslations("caregiverB.earnings");
  const tc = useTranslations("common.actions");
  const f = useFmt();
  const earnings = useQuery({ queryKey: keys.earnings, queryFn: moneyApi.earnings });
  const accounts = useQuery({ queryKey: keys.accounts, queryFn: moneyApi.accounts });
  const payouts = useQuery({ queryKey: [...keys.payouts, "list"], queryFn: () => moneyApi.payouts({ limit: 20 }) });
  const [withdrawing, setWithdrawing] = useState(false);
  const [editing, setEditing] = useState<PayoutAccount | "new" | null>(null);

  const e = earnings.data;
  const paidOut = e ? e.lifetimeEarnings - e.availableAmount - e.pendingAmount : 0;
  const hasAccounts = (accounts.data?.length ?? 0) > 0;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      {earnings.isError ? (
        <Card>
          <ErrorState error={earnings.error} onRetry={() => earnings.refetch()} />
        </Card>
      ) : (
        <div className="space-y-5">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 to-brand-900 p-6 text-white shadow-pop">
            <div className="pointer-events-none absolute -top-16 -end-10 size-56 rounded-full bg-accent-500/20 blur-2xl" aria-hidden />
            <p className="relative text-sm font-semibold text-brand-100">{t("availableToWithdraw")}</p>
            {e ? (
              <p className="tabular relative mt-1 text-4xl font-extrabold tracking-tight">{formatMoney(e.availableAmount)}</p>
            ) : (
              <Skeleton className="relative mt-2 h-10 w-40 bg-white/20" />
            )}
            <p className="relative mt-1 text-sm text-brand-100">{e ? t("fromVisits", { count: e.availableCount }) : " "}</p>
            <Button
              variant="secondary"
              size="lg"
              className="relative mt-5 w-full border-0 sm:w-auto"
              disabled={!e || e.availableAmount < 100 || !hasAccounts}
              onClick={() => setWithdrawing(true)}
            >
              <ArrowUpRight className="size-4" /> {t("withdrawButton")}
            </Button>
            {accounts.data && !hasAccounts && <p className="relative mt-2 text-xs text-brand-100">{t("addAccountFirst")}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { key: "pending", label: t("stats.pending"), value: e?.pendingAmount, note: e ? t("stats.pendingNote", { count: e.pendingCount }) : "" },
              { key: "paidOut", label: t("stats.paidOut"), value: e ? paidOut : undefined, note: t("stats.allTime") },
              { key: "total", label: t("stats.total"), value: e?.lifetimeEarnings, note: e ? t("stats.totalNote", { count: e.lifetimeVisits }) : "" },
              { key: "commission", label: t("stats.commission"), value: e?.lifetimeCommission, note: t("stats.allTime") },
            ].map((s) => (
              <Card key={s.key} className="p-4">
                <p className="text-xs font-semibold text-ink-500">{s.label}</p>
                <p className="tabular mt-1 text-lg font-extrabold text-ink-900">{s.value !== undefined ? formatMoney(s.value) : "–"}</p>
                <p className="text-xs text-ink-400">{s.note}</p>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr]">
            <Card>
              <CardHeader title={t("history.title")} />
              {payouts.isError ? (
                <ErrorState error={payouts.error} onRetry={() => payouts.refetch()} />
              ) : !payouts.data ? (
                <TableSkeleton rows={3} />
              ) : payouts.data.items.length === 0 ? (
                <EmptyState icon={Wallet} title={t("history.emptyTitle")} description={t("history.emptyDescription")} />
              ) : (
                <ul className="mt-3 divide-y divide-ink-100 border-t border-ink-100">
                  {payouts.data.items.map((p) => (
                    <PayoutRow key={p.id} p={p} />
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader
                title={t("accounts.title")}
                action={
                  <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>
                    <Plus className="size-4" /> {tc("add")}
                  </Button>
                }
              />
              <div className="p-5">
                {accounts.isError ? (
                  <ErrorState error={accounts.error} onRetry={() => accounts.refetch()} />
                ) : !accounts.data ? (
                  <Skeleton className="h-16" />
                ) : accounts.data.length === 0 ? (
                  <p className="text-sm text-ink-500">{t("accounts.empty")}</p>
                ) : (
                  <ul className="space-y-2">
                    {accounts.data.map((a) => (
                      <AccountCard key={a.id} account={a} onEdit={() => setEditing(a)} />
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {withdrawing && e && accounts.data && <RequestPayout available={e.availableAmount} accounts={accounts.data} onClose={() => setWithdrawing(false)} />}
      {editing && <PayoutAccountForm account={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
