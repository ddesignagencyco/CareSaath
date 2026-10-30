"use client";

import clsx from "clsx";
import { BadgeCheck, MapPinned, Siren } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoginScreen } from "@shared/auth/login-screen";
import { storeTokens as caregiverStoreTokens } from "@/features/caregiver/lib/auth";
import { authApi } from "@/features/customer/lib/api/customer";
import { session as customerSession } from "@/features/customer/lib/api/session";
import { clearSession } from "@/features/customer/lib/auth";

const FEATURES = [
  { icon: BadgeCheck, title: "Verified caregivers", text: "Every nurse and physiotherapist is licence-checked before they appear." },
  { icon: MapPinned, title: "Live visit tracking", text: "Follow each visit to the door, confirmed by an OTP check-in." },
  { icon: Siren, title: "SOS safety", text: "One tap during a visit alerts our team and your emergency contact." },
];

const ROLES = [
  ["customer", "I need care"],
  ["caregiver", "I provide care"],
] as const;

/**
 * The single sign-up. A role toggle routes families to the customer app and
 * caregivers into onboarding. Sign-up uses the real backend `/auth/signup`
 * (+ `/auth/signup/verify`): an already-registered number is rejected with 409
 * at the OTP-request step (shown on the phone step), so you can never sign up
 * "into" someone else's account. The backend creates the account with the
 * chosen role and the name/email supplied here.
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
      requestOtp={(phone, name, email) =>
        authApi.signup({ phone, fullName: (name ?? "").trim(), ...(email ? { email } : {}), role: role === "caregiver" ? "CAREGIVER" : "CUSTOMER" })
      }
      verifyOtp={async (phone, code) => {
        // The backend already has the name/email/role from /auth/signup; this just verifies + issues tokens.
        const tokens = await authApi.signupVerify(phone, code);
        if (role === "caregiver") {
          clearSession();
          caregiverStoreTokens(tokens, phone);
          router.replace("/caregiver/onboarding");
          return;
        }
        customerSession.set({ ...tokens, phone });
        router.replace("/customer");
      }}
    />
  );
}
