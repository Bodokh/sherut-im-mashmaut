import { AsyncLocalStorage } from "node:async_hooks";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

// Next's console patch calls AsyncLocalStorage.exit. Node does not expose that
// constructor on globalThis, so Next substitutes a fake that throws when a
// response body is read after the test's synchronous section.
if (!globalThis.AsyncLocalStorage) globalThis.AsyncLocalStorage = AsyncLocalStorage;

import * as staffHost from "../../../lib/staff-host.ts";

const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");
const { unstable_doesMiddlewareMatch: doesProxyMatch } = require("next/experimental/testing/server");
const localeConfig = require("../../../i18n/config.ts");
const staffHostName = "staff.imashmaut.co.il";
const developmentKey = `pk_test_${Buffer.from("clerk.example.test$").toString("base64")}`;
const productionKey = `pk_live_${Buffer.from("clerk.example.test$").toString("base64")}`;

function loadSource(relativePath, dependencies, publishableKey, extraEnv = {}) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const compiledModule = { exports: {} };
  new Function("require", "module", "exports", "process", compiled)((specifier) => {
    if (Object.hasOwn(dependencies, specifier)) return dependencies[specifier];
    return require(specifier);
  }, compiledModule, compiledModule.exports, { env: { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey, ...extraEnv } });
  return compiledModule.exports;
}

const pathnameConfig = loadSource("../../../lib/pathname-locale.ts", { "@/i18n/config": localeConfig });

function loadProxy(publishableKey, extraEnv = {}) {
  const calls = [];
  const middlewareResponse = new Response(null, { status: 299 });
  let handler;
  let options;
  const loaded = loadSource("../../../proxy.ts", {
    "@clerk/nextjs/server": {
      clerkMiddleware: (callback, config) => {
        handler = callback;
        options = config;
        return (request, event) => {
          calls.push({ request, event });
          return middlewareResponse;
        };
      },
    },
    "@/i18n/config": localeConfig,
    "@/lib/pathname-locale": pathnameConfig,
    "@/lib/staff-host": staffHost,
  }, publishableKey, extraEnv);
  return { ...loaded, calls, handler, options, middlewareResponse };
}

test("Clerk proxy includes public scripts and dispatches only its exact prefix", () => {
  const loaded = loadProxy(developmentKey);
  assert.deepEqual(loaded.options.frontendApiProxy, { enabled: true, path: "/__clerk" });
  for (const pathname of [
    "/__clerk",
    "/__clerk/v1/client",
    "/__clerk/npm/@clerk/clerk-js@6/dist/clerk.browser.js",
    "/__clerk/npm/@clerk/ui@1/dist/ui.browser.js",
  ]) {
    assert.equal(doesProxyMatch({ config: loaded.config, nextConfig: {}, url: pathname }), true, pathname);
    const request = new NextRequest(`https://example.test${pathname}`);
    const event = {};
    assert.equal(loaded.proxy(request, event), loaded.middlewareResponse, pathname);
    assert.deepEqual(loaded.calls.at(-1), { request, event });
  }
  const count = loaded.calls.length;
  for (const pathname of ["/__clerkx", "/__clerkx/file.js", "/en", "/about"]) {
    assert.equal(loaded.proxy(new NextRequest(`https://example.test${pathname}`), {}).headers.get("x-middleware-next"), "1", pathname);
  }
  assert.equal(loaded.calls.length, count);
  for (const pathname of ["/_next/static/chunk.js", "/public-file.js", "/__clerkx/file.js", "/english/missing.html", "/enclave/missing.html"]) {
    assert.equal(doesProxyMatch({ config: loaded.config, nextConfig: {}, url: pathname }), false, pathname);
  }
});

