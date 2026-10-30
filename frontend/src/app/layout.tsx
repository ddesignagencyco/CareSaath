import type { Metadata, Viewport } from "next";
import { Noto_Naskh_Arabic, Plus_Jakarta_Sans } from "next/font/google";
import { AppProviders } from "@shared/app/providers";
import { Splash } from "@shared/app/splash";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

/** All Urdu text: Noto Naskh Arabic. */
const urdu = Noto_Naskh_Arabic({
  variable: "--font-urdu",
  subsets: ["arabic"],
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "CareSaath", template: "%s · CareSaath" },
  description: "Verified home nursing and physiotherapy in Pakistan.",
};

export const viewport: Viewport = {
  themeColor: "#167267",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${urdu.variable} h-full antialiased`}>
      {/* suppressHydrationWarning: browser extensions inject attributes on <body> */}
      <body className="min-h-full" suppressHydrationWarning>
        <Splash />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
