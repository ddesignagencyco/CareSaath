"use client";

import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Camera, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { PageHeader } from "@shared/page-header";
import { useAction } from "@shared/api/use-action";
import { Badge } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import { Card, CardBody, CardHeader } from "@shared/ui/card";
import { Field, Input, Textarea } from "@shared/ui/field";
import { DetailList, ErrorState, Skeleton } from "@shared/ui/misc";
import { useToast } from "@shared/ui/toast";
import { MultiSelect, Select } from "@shared/ui/select";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import { useLocaleControl } from "@shared/i18n/provider";
import type { Locale } from "@shared/i18n/messages";
import type { Me, MyCaregiverProfile } from "@shared/caregiver-types";
import type { Specialty } from "@shared/types";
import { DocumentList, DocumentUploader } from "@/features/caregiver/components/documents-panel";
import { PhotoAvatar } from "@/features/caregiver/components/profile-photo";
import { meApi, profileApi } from "@/features/caregiver/lib/api/caregiver";
import { keys } from "@/features/caregiver/lib/api/keys";
import { CITY_OPTIONS, SPECIALTY_OPTIONS } from "@shared/lib/options";

const API_LANGUAGE = { en: "EN", ur: "UR" } as const;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

/**
 * GET /caregiver/profile returns a masked CNIC ("*********1234-5"). If the
 * server can't decrypt the stored value it masks the ciphertext instead,
 * which is far longer than a CNIC — don't show that.
 */
function displayCnic(cnic: string | null): string {
  return cnic && cnic.length <= 15 ? cnic : "—";
}

function PhotoButton({ name, photoKey }: { name: string; photoKey: string | null }) {
  const t = useTranslations("caregiverB.profile");
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const upload = useAction((file: File) => profileApi.uploadPhoto(file), { invalidate: [keys.profile], success: t("photoUpdated") });
  const hasPhoto = !!photoKey;
  return (
    <div className="relative">
      <PhotoAvatar name={name} photoKey={photoKey} size="lg" />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={upload.isPending}
        aria-label={hasPhoto ? t("changePhoto") : t("addPhoto")}
        className="absolute -end-1 -bottom-1 flex size-7 items-center justify-center rounded-full bg-brand-600 text-white ring-2 ring-white hover:bg-brand-700"
      >
        <Camera className="size-3.5" />
      </button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="user"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          // The API also accepts PDFs here; a portrait must be an image.
          if (!PHOTO_TYPES.includes(f.type) || f.size > PHOTO_MAX_BYTES) toast.error(t("photoInvalid"));
          else upload.mutate(f);
        }}
      />
    </div>
  );
}

