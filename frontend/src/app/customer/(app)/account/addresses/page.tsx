"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeft, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useAction } from "@shared/api/use-action";
import { PageHeader } from "@shared/page-header";
import { Button, IconButton } from "@shared/ui/button";
import { Card } from "@shared/ui/card";
import { ConfirmDialog } from "@shared/ui/confirm-dialog";
import { DataTable } from "@shared/ui/data-table";
import { EmptyState, ErrorState } from "@shared/ui/misc";
import type { Address } from "@shared/caregiver-types";
import { AddressForm, EditAddressForm } from "@/features/customer/components/forms";
import { addressesApi } from "@/features/customer/lib/api/customer";
import { keys } from "@/features/customer/lib/api/keys";

export default function AddressesPage() {
  const t = useTranslations("customerB.addresses");
  const addresses = useQuery({ queryKey: keys.addresses, queryFn: addressesApi.list });
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [removing, setRemoving] = useState<Address | null>(null);

  const remove = useAction(() => addressesApi.remove(removing!.id), {
    invalidate: [keys.addresses],
    success: t("removed"),
    onSuccess: () => setRemoving(null),
    onError: (err) => {
      // The API refuses (404) once an address is used by a booking.
      if (err.message.startsWith("Address is referenced by existing bookings")) err.message = t("hasBookings");
    },
  });

  const columns: ColumnDef<Address, unknown>[] = [
    {
      accessorKey: "label",
      header: t("columns.label"),
      accessorFn: (a) => a.label || a.city,
      cell: ({ row, getValue }) => (
        <div className="flex items-center gap-3">
          <MapPin className="size-4 shrink-0 text-brand-600" />
          <span className="font-semibold text-ink-900">{getValue() as string}</span>
        </div>
      ),
    },
    {
      id: "address",
      header: t("columns.address"),
      accessorFn: (a) => `${a.addressLine}, ${a.city}`,
      cell: ({ getValue }) => (
        <span dir="auto" className="text-ink-700">{getValue() as string}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      meta: { className: "w-0 text-end" },
      cell: ({ row }) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <IconButton label={t("editLabel")} onClick={() => setEditing(row.original.id)}>
            <Pencil className="size-4" />
          </IconButton>
          <IconButton label={t("removeLabel")} onClick={() => setRemoving(row.original)} className="hover:text-danger-600">
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      ),
    },
  ];

  return (
    <>
      <Link href="/customer/account" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900">
        <ArrowLeft className="rtl:-scale-x-100 size-4" /> {t("back")}
      </Link>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" /> {t("add")}
          </Button>
        }
      />
      {addresses.isError ? (
        <Card>
          <ErrorState error={addresses.error} onRetry={() => addresses.refetch()} />
        </Card>
      ) : addresses.data && addresses.data.length === 0 ? (
        <Card>
          <EmptyState icon={MapPin} title={t("emptyTitle")} description={t("emptyHint")} />
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={addresses.data ?? []}
          loading={!addresses.data}
          searchPlaceholder={t("searchPlaceholder")}
          emptyText={t("noResults")}
          onRowClick={(a) => setEditing(a.id)}
        />
      )}
      {editing === "new" && <AddressForm address={null} onClose={() => setEditing(null)} />}
      {editing && editing !== "new" && <EditAddressForm id={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => remove.mutate(undefined)}
        title={t("removeConfirmTitle")}
        description={t("removeConfirmBody")}
        confirmLabel={t("removeConfirm")}
        loading={remove.isPending}
      />
    </>
  );
}
