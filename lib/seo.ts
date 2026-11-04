import type { Metadata } from "next";
import { defaultLocale, isLocale, type Locale } from "@/i18n/config";
import { getDictionary, type Dictionary } from "@/i18n/dictionaries";
import { absoluteUrl, localizedPath, SITE_ORIGIN, type SiteRouteKey } from "@/lib/routes";

export function buildPageMetadata(
  locale: Locale,
  route: SiteRouteKey,
  dict: Dictionary,
): Metadata {
  const copy = dict.seo[route];
  const canonical = absoluteUrl(locale, route);
  const hebrewUrl = absoluteUrl("he", route);
  const englishUrl = absoluteUrl("en", route);
  // Preview shares must use that branch's artwork, which may not exist on
  // production yet. Search canonicals and language alternates stay official.
  const previewHost = process.env.VERCEL_ENV === "preview"
    ? process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL
    : undefined;
  const socialOrigin = previewHost ? `https://${previewHost}` : SITE_ORIGIN;
  const imageUrl = `${socialOrigin}/og?locale=${locale}&route=${route}&v=3`;
  const imageAlt = `${dict.routeLabels[route]} | ${dict.brand.name}`;

  return {
    title: copy.title,
    description: copy.description,
    alternates: {
      canonical,
      languages: {
        he: hebrewUrl,
        en: englishUrl,
        "x-default": hebrewUrl,
      },
    },
    openGraph: {
      type: "website",
      siteName: dict.brand.name,
      title: copy.title,
      description: copy.description,
      url: `${socialOrigin}${localizedPath(locale, route)}`,
      locale: locale === "he" ? "he_IL" : "en_US",
      alternateLocale: locale === "he" ? ["en_US"] : ["he_IL"],
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: imageAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: copy.title,
      description: copy.description,
      images: [{ url: imageUrl, alt: imageAlt }],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  };
}

export function routeLabel(dict: Dictionary, route: SiteRouteKey): string {
  return dict.routeLabels[route];
}

export function buildNotFoundMetadata(locale: Locale): Metadata {
  const dict = getDictionary(locale);
  return {
    title: `${dict.notFound.documentTitle} | ${dict.brand.name}`,
    description: dict.notFound.lead,
    robots: { index: false, follow: false },
  };
}

export function resolvePageMetadata(locale: string, route: SiteRouteKey): Metadata {
  if (!isLocale(locale)) return buildNotFoundMetadata(defaultLocale);
  return buildPageMetadata(locale, route, getDictionary(locale));
}
