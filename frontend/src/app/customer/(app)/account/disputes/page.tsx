"use client";

import { ArrowLeft, Scale } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { PageHeader } from "@shared/page-header";
import { Card, CardBody } from "@shared/ui/card";
import { EmptyState, ErrorState, Skeleton } from "@shared/ui/misc";
import { DisputeItems, useMyDisputes } from "@/features/customer/components/visit-panels";
import { useMe } from "@/features/customer/lib/auth";

/** GET /disputes: everything raised by or against this customer. */
export default function DisputesPage() {
  const t = useTranslations("customerB.disputes");
  const me = useMe();
  const disputes = useMyDisputes();
  return (
    <>
      <Link href="/customer/account" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900">
        <ArrowLeft className="rtl:-scale-x-100 size-4" /> {t("back")}
      </Link>
      <PageHeader title={t("title")} description={t("description")} />
      <Card>
        {disputes.isError ? (
          <ErrorState error={disputes.error} onRetry={() => disputes.refetch()} />
        ) : !disputes.data ? (
          <CardBody>
            <Skeleton className="h-32" />
          </CardBody>
        ) : disputes.data.length === 0 ? (
          <EmptyState icon={Scale} title={t("emptyTitle")} description={t("emptyHint")} />
        ) : (
          <CardBody>
            <DisputeItems disputes={disputes.data} userId={me.data?.id} linkVisits />
          </CardBody>
        )}
      </Card>
    </>
  );
}
