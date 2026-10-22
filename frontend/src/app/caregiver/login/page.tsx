"use client";

import { CalendarCheck2, MapPinned, Wallet } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { LoginScreen } from "@shared/auth/login-screen";
import { MockHint } from "@shared/auth/mock-hint";
import { LanguageToggle } from "@shared/i18n/language-toggle";
import { useFmt } from "@shared/i18n/use-fmt";
import { formatPkMobile } from "@shared/lib/phone";
import { authApi, meApi } from "@/features/caregiver/lib/api/caregiver";
import { USE_MOCKS } from "@/features/caregiver/lib/api/http";
import { keys } from "@/features/caregiver/lib/api/keys";
import { session } from "@/features/caregiver/lib/api/session";
import { homeFor, storeTokens } from "@/features/caregiver/lib/auth";
import { MOCK_OTP } from "@/features/caregiver/lib/mock/handlers";

export default function LoginPage() {
  const router = useRouter();
  const client = useQueryClient();
  const t = useTranslations("caregiverA.login");
  const f = useFmt();
  const features = [
    { icon: CalendarCheck2, title: t("features.visits.title"), text: t("features.visits.text") },
    { icon: MapPinned, title: t("features.checkIn.title"), text: t("features.checkIn.text") },
    { icon: Wallet, title: t("features.paid.title"), text: t("features.paid.text") },
  ];
  return (
    <LoginScreen
      product={t("product")}
      headline={t("headline")}
      features={features}
      heroFooter={t("heroFooter")}
      phoneTitle={t("phoneTitle")}
      phoneDescription={t("phoneDescription")}
      footerNote={t("footerNote")}
      topRight={<LanguageToggle />}
      codeHint={
        USE_MOCKS ? (
          <MockHint>
            <p>
              {t.rich("mockCode", {
                code: MOCK_OTP,
                b: (c) => <b className="tabular tracking-widest">{c}</b>,
              })}
            </p>
            <p>
              {t("mockNumbers", { approved: formatPkMobile("+923001110011"), pending: formatPkMobile("+923001110012") })}
            </p>
          </MockHint>
        ) : (
          process.env.NODE_ENV !== "production" && (
            <MockHint>
              <p>{t("devOtp")}</p>
              <p>
                {t("devNumbers", {
                  approved: f.list([formatPkMobile("+923001110011"), formatPkMobile("+923001110012"), formatPkMobile("+923001110013")]),
                  pending: formatPkMobile("+923001110014"),
                })}
              </p>
            </MockHint>
          )
        )
      }
      requestOtp={authApi.requestOtp}
      verifyOtp={async (phone, code) => {
        const tokens = await authApi.verifyOtp(phone, code);
        storeTokens(tokens, phone);
        const me = await meApi.get();
        if (me.role === "ADMIN") {
          session.clear();
          return t("adminError");
        }
        client.setQueryData(keys.me, me);
        router.replace(homeFor(me));
      }}
    />
  );
}
