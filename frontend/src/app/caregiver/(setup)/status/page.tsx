"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Ban, Check, Clock3, FileSearch, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button } from "@shared/ui/button";
import { Card, CardBody, CardHeader } from "@shared/ui/card";
import { DetailList, ErrorState, Skeleton } from "@shared/ui/misc";
import { formatMoney } from "@shared/lib/format";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import type { MyCaregiverProfile } from "@shared/caregiver-types";
import { DocumentList, DocumentUploader } from "@/features/caregiver/components/documents-panel";
import { profileApi } from "@/features/caregiver/lib/api/caregiver";
import { keys } from "@/features/caregiver/lib/api/keys";

function Timeline({ profile }: { profile: MyCaregiverProfile }) {
  const t = useTranslations("caregiverB.status.timeline");
  const f = useFmt();
  const hasDocs = profile.documents.length > 0;
  const steps = [
    { label: t("created"), detail: f.date(profile.createdAt), done: true },
    { label: t("uploaded"), detail: hasDocs ? t("files", { count: profile.documents.length }) : t("uploadBelow"), done: hasDocs },
    { label: t("licenseCheck"), detail: t("licenseCheckDetail"), done: false, current: hasDocs },
    { label: t("live"), detail: t("liveDetail"), done: false },
  ];
  return (
    <ol>
      {steps.map((s, i) => (
        <li key={s.label} className="flex gap-3">
          <span className="flex flex-col items-center">
            <span
              className={clsx(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                s.done ? "bg-brand-600 text-white" : s.current ? "bg-accent-500 text-white ring-4 ring-accent-100" : "bg-ink-100 text-ink-400",
              )}
            >
              {s.done ? <Check className="size-4" /> : s.current ? <Clock3 className="size-4" /> : i + 1}
            </span>
            {i < steps.length - 1 && <span className={clsx("my-1 w-0.5 flex-1 rounded-full", s.done ? "bg-brand-300" : "bg-ink-100")} />}
          </span>
          <span className={clsx(i < steps.length - 1 && "pb-6")}>
            <span className={clsx("block text-sm font-bold", s.done || s.current ? "text-ink-900" : "text-ink-400")}>{s.label}</span>
            <span className="block text-xs text-ink-500">{s.detail}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function StatusPage() {
  const t = useTranslations("caregiverB.status");
  const f = useFmt();
  const L = useLabels();
  const client = useQueryClient();
  // Caregivers aren't notified of decisions by the API, so poll.
  const profile = useQuery({ queryKey: keys.profile, queryFn: profileApi.get, refetchInterval: 60_000 });
  const p = profile.data;
  const status = p?.verificationStatus;

  // Once approved, refresh /me so the setup layout sends them into the app.
  useEffect(() => {
    if (status === "APPROVED") client.invalidateQueries({ queryKey: keys.me });
  }, [status, client]);

  if (profile.isError) {
    return (
      <Card>
        <ErrorState error={profile.error} onRetry={() => profile.refetch()} />
      </Card>
    );
  }
  if (!p) return <Skeleton className="h-96 rounded-2xl" />;

  const rejection = p.credentialReviews.find((r) => r.decision === "REJECTED");

  const hero =
    status === "REJECTED"
      ? {
          icon: XCircle,
          tone: "bg-danger-50 text-danger-700 ring-danger-600/20",
          title: t("rejected.title"),
          text: t("rejected.text"),
        }
      : status === "SUSPENDED"
        ? {
            icon: Ban,
            tone: "bg-ink-100 text-ink-700 ring-ink-200",
            title: t("suspended.title"),
            text: t("suspended.text"),
          }
        : {
            icon: FileSearch,
            tone: "bg-accent-50 text-accent-700 ring-accent-400/30",
            title: p.documents.length ? t("reviewing.title") : t("needDocs.title"),
            text: p.documents.length ? t("reviewing.text") : t("needDocs.text"),
          };
  const Icon = hero.icon;

  return (
    <div className="space-y-5">
      <div className={clsx("flex gap-4 rounded-2xl p-5 ring-1", hero.tone)}>
        <Icon className="mt-0.5 size-6 shrink-0" />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-extrabold">{hero.title}</h1>
          <p dir="auto" className="mt-1 text-sm opacity-90">{hero.text}</p>
          {status === "REJECTED" && rejection?.reason && (
            <p className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-sm text-ink-800">
              <span className="font-semibold">{t("reason")}</span> {rejection.reason}
              <span className="block text-xs text-ink-500">{f.dateTime(rejection.decidedAt)}</span>
            </p>
          )}
          {status === "SUSPENDED" && !!p.strikeCount && (
            <p className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-sm font-semibold text-ink-800">{t("suspended.strikes", { count: p.strikeCount })}</p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => profile.refetch()} loading={profile.isFetching} aria-label={t("checkStatus")} className="shrink-0">
          {!profile.isFetching && <RefreshCw className="size-4" />}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_1.2fr] md:items-start">
        {status === "PENDING" ? (
          <Card>
            <CardHeader title={t("progress")} />
            <CardBody>
              <Timeline profile={p} />
            </CardBody>
          </Card>
        ) : (
          <Card>
            <CardHeader title={t("details.title")} />
            <CardBody>
              <DetailList
                items={[
                  { label: t("details.specialty"), value: L.specialty(p.specialty) },
                  {
                    label: t("details.license"),
                    value: (
                      <>
                        <span dir="ltr">{p.licenseNumber}</span> · {L.licenseBody(p.licenseBody)}
                      </>
                    ),
                  },
                  { label: t("details.rate"), value: formatMoney(p.ratePerVisit) },
                  { label: t("details.cities"), value: f.list(p.serviceArea.cities) },
                ]}
              />
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader title={t("documents")} />
          <CardBody className="space-y-5">
            <DocumentList documents={p.documents} />
            {status !== "SUSPENDED" && (
              <div className="border-t border-ink-100 pt-5">
                <DocumentUploader key={p.documents.length} defaultType={p.documents.some((d) => d.type === "LICENSE") ? "CNIC_COPY" : "LICENSE"} compact />
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {status === "PENDING" && (
        <p className="flex items-center justify-center gap-2 text-center text-xs text-ink-500">
          <ShieldCheck className="size-4" /> {t("footer")}
        </p>
      )}
    </div>
  );
}
