import { NextRequest, NextResponse } from "next/server";
import { defaultLocale } from "@/i18n/config";

// Permanently clean up the old explicit prefix for the default Hebrew locale.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const defaultPrefix = `/${defaultLocale}`;
  if (pathname === defaultPrefix || pathname.startsWith(`${defaultPrefix}/`)) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(defaultPrefix.length) || "/";
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next internals, API routes, and anything with a file extension.
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
