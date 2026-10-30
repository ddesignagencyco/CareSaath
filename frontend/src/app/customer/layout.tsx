import type { Metadata } from "next";
import { LocaleProvider } from "@shared/i18n/provider";

export const metadata: Metadata = {
  title: { absolute: "CareSaath", template: "%s · CareSaath" },
  description: "Book verified nurses and physiotherapists for care at home.",
  appleWebApp: { capable: true, title: "CareSaath", statusBarStyle: "default" },
};

export default function CustomerSectionLayout({ children }: { children: React.ReactNode }) {
  return <LocaleProvider storageKey="caresaath.customer.locale">{children}</LocaleProvider>;
}
