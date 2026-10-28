"use client";

import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, FileText, MapPin, Plus, UploadCloud, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { useAction, useApiErrorText } from "@shared/api/use-action";
import { useNow } from "@shared/hooks/use-now";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import { formatBytes, formatMoney } from "@shared/lib/format";
import { localDayKey } from "@shared/lib/visit";
import { Button } from "@shared/ui/button";
import { Card } from "@shared/ui/card";
import { Field, Input } from "@shared/ui/field";
import { DatePicker } from "@shared/ui/date-picker";
import { TimePicker } from "@shared/ui/time-picker";
import { Avatar, Skeleton } from "@shared/ui/misc";
import { useToast } from "@shared/ui/toast";
import type { Address, PatientProfile } from "@shared/caregiver-types";
import type { PromoQuote, PublicCaregiver } from "@shared/customer-types";
import { Rating, useCaregiver } from "@/features/customer/components/caregiver-bits";
import { AddressForm, PatientForm } from "@/features/customer/components/forms";
import { addressesApi, bookingsApi, patientsApi, promosApi } from "@/features/customer/lib/api/customer";
import { ApiError } from "@/features/customer/lib/api/http";
import { keys } from "@/features/customer/lib/api/keys";
import { isUnreadableMedical } from "@/features/customer/lib/labels";

const STEPS = ["who", "where", "when", "review"] as const;
/** ISO weekday (1 = Mon … 7 = Sun), as the bookings API expects. */
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
const MAX_RANGE_DAYS = 60;
const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

/** Same expansion as the backend: every date in range whose ISO weekday is selected. */
function countVisits(type: "SINGLE" | "RECURRING", start: string, end: string, weekdays: number[]): string[] {
  if (!start) return [];
  if (type === "SINGLE") return [start];
  if (!end || end < start) return [];
  const out: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    const iso = cursor.getUTCDay() === 0 ? 7 : cursor.getUTCDay();
    if (weekdays.includes(iso)) out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/** Days of week (0 = Sun … 6 = Sat) in the plan when the requested time falls outside the caregiver's weekly hours. */
function outsideHours(c: PublicCaregiver, dates: string[], start: string, end: string): number[] {
  const off = new Set<number>();
  for (const d of dates) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    const ok = c.availabilityRules.some((r) => r.dayOfWeek === dow && r.startTime <= start && r.endTime >= end);
    if (!ok) off.add(dow);
  }
  return [...off];
}

