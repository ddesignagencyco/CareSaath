"use client";

import clsx from "clsx";
import { BadgeCheck, MapPinned, Siren } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { decodeToken } from "@shared/api/session";
import { LoginScreen } from "@shared/auth/login-screen";
import { MockHint } from "@shared/auth/mock-hint";
import { meApi as caregiverMe } from "@/features/caregiver/lib/api/caregiver";
import { storeTokens as caregiverStoreTokens } from "@/features/caregiver/lib/auth";
import { authApi, meApi } from "@/features/customer/lib/api/customer";
import { USE_MOCKS } from "@/features/customer/lib/api/http";
import { session as customerSession } from "@/features/customer/lib/api/session";
import { clearSession } from "@/features/customer/lib/auth";
import { MOCK_OTP } from "@/features/customer/lib/mock/handlers";

const FEATURES = [
  { icon: BadgeCheck, title: "Verified caregivers", text: "Every nurse and physiotherapist is licence-checked before they appear." },
  { icon: MapPinned, title: "Live visit tracking", text: "Follow each visit to the door, confirmed by an OTP check-in." },
  { icon: Siren, title: "SOS safety", text: "One tap during a visit alerts our team and your emergency contact." },
];

const ROLES = [
  ["customer", "I need care"],
  ["caregiver", "I provide care"],
] as const;

const ALREADY_REGISTERED = "This number is already registered — please log in instead.";

/**
 * The single sign-up. A role toggle routes families to the customer app and
 * caregivers into onboarding. Sign-up is for NEW numbers only: an already
 * registered number is rejected here and sent to the login screen, so you can
 * never sign up "into" someone else's account.
 */
export default function SignupPage() {
  const router = useRouter();
  const [role, setRole] = useState<"customer" | "caregiver">("customer");

  return (
    <LoginScreen
      product="CareSaath"
      headline="Create your CareSaath account"
      features={FEATURES}
      heroFooter="Home nursing & physiotherapy · Pakistan"
      phoneTitle="Create your account"
      phoneDescription="Tell us who you are, then verify your number with a 6-digit code."
      footerNote="We never share your number without your permission."
      aboveFields={
        <div role="radiogroup" aria-label="I want to" className="grid grid-cols-2 gap-1 rounded-xl bg-ink-50 p-1">
          {ROLES.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={role === value}
              onClick={() => setRole(value)}
              className={clsx("rounded-lg py-2.5 text-sm font-semibold transition-colors", role === value ? "bg-white text-ink-900 shadow-card" : "text-ink-500")}
            >
              {label}
            </button>
          ))}
        </div>
      }
      collectName
      nameLabel="Full name"
      namePlaceholder="e.g. Ayesha Khan"
      collectEmail
      emailLabel="Email (optional, for receipts & updates)"
      emailPlaceholder="you@example.com"
      altAction={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-brand-700 hover:underline">
            Log in
          </Link>
        </>
      }
      codeHint={
        USE_MOCKS ? (
          <MockHint>
            <p>
              Demo code: <b className="tabular tracking-widest">{MOCK_OTP}</b>
            </p>
          </MockHint>
        ) : undefined
      }
      requestOtp={authApi.requestOtp}
      verifyOtp={async (phone, code, name, email) => {
        const tokens = await authApi.verifyOtp(phone, code);
        const accountRole = decodeToken(tokens.accessToken)?.role;
        // A caregiver/admin number already has an account — reject sign-up, send them to log in.
        if (accountRole === "ADMIN" || accountRole === "CAREGIVER") {
          await authApi.logout(tokens.refreshToken).catch(() => undefined);
          return ALREADY_REGISTERED;
        }
        // Customer role: a brand-new number is created with an empty name; a non-empty
        // name means the account already belongs to someone — don't take it over.
        customerSession.set({ ...tokens, phone });
        const me = await meApi.get();
        if (me.fullName.trim()) {
          await authApi.logout(tokens.refreshToken).catch(() => undefined);
          clearSession();
          return ALREADY_REGISTERED;
        }
        // Brand-new account → complete sign-up with the chosen role.
        const patch: { fullName?: string; email?: string } = {};
        if (name) patch.fullName = name;
        if (email) patch.email = email;
        if (role === "caregiver") {
          clearSession();
          caregiverStoreTokens(tokens, phone);
          if (Object.keys(patch).length) await caregiverMe.update(patch).catch(() => undefined);
          router.replace("/caregiver/onboarding");
          return;
        }
        if (Object.keys(patch).length) await meApi.update(patch).catch(() => undefined);
        router.replace("/customer");
      }}
    />
  );
}
