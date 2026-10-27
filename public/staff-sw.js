/* Staff-only offline app shell. Private API, RSC and authentication responses
 * are deliberately never cached here. Authorized records live in leased,
 * account-partitioned IndexedDB and are unlocked by WorkspaceProvider. */
const CACHE = "mentoring-anonymous-shell-v1";
const OFFLINE_ENTRY = "/staff/offline";
const SHELL_HEADER = "anonymous-v1";
const MAX_ASSETS = 256;
let cacheWrites = Promise.resolve();
const CLERK_NUMBER = "(?:0|[1-9]\\d*)";
const CLERK_PRERELEASE = "(?:0|[1-9]\\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)";
const CLERK_VERSION = `${CLERK_NUMBER}(?:\\.${CLERK_NUMBER}\\.${CLERK_NUMBER}(?:-${CLERK_PRERELEASE}(?:\\.${CLERK_PRERELEASE})*)?(?:\\+[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)*)?)?`;
const PROXY_CLERK_SCRIPT = new RegExp(`^/__clerk/npm/@clerk/(?:clerk-js@${CLERK_VERSION}/dist/clerk\\.browser\\.js|ui@${CLERK_VERSION}/dist/ui\\.browser\\.js)$`);
const LEGACY_CLERK_SCRIPT = new RegExp(`^/npm/@clerk/(?:clerk-js@${CLERK_VERSION}/dist/clerk\\.browser\\.js|clerk-ui@${CLERK_VERSION}/dist/clerk\\.ui\\.js)$`);

function isStaffPath(path) { return path === "/staff" || path.startsWith("/staff/"); }
function isAuthPath(path) { return ["/staff/login", "/staff/signup", "/staff/logout"].some((prefix) => path === prefix || path.startsWith(`${prefix}/`)); }
function isClerkPublicScript(url) {
  if (url.username || url.password || url.search || url.hash || url.pathname.includes("%")) return false;
  if (url.origin === self.location.origin) return PROXY_CLERK_SCRIPT.test(url.pathname);
  return url.protocol === "https:" && !url.port && url.hostname.endsWith(".clerk.accounts.dev") && LEGACY_CLERK_SCRIPT.test(url.pathname);
}
function isPublicAsset(url) {
  if (isClerkPublicScript(url)) return true;
  if (url.origin === self.location.origin) return url.pathname.startsWith("/_next/static/") || url.pathname === "/images/logo-mark.png";
  return false;
}
function isCacheablePublicResponse(url, response) {
  if (!isPublicAsset(url) || (!response.ok && response.type !== "opaque")) return false;
  if (!isClerkPublicScript(url)) return true;
  if (response.type === "opaque") return url.origin !== self.location.origin;
  if (url.origin === self.location.origin && response.url) {
    const finalUrl = new URL(response.url);
    if (finalUrl.origin !== url.origin || !isClerkPublicScript(finalUrl)) return false;
  }
  const type = response.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
  return ["application/javascript", "text/javascript", "application/ecmascript", "text/ecmascript", "application/x-javascript"].includes(type);
}

function normalizeClerkProxyResponse(url, response) {
  if (url.origin !== self.location.origin || !isClerkPublicScript(url) || response.status !== 200 ||
      !["basic", "cors", "default"].includes(response.type) || !response.body || response.bodyUsed || response.body.locked ||
      !isCacheablePublicResponse(url, response)) return response;
  if (response.url && new URL(response.url).origin !== url.origin) return response;
  // Keep the public script stream, without its followed-redirect provenance.
  // Fetch has already decoded content codings before exposing it.
  const headers = new Headers(response.headers);
  for (const name of ["Content-Encoding", "Content-Length", "Transfer-Encoding"]) headers.delete(name);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function shellAssets(html) {
  return new Set([...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1].replaceAll("&amp;", "&")).map((value) => new URL(value, self.location.origin)).filter(isPublicAsset).map((url) => url.href));
}

function writeCache(task) {
  const next = cacheWrites.catch(() => undefined).then(task);
  cacheWrites = next.catch(() => undefined);
  return next;
}