test("production keys use Clerk DNS and leave the first-party proxy inactive", () => {
  const loaded = loadProxy(productionKey);
  assert.equal(loaded.options.frontendApiProxy.enabled, false);
  for (const pathname of ["/__clerk", "/__clerk/v1/environment", "/__clerk/npm/@clerk/clerk-js@6/dist/clerk.browser.js"]) {
    const request = new NextRequest(`https://www.example.test${pathname}`);
    const response = loaded.proxy(request, {});
    assert.equal(response.headers.get("x-middleware-next"), "1", pathname);
    assert.equal(response.headers.get(`x-middleware-request-${pathnameConfig.PATHNAME_HEADER}`), pathname);
  }
  assert.equal(loaded.calls.length, 0);
});

test("provider uses the proxy only for development keys and keeps anonymous static rendering", () => {
  const ClerkProvider = () => null;
  for (const [key, expectedProxyUrl] of [[developmentKey, "/__clerk"], [productionKey, undefined], [undefined, undefined]]) {
    const { StaffAuthProvider } = loadSource("../../../components/staff/auth/auth-provider.tsx", {
      "@clerk/nextjs": { ClerkProvider },
      "@clerk/localizations": { heIL: {} },
      "@/lib/staff-host": staffHost,
    }, key);
    const element = StaffAuthProvider({ children: "public shell" });
    assert.equal(element.type, ClerkProvider);
    assert.equal(element.props.proxyUrl, expectedProxyUrl);
    assert.equal(Object.hasOwn(element.props, "proxyUrl"), expectedProxyUrl !== undefined);
    assert.equal(element.props.dynamic, false);
    assert.equal(element.props.children, "public shell");
    assert.equal(element.props.signInUrl, "/staff/login");
    assert.equal(element.props.signUpUrl, "/staff/signup");
    assert.equal(element.props.afterSignOutUrl, "/staff/login");
    assert.equal(element.props.isSatellite, undefined);
    assert.equal(element.props.allowedRedirectOrigins, undefined);
  }
});

test("production and missing-key paths retain Clerk staff/API delegation and fail closed on unavailable auth", async () => {
  for (const key of [productionKey, undefined, ""]) {
    const loaded = loadProxy(key);
    assert.equal(loaded.options.frontendApiProxy.enabled, false);
    for (const pathname of ["/staff", "/staff/login/google-callback", "/api/mentoring/workspace"]) {
      assert.equal(loaded.proxy(new NextRequest(`https://www.example.test${pathname}`), {}), loaded.middlewareResponse, pathname);
    }
    const authError = new Error("Clerk authentication unavailable");
    await assert.rejects(loaded.handler(async () => { throw authError; }, new NextRequest("https://www.example.test/staff/cases")), authError);
  }
});

test("existing staff/API dispatch and Hebrew canonical redirects remain intact", () => {
  const loaded = loadProxy(developmentKey);
  for (const pathname of ["/staff", "/staff/login", "/staff/offline", "/api/mentoring", "/api/mentoring/workspace"]) {
    assert.equal(loaded.proxy(new NextRequest(`https://example.test${pathname}`), {}), loaded.middlewareResponse, pathname);
  }
  for (const [pathname, canonical] of [["/he", "/"], ["/he/about", "/about"], ["/he/__clerk", "/__clerk"]]) {
    const response = loaded.proxy(new NextRequest(`https://example.test${pathname}?source=test`), {});
    assert.equal(response.status, 308);
    assert.equal(response.headers.get("location"), `https://example.test${canonical}?source=test`);
  }
  assert.equal(doesProxyMatch({ config: loaded.config, nextConfig: {}, url: "/api/internal/mentoring/reminders" }), false);
  const clerkCalls = loaded.calls.length;
  loaded.proxy(new NextRequest("https://example.test/api/internal/mentoring/reminders"), {});
  assert.equal(loaded.calls.length, clerkCalls);
});

