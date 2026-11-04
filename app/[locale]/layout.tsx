import type { Metadata, Viewport } from "next";
import Script from "next/script";
import localFont from "next/font/local";
import publicStyles from "./public.module.css";
import "../globals.css";
import { locales, isLocale, defaultLocale, dir } from "@/i18n/config";
import { SITE_ORIGIN } from "@/lib/routes";
import {
  USERWAY_ACCOUNT_ID,
  USERWAY_TRIGGER_ID,
  USERWAY_WIDGET_SRC,
} from "@/lib/userway";

const bodyFont = localFont({
  src: "./fonts/Heebo-public.woff2",
  variable: "--font-body",
  weight: "100 900",
  display: "swap",
  fallback: ["Arial"],
});

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: requested } = await params;
  // Keep a real document shell for unknown locales. The page calls notFound()
  // so the localized 404 still returns a 404 status inside this <html>.
  const locale = isLocale(requested) ? requested : defaultLocale;

  return (
    // Next.js 16 keeps `scroll-behavior: smooth` during route changes unless
    // this attribute is set. Without it, the page fragment's scrollIntoView()
    // starts on the footer and the new page settles at the bottom.
    <html
      lang={locale}
      dir={dir(locale)}
      className={bodyFont.variable}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body className={`min-h-dvh ${publicStyles.site}`}>
        {children}
        {USERWAY_ACCOUNT_ID ? (
          <Script
            id="userway-widget"
            src={USERWAY_WIDGET_SRC}
            strategy="lazyOnload"
            data-account={USERWAY_ACCOUNT_ID}
            data-trigger={USERWAY_TRIGGER_ID}
            data-mobile="true"
          />
        ) : null}
      </body>
    </html>
  );
}
