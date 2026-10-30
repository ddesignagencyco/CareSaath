"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Banknote, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PageHeader } from "@shared/page-header";
import { ReasonDialog } from "@shared/reason-dialog";
import { PayoutStatusBadge } from "@shared/status";
import { Button } from "@shared/ui/button";
import { Card } from "@shared/ui/card";
import { DataTable } from "@shared/ui/data-table";
import { Input } from "@shared/ui/field";
import { Avatar, ErrorState } from "@shared/ui/misc";
import { Select } from "@shared/ui/select";
import { useDebouncedValue } from "@shared/hooks/use-debounced-value";
import { payoutsApi } from "@/features/admin/lib/api/admin";
import { keys, useAction } from "@/features/admin/lib/api/hooks";
import { saveBlob } from "@shared/api/http";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import type { AdminPayoutRequest, PayoutStatus } from "@shared/types";

const LIMIT = 10;
type Act = { kind: "approve" | "pay" | "reject"; payout: AdminPayoutRequest };

export default function PayoutsPage() {
  const [status, setStatus] = useState<PayoutStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [act, setAct] = useState<Act | null>(null);
  const [qInput, setQInput] = useState("");
  const q = useDebouncedValue(qInput.trim());
  const t = useTranslations("adminB.payouts");
  const L = useLabels();
  const f = useFmt();

  const list = useQuery({
    queryKey: [...keys.payouts, "list", status, q, page],
    queryFn: () => payoutsApi.list({ ...(status === "ALL" ? {} : { status }), ...(q ? { q } : {}), page, limit: LIMIT }),
  });

  const opts = (success: string) => ({
    invalidate: [keys.payouts, keys.analytics],
    success,
    onSuccess: () => setAct(null),
  });
  const approve = useAction(({ id, note }: { id: string; note: string }) => payoutsApi.approve(id, { note: note || undefined }), opts(t("approved")));
  const pay = useAction(({ id, note }: { id: string; note: string }) => payoutsApi.markTransferred(id, { note: note || undefined }), opts(t("transferred")));
  const reject = useAction(({ id, reason }: { id: string; reason: string }) => payoutsApi.reject(id, { reason }), opts(t("rejected")));
  const receipt = useAction(
    async (id: string) => {
      const { blob, filename } = await payoutsApi.receipt(id);
      saveBlob(blob, filename);
    },
    { invalidate: [], success: null },
  );

  const name = act?.payout.caregiver.user.fullName;
  const amount = act ? f.money(act.payout.amount) : "";

  const showActions = status === "ALL" || status === "REQUESTED" || status === "PROCESSING" || status === "TRANSFERRED";
  const baseColumns: ColumnDef<AdminPayoutRequest, unknown>[] = [
    {
      id: "caregiver",
      header: t("colCaregiver"),
      accessorFn: (p) => p.caregiver.user.fullName,
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <Avatar name={row.original.caregiver.user.fullName} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink-900">{row.original.caregiver.user.fullName}</p>
            <p className="text-xs text-ink-500">{L.specialty(row.original.caregiver.specialty)}</p>
          </div>
        </div>
      ),
    },
    {
      id: "payTo",
      header: t("colPayTo"),
      meta: { className: "hidden md:table-cell" },
      enableSorting: false,
      cell: ({ row }) => {
        const p = row.original;
        const AccountIcon = p.payoutAccount.type === "BANK" ? Banknote : Smartphone;
        return (
          <div className="flex items-center gap-2">
            <AccountIcon className="size-4 text-ink-400" />
            <div>
              <p className="font-medium text-ink-800">
                {p.payoutAccount.provider} <span dir="ltr" className="tabular text-ink-500">{p.payoutAccount.accountNumber}</span>
              </p>
              <p className="text-xs text-ink-500">
                {L.payoutAccount(p.payoutAccount.type)} · {p.payoutAccount.accountTitle}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      id: "amount",
      header: t("colAmount"),
      accessorFn: (p) => p.amount,
      cell: ({ row }) => <span dir="ltr" className="tabular font-bold text-ink-900">{f.money(row.original.amount)}</span>,
    },
    {
      id: "requested",
      header: t("colRequested"),
      meta: { className: "hidden sm:table-cell" },
      accessorFn: (p) => p.requestedAt,
      cell: ({ row }) => (
        <div>
          <p className="text-ink-700">{f.date(row.original.requestedAt)}</p>
          <p className="text-xs text-ink-500">{f.relativeTime(row.original.requestedAt)}</p>
        </div>
      ),
    },
    {
      id: "status",
      header: t("colStatus"),
      enableSorting: false,
      cell: ({ row }) => {
        const p = row.original;
        return (
          <div className="flex items-center gap-2">
            <PayoutStatusBadge status={p.status} />
            {(p.status === "TRANSFERRED" || p.status === "PAID") && (
              <Button size="sm" variant="ghost" loading={receipt.isPending} onClick={() => receipt.mutate(p.id)}>
                {t("receipt")}
              </Button>
            )}
          </div>
        );
      },
    },
  ];
  const actionsColumn: ColumnDef<AdminPayoutRequest, unknown> = {
    id: "actions",
    header: t("colAction"),
    enableSorting: false,
    cell: ({ row }) => {
      const p = row.original;
      // Branch per-row (not on the filter) so the "All" view renders the right control for each status.
      if (p.status === "PAID" || p.status === "REJECTED") return <span className="text-ink-300">—</span>;
      if (p.status === "TRANSFERRED") {
        return p.issueReportedAt ? (
          <div className="flex flex-col items-start gap-1">
            <Button size="sm" variant="success" onClick={() => setAct({ kind: "pay", payout: p })}>
              {t("resend")}
            </Button>
            {p.issueNote && <span className="max-w-48 truncate text-xs text-danger-600" title={p.issueNote}>{p.issueNote}</span>}
          </div>
        ) : (
          <span className="text-xs text-ink-400">{t("awaitingConfirm")}</span>
        );
      }
      return (
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" className="text-danger-600 hover:bg-danger-50" onClick={() => setAct({ kind: "reject", payout: p })}>
            {t("reject")}
          </Button>
          {p.status === "REQUESTED" ? (
            <Button size="sm" onClick={() => setAct({ kind: "approve", payout: p })}>
              {t("approve")}
            </Button>
          ) : (
            <Button size="sm" variant="success" onClick={() => setAct({ kind: "pay", payout: p })}>
              {t("markTransferred")}
            </Button>
          )}
        </div>
      );
    },
  };
  const columns = showActions ? [...baseColumns, actionsColumn] : baseColumns;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      {list.isError ? (
        <Card>
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={list.data?.items ?? []}
          loading={!list.data}
          emptyText={t("empty")}
          serverPagination={list.data ? { page: list.data.page, limit: list.data.limit, total: list.data.total, onPageChange: setPage } : undefined}
          toolbar={() => (
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1 sm:max-w-xs">
                <Input value={qInput} onChange={(e) => { setQInput(e.target.value); setPage(1); }} placeholder={t("searchPlaceholder")} />
              </div>
              <Select<PayoutStatus | "ALL">
                className="w-52"
                value={status}
                isSearchable={false}
                onChange={(v) => {
                  if (v) {
                    setStatus(v);
                    setPage(1);
                  }
                }}
                options={[
                  { value: "ALL", label: t("allStatuses") },
                  { value: "REQUESTED", label: L.payout("REQUESTED") },
                  { value: "PROCESSING", label: L.payout("PROCESSING") },
                  { value: "TRANSFERRED", label: L.payout("TRANSFERRED") },
                  { value: "PAID", label: L.payout("PAID") },
                  { value: "REJECTED", label: L.payout("REJECTED") },
                ]}
              />
            </div>
          )}
        />
      )}

      {act?.kind === "approve" && (
        <ReasonDialog
          open
          onClose={() => setAct(null)}
          title={t("approveTitle", { amount, name: name ?? "" })}
          description={t("approveDescription")}
          label={t("note")}
          maxLength={500}
          confirmLabel={t("approvePayout")}
          loading={approve.isPending}
          onConfirm={(note) => approve.mutate({ id: act.payout.id, note })}
        >
          {<p className="text-xs text-ink-500">{t("noteNotStored")}</p>}
        </ReasonDialog>
      )}
      {act?.kind === "pay" && (
        <ReasonDialog
          open
          onClose={() => setAct(null)}
          title={t("payTitle", { amount })}
          description={t("payDescription", { account: `⁦${act.payout.payoutAccount.provider} ${act.payout.payoutAccount.accountNumber}⁩` })}
          label={t("settlementReference")}
          placeholder={t("settlementPlaceholder")}
          maxLength={500}
          confirmLabel={t("markAsPaid")}
          confirmVariant="success"
          loading={pay.isPending}
          onConfirm={(note) => pay.mutate({ id: act.payout.id, note })}
        >
          {<p className="text-xs text-ink-500">{t("noteNotStored")}</p>}
        </ReasonDialog>
      )}
      {act?.kind === "reject" && (
        <ReasonDialog
          open
          onClose={() => setAct(null)}
          title={t("rejectTitle", { amount, name: name ?? "" })}
          description={t("rejectDescription")}
          required
          maxLength={500}
          placeholder={t("rejectPlaceholder")}
          confirmLabel={t("rejectPayout")}
          confirmVariant="danger"
          loading={reject.isPending}
          onConfirm={(reason) => reject.mutate({ id: act.payout.id, reason })}
        />
      )}
    </>
  );
}
