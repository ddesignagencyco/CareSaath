"use client";

import { useQuery } from "@tanstack/react-query";
import { MapPinned, SearchX, Siren, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { PageHeader } from "@shared/page-header";
import { Button } from "@shared/ui/button";
import { Card } from "@shared/ui/card";
import { Avatar, EmptyState, ErrorState, FilterTabs, Skeleton } from "@shared/ui/misc";
import { formatMoney } from "@shared/lib/format";
import { getPosition, type Coords } from "@shared/lib/geo";
import { useLabels } from "@shared/i18n/use-labels";
import type { Specialty } from "@shared/types";
import type { NearbyCaregiver } from "@shared/customer-types";
import { Rating, TierBadge, VerifiedTag } from "@/features/customer/components/caregiver-bits";
import { caregiversApi } from "@/features/customer/lib/api/customer";
import { keys } from "@/features/customer/lib/api/keys";

const SPECIALTIES: (Specialty | "ALL")[] = ["ALL", "NURSING", "PHYSIOTHERAPY", "POST_SURGERY_CARE", "ELDERLY_CARE", "DOCTOR"];

function NearbyCard({ c }: { c: NearbyCaregiver }) {
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
        <Button size="sm" onClick={() => router.push(`/customer/caregivers/${c.id}/book?immediate=1`)}>
          <Zap className="size-4" /> {t("bookNow")}
        </Button>
      </div>
    </Card>
  );
}

export default function EmergencyPage() {
  const t = useTranslations("customerA.emergency");
  const L = useLabels();
  const [coords, setCoords] = useState<Coords | null>(null);
  const [geoFailed, setGeoFailed] = useState(false);
  const [specialty, setSpecialty] = useState<Specialty | "ALL">("ALL");

  useEffect(() => {
    let active = true;
    getPosition()
      .then((c) => active && setCoords(c))
      .catch(() => active && setGeoFailed(true));
    return () => {
      active = false;
    };
  }, []);

  const retry = () => {
    setGeoFailed(false);
    setCoords(null);
    getPosition()
      .then(setCoords)
      .catch(() => setGeoFailed(true));
  };

  const results = useQuery({
    queryKey: [...keys.caregivers, "nearby", coords?.lat, coords?.lng, specialty],
    queryFn: () => caregiversApi.nearbyNow(coords!.lat, coords!.lng, specialty === "ALL" ? undefined : specialty),
    enabled: !!coords,
  });

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="mb-5">
        <FilterTabs
          value={specialty}
          onChange={setSpecialty}
          options={SPECIALTIES.map((s) => ({ value: s, label: s === "ALL" ? t("allSpecialties") : L.specialty(s) }))}
        />
      </div>

      {geoFailed ? (
        <Card>
          <EmptyState icon={Siren} title={t("locationError")} />
          <div className="flex justify-center pb-6">
            <Button onClick={retry}>{t("retry")}</Button>
          </div>
        </Card>
      ) : !coords ? (
        <Card className="flex items-center justify-center gap-3 p-8 text-sm text-ink-500">
          <Skeleton className="size-5 rounded-full" /> {t("locating")}
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
              <NearbyCard key={c.id} c={c} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
