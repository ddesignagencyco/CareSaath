"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import { FileWarning, UserCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { CaregiverDrawer } from "@/features/admin/components/caregivers/caregiver-drawer";
import { PageHeader } from "@shared/page-header";
import { UserStatusBadge, VerificationBadge } from "@shared/status";
import { Card } from "@shared/ui/card";
import { Avatar, EmptyState, ErrorState, FilterTabs, Pagination, TableSkeleton } from "@shared/ui/misc";
import { Table, Td, Th, Tr } from "@shared/ui/table";
import { caregiversApi } from "@/features/admin/lib/api/admin";
import { keys } from "@/features/admin/lib/api/hooks";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import type { AdminCaregiver, VerificationStatus } from "@shared/types";

const STATUSES: VerificationStatus[] = ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"];

const LIMIT = 10;

export default function CaregiversPage() {
  const t = useTranslations("adminA.caregivers");
  const f = useFmt();
  const L = useLabels();
  const [status, setStatus] = useState<VerificationStatus>("PENDING");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AdminCaregiver | null>(null);

  const list = useQuery({
    queryKey: [...keys.caregivers, "list", status, page],
    queryFn: () => caregiversApi.list({ status, page, limit: LIMIT }),
  });

  const counts = useQueries({
    queries: STATUSES.map((s) => ({
      queryKey: [...keys.caregivers, "count", s],
      queryFn: () => caregiversApi.list({ status: s, limit: 1 }),
    })),
  });

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
          options={STATUSES.map((s, i) => ({ value: s, label: t(`statuses.${s}`), count: counts[i].data?.total }))}
        />
      </div>

      <Card>
        {list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : !list.data ? (
          <TableSkeleton />
        ) : list.data.items.length === 0 ? (
          <EmptyState
            icon={UserCheck}
            title={status === "PENDING" ? t("emptyPendingTitle") : t("emptyTitle")}
            description={status === "PENDING" ? t("emptyPendingText") : undefined}
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>{t("columns.caregiver")}</Th>
                  <Th className="hidden md:table-cell">{t("columns.specialty")}</Th>
                  <Th className="hidden lg:table-cell">{t("columns.license")}</Th>
                  <Th className="hidden sm:table-cell">{t("columns.documents")}</Th>
                  <Th className="hidden lg:table-cell">{t("columns.rate")}</Th>
                  <Th>{t("columns.status")}</Th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((c) => (
                  <Tr key={c.id} onClick={() => setSelected(c)}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar name={c.user.fullName} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink-900">{c.user.fullName || t("unnamed")}</p>
                          <p className="text-xs text-ink-500">
                            {t("registered", { cities: f.list(c.serviceArea.cities), when: f.relativeTime(c.createdAt) })}
                          </p>
                        </div>
                      </div>
                    </Td>
                    <Td className="hidden md:table-cell text-ink-700">{L.specialty(c.specialty)}</Td>
                    <Td className="hidden lg:table-cell">
                      <p className="tabular font-medium text-ink-800">{c.licenseNumber}</p>
                      <p className="text-xs text-ink-500">{L.licenseBodyShort(c.licenseBody)}</p>
                    </Td>
                    <Td className="hidden sm:table-cell">
                      {c.documents.length === 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-warning-700">
                          <FileWarning className="size-3.5" /> {t("noneUploaded")}
                        </span>
                      ) : (
                        <span className="text-ink-700">{t("fileCount", { count: c.documents.length })}</span>
                      )}
                    </Td>
                    <Td className="tabular hidden lg:table-cell text-ink-800">{f.money(c.ratePerVisit)}</Td>
                    <Td>
                      <div className="flex flex-col items-start gap-1">
                        <VerificationBadge status={c.verificationStatus} />
                        {c.user.status !== "ACTIVE" && <UserStatusBadge status={c.user.status} />}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={setPage} />
          </>
        )}
      </Card>

      {selected && <CaregiverDrawer caregiver={selected} onClose={() => setSelected(null)} onChange={setSelected} />}
    </>
  );
}
