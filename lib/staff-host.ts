import { SITE_ORIGIN } from "./site-origin";

const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

type Env = NodeJS.ProcessEnv;

/** Hostname only, for example `staff.imashmaut.co.il`. Scheme, path, and port are ignored. */
export function configuredStaffHost(env: Env = process.env): string | null {
  const raw = env.NEXT_PUBLIC_STAFF_HOST?.trim().toLowerCase() ?? "";
  if (!raw) return null;
  const host = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").split("/")[0]?.replace(/:\d+$/, "") ?? "";
  if (!HOSTNAME.test(host)) return null;
  if (host === "imashmaut.co.il" || host === "www.imashmaut.co.il") return null;
  return host;
}

export function isConfiguredStaffHost(hostHeader: string | null | undefined, env: Env = process.env): boolean {
  const configured = configuredStaffHost(env);
  if (!configured || !hostHeader) return false;
  return hostHeader.trim().toLowerCase().replace(/:\d+$/, "") === configured;
}

/** True when this build should publish staff URLs at the subdomain root. */
export function staffPathsAtRoot(env: Env = process.env): boolean {
  return configuredStaffHost(env) !== null;
}

/** `/staff/participants?x=1` → `/participants?x=1` when the staff app is mounted at the subdomain root. */
export function staffPublicPath(internalPath: string, atRoot = staffPathsAtRoot()): string {
  if (!atRoot) return internalPath;
  const hashIndex = internalPath.indexOf("#");
  const hash = hashIndex >= 0 ? internalPath.slice(hashIndex) : "";
  const beforeHash = hashIndex >= 0 ? internalPath.slice(0, hashIndex) : internalPath;
  const queryIndex = beforeHash.indexOf("?");
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex) : "";
  const path = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;
  return `${stripStaffMount(path)}${query}${hash}`;
}

/** Browser path → internal `/staff` route, including on the subdomain. */
export function toStaffInternalPath(pathname: string, atRoot = staffPathsAtRoot()): string {
  const queryIndex = pathname.indexOf("?");
  const path = (queryIndex >= 0 ? pathname.slice(0, queryIndex) : pathname) || "/";
  if (path === "/staff" || path.startsWith("/staff/")) return path.length > 1 ? path.replace(/\/$/, "") : path;
  if (!atRoot) return path;
  if (path === "/") return "/staff";
  return `/staff${path.startsWith("/") ? path : `/${path}`}`;
}

export function stripStaffMount(pathname: string): string {
  if (pathname === "/staff" || pathname === "/staff/") return "/";
  if (pathname.startsWith("/staff/")) return pathname.slice("/staff".length) || "/";
  return pathname;
}

/** Origins that may mint the shared Clerk session. Unset until the staff host is configured, so local dev is unchanged. */
export function clerkAuthorizedParties(env: Env = process.env): string[] | undefined {
  const staff = configuredStaffHost(env);
  if (!staff) return undefined;
  const primary = new URL(SITE_ORIGIN);
  const apex = `${primary.protocol}//${primary.hostname.replace(/^www\./, "")}`;
  return [...new Set([primary.origin, apex, `https://${staff}`])];
}

export function staffManifest(atRoot: boolean) {
  const root = atRoot ? "/" : "/staff";
  return {
    id: root,
    name: "ליווי – שירות עם משמעות",
    short_name: "ליווי",
    description: "סביבת העבודה של צוות הליווי בשירות עם משמעות.",
    lang: "he",
    dir: "rtl",
    start_url: root,
    scope: root,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
