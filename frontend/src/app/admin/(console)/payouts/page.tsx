"use client";

import { useQuery } from "@tanstack/react-query";
import { Banknote, Smartphone, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PageHeader } from "@shared/page-header";
import { ReasonDialog } from "@shared/reason-dialog";
import { PayoutStatusBadge } from "@shared/status";
import { Button } from "@shared/ui/button";
import { Card } from "@shared/ui/card";
import { Avatar, EmptyState, ErrorState, FilterTabs, Pagination, TableSkeleton } from "@shared/ui/misc";
import { Table, Td, Th, Tr } from "@shared/ui/table";
import { payoutsApi } from "@/features/admin/lib/api/admin";
import { keys, useAction } from "@/features/admin/lib/api/hooks";
import { USE_MOCKS } from "@/features/admin/lib/api/http";
import { saveBlob } from "@shared/api/http";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import type { AdminPayoutRequest, PayoutStatus } from "@shared/types";

const LIMIT = 10;
type Act = { kind: "approve" | "pay" | "reject"; payout: AdminPayoutRequest };

export default function PayoutsPage() {
  const [status, setStatus] = useState<PayoutStatus>("REQUESTED");
  const [page, setPage] = useState(1);
  const [act, setAct] = useState<Act | null>(null);
  const t = useTranslations("adminB.payouts");
  const L = useLabels();
  const f = useFmt();

  const list = useQuery({
    queryKey: [...keys.payouts, "list", status, page],
    queryFn: () => payoutsApi.list({ status, page, limit: LIMIT }),
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

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
      />

      <div className="mb-4">
        <FilterTabs
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { value: "REQUESTED", label: L.payout("REQUESTED") },
            { value: "PROCESSING", label: L.payout("PROCESSING") },
            { value: "TRANSFERRED", label: L.payout("TRANSFERRED") },
            { value: "PAID", label: L.payout("PAID") },
            { value: "REJECTED", label: L.payout("REJECTED") },
          ]}
        />
      </div>

      <Card>
        {list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : !list.data ? (
          <TableSkeleton />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={Wallet} title={t("empty")} />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>{t("colCaregiver")}</Th>
                  <Th className="hidden md:table-cell">{t("colPayTo")}</Th>
                  <Th>{t("colAmount")}</Th>
                  <Th className="hidden sm:table-cell">{t("colRequested")}</Th>
                  <Th>{t("colStatus")}</Th>
                  {(status === "REQUESTED" || status === "PROCESSING" || status === "TRANSFERRED") && <Th>{t("colAction")}</Th>}
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((p) => {
                  const AccountIcon = p.payoutAccount.type === "BANK" ? Banknote : Smartphone;
                  return (
                    <Tr key={p.id}>
                      <Td>
                        <div className="flex items-center gap-3">
                          <Avatar name={p.caregiver.user.fullName} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-ink-900">{p.caregiver.user.fullName}</p>
                            <p className="text-xs text-ink-500">{L.specialty(p.caregiver.specialty)}</p>
                          </div>
                        </div>
                      </Td>
                      <Td className="hidden md:table-cell">
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
                      </Td>
                      <Td className="tabular font-bold text-ink-900">
                        <span dir="ltr">{f.money(p.amount)}</span>
                      </Td>
                      <Td className="hidden sm:table-cell">
                        <p className="text-ink-700">{f.date(p.requestedAt)}</p>
                        <p className="text-xs text-ink-500">{f.relativeTime(p.requestedAt)}</p>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <PayoutStatusBadge status={p.status} />
                          {!USE_MOCKS && (p.status === "TRANSFERRED" || p.status === "PAID") && (
                            <Button size="sm" variant="ghost" loading={receipt.isPending} onClick={() => receipt.mutate(p.id)}>
                              {t("receipt")}
                            </Button>
                          )}
                        </div>
                      </Td>
                      {status === "TRANSFERRED" && (
                        <Td>
                          {p.issueReportedAt ? (
                            <div className="flex flex-col items-start gap-1">
                              <Button size="sm" variant="success" onClick={() => setAct({ kind: "pay", payout: p })}>
                                {t("resend")}
                              </Button>
                              {p.issueNote && <span className="max-w-48 truncate text-xs text-danger-600" title={p.issueNote}>{p.issueNote}</span>}
                            </div>
                          ) : (
                            <span className="text-xs text-ink-400">{t("awaitingConfirm")}</span>
                          )}
                        </Td>
                      )}
                      {(status === "REQUESTED" || status === "PROCESSING") && (
                        <Td>
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
                        </Td>
                      )}
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
            <Pagination page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={setPage} />
          </>
        )}
      </Card>

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
          {!USE_MOCKS && <p className="text-xs text-ink-500">{t("noteNotStored")}</p>}
        </ReasonDialog>
      )}
      {act?.kind === "pay" && (
        <ReasonDialog
          open
          onClose={() => setAct(null)}
          title={t("payTitle", { amount })}
          description={t("payDescription", { account: `\u2066${act.payout.payoutAccount.provider} ${act.payout.payoutAccount.accountNumber}\u2069` })}
          label={t("settlementReference")}
          placeholder={t("settlementPlaceholder")}
          maxLength={500}
          confirmLabel={t("markAsPaid")}
          confirmVariant="success"
          loading={pay.isPending}
          onConfirm={(note) => pay.mutate({ id: act.payout.id, note })}
        >
          {!USE_MOCKS && <p className="text-xs text-ink-500">{t("noteNotStored")}</p>}
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
