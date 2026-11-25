"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  LogOut,
  QrCode,
  RefreshCw,
  Send,
  Smartphone,
  WifiOff,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@shared/ui/button";
import { Card, CardBody, CardHeader } from "@shared/ui/card";
import { Field, Input } from "@shared/ui/field";
import { Skeleton } from "@shared/ui/misc";
import { whatsappAdminApi } from "@/features/admin/lib/api/admin";
import { keys, useAction } from "@/features/admin/lib/api/hooks";

const PHONE_REGEX = /^\+?[0-9\s-]{10,18}$/;

/**
 * Admin-only WhatsApp OTP Gateway section embedded inside `/admin/settings`.
 * Supports WhatsApp Web-style dual linking: Scan QR Code OR Link with 8-Digit Phone Number Code.
 * Protected server-side by `JwtAuthGuard` + `@Roles(UserRole.ADMIN)`.
 */
export function WhatsAppOtpSection() {
  const [linkMode, setLinkMode] = useState<"qr" | "phone">("qr");
  const [pairPhone, setPairPhone] = useState("");
  const [pairError, setPairError] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [testPhone, setTestPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: [...keys.whatsapp, "status"],
    queryFn: () => whatsappAdminApi.status(),
    refetchInterval: (q) => (q.state.data?.connected ? 15_000 : 3_000),
  });

  const reconnect = useAction(
    async () => {
      setPairingCode(null);
      return whatsappAdminApi.reconnect();
    },
    {
      invalidate: [keys.whatsapp],
      success: "Reconnecting WhatsApp session…",
    },
  );

  const logout = useAction(
    async () => {
      setPairingCode(null);
      setLinkMode("qr");
      return whatsappAdminApi.logout();
    },
    {
      invalidate: [keys.whatsapp],
      success: "WhatsApp session disconnected. Ready to link a new number.",
    },
  );

  const requestPairCode = useAction(
    async () => {
      const res = await whatsappAdminApi.requestPairingCode(pairPhone.trim());
      setPairingCode(res.code);
      setPairError(null);
      return res;
    },
    {
      invalidate: [],
      success: "8-digit pairing code generated — enter it in WhatsApp Linked Devices.",
    },
  );

  const sendTest = useAction(
    async () => {
      const cleaned = testPhone.trim();
      const res = await whatsappAdminApi.sendTest(cleaned);
      setTestPhone("");
      setPhoneError(null);
      return res;
    },
    {
      invalidate: [],
      success: "Test OTP delivered via WhatsApp!",
    },
  );

  const data = statusQuery.data;
  const connected = data?.connected ?? false;

  const badge = connected
    ? { label: "Connected", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" }
    : data?.status === "qr_ready"
      ? { label: "Awaiting Link", cls: "bg-amber-50 text-amber-800 border-amber-200" }
      : data?.status === "logged_out"
        ? { label: "Logged Out", cls: "bg-red-50 text-red-700 border-red-200" }
        : { label: "Connecting…", cls: "bg-ink-50 text-ink-600 border-ink-200" };

  function handleRequestPairingCode(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = pairPhone.trim();
    if (!PHONE_REGEX.test(cleaned)) {
      setPairError("Enter a valid WhatsApp number with country code (e.g. +923001234567)");
      return;
    }
    setPairError(null);
    requestPairCode.mutate(undefined);
  }

  function handleCopyCode() {
    if (!pairingCode) return;
    void navigator.clipboard?.writeText(pairingCode.replace("-", ""));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleSendTest(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = testPhone.trim();
    if (!PHONE_REGEX.test(cleaned)) {
      setPhoneError("Enter a valid phone number (e.g. +923001234567)");
      return;
    }
    setPhoneError(null);
    sendTest.mutate(undefined);
  }

  // Split 8-char code into two 4-char halves for WhatsApp Web-style boxed display
  const rawChars = (pairingCode ?? "").replace(/[^A-Za-z0-9]/g, "").split("");
  const leftChars = rawChars.slice(0, 4);
  const rightChars = rawChars.slice(4, 8);

  return (
    <Card className="mb-6">
      <CardHeader
        title="WhatsApp OTP Gateway"
        description="Link the CareSaath WhatsApp sender number once. If offline, OTPs automatically fall back to Email."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${badge.cls}`}
            >
              <span
                className={`size-2 rounded-full ${
                  connected ? "bg-emerald-500" : data?.status === "qr_ready" ? "bg-amber-500 animate-pulse" : "bg-ink-400"
                }`}
              />
              {badge.label}
            </span>
            <Button
              variant="secondary"
              size="sm"
              loading={reconnect.isPending}
              onClick={() => reconnect.mutate(undefined)}
            >
              <RefreshCw className="size-3.5" />
              Reconnect
            </Button>
            {connected && (
              <Button
                variant="danger"
                size="sm"
                loading={logout.isPending}
                onClick={() => logout.mutate(undefined)}
              >
                <LogOut className="size-3.5" />
                Disconnect
              </Button>
            )}
          </div>
        }
      />
      <CardBody>
        {statusQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-44 rounded-2xl" />
          </div>
        ) : connected ? (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-center">
            <div className="flex items-start gap-3.5 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                <CheckCircle2 className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink-900">WhatsApp OTP Service Active</p>
                <p className="mt-0.5 text-sm text-ink-600">
                  Sender:{" "}
                  <strong className="font-semibold text-ink-900">
                    {data?.user?.phone || "Linked Device"}
                  </strong>
                  {data?.user?.name ? ` (${data.user.name})` : ""}
                </p>
                <p className="mt-1 text-xs text-ink-500">
                  {data?.daysRemaining !== null && data?.daysRemaining !== undefined
                    ? `Session stored in PostgreSQL · ${data.daysRemaining} day(s) remaining (30-day cycle)`
                    : "Session stored securely in PostgreSQL (zero disk files)."}
                </p>
                {data?.expiringSoon && (
                  <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                    ⚠ Session expires within 24 hours — click Disconnect to re-link before expiry.
                  </p>
                )}
              </div>
            </div>

            <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={handleSendTest}>
              <div className="flex-1">
                <Field label="Send Test OTP" error={phoneError ?? undefined}>
                  {(id) => (
                    <Input
                      id={id}
                      value={testPhone}
                      onChange={(e) => {
                        setTestPhone(e.target.value);
                        if (phoneError) setPhoneError(null);
                      }}
                      placeholder="+923001234567"
                    />
                  )}
                </Field>
              </div>
              <Button type="submit" loading={sendTest.isPending} disabled={!testPhone.trim()}>
                <Send className="size-4" />
                Send Test
              </Button>
            </form>
          </div>
        ) : linkMode === "qr" ? (
          /* ===== Mode 1: WhatsApp Web-Style QR Scan View ===== */
          <div className="space-y-5">
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
              <div className="flex size-[220px] shrink-0 items-center justify-center rounded-2xl border border-ink-200 bg-white p-2.5 shadow-2xs">
                {data?.qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={data.qrDataUrl}
                    alt="Scan this QR code in WhatsApp Linked Devices"
                    className="size-full object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-ink-400">
                    {data?.status === "logged_out" ? (
                      <>
                        <WifiOff className="size-7 text-red-500" />
                        <p className="text-xs font-semibold text-red-600">Logged Out</p>
                        <p className="px-3 text-center text-[11px] text-ink-500">
                          Click Reconnect to generate a fresh QR code.
                        </p>
                      </>
                    ) : (
                      <>
                        <QrCode className="size-7 animate-pulse text-brand-500" />
                        <p className="text-xs font-medium text-ink-500">Generating QR…</p>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-3">
                <div>
                  <p className="text-base font-bold text-ink-900">Steps to link via QR code</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-500">
                    Scan once with your dedicated WhatsApp OTP sender phone. While disconnected, all users continue receiving OTPs via
                    Email automatically.
                  </p>
                </div>
                <ol className="space-y-2 text-sm text-ink-700">
                  <li className="flex items-start gap-2.5">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                      1
                    </span>
                    <span>Open <strong>WhatsApp</strong> on the sender phone.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                      2
                    </span>
                    <span>Tap <strong>Menu (⋮)</strong> or <strong>Settings → Linked Devices</strong>.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                      3
                    </span>
                    <span>Tap <strong>Link a Device</strong> and point your phone at this QR code.</span>
                  </li>
                </ol>

                {data?.lastDisconnectReason && (
                  <p className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-1.5 text-xs text-amber-800">
                    Last event: {data.lastDisconnectReason}
                  </p>
                )}
              </div>
            </div>

            {/* WhatsApp Web-style switcher link below QR */}
            <div className="flex items-center justify-between border-t border-ink-100 pt-4">
              <button
                type="button"
                onClick={() => {
                  setLinkMode("phone");
                  setPairingCode(null);
                  setPairError(null);
                }}
                className="group inline-flex items-center gap-2 text-sm font-semibold text-brand-700 transition-colors hover:text-brand-800"
              >
                <Smartphone className="size-4" />
                Link with phone number
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </button>
              <span className="text-xs text-ink-400">No camera needed</span>
            </div>
          </div>
        ) : (
          /* ===== Mode 2: WhatsApp Web-Style Link with Phone Number (8-Digit Code) ===== */
          <div className="space-y-5">
            {!pairingCode ? (
              <form className="max-w-lg space-y-4" onSubmit={handleRequestPairingCode}>
                <div>
                  <p className="text-base font-bold text-ink-900">Enter phone number</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-500">
                    Enter the WhatsApp sender phone number with country code (e.g. <code>+923001234567</code>) to receive an 8-character
                    pairing code.
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <Field label="Sender WhatsApp Number" error={pairError ?? undefined}>
                      {(id) => (
                        <Input
                          id={id}
                          value={pairPhone}
                          onChange={(e) => {
                            setPairPhone(e.target.value);
                            if (pairError) setPairError(null);
                          }}
                          placeholder="+923001234567"
                          required
                        />
                      )}
                    </Field>
                  </div>
                  <Button type="submit" loading={requestPairCode.isPending} disabled={!pairPhone.trim()}>
                    Next
                    <ArrowRight className="size-4" />
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-base font-bold text-ink-900">Enter code on phone</p>
                  <p className="mt-1 text-xs text-ink-500">
                    Linking WhatsApp account <strong className="text-ink-800">{pairPhone}</strong>.{" "}
                    <button
                      type="button"
                      onClick={() => setPairingCode(null)}
                      className="font-semibold text-brand-700 hover:underline"
                    >
                      Edit number
                    </button>
                  </p>
                </div>

                {/* Iconic WhatsApp Web 8-Box Pairing Code Display */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex items-center gap-1.5 rounded-2xl border border-ink-200 bg-ink-25/80 px-4 py-3">
                    {leftChars.map((ch, idx) => (
                      <span
                        key={`l-${idx}`}
                        className="flex size-10 items-center justify-center rounded-xl border border-ink-200 bg-white font-mono text-lg font-extrabold text-ink-900 shadow-2xs"
                      >
                        {ch}
                      </span>
                    ))}
                    <span className="px-1 font-mono text-lg font-bold text-ink-400">-</span>
                    {rightChars.map((ch, idx) => (
                      <span
                        key={`r-${idx}`}
                        className="flex size-10 items-center justify-center rounded-xl border border-ink-200 bg-white font-mono text-lg font-extrabold text-ink-900 shadow-2xs"
                      >
                        {ch}
                      </span>
                    ))}
                  </div>

                  <Button type="button" variant="secondary" size="sm" onClick={handleCopyCode}>
                    {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                    {copied ? "Copied" : "Copy code"}
                  </Button>
                </div>

                <ol className="space-y-1.5 text-xs text-ink-700">
                  <li>1. Open <strong>WhatsApp</strong> on your phone.</li>
                  <li>2. Tap <strong>Menu (⋮)</strong> or <strong>Settings → Linked Devices → Link a Device</strong>.</li>
                  <li>3. Tap <strong>Link with phone number instead</strong> and enter the 8-character code above.</li>
                </ol>
              </div>
            )}

            {/* Back to QR switcher */}
            <div className="border-t border-ink-100 pt-4">
              <button
                type="button"
                onClick={() => {
                  setLinkMode("qr");
                  setPairingCode(null);
                  setPairError(null);
                }}
                className="group inline-flex items-center gap-2 text-sm font-semibold text-brand-700 transition-colors hover:text-brand-800"
              >
                <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
                <QrCode className="size-4" />
                Link with QR code
              </button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