function Choice({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={clsx(
        "flex w-full items-start gap-3 rounded-xl border-2 p-4 text-start transition-colors",
        selected ? "border-brand-500 bg-brand-50/50" : "border-ink-100 bg-white hover:border-ink-200",
      )}
    >
      <span className={clsx("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2", selected ? "border-brand-600 bg-brand-600 text-white" : "border-ink-300")}>
        {selected && <Check className="size-3" />}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}

export default function BookPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const now = useNow(60_000);
  const t = useTranslations("customerA.book");
  const tc = useTranslations("common.actions");
  const f = useFmt();
  const L = useLabels();
  const apiError = useApiErrorText();
  const caregiver = useCaregiver(id);
  const patients = useQuery({ queryKey: keys.patients, queryFn: patientsApi.list });
  const addresses = useQuery({ queryKey: keys.addresses, queryFn: addressesApi.list });

  const [step, setStep] = useState(0);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [type, setType] = useState<"SINGLE" | "RECURRING">("SINGLE");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [from, setFrom] = useState("10:00");
  const [to, setTo] = useState("11:00");
  const [promo, setPromo] = useState("");
  const [promoError, setPromoError] = useState<string | null>(null);
  const [applied, setApplied] = useState<PromoQuote | null>(null);
  const [rx, setRx] = useState<File | null>(null);
  const [rxError, setRxError] = useState<string | null>(null);
  const [adding, setAdding] = useState<"patient" | "address" | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const c = caregiver.data;
  const today = now ? localDayKey(now) : "";
  const nowHHmm = now ? ((d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`)(new Date(now)) : "";

  /** Pick the start date; when it's today, pre-fill a window starting at the current time
   *  (the next 5-min slot, so it's valid and never in the past) — not some minutes ahead. */
  const pickStartDate = (value: string) => {
    setStart(value);
    if (value && value === today && now) {
      const fmt = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      const fromAt = new Date(now);
      fromAt.setMinutes((Math.floor(fromAt.getMinutes() / 5) + 1) * 5, 0, 0); // next 5-min slot from now
      const toAt = new Date(fromAt.getTime() + 60 * 60_000);
      setFrom(fmt(fromAt));
      setTo(fmt(toAt));
    }
  };
  const maxEnd = start ? new Date(new Date(`${start}T00:00:00Z`).getTime() + MAX_RANGE_DAYS * 86_400_000).toISOString().slice(0, 10) : "";
  const dates = countVisits(type, start, end, weekdays);
  const offDays = c && dates.length ? outsideHours(c, dates, from, to) : [];
  const patient = patients.data?.find((p) => p.id === patientId);
  const address = addresses.data?.find((a) => a.id === addressId);

  const whenError = !start
    ? t("errors.chooseDate")
    : start < today
      ? t("errors.past")
      : start === today && !!nowHHmm && from <= nowHHmm
        ? t("errors.pastTime")
      : from >= to
        ? t("errors.endTime")
        : type === "RECURRING" && !end
          ? t("errors.chooseEnd")
          : type === "RECURRING" && end < start
            ? t("errors.endBefore")
            : type === "RECURRING" && end > maxEnd
              ? t("errors.maxRange", { n: MAX_RANGE_DAYS })
              : type === "RECURRING" && weekdays.length === 0
                ? t("errors.pickDay")
                : dates.length === 0
                  ? t("errors.noDates")
                  : null;
  const daysText = type === "RECURRING" ? f.weekdays(weekdays) : start ? f.longDay(start) : "";
  const windowText = f.timeWindow(from, to);
  // Block booking a caregiver for an address outside their service area.
  const addressOutOfArea = !!(c && address && !c.serviceArea.cities.includes(address.city));
  const stepOk = [!!patientId, !!addressId && !addressOutOfArea, !whenError, true][step];

  const book = useAction(
    async () => {
      const booking = await bookingsApi.create({
        patientId: patientId!,
        caregiverId: id,
        addressId: addressId!,
        type,
        startDate: start,
        endDate: type === "SINGLE" ? start : end,
        timeWindowStart: from,
        timeWindowEnd: to,
        ...(type === "RECURRING" ? { weekdays } : {}),
        ...(promo.trim() ? { promoCode: promo.trim().toUpperCase() } : {}),
      });
      if (rx) {
        try {
          await bookingsApi.uploadPrescription(booking.id, rx);
        } catch {
          toast.error(t("rxFailed"));
        }
      }
      return booking;
    },
    {
      invalidate: [keys.bookings],
      success: t("success"),
      onSuccess: (b) => {
        // Clear the form so the next booking starts fresh (App Router can reuse this instance).
        setStep(0);
        setPatientId(null);
        setAddressId(null);
        setType("SINGLE");
        setStart("");
        setEnd("");
        setWeekdays([1, 2, 3, 4, 5]);
        setFrom("10:00");
        setTo("11:00");
        setPromo("");
        setPromoError(null);
        setApplied(null);
        setRx(null);
        setRxError(null);
        if (fileInput.current) fileInput.current.value = "";
        router.replace(`/customer/bookings/${b.id}`);
      },
      onError: (err) => {
        if (err instanceof ApiError && err.message.startsWith("Promo code")) {
          setPromoError(apiError(err));
          return true;
        }
      },
    },
  );

  const quote = useAction(() => promosApi.quote(promo.trim().toUpperCase(), id), {
    invalidate: [],
    success: null,
    onSuccess: (q) => {
      setApplied(q);
      setPromoError(null);
    },
    onError: (err) => {
      setApplied(null);
      setPromoError(apiError(err));
      return true;
    },
  });

  if (caregiver.isError) {
    return <p className="text-sm text-danger-600">{apiError(caregiver.error)}</p>;
  }

  const perVisit = c?.ratePerVisit ?? 0;
  const effectivePerVisit = applied ? applied.perVisitAfterDiscount : perVisit;

  return (
    <div className="space-y-5 pb-6">
      <Link href={`/customer/caregivers/${id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900">
        <ArrowLeft className="rtl:-scale-x-100 size-4" /> {t("back")}
      </Link>

      {!c ? (
        <Skeleton className="h-20 rounded-2xl" />
      ) : (
        <Card className="flex items-center gap-3 p-4">
          <Avatar name={c.user.fullName} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold text-ink-900">{t("title", { name: c.user.fullName })}</p>
            <div className="flex flex-wrap items-center gap-x-3 text-sm text-ink-500">
              {L.specialty(c.specialty)} <Rating average={c.ratingAverage} count={c.ratingCount} />
            </div>
          </div>
          <p className="tabular shrink-0 text-end font-extrabold text-ink-900">
            {formatMoney(c.ratePerVisit)}
            <span className="block text-[11px] font-normal text-ink-500">{t("perVisit")}</span>
          </p>
        </Card>
      )}

      <ol className="grid grid-cols-4 gap-2" aria-label={t("stepsLabel")}>
        {STEPS.map((key, i) => (
          <li key={key} aria-current={i === step ? "step" : undefined}>
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              disabled={i >= step}
              aria-label={t(`steps.${key}`)}
              className={clsx("block w-full text-start", i < step && "cursor-pointer")}
            >
              <span className={clsx("block h-1.5 rounded-full transition-colors", i <= step ? "bg-brand-600" : "bg-ink-200")} />
              <span className={clsx("mt-1.5 block text-xs font-semibold transition-colors", i <= step ? "text-ink-900" : "text-ink-400", i < step && "hover:text-brand-700")}>
                {t(`steps.${key}`)}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <Card className="p-5 sm:p-6">
        {step === 0 && (
          <div className="space-y-4" role="radiogroup" aria-label={t("who.aria")}>
            <div>
              <h2 className="text-lg font-extrabold text-ink-900">{t("who.title")}</h2>
              <p className="text-sm text-ink-500">{t("who.text")}</p>
            </div>
            {!patients.data ? (
              <Skeleton className="h-20" />
            ) : (
              patients.data.map((p: PatientProfile) => (
                <Choice key={p.id} selected={patientId === p.id} onClick={() => setPatientId(p.id)}>
                  <span className="block font-bold text-ink-900">
                    {p.name} <span dir="auto" className="font-normal text-ink-500">· {p.relationship === "SELF" ? t("who.you") : t("who.family")}</span>
                  </span>
                  {p.medicalContext && !isUnreadableMedical(p.medicalContext) && <span dir="auto" className="mt-0.5 line-clamp-2 block text-sm text-ink-500">{p.medicalContext}</span>}
                </Choice>
              ))
            )}
            <Button variant="secondary" onClick={() => setAdding("patient")}>
              <Plus className="size-4" /> {t("who.add")}
            </Button>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4" role="radiogroup" aria-label={t("where.aria")}>
            <div>
              <h2 className="text-lg font-extrabold text-ink-900">{t("where.title")}</h2>
              {c && <p className="text-sm text-ink-500">{t("where.cities", { name: c.user.fullName.split(" ")[0], cities: f.list(c.serviceArea.cities) })}</p>}
            </div>
            {!addresses.data ? (
              <Skeleton className="h-20" />
            ) : (
              addresses.data.map((a: Address) => {
                const outOfArea = c && !c.serviceArea.cities.includes(a.city);
                return (
                  <Choice key={a.id} selected={addressId === a.id} onClick={() => setAddressId(a.id)}>
                    <span className="block font-bold text-ink-900">{a.label || a.city}</span>
                    <span dir="auto" className="block text-sm text-ink-500">
                      {a.addressLine}, {a.city}
                    </span>
                    {outOfArea && (
                      <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-warning-700">
                        <AlertTriangle className="size-3.5" /> {t("where.outOfArea")}
                      </span>
                    )}
                  </Choice>
                );
              })
            )}
            <Button variant="secondary" onClick={() => setAdding("address")}>
              <Plus className="size-4" /> {t("where.add")}
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-lg font-extrabold text-ink-900">{t("when.title")}</h2>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-ink-50 p-1" role="radiogroup" aria-label={t("when.typeAria")}>
              {(
                [
                  ["SINGLE", t("when.single")],
                  ["RECURRING", t("when.recurring")],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={type === value}
                  onClick={() => setType(value)}
                  className={clsx("rounded-lg py-2.5 text-sm font-semibold transition-colors", type === value ? "bg-white text-ink-900 shadow-card" : "text-ink-500")}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className={clsx("grid grid-cols-1 gap-4", type === "SINGLE" ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
              <Field label={type === "SINGLE" ? t("when.date") : t("when.from")} required>
                {(fid) => <DatePicker id={fid} min={today} value={start} onChange={pickStartDate} />}
              </Field>
              {type === "RECURRING" && (
                <Field label={t("when.until")} required hint={t("when.upTo", { n: MAX_RANGE_DAYS })}>
                  {(fid) => <DatePicker id={fid} min={start || today} max={maxEnd || undefined} value={end} onChange={setEnd} />}
                </Field>
              )}
              {type === "SINGLE" && (
                <>
                  <Field label={t("when.arriveBetween")} required>
                    {(fid) => <TimePicker id={fid} min={start === today ? nowHHmm || undefined : undefined} value={from} onChange={setFrom} />}
                  </Field>
                  <Field label={t("when.and")} required>
                    {(fid) => <TimePicker id={fid} min={from || undefined} value={to} onChange={setTo} />}
                  </Field>
                </>
              )}
            </div>
            {type === "RECURRING" && (
              <div>
                <p className="mb-2 text-sm font-semibold text-ink-800">{t("when.onDays")}</p>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((iso) => {
                    const on = weekdays.includes(iso);
                    return (
                      <button
                        key={iso}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setWeekdays((w) => (on ? w.filter((x) => x !== iso) : [...w, iso].sort()))}
                        className={clsx(
                          "h-10 w-12 rounded-lg border text-sm font-semibold transition-colors",
                          on ? "border-brand-600 bg-brand-600 text-white" : "border-ink-200 text-ink-600 hover:bg-ink-50",
                        )}
                      >
                        {f.dayOfWeek(iso === 7 ? 0 : iso)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {type === "RECURRING" && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t("when.arriveBetween")} required>
                  {(fid) => <TimePicker id={fid} min={start === today ? nowHHmm || undefined : undefined} value={from} onChange={setFrom} />}
                </Field>
                <Field label={t("when.and")} required>
                  {(fid) => <TimePicker id={fid} min={from || undefined} value={to} onChange={setTo} />}
                </Field>
              </div>
            )}
            {whenError ? (
              start && <p className="text-sm font-medium text-danger-600">{whenError}</p>
            ) : (
              <div className="space-y-2">
                <p className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800">
                  {t.rich("when.summary", { count: dates.length, days: daysText, window: windowText, b: (chunks) => <b>{chunks}</b> })}
                </p>
                {offDays.length > 0 && (
                  <p className="flex items-start gap-2 rounded-xl bg-warning-50 px-4 py-3 text-sm text-warning-700">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    {t("when.offHours", { name: c?.user.fullName.split(" ")[0] ?? "", days: f.list(offDays.map((d) => f.dayOfWeek(d))) })}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {step === 3 && c && (
          <div className="space-y-5">
            <h2 className="text-lg font-extrabold text-ink-900">{t("review.title")}</h2>
            <dl className="divide-y divide-ink-100 rounded-xl border border-ink-100">
              {[
                { icon: UserRound, label: t("review.patient"), value: patient?.name },
                { icon: MapPin, label: t("review.address"), value: address ? `${address.addressLine}, ${address.city}` : "" },
                {
                  icon: Check,
                  label: t("review.schedule"),
                  value: t("review.scheduleValue", { count: dates.length, days: daysText, window: windowText }),
                },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex gap-3 px-4 py-3 text-sm">
                  <Icon className="mt-0.5 size-4 shrink-0 text-ink-400" />
                  <dt className="w-20 shrink-0 text-ink-500">{label}</dt>
                  <dd className="min-w-0 font-semibold text-ink-900">{value}</dd>
                </div>
              ))}
            </dl>

            <div>
              <p className="mb-2 text-sm font-semibold text-ink-800">{t("review.rxTitle")}</p>
              {rx ? (
                <div className="flex items-center gap-3 rounded-xl border border-ink-100 p-3">
                  <FileText className="size-5 text-brand-600" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-900">
                    {rx.name} <span className="font-normal text-ink-500">· {formatBytes(rx.size)}</span>
                  </span>
                  <button aria-label={t("review.removeFile")} onClick={() => setRx(null)} className="text-ink-400 hover:text-ink-700">
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-200 py-4 text-sm font-semibold text-brand-700 hover:border-brand-300 hover:bg-brand-50/40"
                >
                  <UploadCloud className="size-5" /> {t("review.rxAdd")}
                </button>
              )}
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPT}
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const bad = !ACCEPT.split(",").includes(file.type) ? t("review.rxBadType") : file.size > 10 * 1024 * 1024 ? t("review.rxTooBig") : null;
                  setRxError(bad);
                  setRx(bad ? null : file);
                }}
              />
              {rxError && <p className="mt-1 text-sm text-danger-600">{rxError}</p>}
            </div>

            <Field label={t("review.promo")} error={promoError} hint={applied ? undefined : t("review.promoHint")}>
              {(fid) => (
                <div className="flex gap-2">
                  <Input
                    id={fid}
                    value={promo}
                    maxLength={24}
                    className="uppercase"
                    placeholder={t("review.promoPlaceholder")}
                    dir="ltr"
                    onChange={(e) => {
                      setPromo(e.target.value.replace(/[^a-zA-Z0-9]/g, ""));
                      setPromoError(null);
                      setApplied(null);
                    }}
                  />
                  <Button variant="secondary" type="button" loading={quote.isPending} disabled={!promo.trim()} onClick={() => quote.mutate(undefined)}>
                    {t("review.promoApply")}
                  </Button>
                </div>
              )}
            </Field>
            {applied && (
              <p className="-mt-2 flex items-center gap-1.5 text-sm font-semibold text-success-700">
                <Check className="size-4" /> {t("review.promoOk", { amount: formatMoney(applied.discountAmount) })}
              </p>
            )}

            <div className="space-y-1.5 rounded-xl bg-ink-25 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-600">{t("review.price", { price: formatMoney(perVisit), count: dates.length })}</span>
                <span className={clsx("tabular", applied ? "text-ink-400 line-through" : "font-bold text-ink-900")}>{formatMoney(perVisit * dates.length)}</span>
              </div>
              {applied && (
                <>
                  <div className="flex justify-between text-success-700">
                    <span>{t("review.promoLine", { code: applied.code })}</span>
                    <span className="tabular">−{formatMoney(applied.discountAmount * dates.length)}</span>
                  </div>
                  <div className="flex justify-between border-t border-ink-100 pt-1.5">
                    <span className="font-semibold text-ink-900">{t("review.total")}</span>
                    <span className="tabular font-bold text-ink-900">{formatMoney(effectivePerVisit * dates.length)}</span>
                  </div>
                </>
              )}
              <p className="pt-1 text-xs text-ink-500">{t("review.payNote")}</p>
            </div>
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between gap-3">
        {step > 0 ? (
          <Button variant="ghost" onClick={() => setStep(step - 1)}>
            <ArrowLeft className="rtl:-scale-x-100 size-4" /> {tc("back")}
          </Button>
        ) : (
          <span />
        )}
        {step < 3 ? (
          <Button size="lg" disabled={!stepOk} onClick={() => setStep(step + 1)}>
            {tc("continue")} <ArrowRight className="rtl:-scale-x-100 size-4" />
          </Button>
        ) : (
          <Button size="lg" loading={book.isPending} onClick={() => book.mutate(undefined)}>
            {t("send")}
          </Button>
        )}
      </div>

      {adding === "patient" && <PatientForm patient={null} onClose={() => setAdding(null)} onSaved={(p) => setPatientId(p.id)} />}
      {adding === "address" && <AddressForm address={null} onClose={() => setAdding(null)} onSaved={(a) => setAddressId(a.id)} />}
    </div>
  );
}
