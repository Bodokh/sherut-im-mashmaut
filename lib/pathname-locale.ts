import { defaultLocale, isLocale, type Locale } from "@/i18n/config";

/** Request header set by proxy so not-found pages can read the public URL. */
export const PATHNAME_HEADER = "x-sim-pathname";

export function localeFromPathname(pathname: string): Locale {
  const segment = pathname.split("?")[0]?.split("/").filter(Boolean)[0];
  if (segment && isLocale(segment) && segment !== defaultLocale) return segment;
  return defaultLocale;
}

export function isStaffPathname(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? "";
  return path === "/staff" || path.startsWith("/staff/");
}
