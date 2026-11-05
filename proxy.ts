import { clerkMiddleware } from "@clerk/nextjs/server";
import { type NextFetchEvent, NextRequest, NextResponse } from "next/server";
import { defaultLocale } from "@/i18n/config";
import { PATHNAME_HEADER } from "@/lib/pathname-locale";
import {
  clerkAuthorizedParties,
  configuredStaffHost,
  isConfiguredStaffHost,
  staffManifest,
  stripStaffMount,
} from "@/lib/staff-host";

const staffManifestPath = "/staff/manifest.webmanifest";
const staffAuthPaths = new Set(["/staff/login", "/staff/signup", "/staff/logout", "/staff/setup"]);
const useDevelopmentProxy = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_") === true;
const authorizedParties = clerkAuthorizedParties(process.env);

const staffProxy = clerkMiddleware(async (auth, request) => {
  const onStaffHost = isStaffHost(request);
  const pathname = requestPathname(request);
  const internalPath = toInternalStaffPath(pathname, onStaffHost);
  const isApi = internalPath === "/api/mentoring" || internalPath.startsWith("/api/mentoring/");
  const isAuthPage = [...staffAuthPaths].some((path) => internalPath === path || internalPath.startsWith(`${path}/`));
  const isPublicStaffAsset = internalPath === "/staff/offline" || internalPath === staffManifestPath;

  // APIs validate identity and staff membership themselves and return JSON 401/403.
  if (!isApi && !isAuthPage && !isPublicStaffAsset) {
    const session = await auth();
    if (!session.isAuthenticated) {
      const login = onStaffHost ? "/login" : "/staff/login";
      return NextResponse.redirect(new URL(login, request.url));
    }
  }

  const response = onStaffHost && internalPath !== pathname
    ? rewriteStaff(request, internalPath)
    : forwardWithPathname(request);
  if (isApi || isAuthPage) response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}, {
  frontendApiProxy: { enabled: useDevelopmentProxy, path: "/__clerk" },
  ...(authorizedParties ? { authorizedParties } : {}),
});

// Permanently clean up the old explicit prefix for the default Hebrew locale.
export function proxy(request: NextRequest, event: NextFetchEvent) {
  const originalPath = request.nextUrl.pathname;
  const pathname = requestPathname(request);
  const onStaffHost = isStaffHost(request);

  if (useDevelopmentProxy && (pathname === "/__clerk" || pathname.startsWith("/__clerk/"))) {
    return staffProxy(request, event);
  }

  if (pathname === "/staff-sw.js") return staffWorker(request, onStaffHost);

  if (pathname === staffManifestPath) {
    if (onStaffHost) return redirectPath(request, "/manifest.webmanifest");
    return manifestResponse(false);
  }

  if (onStaffHost) return proxyStaffHost(request, event);

  const staffHost = configuredStaffHost(process.env);
  if (staffHost && (pathname === "/staff" || pathname.startsWith("/staff/"))) {
    return redirectToStaffHost(request, staffHost);
  }

  const defaultPrefix = `/${defaultLocale}`;
  if (originalPath === defaultPrefix || originalPath.startsWith(`${defaultPrefix}/`)) {
    const url = request.nextUrl.clone();
    url.pathname = originalPath.slice(defaultPrefix.length) || "/";
    return NextResponse.redirect(url, 308);
  }

  if (pathname === "/staff" || pathname.startsWith("/staff/") || pathname === "/api/mentoring" || pathname.startsWith("/api/mentoring/")) {
    return staffProxy(request, event);
  }

  return forwardWithPathname(request);
}

function proxyStaffHost(request: NextRequest, event: NextFetchEvent) {
  const pathname = requestPathname(request);

  if (pathname === "/robots.txt") return staffRobots();
  if (pathname === "/sitemap.xml" || isPublicApi(pathname)) return staffHostNotFound();
  if (pathname === "/manifest.webmanifest") return manifestResponse(true);
  if (pathname === "/staff" || pathname.startsWith("/staff/")) {
    return redirectPath(request, stripStaffMount(request.nextUrl.pathname));
  }

  return staffProxy(request, event);
}

function isStaffHost(request: NextRequest) {
  // next start keeps the internal URL on nextUrl and puts the public host in
  // x-forwarded-host. Vercel sets both to the domain that was requested.
  const forwarded = request.headers.get("x-forwarded-host");
  return [request.nextUrl.hostname, forwarded, request.headers.get("host")].some((value) =>
    isConfiguredStaffHost(value?.split(",")[0], process.env),
  );
}

function requestPathname(request: NextRequest) {
  const { pathname } = request.nextUrl;
  return pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
}

function toInternalStaffPath(pathname: string, onStaffHost: boolean) {
  if (!onStaffHost) return pathname;
  if (pathname === "/api/mentoring" || pathname.startsWith("/api/mentoring/")) return pathname;
  if (pathname === "/__clerk" || pathname.startsWith("/__clerk/")) return pathname;
  if (pathname === "/") return "/staff";
  if (pathname === "/staff" || pathname.startsWith("/staff/")) return pathname;
  return `/staff${pathname}`;
}

function isPublicApi(pathname: string) {
  return pathname === "/api/contact" || pathname.startsWith("/api/contact/")
    || pathname === "/api/revalidate-videos" || pathname.startsWith("/api/revalidate-videos/");
}

function redirectToStaffHost(request: NextRequest, staffHost: string) {
  const url = request.nextUrl.clone();
  url.protocol = "https:";
  url.hostname = staffHost;
  url.port = "";
  url.pathname = stripStaffMount(request.nextUrl.pathname);
  const response = NextResponse.redirect(url, 308);
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

function redirectPath(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  const response = NextResponse.redirect(url, 308);
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

function manifestResponse(atRoot: boolean) {
  return new NextResponse(JSON.stringify(staffManifest(atRoot)), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function staffRobots() {
  return new NextResponse("User-agent: *\nDisallow: /\n", {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function staffHostNotFound() {
  return new NextResponse("Not found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function staffWorker(request: NextRequest, onStaffHost: boolean) {
  const response = forwardWithPathname(request);
  response.headers.set("Service-Worker-Allowed", onStaffHost ? "/" : "/staff");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

function forwardWithPathname(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(PATHNAME_HEADER, request.nextUrl.pathname);
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

function rewriteStaff(request: NextRequest, internalPath: string) {
  const url = request.nextUrl.clone();
  url.pathname = internalPath;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(PATHNAME_HEADER, internalPath);
  const response = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  // next.config matches the browser path. /offline on the staff host never hits the /staff/offline header rule.
  if (internalPath === "/staff/offline") {
    response.headers.set("X-Mentoring-Shell", "anonymous-v1");
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next|api|.*\\..*).*)",
    // Dotted missing URLs still need their trusted English locale pathname.
    "/en/:path*",
    "/staff/:path*",
    "/api/mentoring/:path*",
    "/api/contact",
    "/api/contact/:path*",
    "/api/revalidate-videos",
    "/api/revalidate-videos/:path*",
    "/__clerk/:path*",
    "/robots.txt",
    "/sitemap.xml",
    "/manifest.webmanifest",
    "/staff-sw.js",
  ],
};
