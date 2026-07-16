import { NextRequest, NextResponse } from "next/server";
import { locales, defaultLocale } from "@/i18n/config";
import { knownUnprefixedPaths } from "@/lib/routes";

// Ensure every visitor lands on a locale-prefixed path (/he by default).
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const hasLocale = locales.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );
  if (hasLocale) return NextResponse.next();

  if (!knownUnprefixedPaths.includes(pathname)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/${defaultLocale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url, 308);
}

export const config = {
  // Skip Next internals, API routes, and anything with a file extension.
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
