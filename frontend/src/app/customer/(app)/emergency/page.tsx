"use client";

import { useQuery } from "@tanstack/react-query";
import { MapPin, MapPinned, SearchX, TriangleAlert, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PageHeader } from "@shared/page-header";
import { Button } from "@shared/ui/button";
import { Card } from "@shared/ui/card";
import { Field } from "@shared/ui/field";
import { Avatar, EmptyState, ErrorState, FilterTabs, Skeleton } from "@shared/ui/misc";
import { Select } from "@shared/ui/select";
import { formatMoney } from "@shared/lib/format";
import { useLabels } from "@shared/i18n/use-labels";
import type { Specialty } from "@shared/types";
import type { NearbyCaregiver } from "@shared/customer-types";
import { Rating, TierBadge, VerifiedTag } from "@/features/customer/components/caregiver-bits";
import { addressesApi, caregiversApi } from "@/features/customer/lib/api/customer";
import { keys } from "@/features/customer/lib/api/keys";

const SPECIALTIES: (Specialty | "ALL")[] = ["ALL", "NURSING", "PHYSIOTHERAPY", "POST_SURGERY_CARE", "ELDERLY_CARE", "DOCTOR"];

function NearbyCard({ c, addressId }: { c: NearbyCaregiver; addressId: string }) {
  const t = useTranslations("customerA.emergency");
  const tb = useTranslations("customerA.bits");
  const L = useLabels();
  const router = useRouter();
  const km = (c.distanceMeters / 1000).toFixed(1);
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-start gap-3">
        <Avatar name={c.user.fullName} src={c.photoUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-ink-900">{c.user.fullName}</p>
          <p className="text-sm text-ink-500">{L.specialty(c.specialty)}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {c.badge && <TierBadge badge={c.badge} />}
            <VerifiedTag />
          </div>
          <div className="mt-1.5">
            <Rating average={c.ratingAverage} count={c.ratingCount} />
          </div>
        </div>
        <div className="shrink-0 text-end">
          <p className="tabular text-lg font-extrabold text-ink-900">{formatMoney(c.ratePerVisit)}</p>
          <p className="text-[11px] text-ink-500">{tb("perVisit")}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700 ring-1 ring-brand-200">
          <MapPinned className="size-3.5" /> {t("distanceEta", { km, min: c.etaMinutes })}
        </span>
        <Button size="sm" onClick={() => router.push(`/customer/caregivers/${c.id}/book?immediate=1&addressId=${addressId}`)}>
          <Zap className="size-4" /> {t("bookNow")}
        </Button>
      </div>
    </Card>
  );
}

export default function EmergencyPage() {
  const t = useTranslations("customerA.emergency");
  const L = useLabels();
  const addresses = useQuery({ queryKey: keys.addresses, queryFn: addressesApi.list });
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [specialty, setSpecialty] = useState<Specialty | "ALL">("ALL");

  // Search near the chosen saved address so the result set and the booking (which validates
  // against the same address) agree — no "caregiver too far" surprise at checkout.
  const addr = addresses.data?.find((a) => a.id === pickedId) ?? addresses.data?.[0];

  const results = useQuery({
    queryKey: [...keys.caregivers, "nearby", addr?.id, specialty],
    queryFn: () => caregiversApi.nearbyNow(Number(addr!.latitude), Number(addr!.longitude), specialty === "ALL" ? undefined : specialty),
    enabled: !!addr,
  });

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="mb-5 flex items-start gap-2 text-sm text-ink-500">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-600" />
        <p>{t("disclaimer")}</p>
      </div>

      {addresses.data && addresses.data.length === 0 ? (
        <Card>
          <EmptyState icon={MapPin} title={t("noAddressTitle")} description={t("noAddressText")} />
          <div className="flex justify-center pb-6">
            <Link href="/customer/account/addresses" className="text-sm font-semibold text-brand-700 hover:underline">
              {t("addAddress")}
            </Link>
          </div>
        </Card>
      ) : (
        <>
          <div className="mb-5 space-y-3">
            {addresses.data && addresses.data.length > 1 && (
              <Field label={t("whereLabel")}>
                {(id) => (
                  <Select
                    inputId={id}
                    value={addr?.id ?? null}
                    isSearchable={false}
                    onChange={(v) => setPickedId(v)}
                    options={addresses.data!.map((a) => ({ value: a.id, label: `${a.label ? `${a.label} · ` : ""}${a.addressLine}, ${a.city}` }))}
                  />
                )}
              </Field>
            )}
            {addr && addresses.data!.length === 1 && (
              <p className="flex items-center gap-1.5 text-sm text-ink-500">
                <MapPin className="size-4 text-ink-400" /> {t("near", { place: addr.label || addr.addressLine })}
              </p>
            )}
            <FilterTabs
              value={specialty}
              onChange={setSpecialty}
              options={SPECIALTIES.map((s) => ({ value: s, label: s === "ALL" ? t("allSpecialties") : L.specialty(s) }))}
            />
          </div>

          {!addr ? (
            <Card className="p-8">
              <Skeleton className="h-24" />
            </Card>
          ) : results.isError ? (
            <Card>
              <ErrorState error={results.error} onRetry={() => results.refetch()} />
            </Card>
          ) : !results.data ? (
            <div className="space-y-3">
              <p className="text-sm text-ink-500">{t("searching")}</p>
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-36 rounded-2xl" />
              ))}
            </div>
          ) : results.data.items.length === 0 ? (
            <Card>
              <EmptyState icon={SearchX} title={t("emptyTitle")} description={t("emptyText")} />
              <div className="flex justify-center pb-6">
                <Link href="/customer/caregivers" className="text-sm font-semibold text-brand-700 hover:underline">
                  {t("browseAll")}
                </Link>
              </div>
            </Card>
          ) : (
            <>
              <p className="mb-3 text-sm text-ink-500">{t("count", { count: results.data.total })}</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {results.data.items.map((c) => (
                  <NearbyCard key={c.id} c={c} addressId={addr.id} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
