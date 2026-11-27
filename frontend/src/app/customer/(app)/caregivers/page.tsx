"use client";

import { useQuery } from "@tanstack/react-query";
import { SearchX } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { PageHeader } from "@shared/page-header";
import { Card } from "@shared/ui/card";
import { EmptyState, ErrorState, FilterTabs, Pagination, Skeleton } from "@shared/ui/misc";
import { Select } from "@shared/ui/select";
import { useLabels } from "@shared/i18n/use-labels";
import { CITY_OPTIONS } from "@shared/lib/options";
import type { Specialty } from "@shared/types";
import { CaregiverCard } from "@/features/customer/components/caregiver-bits";
import { addressesApi, caregiversApi } from "@/features/customer/lib/api/customer";
import { keys } from "@/features/customer/lib/api/keys";

const SPECIALTIES: (Specialty | "ALL")[] = ["ALL", "NURSING", "PHYSIOTHERAPY", "POST_SURGERY_CARE", "ELDERLY_CARE", "DOCTOR"];
const LIMIT = 12;

export default function FindCarePage() {
  const router = useRouter();
  const t = useTranslations("customerA.find");
  const L = useLabels();
  const pathname = usePathname();
  const params = useSearchParams();
  // Filters live in the URL so results can be shared and survive back/forward.
  const raw = params.get("specialty");
  const specialty = (SPECIALTIES.includes(raw as Specialty) ? raw : "ALL") as Specialty | "ALL";
  const city = params.get("city");
  const addressId = params.get("addressId");
  const page = Math.max(1, Number(params.get("page")) || 1);

  const setParams = (next: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };

  // Optional saved-address filter: default shows all caregivers in the city
  // (so adding a new address never silently hides caregivers); picking a saved
  // address narrows results to caregivers covering that exact location.
  const addresses = useQuery({ queryKey: keys.addresses, queryFn: addressesApi.list });
  const selectedAddr = addressId ? addresses.data?.find((a) => a.id === addressId) : undefined;
  const geo =
    selectedAddr && (!city || city === selectedAddr.city)
      ? { lat: Number(selectedAddr.latitude), lng: Number(selectedAddr.longitude) }
      : {};
  const addressOptions = (addresses.data ?? []).map((a) => ({
    value: a.id,
    label: a.label ? `${a.label} — ${a.addressLine}` : a.addressLine,
  }));

  const results = useQuery({
    queryKey: [...keys.caregivers, "search", specialty, city, geo.lat ?? "", geo.lng ?? "", page],
    queryFn: () => caregiversApi.search({ specialty: specialty === "ALL" ? undefined : specialty, city: city ?? undefined, ...geo, page, limit: LIMIT }),
  });

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <FilterTabs
          value={specialty}
          onChange={(v) => setParams({ specialty: v === "ALL" ? null : v, page: null })}
          options={SPECIALTIES.map((s) => ({ value: s, label: s === "ALL" ? t("all") : L.specialty(s) }))}
        />
        <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
          {addressOptions.length > 0 && (
            <div className="w-full sm:w-64">
              <Select
                aria-label="Filter by saved address"
                placeholder="All areas (no address filter)"
                isClearable
                isSearchable
                value={addressId}
                onChange={(v) => setParams({ addressId: v, page: null })}
                options={addressOptions}
              />
            </div>
          )}
          <div className="w-full sm:w-48">
            <Select
              aria-label={t("city")}
              placeholder={t("allCities")}
              isClearable
              isSearchable
              value={city}
              onChange={(v) => setParams({ city: v, page: null })}
              options={CITY_OPTIONS}
            />
          </div>
        </div>
      </div>

      {results.isError ? (
        <Card>
          <ErrorState error={results.error} onRetry={() => results.refetch()} />
        </Card>
      ) : !results.data ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-52 rounded-2xl" />
          ))}
        </div>
      ) : results.data.items.length === 0 ? (
        <Card>
          <EmptyState icon={SearchX} title={t("emptyTitle")} description={t("emptyText")} />
        </Card>
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-500">
            {city ? t("countInCity", { count: results.data.total, city }) : t("count", { count: results.data.total })}
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {results.data.items.map((c) => (
              <CaregiverCard key={c.id} c={c} />
            ))}
          </div>
          {results.data.total > LIMIT && (
            <Pagination page={results.data.page} limit={results.data.limit} total={results.data.total} onPage={(p) => setParams({ page: String(p) })} />
          )}
        </>
      )}
    </>
  );
}
