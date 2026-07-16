import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import Script from "next/script";
import "../globals.css";
import { locales, isLocale, dir } from "@/i18n/config";
import { SITE_ORIGIN } from "@/lib/routes";
import {
  USERWAY_ACCOUNT_ID,
  USERWAY_TRIGGER_ID,
  USERWAY_WIDGET_SRC,
} from "@/lib/userway";

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
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <html
      lang={locale}
      dir={dir(locale)}
      suppressHydrationWarning
    >
      <body className="min-h-dvh">
        {children}
        {USERWAY_ACCOUNT_ID ? (
          <Script
            id="userway-widget"
            src={USERWAY_WIDGET_SRC}
            strategy="afterInteractive"
            data-account={USERWAY_ACCOUNT_ID}
            data-trigger={USERWAY_TRIGGER_ID}
            data-mobile="true"
          />
        ) : null}
      </body>
    </html>
  );
}
