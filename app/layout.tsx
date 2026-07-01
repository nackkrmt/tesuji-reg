import type { Metadata, Viewport } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import Providers from "./providers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from "@/lib/i18n";

const notoThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-thai",
  display: "swap",
});

// Tab title + description follow the cookie locale so the browser chrome matches
// the in-app language.
export function generateMetadata(): Metadata {
  const cookieLocale = cookies().get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;
  const isEn = locale === "en";
  return {
    applicationName: "TesujiReg",
    title: isEn
      ? "TesujiReg — Go tournament registration"
      : "TesujiReg — ระบบรับสมัครแข่งขันหมากล้อม",
    description: isEn
      ? "Go tournament registration — browse events, register, and pay via PromptPay"
      : "ระบบรับสมัครการแข่งขันกีฬาหมากล้อม — ดูรายละเอียดรายการแข่ง สมัคร และชำระเงินผ่าน PromptPay",
    // iOS "Add to Home Screen" → launches standalone (no Safari chrome).
    appleWebApp: {
      capable: true,
      title: "TesujiReg",
      statusBarStyle: "black-translucent",
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#060912",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieLocale = cookies().get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;

  return (
    <html lang={locale} className={`${notoThai.variable} dark`}>
      <body className="font-sans">
        <Providers initialLocale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
