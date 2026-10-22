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
import { caregiversApi } from "@/features/customer/lib/api/customer";
import { keys } from "@/features/customer/lib/api/keys";

const SPECIALTIES: (Specialty | "ALL")[] = ["ALL", "NURSING", "PHYSIOTHERAPY", "POST_SURGERY_CARE", "ELDERLY_CARE"];
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
  const page = Math.max(1, Number(params.get("page")) || 1);

  const setParams = (next: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };

  const results = useQuery({
    queryKey: [...keys.caregivers, "search", specialty, city, page],
    queryFn: () => caregiversApi.search({ specialty: specialty === "ALL" ? undefined : specialty, city: city ?? undefined, page, limit: LIMIT }),
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
        <div className="w-full md:w-56">
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
            <Card className="mt-4">
              <Pagination page={results.data.page} limit={results.data.limit} total={results.data.total} onPage={(p) => setParams({ page: String(p) })} />
            </Card>
          )}
        </>
      )}
    </>
  );
}
