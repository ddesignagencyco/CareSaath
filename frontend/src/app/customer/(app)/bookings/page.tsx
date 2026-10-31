"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useTranslations } from "next-intl";
import { CalendarCheck2, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useNow } from "@shared/hooks/use-now";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import { PageHeader } from "@shared/page-header";
import { Badge } from "@shared/ui/badge";
import { Card } from "@shared/ui/card";
import { DataTable } from "@shared/ui/data-table";
import { Input } from "@shared/ui/field";
import { Avatar, EmptyState, ErrorState } from "@shared/ui/misc";
import { Select } from "@shared/ui/select";
import type { CustomerBookingListItem } from "@shared/customer-types";
import { useCaregiverMap } from "@/features/customer/components/caregiver-bits";
import { bookingsApi, patientsApi, paymentsApi } from "@/features/customer/lib/api/customer";
import { keys } from "@/features/customer/lib/api/keys";
import { BOOKING_TONE, bookingDisplayStatus } from "@/features/customer/lib/labels";

type Group = "active" | "waiting" | "past" | "all";
const LIMIT = 15;

export default function BookingsPage() {
  const t = useTranslations("customerB.bookings");
  const tc = useTranslations("customerB.bookingCard");
  const router = useRouter();
  const f = useFmt();
  const L = useLabels();
  const now = useNow(60_000);
  const [group, setGroup] = useState<Group>("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  // Grouping (active/waiting/past) and search are server-side now — the API filters by the
  // group's visit-completion rule and returns `derivedStatus` per item.
  const list = useQuery({
    queryKey: [...keys.bookings, "list", group, q, page],
    queryFn: () => bookingsApi.list({ page, limit: LIMIT, ...(group === "all" ? {} : { group }), ...(q.trim() ? { q: q.trim() } : {}) }),
    refetchInterval: 30_000,
  });
  const patients = useQuery({ queryKey: keys.patients, queryFn: patientsApi.list });
  const payments = useQuery({ queryKey: [...keys.payments, "list"], queryFn: () => paymentsApi.list({ limit: 100 }) });
  const data = list.data?.items ?? [];
  const caregivers = useCaregiverMap(data.map((b) => b.caregiverId));

  const paidVisitIds = new Set((payments.data?.items ?? []).filter((p) => p.status === "PAID").map((p) => p.visitId));
  const hasPaymentDue = (b: CustomerBookingListItem) => b.visits.some((v) => (v.status === "COMPLETED" || v.status === "CHECKED_OUT") && !paidVisitIds.has(v.id));

  const columns: ColumnDef<CustomerBookingListItem, unknown>[] = [
    {
      id: "caregiver",
      header: t("columns.caregiver"),
      accessorFn: (b) => caregivers[b.caregiverId]?.user.fullName ?? tc("caregiverFallback"),
      cell: ({ row, getValue }) => (
        <div className="flex items-center gap-3">
          <Avatar name={getValue() as string} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink-900">{getValue() as string}</p>
            <p className="truncate text-xs text-ink-500 sm:hidden">{L.specialty(row.original.serviceType)}</p>
          </div>
        </div>
      ),
    },
    {
      id: "for",
      header: t("columns.for"),
      meta: { className: "hidden sm:table-cell" },
      accessorFn: (b) => patients.data?.find((p) => p.id === b.patientId)?.name ?? tc("patientFallback"),
      cell: ({ row, getValue }) => (
        <div>
          <p dir="auto" className="text-ink-800">{getValue() as string}</p>
          <p className="text-xs text-ink-500">{L.specialty(row.original.serviceType)}</p>
        </div>
      ),
    },
    {
      id: "schedule",
      header: t("columns.schedule"),
      meta: { className: "hidden md:table-cell" },
      accessorFn: (b) => b.startDate,
      cell: ({ row }) => {
        const b = row.original;
        return (
          <div className="text-ink-700">
            <span>{b.recurrenceRule ? f.weekdays(b.recurrenceRule.weekdays) : f.relativeDay(b.startDate, now)}</span>
            <span className="tabular block text-xs text-ink-500">{f.timeWindow(b.timeWindowStart, b.timeWindowEnd)}</span>
          </div>
        );
      },
    },
    {
      id: "status",
      header: t("columns.status"),
      accessorFn: (b) => bookingDisplayStatus(b),
      cell: ({ row }) => (
        <div className="flex flex-col items-start gap-1">
          <Badge tone={BOOKING_TONE[bookingDisplayStatus(row.original)]} dot>
            {L.bookingCustomer(bookingDisplayStatus(row.original))}
          </Badge>
          {hasPaymentDue(row.original) && <Badge tone="danger">{tc("paymentDue")}</Badge>}
        </div>
      ),
    },
    {
      id: "chevron",
      header: "",
      enableSorting: false,
      meta: { className: "w-0 text-end" },
      cell: () => <ChevronRight className="rtl:-scale-x-100 inline size-4 text-ink-300" />,
    },
  ];

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      {list.isError ? (
        <Card>
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        </Card>
      ) : list.data && data.length === 0 && group === "all" && !q.trim() ? (
        <Card>
          <EmptyState icon={CalendarCheck2} title={t("emptyActive")} description={t("emptyHint")} />
          <div className="-mt-8 pb-8 text-center">
            <Link href="/customer/caregivers" className="text-sm font-semibold text-brand-700 hover:underline">
              {t("findCare")}
            </Link>
          </div>
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={data}
          loading={!list.data || !now}
          emptyText={t("noResults")}
          onRowClick={(b) => router.push(`/customer/bookings/${b.id}`)}
          serverPagination={list.data ? { page: list.data.page, limit: list.data.limit, total: list.data.total, onPageChange: setPage } : undefined}
          toolbar={() => (
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <Input
                className="w-full sm:w-56"
                placeholder={t("searchPlaceholder")}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
              <Select<Group>
                className="w-40"
                value={group}
                onChange={(v) => {
                  if (v) {
                    setGroup(v);
                    setPage(1);
                  }
                }}
                isSearchable={false}
                options={[
                  { value: "all", label: t("allGroups") },
                  { value: "active", label: t("tabActive") },
                  { value: "waiting", label: t("tabWaiting") },
                  { value: "past", label: t("tabPast") },
                ]}
              />
            </div>
          )}
        />
      )}
    </>
  );
}
