"use client";

import { useQuery } from "@tanstack/react-query";
import { LocateFixed, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useAction } from "@shared/api/use-action";
import { useLabels } from "@shared/i18n/use-labels";
import { Button } from "@shared/ui/button";
import { Field, Input, Textarea } from "@shared/ui/field";
import { LocationMap } from "@shared/ui/location-map";
import { ErrorState, Skeleton } from "@shared/ui/misc";
import { Modal } from "@shared/ui/overlay";
import { Select } from "@shared/ui/select";
import { getPosition } from "@shared/lib/geo";
import { CITY_CENTRES, CITY_OPTIONS } from "@shared/lib/options";
import type { Address, PatientProfile, PatientRelation } from "@shared/caregiver-types";
import { addressesApi, patientsApi } from "@/features/customer/lib/api/customer";
import { keys } from "@/features/customer/lib/api/keys";
import { isUnreadableMedical } from "@/features/customer/lib/labels";

const GENDERS = ["Female", "Male", "Other"] as const;

type GeoErrorKey = "unsupported" | "denied" | "timeout" | "unavailable";

/** Maps getPosition()'s English messages to translation keys. */
function geoErrorKey(message: string): GeoErrorKey {
  if (message.startsWith("This browser")) return "unsupported";
  if (message.startsWith("Location permission")) return "denied";
  if (message.startsWith("Couldn't get")) return "timeout";
  return "unavailable";
}

