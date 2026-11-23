"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronRight, Eye, Zap } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { PageHeader } from "@shared/page-header";
import { VisitStatusBadge } from "@shared/status";
import { Badge, type Tone } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import { Card } from "@shared/ui/card";
import { DataTable } from "@shared/ui/data-table";
import { DatePicker } from "@shared/ui/date-picker";
import { ErrorState, FilterTabs } from "@shared/ui/misc";
import { UserAvatar } from "@shared/ui/user-avatar";
import { Select } from "@shared/ui/select";
import { adminBookingsApi } from "@/features/admin/lib/api/admin";
import { BookingDrawer } from "@/features/admin/components/bookings/booking-drawer";
import { VisitDrawer } from "@/features/admin/components/bookings/visit-drawer";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import type { AdminBookingListItem, AdminVisitListItem, BookingStatus, VisitStatus } from "@shared/types";

const LIMIT = 15;
const BOOKING_STATUSES: BookingStatus[] = ["REQUESTED", "CONFIRMED", "COMPLETED", "DECLINED", "CANCELLED"];
const VISIT_STATUSES: VisitStatus[] = ["REQUESTED", "CONFIRMED", "EN_ROUTE", "CHECKED_IN", "IN_PROGRESS", "CHECKED_OUT", "COMPLETED", "DECLINED", "CANCELLED"];
const BOOKING_TONE: Record<BookingStatus, Tone> = { REQUESTED: "neutral", CONFIRMED: "neutral", COMPLETED: "success", DECLINED: "danger", CANCELLED: "danger" };

function BookingsTab({ onSelectBooking }: { onSelectBooking: (id: string) => void }) {
  const t = useTranslations("adminB.operations");
  const f = useFmt();
  const L = useLabels();
  const [status, setStatus] = useState<BookingStatus | "ALL">("ALL");
  const [scope, setScope] = useState<"all" | "asap">("all");
  const [page, setPage] = useState(1);

  const list = useQuery({
    queryKey: ["admin-bookings", status, scope, page],
    queryFn: () => adminBookingsApi.listBookings({ page, limit: LIMIT, ...(status === "ALL" ? {} : { status }), ...(scope === "asap" ? { isImmediate: true } : {}) }),
  });

  const columns: ColumnDef<AdminBookingListItem, unknown>[] = [
    {
      id: "customer",
      header: t("columns.customer"),
      accessorFn: (b) => b.customer.fullName,
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <UserAvatar userId={row.original.customer.id} name={row.original.customer.fullName} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink-900">{row.original.customer.fullName}</p>
            <p className="text-xs text-ink-500">{t("forPatient", { name: row.original.patient.name })}</p>
          </div>
        </div>
      ),
    },
    {
      id: "caregiver",
      header: t("columns.caregiver"),
      meta: { className: "hidden md:table-cell" },
      accessorFn: (b) => b.caregiver.user.fullName,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate text-ink-800">{row.original.caregiver.user.fullName}</p>
          <p className="text-xs text-ink-500">{L.specialty(row.original.caregiver.specialty)}</p>
        </div>
      ),
    },
    {
      id: "schedule",
      header: t("columns.schedule"),
      meta: { className: "hidden sm:table-cell" },
      accessorFn: (b) => b.startDate,
      cell: ({ row }) => (
        <div>
          <p className="text-ink-700">{f.date(row.original.startDate)}</p>
          <p className="tabular text-xs text-ink-500">{f.timeWindow(row.original.timeWindowStart, row.original.timeWindowEnd)}</p>
        </div>
      ),
    },
    {
      id: "status",
      header: t("columns.status"),
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={BOOKING_TONE[row.original.status]} dot>
            {L.bookingCaregiver(row.original.status)}
          </Badge>
          {row.original.isImmediate && (
            <Badge tone="danger">
              <Zap className="size-3" /> {t("asap")}
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            onSelectBooking(row.original.id);
          }}
          className="text-xs"
        >
          <Eye className="size-3.5 mr-1" /> View
        </Button>
      ),
    },
  ];

  return list.isError ? (
    <Card>
      <ErrorState error={list.error} onRetry={() => list.refetch()} />
    </Card>
  ) : (
    <DataTable
      columns={columns}
      data={list.data?.items ?? []}
      loading={!list.data}
      emptyText={t("emptyBookings")}
      onRowClick={(row) => onSelectBooking(row.id)}
      serverPagination={list.data ? { page: list.data.page, limit: list.data.limit, total: list.data.total, onPageChange: setPage } : undefined}
      toolbar={() => (
        <div className="flex flex-wrap items-center gap-2">
          <Select<BookingStatus | "ALL">
            className="w-48"
            isSearchable={false}
            value={status}
            onChange={(v) => { if (v) { setStatus(v); setPage(1); } }}
            options={[{ value: "ALL", label: t("allStatuses") }, ...BOOKING_STATUSES.map((s) => ({ value: s, label: L.bookingCaregiver(s) }))]}
          />
          <Select<"all" | "asap">
            className="w-40"
            isSearchable={false}
            value={scope}
            onChange={(v) => { if (v) { setScope(v); setPage(1); } }}
            options={[
              { value: "all", label: t("allBookings") },
              { value: "asap", label: t("asapOnly") },
            ]}
          />
        </div>
      )}
    />
  );
}

