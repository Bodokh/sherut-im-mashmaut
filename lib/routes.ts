import { defaultLocale, type Locale } from "@/i18n/config";

export const SITE_ORIGIN = "https://www.imashmaut.co.il";

export const siteRoutes = {
  home: { slug: "" },
  lectures: { slug: "lectures" },
  guidance: { slug: "guidance" },
  team: { slug: "team" },
  getInvolved: { slug: "get-involved" },
  faq: { slug: "faq" },
  contact: { slug: "contact" },
} as const;

export type SiteRouteKey = keyof typeof siteRoutes;

export const siteRouteKeys = Object.keys(siteRoutes) as SiteRouteKey[];

export const nonHomeRouteKeys = siteRouteKeys.filter(
  (key): key is Exclude<SiteRouteKey, "home"> => key !== "home",
);

export function localizedPath(locale: Locale, route: SiteRouteKey): string {
  const slug = siteRoutes[route].slug;
  const localePrefix = locale === defaultLocale ? "" : `/${locale}`;
  if (!slug) return localePrefix || "/";
  return `${localePrefix}/${slug}`;
}

export function absoluteUrl(locale: Locale, route: SiteRouteKey): string {
  return `${SITE_ORIGIN}${localizedPath(locale, route)}`;
}

export function routeFromSlug(slug: string): SiteRouteKey | undefined {
  return siteRouteKeys.find((key) => siteRoutes[key].slug === slug);
}

export const knownUnprefixedPaths = siteRouteKeys.map((key) => {
  const slug = siteRoutes[key].slug;
  return slug ? `/${slug}` : "/";
});
