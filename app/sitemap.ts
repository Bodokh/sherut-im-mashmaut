import type { MetadataRoute } from "next";
import { locales } from "@/i18n/config";
import { absoluteUrl, siteRouteKeys } from "@/lib/routes";

export default function sitemap(): MetadataRoute.Sitemap {
  return siteRouteKeys.flatMap((route) =>
    locales.map((locale) => ({
      url: absoluteUrl(locale, route),
      alternates: {
        languages: {
          he: absoluteUrl("he", route),
          en: absoluteUrl("en", route),
          "x-default": absoluteUrl("he", route),
        },
      },
    })),
  );
}