function VisitsTab({ onSelectVisit }: { onSelectVisit: (id: string) => void }) {
  const t = useTranslations("adminB.operations");
  const f = useFmt();
  const L = useLabels();
  const [status, setStatus] = useState<VisitStatus | "ALL">("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const list = useQuery({
    queryKey: ["admin-visits", status, from, to, page],
    queryFn: () =>
      adminBookingsApi.listVisits({ page, limit: LIMIT, ...(status === "ALL" ? {} : { status }), ...(from ? { from } : {}), ...(to ? { to } : {}) }),
  });

  const columns: ColumnDef<AdminVisitListItem, unknown>[] = [
    {
      id: "customer",
      header: t("columns.customer"),
      accessorFn: (v) => v.booking.customer.fullName,
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <UserAvatar userId={row.original.booking.customer.id} name={row.original.booking.customer.fullName} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink-900">{row.original.booking.customer.fullName}</p>
            <p dir="auto" className="truncate text-xs text-ink-500">{row.original.booking.address.city}</p>
          </div>
        </div>
      ),
    },
    {
      id: "caregiver",
      header: t("columns.caregiver"),
      meta: { className: "hidden md:table-cell" },
      accessorFn: (v) => v.booking.caregiver.user.fullName,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate text-ink-800">{row.original.booking.caregiver.user.fullName}</p>
          <p className="text-xs text-ink-500">{L.specialty(row.original.booking.caregiver.specialty)}</p>
        </div>
      ),
    },
    {
      id: "scheduled",
      header: t("columns.scheduled"),
      meta: { className: "hidden sm:table-cell" },
      accessorFn: (v) => v.scheduledDate,
      cell: ({ row }) => (
        <div>
          <p className="text-ink-700">{f.date(row.original.scheduledDate)}</p>
          <p className="tabular text-xs text-ink-500">{f.timeWindow(row.original.timeWindowStart, row.original.timeWindowEnd)}</p>
        </div>
      ),
    },
    {
      id: "checkin",
      header: t("columns.checkIn"),
      meta: { className: "hidden lg:table-cell" },
      enableSorting: false,
      cell: ({ row }) => {
        const v = row.original;
        return (
          <div className="text-xs text-ink-600">
            {v.checkInAt ? <p>{t("checkedIn", { time: f.dateTime(v.checkInAt) })}</p> : <span className="text-ink-400">—</span>}
            {v.checkOutAt && <p>{t("checkedOut", { time: f.dateTime(v.checkOutAt) })}</p>}
          </div>
        );
      },
    },
    {
      id: "status",
      header: t("columns.status"),
      enableSorting: false,
      cell: ({ row }) => <VisitStatusBadge status={row.original.status} />,
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            onSelectVisit(row.original.id);
          }}
          className="text-xs"
        >
          <Eye className="size-3.5 mr-1" /> View
        </Button>
      ),
    },
  ];

  return list.isError ? (
    <Card>
      <ErrorState error={list.error} onRetry={() => list.refetch()} />
    </Card>
  ) : (
    <DataTable
      columns={columns}
      data={list.data?.items ?? []}
      loading={!list.data}
      emptyText={t("emptyVisits")}
      onRowClick={(row) => onSelectVisit(row.id)}
      serverPagination={list.data ? { page: list.data.page, limit: list.data.limit, total: list.data.total, onPageChange: setPage } : undefined}
      toolbar={() => (
        <div className="flex flex-wrap items-center gap-2">
          <Select<VisitStatus | "ALL">
            className="w-44"
            isSearchable={false}
            value={status}
            onChange={(v) => { if (v) { setStatus(v); setPage(1); } }}
            options={[{ value: "ALL", label: t("allStatuses") }, ...VISIT_STATUSES.map((s) => ({ value: s, label: L.visitAdmin(s) }))]}
          />
          <DatePicker aria-label={t("from")} placeholder={t("from")} value={from} onChange={(v) => { setFrom(v); setPage(1); }} className="w-40" />
          <DatePicker aria-label={t("to")} placeholder={t("to")} value={to} onChange={(v) => { setTo(v); setPage(1); }} className="w-40" />
        </div>
      )}
    />
  );
}

/** Admin read-only browser for every booking and visit across the platform. */
export default function AdminBookingsPage() {
  const t = useTranslations("adminB.operations");
  const searchParams = useSearchParams();
  const initialBookingId = searchParams?.get("bookingId") ?? searchParams?.get("id");
  const initialVisitId = searchParams?.get("visitId");

  const [tab, setTab] = useState<"bookings" | "visits">(initialVisitId ? "visits" : "bookings");
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(initialBookingId ?? null);
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(initialVisitId ?? null);

  useEffect(() => {
    if (initialVisitId) {
      setSelectedVisitId(initialVisitId);
      setTab("visits");
    } else if (initialBookingId) {
      setSelectedBookingId(initialBookingId);
      setTab("bookings");
    }
  }, [initialBookingId, initialVisitId]);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="mb-4">
        <FilterTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "bookings", label: t("tabs.bookings") },
            { value: "visits", label: t("tabs.visits") },
          ]}
        />
      </div>

      {tab === "bookings" ? (
        <BookingsTab onSelectBooking={(id) => setSelectedBookingId(id)} />
      ) : (
        <VisitsTab onSelectVisit={(id) => setSelectedVisitId(id)} />
      )}

      {selectedBookingId && (
        <BookingDrawer
          bookingId={selectedBookingId}
          onClose={() => setSelectedBookingId(null)}
          onSelectVisit={(visitId) => {
            setSelectedBookingId(null);
            setSelectedVisitId(visitId);
          }}
        />
      )}

      {selectedVisitId && (
        <VisitDrawer
          visitId={selectedVisitId}
          onClose={() => setSelectedVisitId(null)}
          onSelectBooking={(bookingId) => {
            setSelectedVisitId(null);
            setSelectedBookingId(bookingId);
          }}
        />
      )}
    </>
  );
}
