"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useAction } from "@shared/api/use-action";
import { PageHeader } from "@shared/page-header";
import { Button, IconButton } from "@shared/ui/button";
import { Card } from "@shared/ui/card";
import { ConfirmDialog } from "@shared/ui/confirm-dialog";
import { LocationMap } from "@shared/ui/location-map";
import { EmptyState, ErrorState, Skeleton } from "@shared/ui/misc";
import type { Address } from "@shared/caregiver-types";
import { AddressForm, EditAddressForm } from "@/features/customer/components/forms";
import { addressesApi } from "@/features/customer/lib/api/customer";
import { keys } from "@/features/customer/lib/api/keys";

function AddressCard({ a, onEdit }: { a: Address; onEdit: () => void }) {
  const t = useTranslations("customerB.addresses");
  const [confirming, setConfirming] = useState(false);
  const remove = useAction(() => addressesApi.remove(a.id), {
    invalidate: [keys.addresses],
    success: t("removed"),
    onError: (err) => {
      // The API refuses (404) once an address is used by a booking.
      if (err.message.startsWith("Address is referenced by existing bookings")) err.message = t("hasBookings");
    },
  });
  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <LocationMap lat={a.latitude} lng={a.longitude} label={a.addressLine} className="rounded-none border-0 border-b" />
      <div className="flex flex-1 items-start gap-3 p-4">
        <MapPin className="mt-0.5 size-4 shrink-0 text-brand-600" />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-ink-900">{a.label || a.city}</p>
          <p dir="auto" className="text-sm text-ink-600">
            {a.addressLine}, {a.city}
          </p>
        </div>
        <IconButton label={t("editLabel")} onClick={onEdit}>
          <Pencil className="size-4" />
        </IconButton>
        <IconButton label={t("removeLabel")} onClick={() => setConfirming(true)} disabled={remove.isPending} className="hover:text-danger-600">
          <Trash2 className="size-4" />
        </IconButton>
        <ConfirmDialog
          open={confirming}
          onClose={() => setConfirming(false)}
          onConfirm={() => remove.mutate(undefined)}
          title={t("removeConfirmTitle")}
          description={t("removeConfirmBody")}
          confirmLabel={t("removeConfirm")}
          loading={remove.isPending}
        />
      </div>
    </Card>
  );
}

export default function AddressesPage() {
  const t = useTranslations("customerB.addresses");
  const addresses = useQuery({ queryKey: keys.addresses, queryFn: addressesApi.list });
  const [editing, setEditing] = useState<string | "new" | null>(null);
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
      ) : !addresses.data ? (
        <Skeleton className="h-56 rounded-2xl" />
      ) : addresses.data.length === 0 ? (
        <Card>
          <EmptyState icon={MapPin} title={t("emptyTitle")} description={t("emptyHint")} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {addresses.data.map((a) => (
            <AddressCard key={a.id} a={a} onEdit={() => setEditing(a.id)} />
          ))}
        </div>
      )}
      {editing === "new" && <AddressForm address={null} onClose={() => setEditing(null)} />}
      {editing && editing !== "new" && <EditAddressForm id={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
