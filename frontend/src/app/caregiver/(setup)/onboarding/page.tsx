"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowLeft, ArrowRight, Check, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useAction } from "@shared/api/use-action";
import { Button } from "@shared/ui/button";
import { Card } from "@shared/ui/card";
import { Field, Input, Textarea } from "@shared/ui/field";
import { Skeleton } from "@shared/ui/misc";
import { MultiSelect, Select } from "@shared/ui/select";
import { TimePicker } from "@shared/ui/time-picker";
import { formatMoney } from "@shared/lib/format";
import type { LicenseBody, Specialty } from "@shared/types";
import type { AvailabilityRuleInput, ServiceAreaInput } from "@shared/caregiver-types";
import { useLabels } from "@shared/i18n/use-labels";
import { useFmt } from "@shared/i18n/use-fmt";
import { DocumentList, DocumentUploader } from "@/features/caregiver/components/documents-panel";
import { ApiError } from "@/features/caregiver/lib/api/http";
import { availabilityApi, meApi, profileApi } from "@/features/caregiver/lib/api/caregiver";
import { keys } from "@/features/caregiver/lib/api/keys";
import { refreshTokens, useMe } from "@/features/caregiver/lib/auth";
import {
  CITY_OPTIONS,
  CNIC_PATTERN,
  formatCnic,
  LAHORE_AREAS,
  LICENSE_BODY_OPTIONS,
  SERVICE_RADIUS_OPTIONS,
  SPECIALTY_OPTIONS,
} from "@shared/lib/options";

const STEPS = ["about", "credentials", "services", "documents"] as const;

