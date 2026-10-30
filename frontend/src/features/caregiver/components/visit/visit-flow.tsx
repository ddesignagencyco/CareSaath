"use client";

import type { QueryKey } from "@tanstack/react-query";
import clsx from "clsx";
import { Check, Car, KeyRound, LocateFixed, LogIn, LogOut, MapPinned, NotebookPen, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useAction, useApiErrorText } from "@shared/api/use-action";
import { Button } from "@shared/ui/button";
import { OtpInput } from "@shared/ui/otp-input";
import { Textarea } from "@shared/ui/field";
import { formatPkMobile } from "@shared/lib/phone";
import type { CaregiverVisitDetail } from "@shared/caregiver-types";
import { useNow } from "@shared/hooks/use-now";
import { useFmt } from "@shared/i18n/use-fmt";
import { visitsApi } from "@/features/caregiver/lib/api/caregiver";
import { keys } from "@/features/caregiver/lib/api/keys";
import { getPosition } from "@shared/lib/geo";
import { mapsUrl, visitStart } from "@shared/lib/visit";

const STEPS = [
  { key: "travel", icon: Car },
  { key: "checkIn", icon: LogIn },
  { key: "checkOut", icon: LogOut },
  { key: "note", icon: NotebookPen },
] as const;

/** getPosition() rejects with fixed English messages; map them to translated text. */
const GEO_ERRORS: Record<string, "geoUnsupported" | "geoDenied" | "geoTimeout" | "geoUnavailable"> = {
  "This browser can't share your location.": "geoUnsupported",
  "Location permission is off. Allow location for this site in your browser settings.": "geoDenied",
  "Couldn't get your location in time. Move near a window and try again.": "geoTimeout",
  "Your location isn't available right now. Please try again.": "geoUnavailable",
};

function useGeoErrorText() {
  const t = useTranslations("caregiverB.flow");
  return (e: unknown) => {
    const key = e instanceof Error ? GEO_ERRORS[e.message] : undefined;
    return t(key ?? "locationFailed");
  };
}

function stepIndex(status: CaregiverVisitDetail["status"]): number {
  switch (status) {
    case "CONFIRMED":
      return 0;
    case "EN_ROUTE":
      return 1;
    case "CHECKED_IN":
    case "IN_PROGRESS":
      return 2;
    case "CHECKED_OUT":
      return 3;
    case "COMPLETED":
      return 4;
    default:
      return -1;
  }
}

function Stepper({ current }: { current: number }) {
  const t = useTranslations("caregiverB.flow");
  return (
    <ol className="grid grid-cols-4 gap-1" aria-label={t("progress")}>
      {STEPS.map(({ key, icon: Icon }, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <li key={key} className="flex flex-col items-center gap-1.5 text-center">
            <span className="flex w-full items-center">
              <span className={clsx("h-0.5 flex-1", i === 0 ? "invisible" : done || now ? "bg-brand-400" : "bg-ink-200")} />
              <span
                className={clsx(
                  "flex size-9 shrink-0 items-center justify-center rounded-full transition-colors",
                  done && "bg-brand-600 text-white",
                  now && "bg-brand-600 text-white ring-4 ring-brand-100",
                  !done && !now && "bg-ink-100 text-ink-400",
                )}
                aria-current={now ? "step" : undefined}
              >
                {done ? <Check className="size-4" /> : <Icon className="size-4" />}
              </span>
              <span className={clsx("h-0.5 flex-1", i === STEPS.length - 1 ? "invisible" : done ? "bg-brand-400" : "bg-ink-200")} />
            </span>
            <span className={clsx("text-[11px] font-semibold sm:text-xs", done || now ? "text-ink-900" : "text-ink-400")}>{t(`steps.${key}`)}</span>
          </li>
        );
      })}
    </ol>
  );
}

function maskPhone(e164: string) {
  const f = formatPkMobile(e164);
  return f.replace(/(\d{3})(\d{4})$/, (_m, a: string, b: string) => `${a.slice(0, 1)}**${b.slice(-3).padStart(4, "*")}`);
}