test("staff callback retains authentication and private API/auth-page cache rules", async () => {
  const loaded = loadProxy(developmentKey);
  let authCalls = 0;
  const auth = async () => { authCalls++; return { isAuthenticated: false }; };
  const protectedResponse = await loaded.handler(auth, new NextRequest("https://example.test/staff/cases"));
  assert.equal(authCalls, 1);
  assert.equal(protectedResponse.headers.get("location"), "https://example.test/staff/login");
  for (const pathname of ["/staff/login", "/staff/login/google-callback", "/staff/login?google=continue", "/staff/signup", "/staff/logout", "/staff/setup", "/api/mentoring/workspace"]) {
    const response = await loaded.handler(auth, new NextRequest(`https://example.test${pathname}`));
    assert.equal(response.headers.get("cache-control"), "private, no-store", pathname);
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow", pathname);
  }
  const offlineResponse = await loaded.handler(auth, new NextRequest("https://example.test/staff/offline"));
  assert.equal(offlineResponse.headers.get("x-middleware-next"), "1");
  assert.equal(authCalls, 1);
});

test("public pathname forwarding replaces spoofed headers and retains unrelated request headers", () => {
  const loaded = loadProxy(developmentKey);
  for (const pathname of ["/missing-page?lang=en", "/en/missing-page?source=test", "/en/missing.html?source=test", "/en/folder/missing.pdf"]) {
    assert.equal(doesProxyMatch({ config: loaded.config, nextConfig: {}, url: pathname }), true, pathname);
    const request = new NextRequest(`https://example.test${pathname}`, {
      headers: { [pathnameConfig.PATHNAME_HEADER]: "/staff/spoofed", "x-preserved": "original" },
    });
    const response = loaded.proxy(request, {});
    assert.equal(response.headers.get("x-middleware-next"), "1");
    assert.equal(response.headers.get(`x-middleware-request-${pathnameConfig.PATHNAME_HEADER}`), request.nextUrl.pathname);
    assert.equal(response.headers.get("x-middleware-request-x-preserved"), "original");
    assert.equal(response.headers.get(pathnameConfig.PATHNAME_HEADER), null);
    assert.equal(request.headers.get(pathnameConfig.PATHNAME_HEADER), "/staff/spoofed");
    if (pathname.startsWith("/en/")) {
      assert.equal(pathnameConfig.localeFromPathname(response.headers.get(`x-middleware-request-${pathnameConfig.PATHNAME_HEADER}`)), "en");
    }
  }
  assert.equal(loaded.calls.length, 0);
});

