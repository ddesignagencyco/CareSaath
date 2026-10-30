import type { Metadata } from "next";
import { LocaleProvider } from "@shared/i18n/provider";

export const metadata: Metadata = {
  title: { absolute: "CareSaath Caregiver", template: "%s · CareSaath Caregiver" },
  description: "Manage your home visits, availability and earnings on CareSaath.",
  appleWebApp: { capable: true, title: "CareSaath", statusBarStyle: "default" },
};

export default function CaregiverSectionLayout({ children }: { children: React.ReactNode }) {
  return <LocaleProvider storageKey="caresaath.caregiver.locale">{children}</LocaleProvider>;
}