/** EN_ROUTE: check in by GPS or by the code SMSed to the family. */
function CheckIn({ visit, invalidate }: { visit: CaregiverVisitDetail; invalidate: QueryKey[] }) {
  const t = useTranslations("caregiverB.flow");
  const apiError = useApiErrorText();
  const geoErrorText = useGeoErrorText();
  const [mode, setMode] = useState<"gps" | "otp">("gps");
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ sentTo: string; at: number } | null>(null);
  const [code, setCode] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);

  const checkIn = useAction((dto: Parameters<typeof visitsApi.checkIn>[1]) => visitsApi.checkIn(visit.id, dto), {
    invalidate,
    success: t("checkedInToast"),
    onError: (err) => {
      // OTP failures are 401s from the API; show them inline, not as "session expired".
      if (mode === "otp") {
        setOtpError(apiError(err));
        setCode("");
        return true;
      }
    },
  });
  const sendCode = useAction(() => visitsApi.checkInOtp(visit.id), {
    invalidate: [],
    success: null,
    onSuccess: (r) => {
      setSent({ sentTo: r.sentTo, at: Date.now() });
      setOtpError(null);
      setCode("");
    },
  });

  async function gps() {
    setGeoError(null);
    setLocating(true);
    try {
      const pos = await getPosition();
      checkIn.mutate({ method: "GPS", lat: pos.lat, lng: pos.lng });
    } catch (e) {
      setGeoError(geoErrorText(e));
    } finally {
      setLocating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-extrabold text-ink-900">{t("checkInTitle")}</h3>
        <p className="text-sm text-ink-500">{t("checkInDesc")}</p>
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-ink-50 p-1" role="tablist">
        {(
          [
            ["gps", t("tabGps"), LocateFixed],
            ["otp", t("tabOtp"), KeyRound],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={clsx(
              "flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition-colors",
              mode === value ? "bg-white text-ink-900 shadow-card" : "text-ink-500",
            )}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>

      {mode === "gps" ? (
        <div className="space-y-3">
          <Button size="lg" className="w-full" loading={locating || checkIn.isPending} onClick={gps}>
            <LocateFixed className="size-4" /> {t("checkInGps")}
          </Button>
          {geoError && (
            <p className="rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-700">
              {geoError}{" "}
              <button className="font-semibold underline" onClick={() => setMode("otp")}>
                {t("useFamilyCode")}
              </button>
            </p>
          )}
          <p className="text-xs text-ink-500">{t("locationPrompt")}</p>
        </div>
      ) : !sent ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-600">{t("otpIntro")}</p>
          <Button size="lg" className="w-full" loading={sendCode.isPending} onClick={() => sendCode.mutate(undefined)}>
            <KeyRound className="size-4" /> {t("sendCode")}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink-600">
            {t.rich("codeSent", {
              phone: maskPhone(sent.sentTo),
              b: (c) => (
                <span dir="ltr" className="tabular font-semibold text-ink-900">
                  {c}
                </span>
              ),
            })}
          </p>
          <OtpInput
            value={code}
            onChange={(v) => {
              setCode(v);
              setOtpError(null);
            }}
            onComplete={(v) => checkIn.mutate({ method: "OTP", code: v })}
            invalid={!!otpError}
            disabled={checkIn.isPending}
            autoFocus
          />
          {otpError && <p className="text-sm font-medium text-danger-600">{otpError}</p>}
          <div className="flex items-center justify-between">
            <button className="text-sm font-semibold text-brand-700 hover:underline" onClick={() => sendCode.mutate(undefined)}>
              {t("newCode")}
            </button>
            <Button loading={checkIn.isPending} disabled={code.length !== 6} onClick={() => checkIn.mutate({ method: "OTP", code })}>
              {t("checkIn")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Check-out with GPS, or an arrival OTP when location is unavailable (mirrors CheckIn). */
function CheckOut({ visit, invalidate }: { visit: CaregiverVisitDetail; invalidate: QueryKey[] }) {
  const t = useTranslations("caregiverB.flow");
  const apiError = useApiErrorText();
  const geoErrorText = useGeoErrorText();
  const [mode, setMode] = useState<"gps" | "otp">("gps");
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ sentTo: string } | null>(null);
  const [code, setCode] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);

  const checkOut = useAction((dto: Parameters<typeof visitsApi.checkOut>[1]) => visitsApi.checkOut(visit.id, dto), {
    invalidate,
    success: t("checkedOutToast"),
    onError: (err) => {
      if (mode === "otp") {
        setOtpError(apiError(err));
        setCode("");
        return true;
      }
    },
  });
  const sendCode = useAction(() => visitsApi.checkInOtp(visit.id), {
    invalidate: [],
    success: null,
    onSuccess: (r) => {
      setSent({ sentTo: r.sentTo });
      setOtpError(null);
      setCode("");
    },
  });

  async function gps() {
    setGeoError(null);
    setLocating(true);
    try {
      const pos = await getPosition();
      checkOut.mutate({ method: "GPS", lat: pos.lat, lng: pos.lng });
    } catch (e) {
      setGeoError(geoErrorText(e));
    } finally {
      setLocating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-ink-50 p-1" role="tablist">
        {(
          [
            ["gps", t("tabGps"), LocateFixed],
            ["otp", t("tabOtp"), KeyRound],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={clsx(
              "flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition-colors",
              mode === value ? "bg-white text-ink-900 shadow-card" : "text-ink-500",
            )}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>

      {mode === "gps" ? (
        <div className="space-y-3">
          <Button size="lg" className="w-full" loading={locating || checkOut.isPending} onClick={gps}>
            <LogOut className="size-4" /> {t("checkOutGps")}
          </Button>
          {geoError && (
            <p className="rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-700">
              {geoError}{" "}
              <button className="font-semibold underline" onClick={() => setMode("otp")}>
                {t("useFamilyCode")}
              </button>
            </p>
          )}
        </div>
      ) : !sent ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-600">{t("otpIntro")}</p>
          <Button size="lg" className="w-full" loading={sendCode.isPending} onClick={() => sendCode.mutate(undefined)}>
            <KeyRound className="size-4" /> {t("sendCode")}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink-600">
            {t.rich("codeSent", {
              phone: maskPhone(sent.sentTo),
              b: (c) => (
                <span dir="ltr" className="tabular font-semibold text-ink-900">
                  {c}
                </span>
              ),
            })}
          </p>
          <OtpInput
            value={code}
            onChange={(v) => {
              setCode(v);
              setOtpError(null);
            }}
            onComplete={(v) => checkOut.mutate({ method: "OTP", code: v })}
            invalid={!!otpError}
            disabled={checkOut.isPending}
            autoFocus
          />
          {otpError && <p className="text-sm font-medium text-danger-600">{otpError}</p>}
          <div className="flex items-center justify-between">
            <button className="text-sm font-semibold text-brand-700 hover:underline" onClick={() => sendCode.mutate(undefined)}>
              {t("newCode")}
            </button>
            <Button loading={checkOut.isPending} disabled={code.length !== 6} onClick={() => checkOut.mutate({ method: "OTP", code })}>
              {t("checkOutConfirm")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Elapsed({ since }: { since: string }) {
  const now = useNow(1000);
  if (!now) return null;
  const s = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return (
    <span dir="ltr" className="tabular text-4xl font-extrabold tracking-tight text-ink-900">
      {h > 0 && `${h}:`}
      {String(m).padStart(h > 0 ? 2 : 1, "0")}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

const NOTE_PROMPTS = ["vitals", "medication", "care", "observations", "advice"] as const;

function NoteForm({ visit, invalidate }: { visit: CaregiverVisitDetail; invalidate: QueryKey[] }) {
  const t = useTranslations("caregiverB.flow");
  const [summary, setSummary] = useState("");
  // Phase 15: a visit can't be completed until its payment is verified (PAID).
  const paid = visit.payments?.some((p) => p.status === "PAID") ?? false;
  const submit = useAction(() => visitsApi.note(visit.id, summary.trim()), {
    invalidate: [...invalidate, keys.earnings],
    success: t("completedToast"),
  });
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-lg font-extrabold text-ink-900">{t("noteTitle")}</h3>
        <p className="text-sm text-ink-500">{t("noteDesc")}</p>
      </div>
      {!paid && <p className="rounded-lg bg-accent-50 px-3 py-2 text-sm font-semibold text-accent-700">{t("paymentRequired")}</p>}
      <div className="flex flex-wrap gap-2">
        {NOTE_PROMPTS.map((k) => {
          const p = t(`prompts.${k}.prefix`);
          return (
            <button
              key={k}
              type="button"
              onClick={() => setSummary((s) => (s && !s.endsWith("\n") ? `${s}\n${p} ` : `${s}${p} `))}
              className="rounded-full border border-ink-200 px-3 py-1 text-xs font-semibold text-ink-600 hover:border-brand-300 hover:bg-brand-50"
            >
              + {t(`prompts.${k}.label`)}
            </button>
          );
        })}
      </div>
      <Textarea
        aria-label={t("noteLabel")}
        value={summary}
        maxLength={4000}
        rows={6}
        placeholder={t("notePlaceholder")}
        onChange={(e) => setSummary(e.target.value)}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="tabular text-xs text-ink-500">{summary.length}/4000</span>
        <Button size="lg" loading={submit.isPending} disabled={!summary.trim()} onClick={() => submit.mutate(undefined)}>
          {t("submitNote")}
        </Button>
      </div>
    </div>
  );
}

export function VisitFlow({ visit }: { visit: CaregiverVisitDetail }) {
  const t = useTranslations("caregiverB.flow");
  const f = useFmt();
  const now = useNow(60_000);
  const invalidate: QueryKey[] = [keys.visits, ["cg-visit", visit.id]];
  const current = stepIndex(visit.status);

  const enRoute = useAction(() => visitsApi.enRoute(visit.id), {
    invalidate,
    success: t("enRouteToast"),
  });

  if (current < 0) return null;
  const startsAt = visitStart(visit.scheduledDate, visit.timeWindowStart);
  const early = now && visit.status === "CONFIRMED" && startsAt - now > 3 * 3600_000;

  return (
    <div className="space-y-6">
      <Stepper current={current} />

      {visit.status === "CONFIRMED" && (
        <div className="space-y-3">
          <div>
            <h3 className="text-lg font-extrabold text-ink-900">{t("readyTitle")}</h3>
            <p className="text-sm text-ink-500">{t("readyDesc")}</p>
          </div>
          {early && <p className="rounded-lg bg-accent-50 px-3 py-2 text-sm text-accent-700">{t("earlyWarning")}</p>}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <a
              href={mapsUrl(visit.booking.address)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-ink-200 bg-white text-sm font-semibold text-ink-800 shadow-card hover:bg-ink-50"
            >
              <MapPinned className="size-4" /> {t("directions")}
            </a>
            <Button size="lg" loading={enRoute.isPending} onClick={() => enRoute.mutate(undefined)}>
              <Car className="size-4" /> {t("startTravel")}
            </Button>
          </div>
        </div>
      )}

      {visit.status === "EN_ROUTE" && <CheckIn visit={visit} invalidate={invalidate} />}

      {(visit.status === "CHECKED_IN" || visit.status === "IN_PROGRESS") && (
        <div className="space-y-4 text-center">
          <div>
            <p className="text-xs font-bold tracking-wide text-brand-700 uppercase">{t("inProgress")}</p>
            {visit.checkInAt && <Elapsed since={visit.checkInAt} />}
            <p className="text-xs text-ink-500">{t("checkedInAt", { time: f.dateTime(visit.checkInAt) })}</p>
          </div>
          <CheckOut visit={visit} invalidate={invalidate} />
        </div>
      )}

      {visit.status === "CHECKED_OUT" && <NoteForm visit={visit} invalidate={invalidate} />}

      {visit.status === "COMPLETED" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl bg-success-50 p-4 text-success-700">
            <Check className="size-5 shrink-0" />
            <p className="text-sm font-semibold">{t("completedAt", { time: f.dateTime(visit.note?.submittedAt ?? visit.checkOutAt) })}</p>
          </div>
          {visit.note && (
            <div>
              <p className="mb-1.5 text-xs font-bold tracking-wide text-ink-500 uppercase">{t("yourNote")}</p>
              <p dir="auto" className="rounded-xl bg-ink-25 p-4 text-sm leading-relaxed whitespace-pre-line text-ink-800">{visit.note.summary}</p>
            </div>
          )}
          {visit.review && (
            <div className="rounded-xl border border-accent-400/30 bg-accent-50/50 p-4">
              <p className="flex items-center gap-0.5" aria-label={t("stars", { rating: visit.review.rating })}>
                {Array.from({ length: 5 }, (_, i) => (
                  <Star key={i} className={clsx("size-4", i < visit.review!.rating ? "fill-accent-500 text-accent-500" : "text-ink-200")} />
                ))}
              </p>
              {visit.review.comment && <p dir="auto" className="mt-2 text-sm text-ink-800">&ldquo;{visit.review.comment}&rdquo;</p>}
              <p className="mt-1 text-xs text-ink-500">{t("familyReview")}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