async function trim(cache) {
  const shell = await cache.match(OFFLINE_ENTRY);
  const pinned = shell ? shellAssets(await shell.text()) : new Set();
  const keys = await cache.keys();
  const assets = keys.filter((request) => new URL(request.url).pathname !== OFFLINE_ENTRY);
  const removable = assets.filter((request) => !pinned.has(request.url));
  for (const request of removable.slice(0, Math.max(0, assets.length - MAX_ASSETS))) await cache.delete(request);
}

async function cachePublicResponse(cache, request, response) {
  const url = new URL(typeof request === "string" ? request : request.url, self.location.origin);
  if (isCacheablePublicResponse(url, response)) await cache.put(request, response.clone());
}

async function prepareShell() {
  const response = await fetch(OFFLINE_ENTRY, { credentials: "same-origin", cache: "no-store", headers: { "X-Mentoring-Prepare": "1" } });
  if (!response.ok || response.redirected || response.headers.get("X-Mentoring-Shell") !== SHELL_HEADER || !response.headers.get("Content-Type")?.includes("text/html")) return;
  const cache = await caches.open(CACHE);
  const html = await response.clone().text();
  const urls = shellAssets(html);
  if (urls.size > MAX_ASSETS) return;
  const results = await Promise.allSettled([...urls].map(async (url) => {
    const assetUrl = new URL(url);
    const sameOrigin = assetUrl.origin === self.location.origin;
    const asset = await fetch(url, { credentials: sameOrigin ? "same-origin" : "omit", mode: sameOrigin ? "same-origin" : "cors", cache: "reload" });
    if (!asset.ok || !isCacheablePublicResponse(assetUrl, asset)) throw new Error("An offline asset could not be prepared.");
    return { url, asset: normalizeClerkProxyResponse(assetUrl, asset) };
  }));
  if (results.some((result) => result.status !== "fulfilled")) return;
  // Keep a replacement complete before publishing it. Other public requests
  // cannot trim its newly written dependencies while the old HTML is active.
  await writeCache(async () => {
    for (const result of results) await cachePublicResponse(cache, result.value.url, result.value.asset);
    await cache.put(OFFLINE_ENTRY, response);
    await trim(cache);
  });
}

self.addEventListener("install", (event) => { event.waitUntil(self.skipWaiting()); });
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith("mentoring-anonymous-shell-") && name !== CACHE).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "PREPARE_STAFF_SHELL") event.waitUntil(prepareShell().catch(() => undefined));
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET") return;
  if (url.origin === self.location.origin && request.mode === "navigate" && isStaffPath(url.pathname) && !isAuthPath(url.pathname)) {
    event.respondWith((async () => {
      try { return await fetch(request); }
      catch {
        const cached = await (await caches.open(CACHE)).match(OFFLINE_ENTRY);
        return cached ?? new Response("<!doctype html><html lang=\"he\" dir=\"rtl\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>נדרש חיבור</title><body><main><h1>נדרש חיבור ראשוני</h1><p>כדי לעבוד ללא חיבור יש לפתוח את סביבת הליווי עם חיבור ולהמתין להכנתה במכשיר.</p><a href=\"/staff\">ניסיון נוסף</a></main></body></html>", { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
      }
    })());
    return;
  }
  if (!isPublicAsset(url)) return;
  const networkFirst = isClerkPublicScript(url);
  event.respondWith((async () => {
    const cache = await caches.open(CACHE).catch(() => null);
    if (!networkFirst) {
      const cached = await cache?.match(request).catch(() => undefined);
      if (cached) return cached;
    }
    try {
      // Clerk's supported URL may use a major alias, so refresh it online.
      // Preserve the first-party caller's credentials; external SDKs stay anonymous.
      const response = normalizeClerkProxyResponse(url, await fetch(request, networkFirst && url.origin !== self.location.origin ? { credentials: "omit" } : undefined));
      if (cache) {
        const cacheCopy = response.clone();
        event.waitUntil(writeCache(async () => { await cachePublicResponse(cache, request, cacheCopy); await trim(cache); }).catch(() => undefined));
      }
      return response;
    } catch (error) {
      const cached = networkFirst ? await cache?.match(request).catch(() => undefined) : undefined;
      if (cached && isCacheablePublicResponse(url, cached)) return normalizeClerkProxyResponse(url, cached);
      throw error;
    }
  })());
});
