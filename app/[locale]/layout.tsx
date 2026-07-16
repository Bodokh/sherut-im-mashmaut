import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import Script from "next/script";
import "../globals.css";
import { locales, isLocale, dir } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import {
  USERWAY_ACCOUNT_ID,
  USERWAY_TRIGGER_ID,
  USERWAY_WIDGET_SRC,
} from "@/lib/userway";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getDictionary(isLocale(locale) ? locale : "he");
  return {
    metadataBase: new URL("https://imashmaut.co.il"),
    title: t.meta.title,
    description: t.meta.description,
    openGraph: {
      title: t.meta.title,
      description: t.meta.description,
      type: "website",
      url: `/${locale}`,
      locale: isLocale(locale) && locale === "en" ? "en_US" : "he_IL",
    },
    alternates: {
      canonical: `/${locale}`,
      languages: { he: "/he", en: "/en" },
    },
  };
}

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