test("staff continuations forward the request pathname without weakening auth or cache boundaries", async () => {
  const loaded = loadProxy(developmentKey);
  let authCalls = 0;
  const auth = async () => { authCalls++; return { isAuthenticated: true }; };
  for (const pathname of ["/staff/participants/missing?tab=history", "/staff/login/google-callback?state=test", "/api/mentoring/workspace?view=test"]) {
    const request = new NextRequest(`https://example.test${pathname}`, {
      headers: { [pathnameConfig.PATHNAME_HEADER]: "/en/spoofed", "x-preserved": "original" },
    });
    const response = await loaded.handler(auth, request);
    assert.equal(response.headers.get("x-middleware-next"), "1");
    assert.equal(response.headers.get(`x-middleware-request-${pathnameConfig.PATHNAME_HEADER}`), request.nextUrl.pathname);
    assert.equal(response.headers.get("x-middleware-request-x-preserved"), "original");
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
    if (!pathname.startsWith("/staff/participants/")) assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  assert.equal(authCalls, 1);
});

const staffEnv = { NEXT_PUBLIC_STAFF_HOST: staffHostName };
const parties = ["https://www.imashmaut.co.il", "https://imashmaut.co.il", `https://${staffHostName}`];

test("an unset staff host keeps /staff on the current host and does not restrict Clerk parties", () => {
  const loaded = loadProxy(productionKey);
  assert.equal(loaded.options.authorizedParties, undefined);
  assert.equal(loaded.options.isSatellite, undefined);
  const response = loaded.proxy(new NextRequest("https://www.imashmaut.co.il/staff/participants?tab=1"), {});
  assert.equal(response, loaded.middlewareResponse);
  assert.equal(loaded.proxy(new NextRequest("https://staff.imashmaut.co.il/"), {}).headers.get("x-middleware-next"), "1");
});

test("production redirects /staff to the configured staff host and rewrites that host onto the staff app", async () => {
  const loaded = loadProxy(productionKey, staffEnv);
  assert.deepEqual(loaded.options.authorizedParties, parties);
  assert.equal(loaded.options.frontendApiProxy.enabled, false);
  assert.equal(loaded.options.isSatellite, undefined);

  for (const [from, to] of [
    ["https://www.imashmaut.co.il/staff/participants?tab=1", `https://${staffHostName}/participants?tab=1`],
    ["https://www.imashmaut.co.il/staff/", `https://${staffHostName}/`],
    ["https://imashmaut.co.il/staff", `https://${staffHostName}/`],
    [`https://${staffHostName}/staff/students?tab=1`, `https://${staffHostName}/students?tab=1`],
  ]) {
    const response = loaded.proxy(new NextRequest(from), {});
    assert.equal(response.status, 308, from);
    assert.equal(response.headers.get("location"), to, from);
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow", from);
  }

  const home = new NextRequest(`https://${staffHostName}/`);
  assert.equal(loaded.proxy(home, {}), loaded.middlewareResponse);
  const students = new NextRequest(`https://${staffHostName}/students?tab=1`);
  assert.equal(loaded.proxy(students, {}), loaded.middlewareResponse);
  assert.equal(loaded.proxy(new NextRequest(`https://${staffHostName}/api/mentoring/workspace`), {}), loaded.middlewareResponse);

  const auth = async () => ({ isAuthenticated: true });
  const anonymous = async () => ({ isAuthenticated: false });
  const rewritten = await loaded.handler(auth, students);
  assert.equal(rewritten.headers.get("x-middleware-rewrite"), `https://${staffHostName}/staff/students?tab=1`);
  assert.equal(rewritten.headers.get(`x-middleware-request-${pathnameConfig.PATHNAME_HEADER}`), "/staff/students");
  assert.equal(rewritten.headers.get("x-robots-tag"), "noindex, nofollow");
  const homeRewrite = await loaded.handler(auth, home);
  assert.equal(homeRewrite.headers.get("x-middleware-rewrite"), `https://${staffHostName}/staff`);
  const login = await loaded.handler(anonymous, new NextRequest(`https://${staffHostName}/participants`));
  assert.equal(login.headers.get("location"), `https://${staffHostName}/login`);
  const loginPage = await loaded.handler(anonymous, new NextRequest(`https://${staffHostName}/login/google-callback?state=test`));
  assert.equal(loginPage.headers.get("x-middleware-rewrite"), `https://${staffHostName}/staff/login/google-callback?state=test`);
  assert.equal(loginPage.headers.get("cache-control"), "private, no-store");

  const about = await loaded.handler(auth, new NextRequest(`https://${staffHostName}/about`));
  assert.equal(about.headers.get("x-middleware-rewrite"), `https://${staffHostName}/staff/about`);
  const offline = await loaded.handler(anonymous, new NextRequest(`https://${staffHostName}/offline`));
  assert.equal(offline.headers.get("x-middleware-rewrite"), `https://${staffHostName}/staff/offline`);
  assert.equal(offline.headers.get("x-mentoring-shell"), "anonymous-v1");
  assert.equal(offline.headers.get("cache-control"), "private, no-store");
  assert.equal(loaded.proxy(new NextRequest(`https://${staffHostName}/he/about`), {}), loaded.middlewareResponse);
  assert.equal(loaded.proxy(new NextRequest("https://www.imashmaut.co.il/about"), {}).headers.get("x-middleware-next"), "1");
  const hebrew = loaded.proxy(new NextRequest("https://www.imashmaut.co.il/he/about?source=test"), {});
  assert.equal(hebrew.status, 308);
  assert.equal(hebrew.headers.get("location"), "https://www.imashmaut.co.il/about?source=test");
});

test("the staff host serves its own manifest, robots, and worker scope and hides the public site", async () => {
  const loaded = loadProxy(productionKey, staffEnv);
  const manifest = await loaded.proxy(new NextRequest(`https://${staffHostName}/manifest.webmanifest`), {}).json();
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.id, "/");
  assert.equal(manifest.short_name, "ליווי");
  const mounted = await loaded.proxy(new NextRequest("https://www.example.test/staff/manifest.webmanifest"), {}).json();
  assert.equal(mounted.start_url, "/staff");
  assert.equal(mounted.scope, "/staff");
  assert.equal(loaded.proxy(new NextRequest("https://www.imashmaut.co.il/manifest.webmanifest"), {}).headers.get("x-middleware-next"), "1");

  const robots = loaded.proxy(new NextRequest(`https://${staffHostName}/robots.txt`), {});
  assert.match(await robots.text(), /^User-agent: \*\nDisallow: \/\n$/);
  assert.equal(robots.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(loaded.proxy(new NextRequest("https://www.imashmaut.co.il/robots.txt"), {}).headers.get("x-middleware-next"), "1");
  assert.equal(loaded.proxy(new NextRequest("https://www.imashmaut.co.il/sitemap.xml"), {}).headers.get("x-middleware-next"), "1");

  for (const path of ["/sitemap.xml", "/api/contact", "/api/revalidate-videos"]) {
    const response = loaded.proxy(new NextRequest(`https://${staffHostName}${path}`), {});
    assert.equal(response.status, 404, path);
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow", path);
    assert.equal(loaded.calls.length, 0, path);
  }
  assert.equal(loaded.proxy(new NextRequest("https://www.imashmaut.co.il/api/contact"), {}).headers.get("x-middleware-next"), "1");

  const forwarded = new NextRequest("http://localhost:3100/participants?tab=1", { headers: { "x-forwarded-host": staffHostName } });
  assert.equal(loaded.proxy(forwarded, {}), loaded.middlewareResponse);
  const forwardedRewrite = await loaded.handler(async () => ({ isAuthenticated: true }), forwarded);
  assert.equal(forwardedRewrite.headers.get("x-middleware-rewrite"), "http://localhost:3100/staff/participants?tab=1");
  const forwardedRobots = loaded.proxy(new NextRequest("http://localhost:3100/robots.txt", { headers: { "x-forwarded-host": `ignored.example, ${staffHostName}` } }), {});
  assert.equal(forwardedRobots.headers.get("x-middleware-next"), "1");

  const worker = loaded.proxy(new NextRequest(`https://${staffHostName}/staff-sw.js`), {});
  assert.equal(worker.headers.get("service-worker-allowed"), "/");
  const mainWorker = loaded.proxy(new NextRequest("https://www.imashmaut.co.il/staff-sw.js"), {});
  assert.equal(mainWorker.headers.get("service-worker-allowed"), "/staff");
  for (const path of ["/robots.txt", "/sitemap.xml", "/manifest.webmanifest", "/staff-sw.js", "/api/contact"]) {
    assert.equal(doesProxyMatch({ config: loaded.config, nextConfig: {}, url: path }), true, path);
  }
  assert.equal(doesProxyMatch({ config: loaded.config, nextConfig: {}, url: "/api/internal/mentoring/reminders" }), false);
  assert.equal(doesProxyMatch({ config: loaded.config, nextConfig: {}, url: "/_next/static/chunk.js" }), false);
});

test("Clerk sign-in URLs are root-relative only when the staff host is configured", () => {
  const ClerkProvider = () => null;
  const { StaffAuthProvider } = loadSource("../../../components/staff/auth/auth-provider.tsx", {
    "@clerk/nextjs": { ClerkProvider },
    "@clerk/localizations": { heIL: {} },
    "@/lib/staff-host": staffHost,
  }, productionKey, staffEnv);
  const element = StaffAuthProvider({ children: "workspace" });
  assert.equal(element.props.signInUrl, "/login");
  assert.equal(element.props.signUpUrl, "/signup");
  assert.equal(element.props.signInForceRedirectUrl, "/");
  assert.equal(element.props.signUpForceRedirectUrl, "/");
  assert.equal(element.props.afterSignOutUrl, "/login");
  assert.deepEqual(element.props.allowedRedirectOrigins, parties);
  assert.equal(element.props.isSatellite, undefined);
  assert.equal(element.props.proxyUrl, undefined);
});
