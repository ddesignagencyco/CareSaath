"use client";

import { useMutation } from "@tanstack/react-query";
import { CalendarCheck2, CreditCard, Download, UserCheck, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { useApiErrorText } from "@shared/api/use-action";
import { PageHeader } from "@shared/page-header";
import { Button } from "@shared/ui/button";
import { Card } from "@shared/ui/card";
import { useToast } from "@shared/ui/toast";
import { analyticsApi } from "@/features/admin/lib/api/admin";
import type { ReportType } from "@shared/types";

const REPORTS: { type: ReportType; icon: React.ComponentType<{ className?: string }> }[] = [
  { type: "payments", icon: CreditCard },
  { type: "payouts", icon: Wallet },
  { type: "bookings", icon: CalendarCheck2 },
  { type: "caregivers", icon: UserCheck },
];

/** Save CSV text as a file. The BOM makes Excel read it as UTF-8 (Urdu names). */
function download(filename: string, csv: string) {
  const body = csv.startsWith("\uFEFF") ? csv : `\uFEFF${csv}`;
  const url = URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the browser has started the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ReportsPage() {
  const toast = useToast();
  const t = useTranslations("adminA.reports");
  const apiError = useApiErrorText();
  const exporter = useMutation({
    mutationFn: (type: ReportType) => analyticsApi.exportCsv(type),
    onSuccess: ({ filename, csv }, type) => {
      download(filename, csv);
      toast.success(t("downloaded", { title: t(`items.${type}.title`) }));
    },
    onError: (err) => toast.error(err instanceof Error ? apiError(err) : t("exportFailed")),
  });

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
      />
      <div className="grid gap-4 md:grid-cols-2">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          const busy = exporter.isPending && exporter.variables === r.type;
          return (
            <Card key={r.type} className="flex flex-col p-5">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon className="size-5" />
                </span>
                <div>
                  <h2 className="font-bold text-ink-900">{t(`items.${r.type}.title`)}</h2>
                  <p className="mt-0.5 text-sm text-ink-500">{t(`items.${r.type}.description`)}</p>
                </div>
              </div>
              <p className="mt-4 flex-1 text-xs text-ink-500">
                <span className="font-semibold text-ink-700">{t("columnsLabel")}</span> <span dir="ltr">{t(`items.${r.type}.columns`)}</span>
              </p>
              <div className="mt-4 flex justify-end">
                <Button variant="secondary" loading={busy} disabled={exporter.isPending && !busy} onClick={() => exporter.mutate(r.type)}>
                  {!busy && <Download className="size-4" />} {t("download")}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
