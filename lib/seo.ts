import type { Metadata } from "next";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { absoluteUrl, SITE_ORIGIN, type SiteRouteKey } from "@/lib/routes";

export function buildPageMetadata(
  locale: Locale,
  route: SiteRouteKey,
  dict: Dictionary,
): Metadata {
  const copy = dict.seo[route];
  const canonical = absoluteUrl(locale, route);
  const hebrewUrl = absoluteUrl("he", route);
  const englishUrl = absoluteUrl("en", route);
  const imageUrl = `${SITE_ORIGIN}/og`;

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
      url: canonical,
      locale: locale === "he" ? "he_IL" : "en_US",
      alternateLocale: locale === "he" ? ["en_US"] : ["he_IL"],
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: dict.meta.ogAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: copy.title,
      description: copy.description,
      images: [{ url: imageUrl, alt: dict.meta.ogAlt }],
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
