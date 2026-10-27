import { clerkMiddleware } from "@clerk/nextjs/server";
import { type NextFetchEvent, NextRequest, NextResponse } from "next/server";
import { defaultLocale } from "@/i18n/config";
import { PATHNAME_HEADER } from "@/lib/pathname-locale";

const staffAuthPaths = new Set(["/staff/login", "/staff/signup", "/staff/logout", "/staff/setup"]);
const useDevelopmentProxy = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_") === true;

const staffProxy = clerkMiddleware(async (auth, request) => {
  const pathname = request.nextUrl.pathname.replace(/\/$/, "");
  const isApi = pathname === "/api/mentoring" || pathname.startsWith("/api/mentoring/");
  const isAuthPage = [...staffAuthPaths].some((path) => pathname === path || pathname.startsWith(`${path}/`));

  // APIs validate identity and staff membership themselves and return JSON 401/403.
  if (!isApi && !isAuthPage && pathname !== "/staff/offline") {
    const session = await auth();
    if (!session.isAuthenticated) {
      return NextResponse.redirect(new URL("/staff/login", request.url));
    }
  }

  const response = forwardWithPathname(request);
  if (isApi || isAuthPage) response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}, {
  frontendApiProxy: { enabled: useDevelopmentProxy, path: "/__clerk" },
});

// Permanently clean up the old explicit prefix for the default Hebrew locale.
export function proxy(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;

  if (useDevelopmentProxy && (pathname === "/__clerk" || pathname.startsWith("/__clerk/"))) {
    return staffProxy(request, event);
  }

  const defaultPrefix = `/${defaultLocale}`;
  if (pathname === defaultPrefix || pathname.startsWith(`${defaultPrefix}/`)) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(defaultPrefix.length) || "/";
    return NextResponse.redirect(url, 308);
  }

  if (pathname === "/staff" || pathname.startsWith("/staff/") || pathname === "/api/mentoring" || pathname.startsWith("/api/mentoring/")) {
    return staffProxy(request, event);
  }

  return forwardWithPathname(request);
}

function forwardWithPathname(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(PATHNAME_HEADER, request.nextUrl.pathname);
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    "/((?!_next|api|.*\\..*).*)",
    // Dotted missing URLs still need their trusted English locale pathname.
    "/en/:path*",
    "/staff/:path*",
    "/api/mentoring/:path*",
    "/__clerk/:path*",
  ],
};
