"use client";

import { CalendarCheck2, MapPinned, Wallet } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { LoginScreen } from "@shared/auth/login-screen";
import { DevHint } from "@shared/auth/dev-hint";
import { LanguageToggle } from "@shared/i18n/language-toggle";
import { useFmt } from "@shared/i18n/use-fmt";
import { formatPkMobile } from "@shared/lib/phone";
import { authApi, meApi } from "@/features/caregiver/lib/api/caregiver";
import { keys } from "@/features/caregiver/lib/api/keys";
import { session } from "@/features/caregiver/lib/api/session";
import { homeFor, storeTokens } from "@/features/caregiver/lib/auth";

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
        process.env.NODE_ENV !== "production" && (
          <DevHint>
            <p>{t("devOtp")}</p>
            <p>
              {t("devNumbers", {
                approved: f.list([formatPkMobile("+923001110011"), formatPkMobile("+923001110012"), formatPkMobile("+923001110013")]),
                pending: formatPkMobile("+923001110014"),
              })}
            </p>
          </DevHint>
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
