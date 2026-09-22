import type { MetadataRoute } from "next";
import { locales } from "@/i18n/config";
import { absoluteUrl, siteRouteKeys, type SiteRouteKey } from "@/lib/routes";

// Update a route only when its user-visible primary content changes. These
// dates intentionally do not use build time, which would overstate freshness.
const lastModifiedByRoute: Record<SiteRouteKey, string> = {
  home: "2026-09-22",
  about: "2026-09-22",
  lectures: "2026-08-11",
  guidance: "2026-08-11",
  team: "2026-08-11",
  getInvolved: "2026-08-11",
  faq: "2026-08-11",
  contact: "2026-09-22",
};

export default function sitemap(): MetadataRoute.Sitemap {
  return siteRouteKeys.flatMap((route) =>
    locales.map((locale) => ({
      url: absoluteUrl(locale, route),
      lastModified: lastModifiedByRoute[route],
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
