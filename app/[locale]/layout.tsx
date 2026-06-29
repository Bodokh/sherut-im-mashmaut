import type { Metadata, Viewport } from "next";
import { Rubik, Assistant } from "next/font/google";
import { notFound } from "next/navigation";
import "../globals.css";
import { locales, isLocale, dir } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

// Strong, Hebrew-first geometric type for display — bold, modern, confident.
const display = Rubik({
  subsets: ["hebrew", "latin"],
  weight: ["500", "600", "700", "800", "900"],
  variable: "--font-display-family",
  display: "swap",
});

// Humanist Hebrew sans for body & UI — warm, modern, highly readable.
const sans = Assistant({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-assistant",
  display: "swap",
});

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
    title: t.meta.title,
    description: t.meta.description,
    openGraph: {
      title: t.meta.title,
      description: t.meta.description,
      type: "website",
      locale: isLocale(locale) && locale === "en" ? "en_US" : "he_IL",
    },
    alternates: { languages: { he: "/he", en: "/en" } },
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
      className={`${display.variable} ${sans.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