function Progress({ step, onStep }: { step: number; onStep: (i: number) => void }) {
  const t = useTranslations("caregiverB.onboarding");
  return (
    <ol className="mb-8 grid grid-cols-4 gap-2" aria-label={t("progress")}>
      {STEPS.map((key, i) => {
        // The first three steps are editable and freely navigable; the documents step
        // (3) is only reached once the profile is created, so it isn't clickable.
        const clickable = step < 3 && i <= 2;
        return (
          <li key={key} aria-current={i === step ? "step" : undefined}>
            <button
              type="button"
              disabled={!clickable}
              onClick={() => onStep(i)}
              className={clsx("block w-full text-start", clickable && "cursor-pointer")}
            >
              <span className={clsx("block h-1.5 rounded-full transition-colors", i <= step ? "bg-brand-600" : "bg-ink-200")} />
              <span className={clsx("mt-2 hidden text-xs font-semibold sm:block", i <= step ? "text-ink-900" : "text-ink-400")}>
                {i < step && <Check className="me-1 inline size-3 text-brand-600" />}
                {t(`steps.${key}`)}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

const DEFAULT_BODY: Record<Specialty, LicenseBody> = {
  NURSING: "PNC",
  POST_SURGERY_CARE: "PNC",
  ELDERLY_CARE: "OTHER",
  PHYSIOTHERAPY: "OTHER",
  DOCTOR: "PMDC",
};

/** Monday-first display order; the API uses 0 = Sunday … 6 = Saturday. */
const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 0] as const;
type DayWindow = { start: string; end: string } | null;
type WeekHours = Record<number, DayWindow>;
const EMPTY_WEEK: WeekHours = { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null };
const AREA_OPTIONS = LAHORE_AREAS.map((a) => ({ value: a.value, label: a.label }));

export default function OnboardingPage() {
  const me = useMe();
  if (!me.data) return <Skeleton className="h-96 rounded-2xl" />;
  return <Wizard key={me.data.id} initialStep={me.data.caregiverProfile ? 3 : 0} initialName={me.data.fullName} />;
}

function Wizard({ initialStep, initialName }: { initialStep: number; initialName: string }) {
  const t = useTranslations("caregiverB.onboarding");
  const tc = useTranslations("common.actions");
  const L = useLabels();
  const f = useFmt();
  const router = useRouter();
  const client = useQueryClient();
  const [step, setStep] = useState(initialStep);
  const [touched, setTouched] = useState(false);

  const [name, setName] = useState(initialName);
  const [cnic, setCnic] = useState("");
  const [specialty, setSpecialty] = useState<Specialty | null>(null);
  const [body, setBody] = useState<LicenseBody | null>(null);
  const [license, setLicense] = useState("");
  const [licenseExpiry, setLicenseExpiry] = useState("");
  const [years, setYears] = useState("");
  const [cities, setCities] = useState<string[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [radius, setRadius] = useState("5000");
  const [week, setWeek] = useState<WeekHours>(EMPTY_WEEK);
  const [rate, setRate] = useState("");
  const [minRate, setMinRate] = useState("");
  const [maxRate, setMaxRate] = useState("");
  const [bio, setBio] = useState("");

  const toggleDay = (dow: number) =>
    setWeek((w) => ({ ...w, [dow]: w[dow] ? null : { start: "09:00", end: "17:00" } }));
  const setDayTime = (dow: number, part: "start" | "end", value: string) =>
    setWeek((w) => (w[dow] ? { ...w, [dow]: { ...w[dow]!, [part]: value } } : w));

  const yearsNum = years === "" ? undefined : Number(years);
  const rateNum = Number(rate);
  const minNum = minRate ? Number(minRate) : rateNum;
  const maxNum = maxRate ? Number(maxRate) : rateNum;
  const errors: Record<number, Record<string, string | null>> = {
    0: {
      name: name.trim().length < 2 ? t("errors.name") : null,
      cnic: !CNIC_PATTERN.test(cnic) ? t("errors.cnic") : null,
    },
    1: {
      specialty: !specialty ? t("errors.specialty") : null,
      body: !body ? t("errors.body") : null,
      license: license.trim().length < 3 || license.trim().length > 40 ? t("errors.license") : null,
      years: yearsNum !== undefined && (!Number.isInteger(yearsNum) || yearsNum < 0 || yearsNum > 60) ? t("errors.years") : null,
    },
    2: {
      cities: cities.length === 0 ? t("errors.cities") : null,
      rate: !rate || !Number.isFinite(rateNum) || rateNum < 10 ? t("errors.rate") : null,
      bracket:
        (minRate || maxRate) && (!Number.isFinite(minNum) || !Number.isFinite(maxNum) || minNum < 10 || maxNum < minNum || rateNum < minNum || rateNum > maxNum)
          ? t("errors.bracket")
          : null,
    },
  };
  const stepValid = (s: number) => Object.values(errors[s] ?? {}).every((e) => !e);
  const err = (s: number, k: string) => (touched ? errors[s][k] : null);

  const profile = useQuery({ queryKey: keys.profile, queryFn: profileApi.get, enabled: step === 3 });

  const register = useAction(
    async () => {
      await meApi.update({ fullName: name.trim() });
      try {
        await profileApi.register({
          cnic,
          licenseNumber: license.trim(),
          licenseBody: body!,
          ...(licenseExpiry && body === "PMDC" ? { pmdcExpiryDate: licenseExpiry } : {}),
          ...(licenseExpiry && body === "PNC" ? { pncExpiryDate: licenseExpiry } : {}),
          specialty: specialty!,
          ...(yearsNum !== undefined ? { experienceYears: yearsNum } : {}),
          ...(bio.trim() ? { bio: bio.trim() } : {}),
          serviceCities: cities,
          ratePerVisit: Math.round(rateNum * 100),
          minRatePerVisit: Math.round(minNum * 100),
          maxRatePerVisit: Math.round(maxNum * 100),
        });
      } catch (e) {
        // A retry after a network blip: the profile already exists, carry on.
        if (!(e instanceof ApiError && e.message === "Caregiver profile already exists")) throw e;
      }
      // The access token still says CUSTOMER until refreshed.
      await refreshTokens();
      // Now a CAREGIVER: persist the sub-city areas and weekly hours they filled in.
      // Best-effort — both can be refined later on their dedicated pages, so a failure
      // here must not block finishing onboarding.
      const serviceAreas: ServiceAreaInput[] = cities.includes("Lahore")
        ? areas.map((v) => {
            const a = LAHORE_AREAS.find((x) => x.value === v)!;
            return { city: "Lahore", label: a.label, lat: a.lat, lng: a.lng, radiusMeters: Number(radius) };
          })
        : [];
      const rules: AvailabilityRuleInput[] = WEEK_DAYS.flatMap((dow) => {
        const win = week[dow];
        return win ? [{ dayOfWeek: dow, startTime: win.start, endTime: win.end }] : [];
      });
      try {
        if (serviceAreas.length > 0) await profileApi.setServiceAreas(serviceAreas);
        if (rules.length > 0) await availabilityApi.put(rules);
      } catch {
        // ignore — refine later under Availability / Service areas
      }
    },
    {
      invalidate: [keys.me, keys.profile],
      success: t("created"),
      onSuccess: () => {
        setTouched(false);
        setStep(3);
      },
    },
  );

  function next() {
    setTouched(true);
    if (!stepValid(step)) return;
    setTouched(false);
    if (step === 2) register.mutate(undefined);
    else setStep(step + 1);
  }

  /** Jump to a step from the progress bar. Back is free; forward validates each step on the way. */
  function goTo(target: number) {
    if (target === step || register.isPending || step >= 3 || target > 2) return;
    if (target < step) {
      setTouched(false);
      setStep(target);
      return;
    }
    setTouched(true);
    for (let s = step; s < target; s++) {
      if (!stepValid(s)) {
        setStep(s);
        return;
      }
    }
    setTouched(false);
    setStep(target);
  }

  const docs = profile.data?.documents ?? [];

  return (
    <>
      <Progress step={step} onStep={goTo} />
      <div className="mb-6">
        <p className="text-sm font-semibold text-brand-700">
          {t("stepOf", { step: step + 1, total: STEPS.length })}
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
          {t(`titles.${STEPS[step]}`)}
        </h1>
        <p className="mt-1 text-ink-500">
          {t(`descriptions.${STEPS[step]}`)}
        </p>
      </div>

      <Card className="p-5 sm:p-6">
        {step === 0 && (
          <div className="space-y-4">
            <Field label={t("fullName")} required error={err(0, "name")}>
              {(id) => <Input id={id} value={name} maxLength={120} autoComplete="name" onChange={(e) => setName(e.target.value)} autoFocus />}
            </Field>
            <Field label={t("cnic")} required error={err(0, "cnic")}>
              {(id) => (
                <Input
                  id={id}
                  inputMode="numeric"
                  dir="ltr"
                  value={cnic}
                  placeholder="35201-1234567-1"
                  className="tabular tracking-wide"
                  onChange={(e) => setCnic(formatCnic(e.target.value))}
                />
              )}
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("specialty")} required error={err(1, "specialty")} className="sm:col-span-2">
              {(id) => (
                <Select
                  inputId={id}
                  value={specialty}
                  placeholder={t("specialtyPlaceholder")}
                  onChange={(v) => {
                    setSpecialty(v);
                    if (v && !body) setBody(DEFAULT_BODY[v]);
                  }}
                  options={SPECIALTY_OPTIONS.map((o) => ({ ...o, label: L.specialty(o.value), description: L.specialtyHint(o.value) }))}
                />
              )}
            </Field>
            <Field label={t("body")} required error={err(1, "body")}>
              {(id) => (
                <Select
                  inputId={id}
                  value={body}
                  onChange={setBody}
                  options={LICENSE_BODY_OPTIONS.map((o) => ({ ...o, label: L.licenseBodyOption(o.value), description: L.licenseBodyHint(o.value) }))}
                  placeholder={t("bodyPlaceholder")}
                />
              )}
            </Field>
            <Field label={t("license")} required error={err(1, "license")}>
              {(id) => (
                <Input id={id} dir="ltr" value={license} maxLength={40} className="tabular uppercase" placeholder={t("licensePlaceholder")} onChange={(e) => setLicense(e.target.value)} />
              )}
            </Field>
            {(body === "PMDC" || body === "PNC") && (
              <Field label={body === "PMDC" ? t("pmdcExpiry") : t("pncExpiry")} hint={t("licenseExpiryHint")}>
                {(id) => <Input id={id} type="date" dir="ltr" value={licenseExpiry} onChange={(e) => setLicenseExpiry(e.target.value)} className="tabular" />}
              </Field>
            )}
            <Field label={t("years")} error={err(1, "years")}>
              {(id) => <Input id={id} type="number" inputMode="numeric" min={0} max={60} dir="ltr" value={years} onChange={(e) => setYears(e.target.value)} className="tabular" />}
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <Field label={t("cities")} required error={err(2, "cities")}>
              {(id) => (
                <MultiSelect inputId={id} value={cities} onChange={setCities} options={CITY_OPTIONS} placeholder={t("chooseCities")} closeMenuOnSelect />
              )}
            </Field>
            {cities.includes("Lahore") && (
              <>
                <Field label={t("areas")} hint={t("areasHint")}>
                  {(id) => (
                    <MultiSelect inputId={id} value={areas} onChange={setAreas} options={AREA_OPTIONS} placeholder={t("areasPlaceholder")} />
                  )}
                </Field>
                {areas.length > 0 && (
                  <Field label={t("radius")} hint={t("radiusHint")}>
                    {(id) => (
                      <Select<string> inputId={id} value={radius} isSearchable={false} onChange={(v) => v && setRadius(v)} options={SERVICE_RADIUS_OPTIONS} />
                    )}
                  </Field>
                )}
              </>
            )}
            <Field
              label={t("rate")}
              required
              error={err(2, "rate")}
              hint={rateNum >= 10 ? t("rateHintAmount", { amount: formatMoney(Math.round(rateNum * 100)) }) : t("rateHint")}
            >
              {(id) => <Input id={id} type="number" inputMode="numeric" min={10} dir="ltr" value={rate} placeholder="2500" onChange={(e) => setRate(e.target.value)} className="tabular" />}
            </Field>
            <Field label={t("minRate")} error={err(2, "bracket")} hint={t("bracketHint")}>
              {(id) => <Input id={id} type="number" inputMode="numeric" min={10} dir="ltr" value={minRate} placeholder={rate || "2000"} onChange={(e) => setMinRate(e.target.value)} className="tabular" />}
            </Field>
            <Field label={t("maxRate")}>
              {(id) => <Input id={id} type="number" inputMode="numeric" min={10} dir="ltr" value={maxRate} placeholder={rate || "3000"} onChange={(e) => setMaxRate(e.target.value)} className="tabular" />}
            </Field>
            <Field label={t("about")} hint={t("aboutHint", { count: bio.length })}>
              {(id) => <Textarea id={id} value={bio} maxLength={2000} rows={4} onChange={(e) => setBio(e.target.value)} />}
            </Field>
            <Field label={t("hours")} hint={t("hoursHint")}>
              {() => (
                <ul className="divide-y divide-ink-100 overflow-hidden rounded-xl border border-ink-200">
                  {WEEK_DAYS.map((dow) => {
                    const win = week[dow];
                    const on = !!win;
                    const day = f.dayOfWeekLong(dow);
                    return (
                      <li key={dow} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={on}
                          aria-label={t("dayToggle", { day })}
                          onClick={() => toggleDay(dow)}
                          className={clsx("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-brand-600" : "bg-ink-200")}
                        >
                          <span className={clsx("absolute top-0.5 start-0.5 size-5 rounded-full bg-white shadow transition-transform", on && "translate-x-5 rtl:-translate-x-5")} />
                        </button>
                        <span className={clsx("w-24 shrink-0 text-sm font-semibold", on ? "text-ink-900" : "text-ink-400")}>{day}</span>
                        {on ? (
                          <div className="flex items-center gap-2">
                            <TimePicker aria-label={t("startFor", { day })} value={win!.start} className="w-28" onChange={(v) => setDayTime(dow, "start", v)} />
                            <span className="text-ink-400">–</span>
                            <TimePicker aria-label={t("endFor", { day })} value={win!.end} min={win!.start || undefined} className="w-28" onChange={(v) => setDayTime(dow, "end", v)} />
                          </div>
                        ) : (
                          <span className="text-sm text-ink-400">{t("dayOff")}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Field>
          </div>
        )}

        {step === 3 && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-3 text-sm font-semibold text-ink-800">{t("addDocument")}</p>
              <DocumentUploader key={docs.length} defaultType={docs.some((d) => d.type === "LICENSE") ? "CNIC_COPY" : "LICENSE"} />
            </div>
            <div>
              <p className="mb-3 text-sm font-semibold text-ink-800">{t("uploadedList")}</p>
              {profile.data ? <DocumentList documents={docs} /> : <Skeleton className="h-20" />}
              <ul className="mt-4 space-y-1.5 text-xs text-ink-500">
                {(["LICENSE", "CNIC_COPY", "CERTIFICATE"] as const).map((type) => (
                  <li key={type} className="flex items-center gap-2">
                    <span className={clsx("flex size-4 items-center justify-center rounded-full", docs.some((d) => d.type === type) ? "bg-success-600 text-white" : "bg-ink-100")}>
                      {docs.some((d) => d.type === type) && <Check className="size-3" />}
                    </span>
                    {t(`checklist.${type}`)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Card>

      <div className="mt-6 flex items-center justify-between gap-3">
        {step > 0 && step < 3 ? (
          <Button variant="ghost" onClick={() => setStep(step - 1)}>
            <ArrowLeft className="rtl:-scale-x-100 size-4" /> {tc("back")}
          </Button>
        ) : (
          <span />
        )}
        {step < 3 ? (
          <Button size="lg" loading={register.isPending} onClick={next}>
            {step === 2 ? t("createProfile") : tc("continue")} {!register.isPending && <ArrowRight className="rtl:-scale-x-100 size-4" />}
          </Button>
        ) : (
          <Button
            size="lg"
            disabled={!docs.some((d) => d.type === "LICENSE")}
            onClick={() => {
              client.invalidateQueries({ queryKey: keys.me });
              router.replace("/caregiver/status");
            }}
          >
            <ShieldCheck className="size-4" /> {t("submit")}
          </Button>
        )}
      </div>
    </>
  );
}