function ProfileForm({ me, profile }: { me: Me; profile: MyCaregiverProfile }) {
  const t = useTranslations("caregiverB.profile.form");
  const tl = useTranslations("common.language");
  const L = useLabels();
  const { locale, setLocale } = useLocaleControl();
  const [name, setName] = useState(me.fullName);
  const [language, setLanguage] = useState<Locale>(locale);
  const [specialty, setSpecialty] = useState<Specialty>(profile.specialty);
  const [years, setYears] = useState(profile.experienceYears?.toString() ?? "");
  const [rate, setRate] = useState(String(profile.ratePerVisit / 100));
  const [cities, setCities] = useState<string[]>(profile.serviceArea?.cities ?? []);
  const [bio, setBio] = useState(profile.bio ?? "");

  const rateNum = Number(rate);
  const yearsNum = years === "" ? undefined : Number(years);
  const errors = {
    name: name.trim().length < 2 ? t("errors.name") : null,
    rate: !Number.isFinite(rateNum) || rateNum < 10 ? t("errors.rate") : null,
    years: yearsNum !== undefined && (!Number.isInteger(yearsNum) || yearsNum < 0 || yearsNum > 60) ? t("errors.years") : null,
    cities: cities.length === 0 ? t("errors.cities") : null,
  };
  const valid = Object.values(errors).every((e) => !e);

  const save = useAction(
    async () => {
      const nameChanged = name.trim() !== me.fullName;
      const languageChanged = API_LANGUAGE[language] !== me.preferredLanguage;
      if (nameChanged || languageChanged) {
        await meApi.update({
          ...(nameChanged ? { fullName: name.trim() } : {}),
          ...(languageChanged ? { preferredLanguage: API_LANGUAGE[language] } : {}),
        });
      }
      return profileApi.update({
        specialty,
        ratePerVisit: Math.round(rateNum * 100),
        serviceCities: cities,
        bio: bio.trim(),
        ...(yearsNum !== undefined ? { experienceYears: yearsNum } : {}),
      });
    },
    { invalidate: [keys.profile, keys.me], success: t("saved"), onSuccess: () => setLocale(language) },
  );

  return (
    <Card>
      <CardHeader title={t("title")} description={t("description")} />
      <CardBody className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("fullName")} required error={errors.name}>
            {(id) => <Input id={id} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <Field label={t("specialty")} required hint={specialty !== profile.specialty ? t("specialtyHint") : undefined}>
            {(id) => <Select inputId={id} value={specialty} onChange={(v) => v && setSpecialty(v)} options={SPECIALTY_OPTIONS.map((o) => ({ ...o, label: L.specialty(o.value), description: L.specialtyHint(o.value) }))} />}
          </Field>
          <Field label={t("rate")} required error={errors.rate}>
            {(id) => <Input id={id} type="number" inputMode="numeric" min={10} dir="ltr" value={rate} onChange={(e) => setRate(e.target.value)} className="tabular" />}
          </Field>
          <Field label={t("years")} error={errors.years}>
            {(id) => <Input id={id} type="number" inputMode="numeric" min={0} max={60} dir="ltr" value={years} onChange={(e) => setYears(e.target.value)} className="tabular" />}
          </Field>
          <Field label={t("cities")} required error={errors.cities} className="sm:col-span-2">
            {(id) => <MultiSelect inputId={id} value={cities} onChange={setCities} options={CITY_OPTIONS} placeholder={t("chooseCities")} />}
          </Field>
          <Field label={t("about")} hint={t("aboutHint", { count: bio.length })} className="sm:col-span-2">
            {(id) => <Textarea id={id} value={bio} maxLength={2000} rows={4} onChange={(e) => setBio(e.target.value)} />}
          </Field>
          <Field label={tl("appLanguage")} hint={tl("hint")}>
            {(id) => (
              <Select
                inputId={id}
                value={language}
                onChange={(v) => v && setLanguage(v)}
                options={[
                  { value: "en" as const, label: tl("en") },
                  { value: "ur" as const, label: tl("ur") },
                ]}
              />
            )}
          </Field>
        </div>
        <div className="flex justify-end">
          <Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate(undefined)}>
            {t("save")}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

export default function ProfilePage() {
  const t = useTranslations("caregiverB.profile");
  const f = useFmt();
  const L = useLabels();
  const profile = useQuery({ queryKey: keys.profile, queryFn: profileApi.get });
  const me = useQuery({ queryKey: keys.me, queryFn: meApi.get });
  const p = profile.data;

  if (profile.isError) {
    return (
      <Card>
        <ErrorState error={profile.error} onRetry={() => profile.refetch()} />
      </Card>
    );
  }

  return (
    <>
      <PageHeader title={t("title")} />
      {!p || !me.data ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-5">
            <Card className="flex flex-wrap items-center gap-4 p-5">
              <PhotoButton name={me.data.fullName || t("fallbackName")} photoKey={p.photoKey} />
              <div className="min-w-0 flex-1">
                <p className="text-lg font-extrabold text-ink-900">{me.data.fullName}</p>
                <p className="tabular text-sm text-ink-500">{f.phone(me.data.phone)}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge tone="success" dot>
                    <BadgeCheck className="size-3" /> {t("verified")}
                  </Badge>
                  {p.ratingCount > 0 && (
                    <Badge tone="accent">
                      <Star className="size-3 fill-current" /> {t("rating", { rating: Number(p.ratingAverage).toFixed(2), count: p.ratingCount })}
                    </Badge>
                  )}
                </div>
              </div>
            </Card>
            <ProfileForm key={p.updatedAt} me={me.data} profile={p} />
          </div>

          <div className="space-y-5">
            <Card>
              <CardHeader title={t("credentials.title")} description={t("credentials.description")} />
              <CardBody>
                <DetailList
                  items={[
                    { label: t("credentials.license"), value: <span dir="ltr" className="tabular font-semibold">{p.licenseNumber}</span> },
                    { label: t("credentials.body"), value: L.licenseBody(p.licenseBody) },
                    { label: t("credentials.cnic"), value: <span dir="ltr" className="tabular">{displayCnic(p.cnic)}</span> },
                    { label: t("credentials.commission"), value: p.commissionRate ? t("credentials.commissionValue", { pct: Number(p.commissionRate.percentage) }) : "—" },
                    { label: t("credentials.approved"), value: f.date(p.approvedAt) },
                    { label: t("credentials.reverify"), value: f.date(p.reverifyDueAt) },
                  ]}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title={t("documents")} />
              <CardBody className="space-y-5">
                <DocumentList documents={p.documents ?? []} />
                <div className="border-t border-ink-100 pt-5">
                  <p className="mb-3 text-sm font-semibold text-ink-800">{t("uploadNew")}</p>
                  <DocumentUploader defaultType="CERTIFICATE" compact />
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
