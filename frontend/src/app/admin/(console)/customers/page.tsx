"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarDays, Mail, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PageHeader } from "@shared/page-header";
import { ReasonDialog } from "@shared/reason-dialog";
import { UserStatusBadge } from "@shared/status";
import { Badge } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import { Card } from "@shared/ui/card";
import { DataTable } from "@shared/ui/data-table";
import { Input } from "@shared/ui/field";
import { Avatar, ErrorState, Skeleton } from "@shared/ui/misc";
import { Drawer } from "@shared/ui/overlay";
import { customersApi } from "@/features/admin/lib/api/admin";
import { useAction } from "@/features/admin/lib/api/hooks";
import { useDebouncedValue } from "@shared/hooks/use-debounced-value";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import type { AdminCustomer } from "@shared/types";

const LIMIT = 15;
const KEY = ["admin-customers"] as const;

function CustomerDrawer({ customer, onClose }: { customer: AdminCustomer; onClose: () => void }) {
  const t = useTranslations("adminB.customers");
  const f = useFmt();
  const L = useLabels();
  const [confirming, setConfirming] = useState(false);

  const detail = useQuery({ queryKey: [...KEY, "detail", customer.id], queryFn: () => customersApi.get(customer.id) });
  const c = detail.data ?? customer;
  const isActive = c.status === "ACTIVE";

  const deactivate = useAction((reason: string) => customersApi.deactivate(customer.id, reason || undefined), {
    invalidate: [KEY],
    success: t("toast.deactivated", { name: customer.fullName }),
    onSuccess: () => setConfirming(false),
  });
  const reactivate = useAction(() => customersApi.reactivate(customer.id), {
    invalidate: [KEY],
    success: t("toast.reactivated", { name: customer.fullName }),
  });

  return (
    <Drawer
      open
      onClose={onClose}
      title={customer.fullName}
      subtitle={<UserStatusBadge status={c.status} />}
      footer={
        isActive ? (
          <Button variant="danger" className="w-full" onClick={() => setConfirming(true)}>
            {t("actions.deactivate")}
          </Button>
        ) : (
          <Button variant="success" className="w-full" loading={reactivate.isPending} onClick={() => reactivate.mutate(undefined)}>
            {t("actions.reactivate")}
          </Button>
        )
      }
    >
      <dl className="space-y-3 text-sm">
        <div className="flex items-center gap-2.5 text-ink-700">
          <Phone className="size-4 text-ink-400" />
          <dd dir="ltr" className="tabular">{c.phone}</dd>
        </div>
        <div className="flex items-center gap-2.5 text-ink-700">
          <Mail className="size-4 text-ink-400" />
          <dd dir="ltr">{c.email || <span className="text-ink-400">{t("noEmail")}</span>}</dd>
        </div>
        <div className="flex items-center gap-2.5 text-ink-700">
          <CalendarDays className="size-4 text-ink-400" />
          <dd>{t("joinedOn", { date: f.date(c.createdAt) })}</dd>
        </div>
        <div className="text-xs text-ink-500">
          {c.lastLoginAt ? t("lastLogin", { when: f.relativeTime(c.lastLoginAt) }) : t("neverLoggedIn")}
        </div>
      </dl>

      <div className="mt-6">
        <p className="mb-2 text-xs font-bold tracking-wide text-ink-500 uppercase">
          {detail.data ? t("bookingsCount", { count: detail.data.bookingsTotal }) : t("recentBookings")}
        </p>
        {!detail.data ? (
          <div className="space-y-2">
            <Skeleton className="h-12 rounded-lg" />
            <Skeleton className="h-12 rounded-lg" />
          </div>
        ) : detail.data.recentBookings.length === 0 ? (
          <p className="text-sm text-ink-500">{t("noBookings")}</p>
        ) : (
          <ul className="space-y-2">
            {detail.data.recentBookings.map((b) => (
              <li key={b.id} className="rounded-lg border border-ink-100 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-ink-800">{L.specialty(b.serviceType)}</span>
                  <Badge tone={b.status === "COMPLETED" ? "success" : b.status === "CANCELLED" || b.status === "DECLINED" ? "danger" : "info"} dot>
                    {L.bookingCaregiver(b.status)}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-ink-500">
                  {f.date(b.startDate)} · {b.caregiver.user.fullName}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ReasonDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t("deactivateTitle", { name: customer.fullName })}
        description={t("deactivateDesc")}
        placeholder={t("deactivatePlaceholder")}
        confirmLabel={t("actions.deactivate")}
        confirmVariant="danger"
        loading={deactivate.isPending}
        onConfirm={(reason) => deactivate.mutate(reason)}
      />
    </Drawer>
  );
}

/** Admin customer directory: search, view a booking summary, and deactivate/reactivate accounts. */
export default function CustomersPage() {
  const t = useTranslations("adminB.customers");
  const f = useFmt();
  const [qInput, setQInput] = useState("");
  const q = useDebouncedValue(qInput.trim());
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AdminCustomer | null>(null);

  const list = useQuery({
    queryKey: [...KEY, "list", q, page],
    queryFn: () => customersApi.list({ page, limit: LIMIT, ...(q ? { q } : {}) }),
  });

  const columns: ColumnDef<AdminCustomer, unknown>[] = [
    {
      id: "customer",
      header: t("columns.customer"),
      accessorFn: (c) => c.fullName,
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <Avatar name={row.original.fullName} size="sm" />
          <p className="truncate font-semibold text-ink-900">{row.original.fullName}</p>
        </div>
      ),
    },
    {
      id: "contact",
      header: t("columns.contact"),
      meta: { className: "hidden sm:table-cell" },
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-sm">
          <p dir="ltr" className="tabular text-ink-700">{row.original.phone}</p>
          {row.original.email && <p dir="ltr" className="truncate text-xs text-ink-500">{row.original.email}</p>}
        </div>
      ),
    },
    {
      id: "joined",
      header: t("columns.joined"),
      meta: { className: "hidden md:table-cell" },
      accessorFn: (c) => c.createdAt,
      cell: ({ row }) => <span className="text-ink-700">{f.date(row.original.createdAt)}</span>,
    },
    {
      id: "status",
      header: t("columns.status"),
      enableSorting: false,
      cell: ({ row }) => <UserStatusBadge status={row.original.status} />,
    },
  ];

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
          onRowClick={(c) => setSelected(c)}
          serverPagination={list.data ? { page: list.data.page, limit: list.data.limit, total: list.data.total, onPageChange: setPage } : undefined}
          toolbar={() => (
            <div className="min-w-0 flex-1 sm:max-w-xs">
              <Input value={qInput} onChange={(e) => { setQInput(e.target.value); setPage(1); }} placeholder={t("searchPlaceholder")} />
            </div>
          )}
        />
      )}
      {selected && <CustomerDrawer key={selected.id} customer={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
