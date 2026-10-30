"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeft, Pencil, Plus, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useAction } from "@shared/api/use-action";
import { useNow } from "@shared/hooks/use-now";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import { PageHeader } from "@shared/page-header";
import { Button, IconButton } from "@shared/ui/button";
import { Card } from "@shared/ui/card";
import { ConfirmDialog } from "@shared/ui/confirm-dialog";
import { DataTable } from "@shared/ui/data-table";
import { Avatar, EmptyState, ErrorState } from "@shared/ui/misc";
import { Select } from "@shared/ui/select";
import type { PatientProfile, PatientRelation } from "@shared/caregiver-types";
import { EditPatientForm, PatientForm } from "@/features/customer/components/forms";
import { patientsApi } from "@/features/customer/lib/api/customer";
import { keys } from "@/features/customer/lib/api/keys";
import { isUnreadableMedical } from "@/features/customer/lib/labels";

export default function PatientsPage() {
  const t = useTranslations("customerB.patients");
  const f = useFmt();
  const L = useLabels();
  const now = useNow(60_000);
  const patients = useQuery({ queryKey: keys.patients, queryFn: patientsApi.list });
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [removing, setRemoving] = useState<PatientProfile | null>(null);

  const remove = useAction(() => patientsApi.remove(removing!.id), {
    invalidate: [keys.patients],
    success: removing ? t("removed", { name: removing.name }) : "",
    onSuccess: () => setRemoving(null),
    onError: (err) => {
      // The API refuses (404) once a patient has bookings, to keep records for audit.
      if (removing && err.message.startsWith("Patient has bookings")) err.message = t("hasBookings", { name: removing.name });
    },
  });

  const columns: ColumnDef<PatientProfile, unknown>[] = [
    {
      accessorKey: "name",
      header: t("columns.name"),
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <Avatar name={row.original.name} size="sm" />
          <span className="font-semibold text-ink-900">{row.original.name}</span>
        </div>
      ),
    },
    {
      accessorKey: "relationship",
      header: t("columns.relationship"),
      filterFn: "equalsString",
      cell: ({ row }) => <span className="text-ink-700">{L.relation(row.original.relationship)}</span>,
    },
    {
      id: "age",
      header: t("columns.age"),
      accessorFn: (p) => f.age(p.dateOfBirth, now) ?? "",
      cell: ({ getValue }) => <span className="text-ink-700">{(getValue() as string) || "—"}</span>,
    },
    {
      id: "medical",
      header: t("columns.medical"),
      enableSorting: false,
      cell: ({ row }) =>
        isUnreadableMedical(row.original.medicalContext) ? (
          <span className="text-ink-400 italic">{t("medicalUnavailable")}</span>
        ) : (
          <span dir="auto" className="line-clamp-1 text-ink-600">{row.original.medicalContext || t("notAdded")}</span>
        ),
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <IconButton label={t("editLabel", { name: row.original.name })} onClick={() => setEditing(row.original.id)}>
            <Pencil className="size-4" />
          </IconButton>
          <IconButton label={t("removeLabel", { name: row.original.name })} onClick={() => setRemoving(row.original)} className="hover:text-danger-600">
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      ),
    },
  ];

  const RELATIONS: PatientRelation[] = ["SELF", "FAMILY_MEMBER"];

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
      {patients.isError ? (
        <Card>
          <ErrorState error={patients.error} onRetry={() => patients.refetch()} />
        </Card>
      ) : patients.data && patients.data.length === 0 ? (
        <Card>
          <EmptyState icon={Users} title={t("emptyTitle")} description={t("emptyHint")} />
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={patients.data ?? []}
          loading={!patients.data}
          searchPlaceholder={t("searchPlaceholder")}
          emptyText={t("noResults")}
          onRowClick={(p) => setEditing(p.id)}
          toolbar={(table) => {
            const col = table.getColumn("relationship");
            const val = (col?.getFilterValue() as string) ?? "ALL";
            return (
              <Select<string>
                className="w-48"
                value={val}
                onChange={(v) => col?.setFilterValue(!v || v === "ALL" ? undefined : v)}
                isSearchable={false}
                options={[{ value: "ALL", label: t("filterAll") }, ...RELATIONS.map((r) => ({ value: r, label: L.relation(r) }))]}
              />
            );
          }}
        />
      )}
      {editing === "new" && <PatientForm patient={null} onClose={() => setEditing(null)} />}
      {editing && editing !== "new" && <EditPatientForm id={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => remove.mutate(undefined)}
        title={removing ? t("removeConfirmTitle", { name: removing.name }) : ""}
        description={t("removeConfirmBody")}
        confirmLabel={t("removeConfirm")}
        loading={remove.isPending}
      />
    </>
  );
}