export function PatientForm({
  patient,
  onClose,
  onSaved,
}: {
  patient: PatientProfile | null;
  onClose: () => void;
  onSaved?: (p: PatientProfile) => void;
}) {
  const t = useTranslations("customerB.patientForm");
  const tc = useTranslations("common.actions");
  const L = useLabels();
  const genderOptions = GENDERS.map((value) => ({ value, label: L.gender(value) }));
  const [name, setName] = useState(patient?.name ?? "");
  const [relationship, setRelationship] = useState<PatientRelation>(patient?.relationship ?? "FAMILY_MEMBER");
  const [dob, setDob] = useState(patient?.dateOfBirth?.slice(0, 10) ?? "");
  const [gender, setGender] = useState<string | null>(patient?.gender ?? null);
  // An undecryptable value (raw "iv:tag:ciphertext") is never prefilled or saved back.
  const unreadable = isUnreadableMedical(patient?.medicalContext);
  const initialContext = unreadable ? "" : (patient?.medicalContext ?? "");
  const [context, setContext] = useState(initialContext);
  const today = new Date().toISOString().slice(0, 10);
  const valid = name.trim().length >= 1 && (!dob || dob <= today);

  const save = useAction(
    () => {
      const dto = { name: name.trim(), relationship, dateOfBirth: dob || undefined, gender: gender ?? undefined, medicalContext: context.trim() || undefined };
      if (!patient) return patientsApi.create(dto);
      // PATCH: "" clears a readable note (backend stores null); leave an unreadable one untouched unless replaced.
      const medicalContext = context.trim() ? context.trim() : unreadable || !initialContext ? undefined : "";
      return patientsApi.update(patient.id, { ...dto, medicalContext });
    },
    {
      invalidate: [keys.patients],
      success: patient ? t("updated") : t("added"),
      onSuccess: (p) => {
        onSaved?.(p);
        onClose();
      },
    },
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={patient ? t("editTitle", { name: patient.name }) : t("addTitle")}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate(undefined)}>
            {patient ? tc("save") : t("addSubmit")}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-ink-50 p-1 sm:col-span-2" role="radiogroup" aria-label={t("whoFor")}>
          {(
            [
              ["FAMILY_MEMBER", t("familyMember")],
              ["SELF", t("myself")],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={relationship === value}
              onClick={() => setRelationship(value)}
              className={`rounded-lg py-2 text-sm font-semibold transition-colors ${relationship === value ? "bg-white text-ink-900 shadow-card" : "text-ink-500"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <Field label={t("fullName")} required className="sm:col-span-2">
          {(id) => <Input id={id} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder={t("fullNamePlaceholder")} />}
        </Field>
        <Field label={t("dob")} error={dob && dob > today ? t("dobFuture") : null}>
          {(id) => <Input id={id} type="date" max={today} value={dob} onChange={(e) => setDob(e.target.value)} />}
        </Field>
        <Field label={t("gender")}>
          {(id) => <Select inputId={id} value={gender} onChange={setGender} options={genderOptions} placeholder={t("choose")} isClearable />}
        </Field>
        <Field
          label={t("medical")}
          hint={unreadable && !context ? t("medicalUnreadable") : t("medicalHint", { count: context.length })}
          className="sm:col-span-2"
        >
          {(id) => (
            <Textarea
              id={id}
              value={context}
              maxLength={4000}
              rows={4}
              onChange={(e) => setContext(e.target.value)}
              placeholder={t("medicalPlaceholder")}
            />
          )}
        </Field>
      </div>
    </Modal>
  );
}

export function AddressForm({ address, onClose, onSaved }: { address: Address | null; onClose: () => void; onSaved?: (a: Address) => void }) {
  const t = useTranslations("customerB.addressForm");
  const tc = useTranslations("common.actions");
  const [label, setLabel] = useState(address?.label ?? "");
  const [line, setLine] = useState(address?.addressLine ?? "");
  const [city, setCity] = useState<string | null>(address?.city ?? null);
  const [coords, setCoords] = useState<{ lat: string; lng: string; precise: boolean } | null>(
    address ? { lat: address.latitude, lng: address.longitude, precise: true } : null,
  );
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<GeoErrorKey | null>(null);

  const pin = coords ?? (city ? { ...CITY_CENTRES[city], precise: false } : null);
  const valid = line.trim().length >= 3 && !!city && !!pin;

  async function locate() {
    setGeoError(null);
    setLocating(true);
    try {
      const p = await getPosition();
      setCoords({ lat: p.lat.toFixed(6), lng: p.lng.toFixed(6), precise: true });
    } catch (e) {
      setGeoError(geoErrorKey((e as Error).message));
    } finally {
      setLocating(false);
    }
  }

  const save = useAction(
    () => {
      const dto = { label: label.trim() || undefined, addressLine: line.trim(), city: city!, latitude: pin!.lat, longitude: pin!.lng };
      return address ? addressesApi.update(address.id, dto) : addressesApi.create(dto);
    },
    {
      invalidate: [keys.addresses],
      success: address ? t("updated") : t("saved"),
      onSuccess: (a) => {
        onSaved?.(a);
        onClose();
      },
    },
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={address ? t("editTitle") : t("addTitle")}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate(undefined)}>
            {address ? tc("save") : t("saveSubmit")}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("label")} hint={t("labelHint")}>
          {(id) => <Input id={id} value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder={t("labelPlaceholder")} />}
        </Field>
        <Field label={t("city")} required>
          {(id) => <Select inputId={id} value={city} onChange={setCity} options={CITY_OPTIONS} placeholder={t("cityPlaceholder")} isSearchable />}
        </Field>
        <Field label={t("address")} required className="sm:col-span-2" hint={t("addressHint")}>
          {(id) => <Input id={id} value={line} maxLength={240} onChange={(e) => setLine(e.target.value)} placeholder={t("addressPlaceholder")} />}
        </Field>
        <div className="space-y-2 sm:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink-800">{t("mapPin")}</p>
            <Button size="sm" variant="secondary" loading={locating} onClick={locate}>
              <LocateFixed className="size-4" /> {t("useLocation")}
            </Button>
          </div>
          {pin ? (
            <>
              <LocationMap lat={pin.lat} lng={pin.lng} label={line || city || t("selectedLocation")} />
              <p className="flex items-center gap-1.5 text-xs text-ink-500">
                <MapPin className="size-3.5" />
                {pin.precise ? t("pinnedPrecise") : t("pinnedCentre", { city: city ?? "" })}
              </p>
            </>
          ) : (
            <p className="rounded-xl border border-dashed border-ink-200 px-4 py-6 text-center text-sm text-ink-500">{t("noPin")}</p>
          )}
          {geoError && <p className="text-sm text-warning-700">{t(`geo.${geoError}`)}</p>}
        </div>
      </div>
    </Modal>
  );
}

/** Edit form for one patient, loaded fresh with GET /customer/patients/:id. */
export function EditPatientForm({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations("customerB.patientForm");
  const q = useQuery({ queryKey: [...keys.patients, "detail", id], queryFn: () => patientsApi.get(id) });
  if (q.data) return <PatientForm key={q.data.updatedAt} patient={q.data} onClose={onClose} />;
  return (
    <Modal open onClose={onClose} title={t("loadingTitle")}>
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <Skeleton className="h-64" />}
    </Modal>
  );
}

/** Edit form for one address, loaded fresh with GET /customer/addresses/:id. */
export function EditAddressForm({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations("customerB.addressForm");
  const q = useQuery({ queryKey: [...keys.addresses, "detail", id], queryFn: () => addressesApi.get(id) });
  if (q.data) return <AddressForm key={q.data.updatedAt} address={q.data} onClose={onClose} />;
  return (
    <Modal open onClose={onClose} size="lg" title={t("editTitle")}>
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <Skeleton className="h-64" />}
    </Modal>
  );
}
