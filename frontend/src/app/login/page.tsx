"use client";

import { BadgeCheck, MapPinned, Siren } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { decodeToken } from "@shared/api/session";
import { LoginScreen } from "@shared/auth/login-screen";
import { MockHint } from "@shared/auth/mock-hint";
import { session as adminSession } from "@/features/admin/lib/api/session";
import { meApi as caregiverMe } from "@/features/caregiver/lib/api/caregiver";
import { session as caregiverSession } from "@/features/caregiver/lib/api/session";
// The OTP endpoints are public and identical across sections; use one client.
import { authApi } from "@/features/customer/lib/api/customer";
import { USE_MOCKS } from "@/features/customer/lib/api/http";
import { session as customerSession } from "@/features/customer/lib/api/session";
import { MOCK_OTP } from "@/features/customer/lib/mock/handlers";
import { homeFor } from "@/features/caregiver/lib/auth";

const FEATURES = [
  { icon: BadgeCheck, title: "Verified caregivers", text: "Every nurse and physiotherapist is licence-checked before they appear." },
  { icon: MapPinned, title: "Live visit tracking", text: "Follow each visit to the door, confirmed by an OTP check-in." },
  { icon: Siren, title: "SOS safety", text: "One tap during a visit alerts our team and your emergency contact." },
];

function LoginInner() {
  const router = useRouter();
  const next = useSearchParams().get("next");

  /** Only follow `next` into the section that matches the role (plus caregiver sign-up). */
  const destinationFor = (base: string) => (next && (next.startsWith(base) || next.startsWith("/caregiver/onboarding")) ? next : base);

  return (
    <LoginScreen
      product="CareSaath"
      headline="Sign in to CareSaath"
      features={FEATURES}
      heroFooter="Home nursing & physiotherapy · Pakistan"
      phoneTitle="Sign in or sign up"
      phoneDescription="Enter your mobile number and we'll send you a one-time code."
      footerNote="We'll take you to the right place based on your account."
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
      verifyOtp={async (phone, code) => {
        const tokens = await authApi.verifyOtp(phone, code);
        const role = decodeToken(tokens.accessToken)?.role;
        const value = { ...tokens, phone };
        if (role === "ADMIN") {
          adminSession.set(value);
          router.replace(destinationFor("/admin"));
        } else if (role === "CAREGIVER") {
          caregiverSession.set(value);
          if (next && next.startsWith("/caregiver")) {
            router.replace(next);
          } else {
            const me = await caregiverMe.get();
            router.replace(homeFor(me));
          }
        } else {
          customerSession.set(value);
          router.replace(destinationFor("/customer"));
        }
      }}
    />
  );
}

export default function LoginPage() {
  // useSearchParams requires a Suspense boundary under Next 16.
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
