import type { Metadata } from "next";
import { LocaleProvider } from "@shared/i18n/provider";

export const metadata: Metadata = {
  title: { absolute: "CareSaath Admin", template: "%s · CareSaath Admin" },
  description: "Operations console for the CareSaath home nursing and physiotherapy marketplace.",
};

export default function AdminSectionLayout({ children }: { children: React.ReactNode }) {
  return <LocaleProvider storageKey="caresaath.admin.locale">{children}</LocaleProvider>;
}
