"use client";

import { BadgeCheck, FileCheck2, Siren } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { LoginScreen } from "@shared/auth/login-screen";
import { DevHint } from "@shared/auth/dev-hint";
import { LanguageToggle } from "@shared/i18n/language-toggle";
import { authApi } from "@/features/admin/lib/api/admin";
import { decodeToken, session } from "@/features/admin/lib/api/session";
import { formatPkMobile } from "@shared/lib/phone";

/** Seeded admin (backend/prisma/seed.mjs). */
const DEMO_ADMIN_PHONE = "+923000000000";
const SHOW_DEV_HINT = process.env.NODE_ENV !== "production";

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations("adminA.login");
  const features = [
    { icon: BadgeCheck, title: t("features.credentials.title"), text: t("features.credentials.text") },
    { icon: Siren, title: t("features.safety.title"), text: t("features.safety.text") },
    { icon: FileCheck2, title: t("features.audit.title"), text: t("features.audit.text") },
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
      phoneHint={
        SHOW_DEV_HINT && (
          <DevHint>
            <p>{t("devOtpHint")}</p>
            <p>{t("devDemoNumbers", { phone: `\u2066${formatPkMobile(DEMO_ADMIN_PHONE)}\u2069` })}</p>
          </DevHint>
        )
      }
      codeHint={
        SHOW_DEV_HINT && (
          <DevHint>
            <p>{t("devOtpHint")}</p>
          </DevHint>
        )
      }
      requestOtp={authApi.requestOtp}
      verifyOtp={async (phone, code) => {
        const tokens = await authApi.verifyOtp(phone, code);
        if (decodeToken(tokens.accessToken)?.role !== "ADMIN") {
          // The API signs in any phone (unknown numbers become CUSTOMERs), so a
          // non-admin gets a valid session here: revoke it and don't store it.
          await authApi.logout(tokens.refreshToken).catch(() => undefined);
          return t("notAdmin");
        }
        session.set({ ...tokens, phone });
        router.replace("/admin");
      }}
    />
  );
}
