"use client";

/** Two-step phone + OTP sign-in screen shared by the admin and caregiver apps. */

import clsx from "clsx";
import { ArrowLeft, ArrowRight, CheckCircle2, Lock, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useApiErrorText } from "../api/use-action";
import { Logo } from "../brand";
import { formatPkMobile, parsePkMobile } from "../lib/phone";
import { Button } from "../ui/button";
import { Field, Input } from "../ui/field";
import { OtpInput } from "../ui/otp-input";
import { PhoneField } from "../ui/phone-field";
import { useToast } from "../ui/toast";

export interface LoginFeature {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
}

export interface LoginScreenProps {
  /** Shown under the wordmark, e.g. "Admin console". */
  product: string;
  headline: string;
  features: LoginFeature[];
  heroFooter: string;
  phoneTitle: string;
  phoneDescription: string;
  footerNote: string;
  /** Extra content under the code step (e.g. mock-mode hint). */
  codeHint?: React.ReactNode;
  /** Extra content under the phone step (e.g. dev-mode demo numbers). */
  phoneHint?: React.ReactNode;
  /** Top-right control on the form side (e.g. a language toggle). */
  topRight?: React.ReactNode;
  /** `name`/`email` are passed in signup mode (collectName/collectEmail) so signup can send them with the OTP request. */
  requestOtp: (phone: string, name?: string, email?: string) => Promise<unknown>;
  /** Resolve with an error message to show it, or nothing on success. `name`/`email` are set in signup mode. */
  verifyOtp: (phone: string, code: string, name?: string, email?: string) => Promise<string | void>;
  /** Signup mode: also collect the person's name in the first step. */
  collectName?: boolean;
  nameLabel?: string;
  namePlaceholder?: string;
  /** Signup mode: also collect an optional email (for notifications/receipts). */
  collectEmail?: boolean;
  emailLabel?: string;
  emailPlaceholder?: string;
  /** A link to the other auth screen (e.g. "Already have an account? Sign in"). */
  altAction?: React.ReactNode;
  /** Content at the top of the first step, above the name/phone fields (e.g. a role selector). */
  aboveFields?: React.ReactNode;
}

const RESEND_SECONDS = 30;

