"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, HeartPulse, Pencil, Plus, Trash2, Users } from "lucide-react";
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
import { Avatar, EmptyState, ErrorState, Skeleton } from "@shared/ui/misc";
import type { PatientProfile } from "@shared/caregiver-types";
import { EditPatientForm, PatientForm } from "@/features/customer/components/forms";
import { patientsApi } from "@/features/customer/lib/api/customer";
import { keys } from "@/features/customer/lib/api/keys";
import { isUnreadableMedical } from "@/features/customer/lib/labels";

function PatientCard({ p, onEdit }: { p: PatientProfile; onEdit: () => void }) {
  const t = useTranslations("customerB.patients");
  const f = useFmt();
  const L = useLabels();
  const now = useNow(60_000);
  const [confirming, setConfirming] = useState(false);
  const remove = useAction(() => patientsApi.remove(p.id), {
    invalidate: [keys.patients],
    success: t("removed", { name: p.name }),
    onError: (err) => {
      // The API refuses (404) once a patient has bookings, to keep records for audit.
      if (err.message.startsWith("Patient has bookings")) err.message = t("hasBookings", { name: p.name });
    },
  });
  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-start gap-3">
        <Avatar name={p.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-ink-900">{p.name}</p>
          <p className="text-sm text-ink-500">{L.patientLine(p, f.age(p.dateOfBirth, now))}</p>
        </div>
        <IconButton label={t("editLabel", { name: p.name })} onClick={onEdit}>
          <Pencil className="size-4" />
        </IconButton>
        <IconButton label={t("removeLabel", { name: p.name })} onClick={() => setConfirming(true)} disabled={remove.isPending} className="hover:text-danger-600">
          <Trash2 className="size-4" />
        </IconButton>
        <ConfirmDialog
          open={confirming}
          onClose={() => setConfirming(false)}
          onConfirm={() => remove.mutate(undefined)}
          title={t("removeConfirmTitle", { name: p.name })}
          description={t("removeConfirmBody")}
          confirmLabel={t("removeConfirm")}
          loading={remove.isPending}
        />
      </div>
      <div className="mt-4 flex-1 rounded-xl bg-brand-50/60 p-3">
        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-brand-800 uppercase">
          <HeartPulse className="size-3.5" /> {t("medical")}
        </p>
        {isUnreadableMedical(p.medicalContext) ? (
          <p className="text-sm text-ink-500 italic">{t("medicalUnavailable")}</p>
        ) : (
          <p dir="auto" className="text-sm text-ink-700">{p.medicalContext || t("notAdded")}</p>
        )}
      </div>
    </Card>
  );
}

export default function PatientsPage() {
  const t = useTranslations("customerB.patients");
  const patients = useQuery({ queryKey: keys.patients, queryFn: patientsApi.list });
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
      {patients.isError ? (
        <Card>
          <ErrorState error={patients.error} onRetry={() => patients.refetch()} />
        </Card>
      ) : !patients.data ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : patients.data.length === 0 ? (
        <Card>
          <EmptyState icon={Users} title={t("emptyTitle")} description={t("emptyHint")} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {patients.data.map((p) => (
            <PatientCard key={p.id} p={p} onEdit={() => setEditing(p.id)} />
          ))}
        </div>
      )}
      {editing === "new" && <PatientForm patient={null} onClose={() => setEditing(null)} />}
      {editing && editing !== "new" && <EditPatientForm id={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
