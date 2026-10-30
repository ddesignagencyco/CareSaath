"use client";

import { useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, MapPinned, Siren } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LoginScreen } from "@shared/auth/login-screen";
import { DevHint } from "@shared/auth/dev-hint";
import { LanguageToggle } from "@shared/i18n/language-toggle";
import { formatPkMobile } from "@shared/lib/phone";
import { authApi, meApi } from "@/features/customer/lib/api/customer";
import { keys } from "@/features/customer/lib/api/keys";
import { clearSession, storeTokens } from "@/features/customer/lib/auth";

const FEATURES = [
  { icon: BadgeCheck, key: "verified" },
  { icon: MapPinned, key: "track" },
  { icon: Siren, key: "safety" },
] as const;

export default function CustomerLoginPage() {
  const router = useRouter();
  const client = useQueryClient();
  const t = useTranslations("customerA.login");
  return (
    <LoginScreen
      topRight={<LanguageToggle />}
      product={t("product")}
      headline={t("headline")}
      features={FEATURES.map(({ icon, key }) => ({ icon, title: t(`features.${key}.title`), text: t(`features.${key}.text`) }))}
      heroFooter={t("heroFooter")}
      phoneTitle={t("phoneTitle")}
      phoneDescription={t("phoneDescription")}
      footerNote={t("footerNote")}
      codeHint={
        process.env.NODE_ENV !== "production" && (
          <DevHint>
            <p>{t("devCode")}</p>
            <p>{t("devNumbers", { ayesha: formatPkMobile("+923001110001"), bilal: formatPkMobile("+923001110002") })}</p>
          </DevHint>
        )
      }
      requestOtp={authApi.requestOtp}
      verifyOtp={async (phone, code) => {
        const tokens = await authApi.verifyOtp(phone, code);
        storeTokens(tokens, phone);
        const me = await meApi.get();
        if (me.role !== "CUSTOMER") {
          // The backend issued tokens for a caregiver/admin number: revoke them and stay signed out.
          await authApi.logout(tokens.refreshToken).catch(() => undefined);
          clearSession();
          return me.role === "CAREGIVER" ? t("roleCaregiver") : t("roleOther");
        }
        client.setQueryData(keys.me, me);
        router.replace("/customer");
      }}
    />
  );
}