function Hero({ product, headline, features, heroFooter }: Pick<LoginScreenProps, "product" | "headline" | "features" | "heroFooter">) {
  return (
    <div className="relative hidden min-h-0 overflow-hidden rounded-[28px] bg-gradient-to-br from-brand-600 via-brand-800 to-brand-950 p-10 text-white lg:flex lg:flex-col xl:p-12">
      {/* dot grid + glows */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.14]"
        style={{ backgroundImage: "radial-gradient(white 1px, transparent 1px)", backgroundSize: "22px 22px" }}
        aria-hidden
      />
      <div className="pointer-events-none absolute -top-32 -end-24 size-[28rem] rounded-full bg-brand-400/30 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-40 -start-24 size-[26rem] rounded-full bg-accent-500/25 blur-3xl" aria-hidden />

      <Logo inverted subtitle={product} className="relative" />

      <div className="relative my-auto max-w-lg py-8">
        <h1 className="text-4xl leading-[1.1] font-extrabold tracking-tight xl:text-[2.75rem]">
          {headline}
        </h1>
        <p lang="ur" dir="rtl" className="mt-3 text-2xl text-accent-200">
          گھر پر قابلِ اعتماد دیکھ بھال
        </p>

        <ul className="mt-8 space-y-3 [@media(max-height:620px)]:hidden">
          {features.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex items-center gap-4 rounded-2xl bg-white/[0.04] p-3 pe-4 ring-1 ring-white/10">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15 backdrop-blur">
                <Icon className="size-5 text-accent-400" />
              </span>
              <span>
                <span className="block leading-tight font-bold">{title}</span>
                <span className="mt-1 block text-sm leading-snug text-brand-100/80">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="relative text-xs text-brand-200/80">{heroFooter}</p>
    </div>
  );
}

function Steps({ step }: { step: "phone" | "otp" }) {
  const t = useTranslations("shared.login");
  const items = [t("stepPhone"), t("stepVerify")];
  const current = step === "phone" ? 0 : 1;
  return (
    <ol className="mb-7 flex items-center gap-3" aria-label={t("progress")}>
      {items.map((label, i) => (
        <li key={label} className="flex flex-1 items-center gap-3">
          <span
            className={clsx(
              "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors",
              i < current && "bg-brand-600 text-white",
              i === current && "bg-brand-600 text-white ring-4 ring-brand-100",
              i > current && "bg-ink-100 text-ink-500",
            )}
            aria-current={i === current ? "step" : undefined}
          >
            {i < current ? <CheckCircle2 className="size-4" /> : i + 1}
          </span>
          <span className={clsx("text-sm font-semibold", i <= current ? "text-ink-900" : "text-ink-400")}>{label}</span>
          {i < items.length - 1 && <span className={clsx("h-px flex-1", current > i ? "bg-brand-400" : "bg-ink-200")} />}
        </li>
      ))}
    </ol>
  );
}

export function LoginScreen(props: LoginScreenProps) {
  const t = useTranslations("shared");
  const apiError = useApiErrorText();
  const toast = useToast();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [code, setCode] = useState("");
  // Dev convenience: if the backend returns the OTP in its response (non-production),
  // show it and prefill the input so you don't have to read it from the server console.
  const [devCode, setDevCode] = useState<string | null>(null);
  // Field-format validation stays inline (so you can see which field); submit/API errors go to a toast.
  const [codeInvalid, setCodeInvalid] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const parsed = parsePkMobile(phone);
  const fullPhone = parsed.ok ? parsed.e164 : "";
  const phoneError = touched && !parsed.ok ? t(`phone.${parsed.code}`) : null;
  const nameOk = !props.collectName || name.trim().length >= 2;
  const nameError = props.collectName && touched && !nameOk ? t("login.nameRequired") : undefined;
  const emailOk = !props.collectEmail || !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const emailError = props.collectEmail && touched && !!email.trim() && !emailOk ? t("login.emailInvalid") : undefined;

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setTouched(true);
    // Field-format problems are shown inline (phoneError / nameError / emailError); don't proceed.
    if (!nameOk || !emailOk || !parsed.ok) return;
    setLoading(true);
    try {
      const res = await props.requestOtp(fullPhone, name.trim() || undefined, email.trim() || undefined);
      // Non-production backends may echo the OTP as `devCode`; prefill it so no console is needed.
      const dev = res && typeof res === "object" && typeof (res as { devCode?: unknown }).devCode === "string" ? (res as { devCode: string }).devCode : null;
      setDevCode(dev);
      setStep("otp");
      setCode(dev ?? "");
      setResendIn(RESEND_SECONDS);
      toast.success(t("login.codeSent", { phone: formatPkMobile(fullPhone) }));
    } catch (err) {
      toast.error(err instanceof Error ? apiError(err) : t("login.couldNotSend"));
    } finally {
      setLoading(false);
    }
  }

  async function verify(value = code) {
    if (value.length !== 6 || loading) return;
    setCodeInvalid(false);
    setLoading(true);
    try {
      const message = await props.verifyOtp(fullPhone, value, name.trim(), email.trim());
      if (message) {
        toast.error(message);
        setCodeInvalid(true);
        setCode("");
      } else {
        toast.success(t("login.signedIn"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? apiError(err) : t("login.verificationFailed"));
      setCodeInvalid(true);
      setCode("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid h-dvh overflow-hidden bg-ink-25 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:p-3">
      <Hero {...props} />

      <div className="flex min-h-0 flex-col overflow-y-auto px-4 py-6 sm:px-8 lg:px-12">
        <div className="flex items-center justify-between gap-3">
          <Logo subtitle={props.product} className="lg:invisible" />
          {props.topRight}
        </div>

        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-6">
          <Steps step={step} />

          {step === "phone" ? (
            <form onSubmit={sendCode} noValidate>
              <h2 className="text-3xl font-extrabold tracking-tight text-ink-900">{props.phoneTitle}</h2>
              <p className="mt-2 text-ink-500">{props.phoneDescription}</p>

              {props.aboveFields && <div className="mt-6">{props.aboveFields}</div>}

              {props.collectName && (
                <div className="mt-8">
                  <Field label={props.nameLabel ?? ""} error={nameError} required>
                    {(id) => <Input id={id} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder={props.namePlaceholder} />}
                  </Field>
                </div>
              )}
              {props.collectEmail && (
                <div className="mt-4">
                  <Field label={props.emailLabel ?? ""} error={emailError}>
                    {(id) => <Input id={id} type="email" value={email} maxLength={160} onChange={(e) => setEmail(e.target.value)} placeholder={props.emailPlaceholder} />}
                  </Field>
                </div>
              )}
              <div className="mt-8">
                <PhoneField
                  value={phone}
                  onChange={setPhone}
                  onBlur={() => setTouched(true)}
                  error={phoneError}
                  autoFocus
                />
              </div>

              <Button type="submit" size="lg" className="mt-6 w-full" loading={loading}>
                {t("login.sendCode")} {!loading && <ArrowRight className="rtl:-scale-x-100 size-4" />}
              </Button>

              {props.phoneHint}
              {props.altAction && <div className="mt-6 text-center text-sm text-ink-500">{props.altAction}</div>}
            </form>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                verify();
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setStep("phone");
                  setCodeInvalid(false);
                }}
                className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900"
              >
                <ArrowLeft className="rtl:-scale-x-100 size-4" /> {t("login.differentNumber")}
              </button>

              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600" aria-hidden>
                  <Smartphone className="size-5" />
                </span>
                <h2 className="text-3xl font-extrabold tracking-tight text-ink-900">{t("login.checkPhone")}</h2>
              </div>
              <p className="mt-2 text-ink-500">
                {t.rich("login.enterCode", {
                  phone: () => <span className="tabular font-semibold whitespace-nowrap text-ink-900">{formatPkMobile(fullPhone)}</span>,
                })}
              </p>

              <div className="mt-7">
                <OtpInput value={code} onChange={(v) => { setCode(v); setCodeInvalid(false); }} onComplete={verify} invalid={codeInvalid} disabled={loading} autoFocus />
              </div>

              {devCode && (
                <p className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-accent-50 px-3 py-2 text-center text-xs font-semibold text-accent-700 ring-1 ring-accent-400/30">
                  Dev code <b className="tabular tracking-widest">{devCode}</b> · auto-filled
                </p>
              )}

              <Button type="submit" size="lg" className="mt-6 w-full" loading={loading} disabled={code.length !== 6}>
                {t("login.verify")}
              </Button>

              <p className="mt-5 text-center text-sm text-ink-500">
                {t("login.didntGet")}{" "}
                {resendIn > 0 ? (
                  <span className="tabular font-semibold text-ink-700">{t("login.resendIn", { time: `0:${String(resendIn).padStart(2, "0")}` })}</span>
                ) : (
                  <button type="button" onClick={() => sendCode()} className="font-semibold text-brand-700 hover:underline">
                    {t("login.resend")}
                  </button>
                )}
              </p>

              {props.codeHint}
            </form>
          )}
        </div>

        <p className="flex shrink-0 items-center justify-center gap-1.5 text-center text-xs text-ink-400">
          <Lock className="size-3.5" /> {props.footerNote}
        </p>
      </div>
    </div>
  );
}
