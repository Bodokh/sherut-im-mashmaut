import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const origin = "https://mentoring.test";
const cacheName = "mentoring-anonymous-shell-v1";
const source = readFileSync(new URL("../../../public/staff-sw.js", import.meta.url), "utf8");
const absolute = (request) => new URL(typeof request === "string" ? request : request.url, origin).href;
const html = (body = "<main>anonymous offline shell</main>") => new Response(body, {
  headers: { "Content-Type": "text/html; charset=utf-8", "X-Mentoring-Shell": "anonymous-v1" },
});
const javascript = (body = "public JavaScript", status = 200) => new Response(body, { status, headers: { "Content-Type": "application/javascript; charset=utf-8" } });
function opaqueResponse() {
  const response = new Response(null);
  Object.defineProperties(response, { type: { value: "opaque" }, status: { value: 0 }, ok: { value: false }, clone: { value: opaqueResponse } });
  return response;
}
const proxySdk = "/__clerk/npm/@clerk/clerk-js@7/dist/clerk.browser.js";
const proxyUi = "/__clerk/npm/@clerk/ui@1/dist/ui.browser.js";
const legacySdk = "https://sample.clerk.accounts.dev/npm/@clerk/clerk-js@6/dist/clerk.browser.js";
const legacyUi = "https://sample.clerk.accounts.dev/npm/@clerk/clerk-ui@1/dist/clerk.ui.js";
const effectiveCredentials = ({ request, options }) => options?.credentials ?? request.credentials;
const expectedClerkCredentials = (url, incomingCredentials = "same-origin") => new URL(absolute(url)).origin === origin ? incomingCredentials : "omit";
const transportHeaders = ["content-encoding", "content-length", "transfer-encoding"];
function responseMetadata(response, { url = `${origin}/__clerk/npm/@clerk/clerk-js@7.1.0/dist/clerk.browser.js`, redirected = true, type = "cors" } = {}) {
  Object.defineProperties(response, {
    url: { value: url }, redirected: { value: redirected }, type: { value: type },
    clone: { value() { return responseMetadata(Response.prototype.clone.call(this), { url, redirected, type }); } },
  });
  return response;
}
function redirectedJavaScript(body = "window.publicScript = true;", { status = 200, statusText = "Public SDK Ready", headers = {}, type = "cors", url } = {}) {
  return responseMetadata(new Response(body, { status, statusText, headers: {
    "Content-Type": "text/javascript; charset=utf-8", "Content-Encoding": "gzip", "Content-Length": "12345", "Transfer-Encoding": "chunked",
    "Content-Security-Policy": "default-src 'none'", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin",
    "Cache-Control": "public, max-age=120", ETag: '"public-sdk-v1"', "X-Public-Script": "retained", ...headers,
  } }), { type, ...(url ? { url } : {}) });
}
function proxyProtectionResponses() {
  return [
    ["redirected SSO HTML", redirectedJavaScript("<html>Sign in to the protected preview</html>", { url: `${origin}/_vercel/sso-api`, headers: { "Content-Type": "text/html; charset=utf-8" } })],
    ["unauthorized", redirectedJavaScript("<html>Unauthorized preview</html>", { status: 401, url: `${origin}/_vercel/sso-api`, headers: { "Content-Type": "text/html" } })],
    ["forbidden", redirectedJavaScript("<html>Forbidden preview</html>", { status: 403, url: `${origin}/_vercel/sso-api`, headers: { "Content-Type": "text/html" } })],
    ["auth JSON", redirectedJavaScript('{"private":"auth result"}', { url: `${origin}/__clerk/v1/client`, headers: { "Content-Type": "application/json" } })],
    ["auth JavaScript", redirectedJavaScript("window.privateAuthResult = true;", { url: `${origin}/__clerk/v1/client` })],
    ["protection JavaScript", redirectedJavaScript("window.privatePreviewResult = true;", { url: `${origin}/_vercel/sso-api` })],
    ["other-origin JavaScript", redirectedJavaScript("window.otherOriginResult = true;", { url: "https://other.test/__clerk/npm/@clerk/clerk-js@7/dist/clerk.browser.js" })],
  ];
}
function assertNormalizedProxyResponse(actual, expected) {
  assert.notEqual(actual, expected, "A proxy script must be delivered as a fresh Response.");
  assert.equal(actual.url, "");
  assert.equal(actual.redirected, false);
  assert.equal(actual.type, "default");
  assert.equal(actual.status, expected.status);
  assert.equal(actual.statusText, expected.statusText);
  const headers = new Headers(expected.headers);
  for (const name of transportHeaders) { headers.delete(name); assert.equal(actual.headers.has(name), false, name); }
  assert.deepEqual([...actual.headers], [...headers], "Only body transport headers may be removed.");
}

function harness(fetcher = async () => { throw new TypeError("offline"); }, { beforeCachePut, sourceOverride = source, navigatorOnline = true, cacheUnavailable = false } = {}) {
  const listeners = new Map();
  const stores = new Map();
  const requests = [];
  const deletedCaches = [];
  let claimed = 0;
  let skipped = 0;
  const caches = {
    async open(name) {
      if (cacheUnavailable) throw new DOMException("Cache storage unavailable", "InvalidStateError");
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async put(request, response) { await beforeCachePut?.(absolute(request), response); entries.set(absolute(request), response.clone()); },
        async match(request) { return entries.get(absolute(request))?.clone(); },
        async keys() { return [...entries.keys()].map((url) => ({ url })); },
        async delete(request) { return entries.delete(absolute(request)); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { deletedCaches.push(name); return stores.delete(name); },
  };
  const context = vm.createContext({
    URL, Request, Response, Headers, Set, Promise, Error, navigator: { onLine: navigatorOnline },
    caches,
    fetch: async (request, options) => { requests.push({ url: absolute(request), request, options }); return fetcher(request, options); },
    self: {
      location: { origin },
      addEventListener(name, handler) { listeners.set(name, handler); },
      async skipWaiting() { ++skipped; },
      clients: { async claim() { ++claimed; } },
    },
  });
  vm.runInContext(sourceOverride, context, { filename: "staff-sw.js" });
  return {
    caches, stores, requests, deletedCaches,
    get claimed() { return claimed; },
    get skipped() { return skipped; },
    async lifecycle(name, properties = {}) {
      const work = [];
      listeners.get(name)({ ...properties, waitUntil(task) { work.push(task); } });
      await Promise.all(work);
    },
    async prepare() { await this.lifecycle("message", { data: { type: "PREPARE_STAFF_SHELL" } }); },
    fetch(path, options = {}) {
      let response;
      const work = [];
      const requestOptions = { method: "GET", mode: "cors", credentials: "same-origin", ...options };
      const request = new Request(absolute(path), { ...requestOptions, mode: requestOptions.mode === "navigate" ? "same-origin" : requestOptions.mode });
      if (requestOptions.mode === "navigate") Object.defineProperty(request, "mode", { value: "navigate" });
      listeners.get("fetch")({ request, respondWith(task) { response = Promise.resolve(task); }, waitUntil(task) { work.push(Promise.resolve(task)); } });
      return { intercepted: Boolean(response), response, work, async settled() { await response; await Promise.all(work); } };
    },
    async fetchAndSettle(path, options = {}) {
      const request = this.fetch(path, options);
      const response = await request.response;
      await request.settled();
      return response;
    },
  };
}

// A narrow mutation control restores the original blocking publication branch.
// Positive regressions always evaluate the actual public/staff-sw.js source.
const awaitedPublication = "if (cache) await writeCache(async () => { await cachePublicResponse(cache, request, response); await trim(cache); }).catch(() => undefined);";
const backgroundPublication = `if (cache) {
        const cacheCopy = response.clone();
        event.waitUntil(writeCache(async () => { await cachePublicResponse(cache, request, cacheCopy); await trim(cache); }).catch(() => undefined));
      }`;
assert.ok(source.includes(backgroundPublication), "The mutation control must match the actual nonblocking cache-publication branch exactly.");
const oldAwaitedSource = source.replace(backgroundPublication, awaitedPublication);

async function probeStalledPublicScript(sourceOverride, sdk = legacySdk) {
  let reachedPut;
  const putStarted = new Promise((resolve) => { reachedPut = resolve; });
  const neverCompletes = new Promise(() => undefined);
  const worker = harness(async () => javascript("fresh Clerk network bytes"), {
    sourceOverride,
    beforeCachePut(url) { if (url === absolute(sdk)) { reachedPut(); return neverCompletes; } },
  });
  const request = worker.fetch(sdk, { credentials: "omit" });
  let delivered = false;
  const body = request.response.then(async (response) => { const bytes = await response.text(); delivered = true; return bytes; });
  await putStarted;
  // Promise jobs settle before the next event-loop turn. No wall-clock timeout
  // is needed: Cache.put is deliberately never released in this fixture.
  await new Promise((resolve) => setImmediate(resolve));
  return { delivered, body, request, worker };
}

test("an old awaited-publication mutation reproduces the stalled Clerk-script delivery regression", async () => {
  const stalled = await probeStalledPublicScript(oldAwaitedSource);
  assert.equal(stalled.delivered, false);
  assert.equal(stalled.request.work.length, 0);
});

test("actual public script delivery returns fresh Clerk bytes while Cache.put remains pending", { timeout: 5000 }, async () => {
  for (const script of [proxySdk, proxyUi, legacySdk, legacyUi]) {
    const delivery = await probeStalledPublicScript(source, script);
    assert.equal(delivery.delivered, true, "Fresh public network bytes must not wait for Cache.put or trim.");
    assert.equal(await delivery.body, "fresh Clerk network bytes");
    assert.equal(delivery.request.work.length, 1, "The fetch event must retain caught cache publication independently of delivery.");
    assert.equal(delivery.worker.requests.length, 1);
  }
});

test("actual public script delivery clones network bytes before queued cache publication", async () => {
  const sdk = "https://sample.clerk.accounts.dev/npm/@clerk/clerk-js@6/dist/clerk.browser.js";
  let releaseFirstWrite; let reachedFirstWrite;
  const firstWriteStarted = new Promise((resolve) => { reachedFirstWrite = resolve; });
  const firstWriteGate = new Promise((resolve) => { releaseFirstWrite = resolve; });
  const worker = harness(async (request) => javascript(absolute(request) === sdk ? "fresh Clerk SDK" : "first asset"), {
    async beforeCachePut(url) { if (url.endsWith("first-cache-write.js")) { reachedFirstWrite(); await firstWriteGate; } },
  });
  const first = worker.fetch("/_next/static/first-cache-write.js");
  await firstWriteStarted;
  const next = worker.fetch(sdk, { credentials: "omit" });
  assert.equal(await (await next.response).text(), "fresh Clerk SDK", "The page may consume its response before queued publication starts.");
  const cache = await worker.caches.open(cacheName);
  assert.equal(await cache.match(sdk), undefined);
  releaseFirstWrite();
  await Promise.all([first.settled(), next.settled()]);
  assert.equal(await (await cache.match(sdk)).text(), "fresh Clerk SDK");
});

test("actual public delivery catches background cache failure without replacing fresh network bytes", async () => {
  const worker = harness(async () => new Response("fresh network bytes"), {
    beforeCachePut() { throw new DOMException("Test quota exceeded", "QuotaExceededError"); },
  });
  const request = worker.fetch("/_next/static/ordinary-quota.js");
  assert.equal(await (await request.response).text(), "fresh network bytes");
  await assert.doesNotReject(request.settled());
  assert.equal(await (await worker.caches.open(cacheName)).match("/_next/static/ordinary-quota.js"), undefined);
});

test("successful readable proxy SDK and UI responses normalize redirect metadata and only transport headers", async () => {
  for (const path of [proxySdk, proxyUi]) {
    for (const type of ["basic", "cors", "default"]) {
      const original = redirectedJavaScript(`window.normalized = ${JSON.stringify(path)};`, { type });
      const expectedBody = await Response.prototype.clone.call(original).text();
      const worker = harness(async () => original);
      const request = worker.fetch(path);
      const response = await request.response;
      assertNormalizedProxyResponse(response, original);
      assert.equal(response.bodyUsed, false);
      assert.equal(await response.text(), expectedBody);
      await request.settled();
      const cached = await (await worker.caches.open(cacheName)).match(path);
      assertNormalizedProxyResponse(cached, original);
      assert.equal(await cached.text(), expectedBody);
    }
  }
});

test("proxy preparation normalizes each script before storing the replacement shell and dependencies", async () => {
  const originals = new Map();
  const body = `<script src="${proxySdk}"></script><script src="${proxyUi}"></script>`;
  const worker = harness(async (request) => {
    const url = absolute(request);
    if (url.endsWith("/staff/offline")) return html(body);
    const script = redirectedJavaScript(`window.asset = ${JSON.stringify(url)};`);
    originals.set(url, script);
    return script;
  });
  await worker.prepare();
  const cache = await worker.caches.open(cacheName);
  assert.equal(await (await cache.match("/staff/offline")).text(), body);
  for (const path of [proxySdk, proxyUi]) {
    const cached = await cache.match(path);
    assertNormalizedProxyResponse(cached, originals.get(absolute(path)));
    assert.equal(await cached.text(), `window.asset = ${JSON.stringify(absolute(path))};`);
  }
});

test("old redirected proxy cache entries are normalized when a rejected network request needs fallback", async () => {
  for (const path of [proxySdk, proxyUi]) {
    const cachedOriginal = redirectedJavaScript(`window.offline = ${JSON.stringify(path)};`);
    const worker = harness();
    await (await worker.caches.open(cacheName)).put(path, cachedOriginal);
    const response = await worker.fetchAndSettle(path);
    assertNormalizedProxyResponse(response, cachedOriginal);
    assert.equal(await response.text(), `window.offline = ${JSON.stringify(path)};`);
  }
});

test("proxy normalization returns an open lazy body without calling a buffering method or waiting for completion", { timeout: 5000 }, async () => {
  for (const path of [proxySdk, proxyUi]) {
    let controller;
    const stream = new ReadableStream({ start(value) { controller = value; } });
    const original = redirectedJavaScript(stream);
    let bufferingCalls = 0;
    for (const method of ["text", "arrayBuffer", "json", "blob", "formData"]) Object.defineProperty(original, method, { value() { ++bufferingCalls; throw new Error("A body buffering method must not run during delivery."); } });
    const worker = harness(async () => original, { cacheUnavailable: true });
    let delivered;
    const request = worker.fetch(path);
    void request.response.then((response) => { delivered = response; });
    await new Promise((resolve) => setImmediate(resolve));
    try {
      assert.ok(delivered, "An unfinished source body must not delay the response promise.");
      assertNormalizedProxyResponse(delivered, original);
      assert.equal(delivered.bodyUsed, false);
      assert.equal(bufferingCalls, 0);
    } finally { controller.close(); }
  }
});

test("normalization leaves legacy, unrelated, wrong-MIME, unsuccessful, and unexpected external-finalURL responses unchanged", async () => {
  for (const path of [legacySdk, legacyUi, "/_next/static/nonproxy-normalization.js"]) {
    const original = redirectedJavaScript("unchanged public script", { url: "https://sample.clerk.accounts.dev/legacy-public-script.js" });
    const worker = harness(async () => original);
    const response = await worker.fetchAndSettle(path);
    assert.equal(response, original);
    assert.equal(response.headers.get("Content-Encoding"), "gzip");
    assert.equal(response.redirected, true);
  }
  for (const path of [proxySdk, proxyUi]) {
    const responses = [
      redirectedJavaScript("partial script", { status: 206 }), redirectedJavaScript(null, { status: 204 }), redirectedJavaScript(null),
      redirectedJavaScript("provider error", { status: 503 }), redirectedJavaScript("<html>private response</html>", { headers: { "Content-Type": "text/html" } }),
      redirectedJavaScript('{"private":true}', { headers: { "Content-Type": "application/json" } }),
      redirectedJavaScript("external redirect", { url: "https://sample.clerk.accounts.dev/external-final-script.js" }), opaqueResponse(), Response.error(),
    ];
    for (const original of responses) {
      const worker = harness(async () => original, { cacheUnavailable: true });
      assert.equal(await worker.fetchAndSettle(path), original);
    }
  }
  const privateWorker = harness(async () => assert.fail("Private endpoints never enter public response handling."));
  for (const path of ["/__clerk/v1/client", "/__clerk/v1/sessions", "/api/mentoring/workspace"]) assert.equal(privateWorker.fetch(path).intercepted, false);
});

test("used or locked proxy bodies stay unchanged when cache publication is unavailable", async () => {
  for (const path of [proxySdk, proxyUi]) {
    const used = redirectedJavaScript("already consumed");
    await used.text();
    const usedWorker = harness(async () => used, { cacheUnavailable: true });
    assert.equal(await usedWorker.fetchAndSettle(path), used);
    const locked = redirectedJavaScript("locked by its owner");
    const reader = locked.body.getReader();
    try {
      const lockedWorker = harness(async () => locked, { cacheUnavailable: true });
      assert.equal(await lockedWorker.fetchAndSettle(path), locked);
    } finally { reader.releaseLock(); }
  }
});

test("preparation caches only tagged anonymous HTML and warms its permitted public assets", async () => {
  const body = `<link href="/_next/static/app.css"><script src="/_next/static/app.js?x=1&amp;y=2"></script>
    <script src="/_next/static/app.js?x=1&amp;y=2"></script><img src="/images/logo-mark.png">
    <script src="https://sample.clerk.accounts.dev/npm/@clerk/clerk-js@7.1.0/dist/clerk.browser.js"></script>
    <link href="/staff"><link href="/staff/login"><script src="/api/mentoring/workspace"></script>
    <script src="https://sample.clerk.accounts.dev/v1/client"></script>`;
  const worker = harness(async (request) => absolute(request) === `${origin}/staff/offline` ? html(body) : javascript("public asset"));
  await worker.lifecycle("message", { data: { type: "UNRELATED_MESSAGE" } });
  assert.equal(worker.requests.length, 0);
  await worker.prepare();
  assert.deepEqual(worker.requests.map(({ url }) => url).sort(), [
    `${origin}/staff/offline`, `${origin}/_next/static/app.css`, `${origin}/_next/static/app.js?x=1&y=2`, `${origin}/images/logo-mark.png`,
    "https://sample.clerk.accounts.dev/npm/@clerk/clerk-js@7.1.0/dist/clerk.browser.js",
  ].sort());
  const prepare = worker.requests.find(({ url }) => url.endsWith("/staff/offline"));
  assert.equal(prepare.options.cache, "no-store");
  assert.equal(prepare.options.headers["X-Mentoring-Prepare"], "1");
  const external = worker.requests.find(({ url }) => url.includes("clerk.accounts.dev"));
  assert.equal(external.options.credentials, "omit");
  assert.equal(external.options.mode, "cors");
  const asset = worker.requests.find(({ url }) => url.endsWith("app.css"));
  assert.equal(asset.options.cache, "reload");
  assert.equal(asset.options.credentials, "same-origin");
  const cache = await worker.caches.open(cacheName);
  assert.equal(await (await cache.match("/staff/offline")).text(), body);
  assert.equal((await cache.keys()).length, 5);
});

test("failed, redirected, unmarked, non-HTML, and malformed preparations cannot become an offline shell", async () => {
  const redirected = html();
  Object.defineProperty(redirected, "redirected", { value: true });
  const candidates = [
    new Response("unavailable", { status: 503 }),
    redirected,
    new Response("private HTML", { headers: { "Content-Type": "text/html" } }),
    new Response("private HTML", { headers: { "Content-Type": "text/html", "X-Mentoring-Shell": "private" } }),
    new Response("{}", { headers: { "Content-Type": "application/json", "X-Mentoring-Shell": "anonymous-v1" } }),
    html('<script src="http://["></script>'),
  ];
  for (const candidate of candidates) {
    const worker = harness(async () => candidate);
    await worker.prepare();
    assert.equal(await (await worker.caches.open(cacheName)).match("/staff/offline"), undefined);
    assert.equal(worker.requests.length, 1);
  }
});

test("an incomplete asset warmup retains the previous complete shell and never publishes the new one", async () => {
  for (const assetFailure of [() => new Response("unavailable", { status: 503 }), () => { throw new TypeError("connection lost"); }]) {
    const worker = harness(async (request) => absolute(request).endsWith("/staff/offline") ? html('<script src="/_next/static/new.js"></script>') : assetFailure());
    const cache = await worker.caches.open(cacheName);
    await cache.put("/staff/offline", html("old complete shell"));
    await worker.prepare();
    assert.equal(await (await cache.match("/staff/offline")).text(), "old complete shell");
    assert.equal(await cache.match("/_next/static/new.js"), undefined);
  }
});

test("staff navigations use the network and fall back only to the prepared anonymous shell", async () => {
  let online = true;
  const worker = harness(async () => { if (!online) throw new TypeError("offline"); return html("fresh private route HTML"); });
  const cache = await worker.caches.open(cacheName);
  await cache.put("/staff/offline", html("prepared anonymous shell"));
  let request = worker.fetch("/staff/participants/p", { mode: "navigate" });
  assert.equal(request.intercepted, true);
  assert.equal(await (await request.response).text(), "fresh private route HTML");
  assert.equal(await cache.match("/staff/participants/p"), undefined);
  online = false;
  for (const path of ["/staff", "/staff/", "/staff/participants/p", "/staff/offline"]) {
    request = worker.fetch(path, { mode: "navigate" });
    assert.equal(request.intercepted, true);
    assert.equal(await (await request.response).text(), "prepared anonymous shell");
  }
  assert.deepEqual((await cache.keys()).map(({ url }) => url), [`${origin}/staff/offline`]);
});

test("an unprepared offline navigation returns an uncached Hebrew 503", async () => {
  const worker = harness();
  const response = await worker.fetchAndSettle("/staff", { mode: "navigate" });
  assert.equal(response.status, 503);
  assert.match(response.headers.get("Content-Type"), /text\/html/);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.match(await response.text(), /נדרש חיבור ראשוני/);
  assert.equal((await (await worker.caches.open(cacheName)).keys()).length, 0);
});

test("private APIs, RSC payloads, authentication, public pages, and writes are never intercepted", () => {
  const worker = harness();
  const requests = [
    ["/api/mentoring/workspace"], ["/api/mentoring/commands"], ["/api/auth/session"],
    ["/staff?_rsc=private"], ["/staff/participants/p?_rsc=private"],
    ["/staff/login", { mode: "navigate" }], ["/staff/login/factor-one", { mode: "navigate" }],
    ["/staff/signup", { mode: "navigate" }], ["/staff/signup/verify", { mode: "navigate" }],
    ["/staff/logout", { mode: "navigate" }], ["/staff/logout/complete", { mode: "navigate" }],
    ["/", { mode: "navigate" }], ["/about", { mode: "navigate" }], ["/staffing", { mode: "navigate" }],
    ["https://other.test/staff", { mode: "navigate" }],
    ["https://sample.clerk.accounts.dev/v1/client"], ["https://clerk.mentoring.test/v1/users"],
    ["/staff", { method: "POST", mode: "navigate" }], ["/_next/static/app.js", { method: "POST" }],
  ];
  for (const [path, options] of requests) assert.equal(worker.fetch(path, options).intercepted, false, path);
  assert.equal(worker.requests.length, 0);
});

test("static public assets use cache-first while allowed credential-free Clerk JavaScript revalidates online", async () => {
  const worker = harness(async () => javascript("public bytes"));
  const allowed = ["/_next/static/app.js", "/images/logo-mark.png", "https://sample.clerk.accounts.dev/npm/@clerk/clerk-js@7.1.0/dist/clerk.browser.js", "https://sample.clerk.accounts.dev/npm/@clerk/clerk-ui@1.2.3/dist/clerk.ui.js"];
  for (const path of allowed) {
    const options = path.startsWith("https:") ? { credentials: "omit" } : {};
    assert.equal(await (await worker.fetchAndSettle(path, options)).text(), "public bytes");
    assert.equal(await (await worker.fetchAndSettle(path, options)).text(), "public bytes");
  }
  assert.equal(worker.requests.length, allowed.length + allowed.filter((path) => path.startsWith("https:")).length);
  for (const path of ["/images/other.png", "/_next/data/build/staff.json", "https://untrusted.test/npm/@clerk/clerk-js@7.1.0/dist/clerk.browser.js", "https://sample.clerk.accounts.dev/npm/@clerk/clerk-js/dist/clerk.browser.js", "https://sample.clerk.accounts.dev/v1/client", "https://sample.clerk.accounts.dev/npm/@clerk/clerk-js@7.1.0/dist/other.js"]) {
    assert.equal(worker.fetch(path, { credentials: "omit" }).intercepted, false, path);
  }
  const credentialedPublicScript = worker.fetch(allowed[2], { credentials: "include" });
  assert.equal(credentialedPublicScript.intercepted, true);
  await credentialedPublicScript.settled();
  assert.equal(effectiveCredentials(worker.requests.at(-1)), "omit");
});

test("a Clerk major-version alias updates online and falls back to its latest bytes only on network rejection", async () => {
  const sdk = "https://sample.clerk.accounts.dev/npm/@clerk/clerk-js@6/dist/clerk.browser.js";
  let version = "SDK-v1";
  let status = 200;
  let online = true;
  const worker = harness(async () => {
    if (!online) throw new TypeError("offline");
    return javascript(version, status);
  });
  assert.equal(await (await worker.fetchAndSettle(sdk, { credentials: "omit" })).text(), "SDK-v1");
  version = "SDK-v2";
  assert.equal(await (await worker.fetchAndSettle(sdk, { credentials: "omit" })).text(), "SDK-v2");
  const cache = await worker.caches.open(cacheName);
  assert.equal(await (await cache.match(sdk)).text(), "SDK-v2");
  status = 503;
  version = "provider unavailable";
  const unavailable = await worker.fetchAndSettle(sdk, { credentials: "omit" });
  assert.equal(unavailable.status, 503);
  assert.equal(await unavailable.text(), "provider unavailable");
  assert.equal(await (await cache.match(sdk)).text(), "SDK-v2");
  online = false;
  assert.equal(await (await worker.fetchAndSettle(sdk, { credentials: "omit" })).text(), "SDK-v2");
  assert.equal(worker.requests.length, 4);
  for (const path of ["https://sample.clerk.accounts.dev/v1/client", "https://sample.clerk.accounts.dev/v1/sessions", "https://sample.clerk.accounts.dev/v1/users"]) {
    assert.equal(worker.fetch(path, { credentials: "include" }).intercepted, false);
    assert.equal(await cache.match(path), undefined);
  }
});

test("proxy SDK and modern UI scripts warm with origin-scoped credentials and remain pinned with legacy prepared scripts", async () => {
  const scripts = [proxySdk, proxyUi, legacySdk, legacyUi];
  const body = scripts.map((path) => `<script src="${path}"></script>`).join("")
    + '<script src="/__clerk/v1/client"></script><script src="/__clerk/npm/arbitrary@1/index.js"></script>';
  const worker = harness(async (request) => absolute(request) === `${origin}/staff/offline` ? html(body) : javascript("public Clerk script"));
  await worker.prepare();
  assert.deepEqual(worker.requests.map(({ url }) => url).sort(), [`${origin}/staff/offline`, ...scripts.map(absolute)].sort());
  const shellRequest = worker.requests.find(({ url }) => url.endsWith("/staff/offline"));
  assert.equal(effectiveCredentials(shellRequest), "same-origin");
  for (const request of worker.requests.filter(({ url }) => !url.endsWith("/staff/offline"))) {
    assert.equal(effectiveCredentials(request), expectedClerkCredentials(request.url), request.url);
    assert.equal(request.options.cache, "reload");
  }
  const cache = await worker.caches.open(cacheName);
  assert.equal(await (await cache.match("/staff/offline")).text(), body);
  for (let index = 0; index < 260; ++index) await cache.put(`/_next/static/unpinned-proxy-${index}.js`, javascript("unpinned"));
  await worker.fetchAndSettle("/_next/static/trim-after-proxy-warmup.js");
  for (const script of scripts) assert.equal(await (await cache.match(script)).text(), "public Clerk script");
  assert.equal((await cache.keys()).length, 257);
  assert.equal(await cache.match("/__clerk/v1/client"), undefined);
});

test("proxy Clerk delivery preserves caller credentials and warmup uses same-origin SSO without widening other fetches", async () => {
  for (const path of [proxySdk, proxyUi, legacySdk, legacyUi]) {
    const worker = harness(async () => javascript("public script behind its intended origin"));
    for (const credentials of ["same-origin", "include", "omit"]) {
      await worker.fetchAndSettle(path, { credentials });
      const outgoing = worker.requests.at(-1);
      assert.equal(effectiveCredentials(outgoing), expectedClerkCredentials(path, credentials), `${path} (${credentials})`);
      if (new URL(absolute(path)).origin === origin) {
        assert.equal(outgoing.options, undefined, "Proxy foreground delivery must preserve the original Request, including explicit omit.");
        assert.equal(outgoing.request.credentials, credentials);
      }
    }
  }
  const scripts = [proxySdk, proxyUi, legacySdk, legacyUi];
  const body = scripts.map((path) => `<script src="${path}"></script>`).join("");
  const warming = harness(async (request) => absolute(request).endsWith("/staff/offline") ? html(body) : javascript("warm public script"));
  await warming.prepare();
  for (const request of warming.requests.filter(({ url }) => !url.endsWith("/staff/offline"))) assert.equal(effectiveCredentials(request), expectedClerkCredentials(request.url));
  for (const path of ["/_next/static/ordinary-sso.js", "/images/logo-mark.png"]) {
    const ordinary = harness(async () => javascript("ordinary public asset"));
    await ordinary.fetchAndSettle(path, { credentials: "include" });
    assert.equal(ordinary.requests[0].options, undefined, "Ordinary assets retain the incoming Request's fetch behavior.");
    assert.equal(ordinary.requests[0].request.credentials, "include");
  }
});

test("all recognized Clerk scripts refresh aliases network-first with origin-scoped credentials", async () => {
  for (const path of [proxySdk, proxyUi, legacySdk, legacyUi]) {
    let version = 0;
    const worker = harness(async () => javascript(`network-${++version}`));
    for (const credentials of ["same-origin", "include", "omit"]) {
      const request = worker.fetch(path, { credentials });
      assert.equal(request.intercepted, true, `${path} (${credentials})`);
      assert.equal(await (await request.response).text(), `network-${version}`);
      await request.settled();
      assert.equal(effectiveCredentials(worker.requests.at(-1)), expectedClerkCredentials(path, credentials));
    }
    assert.equal(worker.requests.length, 3, `${path} must not use its cached alias while network succeeds`);
    assert.equal(await (await (await worker.caches.open(cacheName)).match(path)).text(), "network-3");
  }
});

test("Clerk aliases still attempt the network when navigator.onLine is false", async () => {
  for (const path of [proxySdk, proxyUi, legacySdk, legacyUi]) {
    const worker = harness(async () => javascript("reachable network despite advisory offline flag"), { navigatorOnline: false });
    const cache = await worker.caches.open(cacheName);
    await cache.put(path, javascript("old cached bytes"));
    assert.equal(await (await worker.fetchAndSettle(path)).text(), "reachable network despite advisory offline flag");
    assert.equal(worker.requests.length, 1);
    assert.equal(effectiveCredentials(worker.requests[0]), expectedClerkCredentials(path));
  }
});

test("Clerk public selectors allow major or full semantic versions and reject private or malformed paths", async () => {
  const worker = harness(async () => javascript("public"));
  const selectors = [
    ["/__clerk/npm/@clerk/clerk-js@", "/dist/clerk.browser.js"],
    ["/__clerk/npm/@clerk/ui@", "/dist/ui.browser.js"],
    ["https://sample.clerk.accounts.dev/npm/@clerk/clerk-js@", "/dist/clerk.browser.js"],
    ["https://sample.clerk.accounts.dev/npm/@clerk/clerk-ui@", "/dist/clerk.ui.js"],
  ];
  for (const [prefix, suffix] of selectors) {
    for (const version of ["6", "6.40.1", "6.40.1-beta.2", "6.40.1+build.5", "6.40.1-beta.2+build.5", "7.1.0-0", "7.1.0-beta.2+0001"]) {
      assert.equal(await (await worker.fetchAndSettle(`${prefix}${version}${suffix}`)).text(), "public");
    }
    for (const version of ["", "latest", "next", "v6", "06", "6.40", "6.40.1.2", "6.040.1", "6.40.01", "6.40.1-", "6.40.1+", "6.40.1-beta..2", "6.40.1+build..5", "7.1.0-01"]) {
      assert.equal(worker.fetch(`${prefix}${version}${suffix}`).intercepted, false, `${prefix}${version}${suffix}`);
    }
  }
  const rejected = [
    "/__clerk/v1/client", "/__clerk/v1/sessions", "/__clerk/v1/handshake", "/__clerk/auth", "/__clerk/client", "/__clerk/session", "/__clerk/handshake",
    "/__clerk/npm/arbitrary@1/index.js", "/__clerk/npm/@clerk/clerk-ui@1/dist/clerk.ui.js",
    "/__clerk/npm/@clerk/clerk-js@6/dist/ui.browser.js", "/__clerk/npm/@clerk/ui@1/dist/clerk.browser.js",
    "/__clerk/npm/@clerk/clerk-js@6/dist/clerk.browser.json", "/__clerk/npm/@clerk/clerk-js@6/dist/clerk.browser.js/extra",
    "/__clerk/npm/%40clerk/clerk-js@6/dist/clerk.browser.js", "/__clerk/npm/@clerk/%63lerk-js@6/dist/clerk.browser.js",
    "/__clerk/npm/@clerk/clerk-js@6/dist/%2e%2e%2fclerk.browser.js", `${proxySdk}?cache=1`, `${proxyUi}#fragment`,
    "https://other.test/__clerk/npm/@clerk/clerk-js@6/dist/clerk.browser.js",
    "https://clerk.attacker.test/npm/@clerk/clerk-js@6/dist/clerk.browser.js",
    "https://sample.clerk.accounts.dev.attacker.test/npm/@clerk/clerk-js@6/dist/clerk.browser.js",
    "http://sample.clerk.accounts.dev/npm/@clerk/clerk-js@6/dist/clerk.browser.js",
    "https://sample.clerk.accounts.dev:444/npm/@clerk/clerk-js@6/dist/clerk.browser.js",
    "https://clerk.accounts.dev/npm/@clerk/clerk-js@6/dist/clerk.browser.js",
    "https://sample.clerk.accounts.dev/npm/@clerk/clerk-js@6/dist/clerk.ui.js",
    "https://sample.clerk.accounts.dev/npm/@clerk/clerk-ui@1/dist/clerk.browser.js",
  ];
  const beforeRejected = worker.requests.length;
  for (const path of rejected) assert.equal(worker.fetch(path).intercepted, false, path);
  for (const path of ["https://user:password@sample.clerk.accounts.dev/npm/@clerk/clerk-js@6/dist/clerk.browser.js", "https://user@mentoring.test/__clerk/npm/@clerk/clerk-js@6/dist/clerk.browser.js"]) {
    assert.throws(() => worker.fetch(path), TypeError, "Request itself must reject credential-bearing public-script URLs before a network request exists.");
  }
  assert.equal(worker.requests.length, beforeRejected);
});

test("Clerk HTTP failures and wrong MIME types are served unchanged without stale fallback or private caching", async () => {
  for (const path of [proxySdk, proxyUi, legacySdk, legacyUi]) {
    let response = javascript("accepted public bytes");
    let online = true;
    const worker = harness(async () => { if (!online) throw new TypeError("network rejected"); return response; });
    const cache = await worker.caches.open(cacheName);
    await worker.fetchAndSettle(path);
    for (const next of [javascript("provider unavailable", 503), Response.json({ private: "not public script" }), new Response("<html>private auth response</html>", { headers: { "Content-Type": "text/html" } }), new Response("wrong type"), new Response(null), new Response("not JSON-safe JavaScript", { headers: { "Content-Type": "application/javascript+json" } })]) {
      const expectedBody = await next.clone().text();
      response = next;
      const delivered = await worker.fetchAndSettle(path);
      assert.equal(delivered.status, next.status);
      assert.equal(await delivered.text(), expectedBody);
      assert.equal(await (await cache.match(path)).text(), "accepted public bytes");
    }
    online = false;
    assert.equal(await (await worker.fetchAndSettle(path)).text(), "accepted public bytes");
  }
});

test("proxy SSO challenges and private final redirects stay unchanged and cannot overwrite accepted public bytes", async () => {
  for (const path of [proxySdk, proxyUi]) {
    let response = javascript("accepted public script before SSO challenge");
    let online = true;
    const worker = harness(async () => { if (!online) throw new TypeError("network rejected"); return response; });
    await worker.fetchAndSettle(path);
    const cache = await worker.caches.open(cacheName);
    for (const [label, challenge] of proxyProtectionResponses()) {
      const expectedBody = await challenge.clone().text();
      response = challenge;
      const delivered = await worker.fetchAndSettle(path, { credentials: "include" });
      assert.equal(delivered, challenge, `${path}: ${label} must retain its original HTTP response metadata`);
      assert.equal(await delivered.text(), expectedBody);
      assert.equal(await (await cache.match(path)).text(), "accepted public script before SSO challenge", label);
    }
    online = false;
    assert.equal(await (await worker.fetchAndSettle(path)).text(), "accepted public script before SSO challenge");
  }
});

test("proxy protection failures leave the prior complete shell and its script dependencies intact during preparation", async () => {
  for (const script of [proxySdk, proxyUi]) {
    for (const [label, challenge] of proxyProtectionResponses()) {
      const replacement = `<script src="${script}"></script><script src="/_next/static/new-protected-shell.js"></script>`;
      const worker = harness(async (request) => absolute(request).endsWith("/staff/offline") ? html(replacement) : absolute(request) === absolute(script) ? challenge : javascript("new public dependency"));
      const cache = await worker.caches.open(cacheName);
      const oldBody = `<script src="${script}"></script><script src="/_next/static/old-protected-shell.js"></script>`;
      await cache.put(script, javascript("old accepted public Clerk script"));
      await cache.put("/_next/static/old-protected-shell.js", javascript("old complete dependency"));
      await cache.put("/staff/offline", html(oldBody));
      await worker.prepare();
      assert.equal(await (await cache.match("/staff/offline")).text(), oldBody, label);
      assert.equal(await (await cache.match(script)).text(), "old accepted public Clerk script", label);
      assert.equal(await (await cache.match("/_next/static/old-protected-shell.js")).text(), "old complete dependency", label);
      assert.equal(await cache.match("/_next/static/new-protected-shell.js"), undefined, label);
    }
  }
});

test("proxy fallback rejects preexisting SSO challenges and private final redirects even when they claim JavaScript", async () => {
  for (const script of [proxySdk, proxyUi]) {
    for (const [label, challenge] of proxyProtectionResponses()) {
      const worker = harness();
      const cache = await worker.caches.open(cacheName);
      await cache.put(script, challenge);
      await assert.rejects(worker.fetchAndSettle(script), TypeError, `${script}: ${label}`);
    }
  }
});

test("SSO credential handling never intercepts, rewrites, warms, or caches private API and auth paths", async () => {
  const paths = ["/api/mentoring", "/__clerk/v1/client", "/__clerk/v1/sessions", "/__clerk/v1/handshake", "/__clerk/auth", "/_vercel/sso-api", "/sign-in", "https://sample.clerk.accounts.dev/v1/client"];
  const worker = harness();
  for (const path of paths) assert.equal(worker.fetch(path, { credentials: "include" }).intercepted, false, path);
  assert.equal(worker.requests.length, 0);
  const cache = await worker.caches.open(cacheName);
  assert.equal((await cache.keys()).length, 0);
  const body = paths.map((path) => `<script src="${path}"></script>`).join("");
  const warming = harness(async () => html(body));
  await warming.prepare();
  assert.deepEqual(warming.requests.map(({ url }) => url), [`${origin}/staff/offline`]);
  const warmedCache = await warming.caches.open(cacheName);
  for (const path of paths) assert.equal(await warmedCache.match(path), undefined, path);
});

test("proxy scripts cache only the explicit visible JavaScript MIME family", async () => {
  for (const path of [proxySdk, proxyUi]) {
    for (const type of ["application/javascript", "text/javascript", "application/ecmascript", "text/ecmascript", "application/x-javascript", "Text/JavaScript; charset=utf-8"]) {
      const worker = harness(async () => new Response("public script bytes", { headers: { "Content-Type": type } }));
      await worker.fetchAndSettle(path);
      assert.equal(await (await (await worker.caches.open(cacheName)).match(path)).text(), "public script bytes", type);
    }
  }
});

test("network rejection never serves visible JSON or HTML poisoned under an eligible Clerk cache key", async () => {
  for (const path of [proxySdk, proxyUi, legacySdk, legacyUi]) {
    for (const poisoned of [Response.json({ private: "not JavaScript" }), html("not JavaScript"), new Response("missing MIME")]) {
      const worker = harness();
      const cache = await worker.caches.open(cacheName);
      await cache.put(path, poisoned);
      await assert.rejects(worker.fetchAndSettle(path), TypeError);
    }
  }
});

test("wrong-type proxy scripts abort replacement preparation and preserve the prior complete shell", async () => {
  for (const script of [proxySdk, proxyUi]) {
    for (const wrongType of [Response.json({ private: "not JavaScript" }), new Response("<html>not JavaScript</html>", { headers: { "Content-Type": "text/html" } })]) {
      const replacement = `<script src="${script}"></script><script src="/_next/static/new-proxy-shell.js"></script>`;
      const worker = harness(async (request) => {
        if (absolute(request).endsWith("/staff/offline")) return html(replacement);
        return absolute(request) === absolute(script) ? wrongType : javascript("public dependency");
      });
      const cache = await worker.caches.open(cacheName);
      const oldBody = '<script src="/_next/static/old-proxy-shell.js"></script>';
      await cache.put("/_next/static/old-proxy-shell.js", javascript("old complete dependency"));
      await cache.put("/staff/offline", html(oldBody));
      await worker.prepare();
      assert.equal(await (await cache.match("/staff/offline")).text(), oldBody);
      assert.equal(await (await cache.match("/_next/static/old-proxy-shell.js")).text(), "old complete dependency");
      assert.equal(await cache.match(script), undefined);
      assert.equal(await cache.match("/_next/static/new-proxy-shell.js"), undefined);
      assert.equal(effectiveCredentials(worker.requests.find(({ url }) => url === absolute(script))), "same-origin");
    }
  }
});

test("proxy SDK and modern UI retain separate cache identities through preparation, alias refresh, and offline fallback", async () => {
  const versions = new Map([[absolute(proxySdk), 1], [absolute(proxyUi), 1]]);
  let online = true;
  const worker = harness(async (request) => {
    const url = absolute(request);
    if (url.endsWith("/staff/offline")) return html(`<script src="${proxySdk}"></script><script src="${proxyUi}"></script>`);
    if (!online) throw new TypeError("network rejected");
    const label = url === absolute(proxySdk) ? "main SDK" : "modern UI";
    return javascript(`${label} version ${versions.get(url)}`);
  });
  await worker.prepare();
  const cache = await worker.caches.open(cacheName);
  assert.equal(await (await cache.match(proxySdk)).text(), "main SDK version 1");
  assert.equal(await (await cache.match(proxyUi)).text(), "modern UI version 1");
  versions.set(absolute(proxySdk), 2);
  assert.equal(await (await worker.fetchAndSettle(proxySdk)).text(), "main SDK version 2");
  assert.equal(await (await cache.match(proxyUi)).text(), "modern UI version 1");
  versions.set(absolute(proxyUi), 2);
  assert.equal(await (await worker.fetchAndSettle(proxyUi)).text(), "modern UI version 2");
  assert.equal(await (await cache.match(proxySdk)).text(), "main SDK version 2");
  online = false;
  assert.equal(await (await worker.fetchAndSettle(proxySdk)).text(), "main SDK version 2");
  assert.equal(await (await worker.fetchAndSettle(proxyUi)).text(), "modern UI version 2");
  const keys = (await cache.keys()).map(({ url }) => url);
  assert.ok(keys.includes(absolute(proxySdk)) && keys.includes(absolute(proxyUi)));
  for (const request of worker.requests.filter(({ url }) => !url.endsWith("/staff/offline"))) assert.equal(effectiveCredentials(request), "same-origin");
});

test("opaque compatibility is limited to trusted external legacy scripts and never admits opaque proxy cache entries", async () => {
  for (const path of [proxySdk, proxyUi]) {
    let networkAvailable = true;
    const worker = harness(async () => { if (!networkAvailable) throw new TypeError("network rejected"); return opaqueResponse(); });
    const response = await worker.fetchAndSettle(path);
    assert.equal(response.type, "opaque", "Foreground network responses are returned unchanged.");
    const cache = await worker.caches.open(cacheName);
    assert.equal(await cache.match(path), undefined);
    await cache.put(path, opaqueResponse());
    networkAvailable = false;
    await assert.rejects(worker.fetchAndSettle(path), TypeError, "A poisoned opaque proxy entry must not become fallback JavaScript.");
  }
  for (const path of [legacySdk, legacyUi]) {
    let networkAvailable = true;
    const worker = harness(async () => { if (!networkAvailable) throw new TypeError("network rejected"); return opaqueResponse(); });
    assert.equal((await worker.fetchAndSettle(path)).type, "opaque");
    const cache = await worker.caches.open(cacheName);
    assert.equal((await cache.match(path)).type, "opaque");
    networkAvailable = false;
    assert.equal((await worker.fetchAndSettle(path)).type, "opaque");
    for (const request of worker.requests) assert.equal(effectiveCredentials(request), "omit");
  }
});

test("unsuccessful public asset responses are served without being cached", async () => {
  const worker = harness(async () => new Response("missing", { status: 404 }));
  assert.equal((await worker.fetchAndSettle("/_next/static/missing.js")).status, 404);
  assert.equal(await (await worker.caches.open(cacheName)).match("/_next/static/missing.js"), undefined);
});

test("activation claims clients and removes only obsolete mentoring shell caches", async () => {
  const worker = harness();
  await worker.caches.open("mentoring-anonymous-shell-v0");
  await worker.caches.open(cacheName);
  await worker.caches.open("unrelated-public-cache");
  await worker.lifecycle("install");
  await worker.lifecycle("activate");
  assert.equal(worker.skipped, 1);
  assert.equal(worker.claimed, 1);
  assert.deepEqual(worker.deletedCaches, ["mentoring-anonymous-shell-v0"]);
  assert.deepEqual(await worker.caches.keys(), [cacheName, "unrelated-public-cache"]);
});

test("asset eviction stays bounded while preserving the prepared anonymous entry", async () => {
  const worker = harness(async () => new Response("public asset"));
  const cache = await worker.caches.open(cacheName);
  await cache.put("/staff/offline", html("prepared shell"));
  for (let i = 0; i < 260; ++i) await cache.put(`/_next/static/old-${i}.js`, new Response("old asset"));
  await worker.fetchAndSettle("/_next/static/new.js");
  assert.equal((await cache.keys()).length, 257);
  assert.equal(await (await cache.match("/staff/offline")).text(), "prepared shell");
  assert.equal(await cache.match("/_next/static/old-0.js"), undefined);
  assert.equal(await (await cache.match("/_next/static/new.js")).text(), "public asset");
});

const oldDependencies = ["/_next/static/chunks/shared.js", "/_next/static/css/staff.css", "/_next/static/media/hebrew.woff2"];
const dependencyHtml = (dependencies) => dependencies.map((path) => `<link href="${path}">`).join("");

async function seedOldShell(cache) {
  // The critical shared dependencies are deliberately the oldest cache entries.
  for (const path of oldDependencies) await cache.put(path, new Response(`old dependency: ${path}`));
  const body = dependencyHtml(oldDependencies);
  await cache.put("/staff/offline", html(body));
  return body;
}

async function assertCachedDependencies(cache, dependencies) {
  for (const path of dependencies) assert.ok(await cache.match(path), `Missing shell dependency: ${path}`);
}

test("trim pins every dependency referenced by the current HTML, including the oldest shared chunk, CSS, and font", async () => {
  const worker = harness(async () => new Response("public asset"));
  const cache = await worker.caches.open(cacheName);
  const oldHtml = await seedOldShell(cache);
  for (let i = 0; i < 260; ++i) await cache.put(`/_next/static/unreferenced-${i}.js`, new Response("unreferenced"));
  await worker.fetchAndSettle("/_next/static/latest.js");
  assert.equal(await (await cache.match("/staff/offline")).text(), oldHtml);
  await assertCachedDependencies(cache, oldDependencies);
  assert.equal((await cache.keys()).length, 257);
  assert.equal(await cache.match("/_next/static/unreferenced-0.js"), undefined);
  assert.ok(await cache.match("/_next/static/latest.js"));
});

test("a failed large warmup preserves the old shell and all its dependencies through later cache pressure", async () => {
  const candidateDependencies = Array.from({ length: 256 }, (_, index) => `/_next/static/candidate-${index}.js`);
  const worker = harness(async (request) => {
    const url = absolute(request);
    if (url.endsWith("/staff/offline")) return html(dependencyHtml(candidateDependencies));
    return url.endsWith("candidate-255.js") ? new Response("unavailable", { status: 503 }) : new Response("candidate bytes");
  });
  const cache = await worker.caches.open(cacheName);
  const oldHtml = await seedOldShell(cache);
  await worker.prepare();
  assert.equal(await (await cache.match("/staff/offline")).text(), oldHtml);
  await assertCachedDependencies(cache, oldDependencies);
  for (let i = 0; i < 260; ++i) await cache.put(`/_next/static/later-${i}.js`, new Response("later asset"));
  await worker.fetchAndSettle("/_next/static/latest.js");
  assert.equal(await (await cache.match("/staff/offline")).text(), oldHtml);
  await assertCachedDependencies(cache, oldDependencies);
  assert.equal((await cache.keys()).length, 257);
});

test("preparation refuses more than 256 unique dependencies before fetching any assets", async () => {
  const dependencies = Array.from({ length: 257 }, (_, index) => `/_next/static/oversized-${index}.js`);
  const worker = harness(async (request) => absolute(request).endsWith("/staff/offline") ? html(dependencyHtml(dependencies)) : new Response("asset"));
  const cache = await worker.caches.open(cacheName);
  const oldHtml = await seedOldShell(cache);
  await worker.prepare();
  assert.deepEqual(worker.requests.map(({ url }) => url), [`${origin}/staff/offline`]);
  assert.equal(await (await cache.match("/staff/offline")).text(), oldHtml);
  await assertCachedDependencies(cache, oldDependencies);
  assert.equal((await cache.keys()).length, oldDependencies.length + 1);
});

test("a shell with exactly 256 unique dependencies is published with every asset intact", async () => {
  const dependencies = Array.from({ length: 256 }, (_, index) => `/_next/static/full-${index}.js`);
  const body = dependencyHtml(dependencies);
  const worker = harness(async (request) => absolute(request).endsWith("/staff/offline") ? html(body) : new Response("asset"));
  await worker.prepare();
  const cache = await worker.caches.open(cacheName);
  assert.equal(await (await cache.match("/staff/offline")).text(), body);
  await assertCachedDependencies(cache, dependencies);
  assert.equal(worker.requests.length, 257);
  assert.equal((await cache.keys()).length, 257);
});

test("a concurrent public-asset trim cannot evict current or candidate shell dependencies during preparation", { timeout: 5000 }, async () => {
  const dependencies = Array.from({ length: 256 }, (_, index) => `/_next/static/race-${index}.js`);
  let releaseLastAsset;
  let reachedLastAsset;
  const lastAssetStarted = new Promise((resolve) => { reachedLastAsset = resolve; });
  const lastAssetGate = new Promise((resolve) => { releaseLastAsset = resolve; });
  const body = dependencyHtml(dependencies);
  const worker = harness(async (request) => {
    const url = absolute(request);
    if (url.endsWith("/staff/offline")) return html(body);
    if (url.endsWith("race-255.js")) { reachedLastAsset(); await lastAssetGate; }
    return new Response("asset bytes");
  });
  const cache = await worker.caches.open(cacheName);
  const oldHtml = await seedOldShell(cache);
  const preparation = worker.prepare();
  await lastAssetStarted;
  await worker.fetchAndSettle("/_next/static/concurrent-public.js");
  const htmlDuringPreparation = await (await cache.match("/staff/offline")).text();
  const oldDependenciesDuringPreparation = await Promise.all(oldDependencies.map((path) => cache.match(path)));
  releaseLastAsset();
  await preparation;
  assert.equal(htmlDuringPreparation, oldHtml);
  assert.ok(oldDependenciesDuringPreparation.every(Boolean), "A concurrent trim evicted a dependency of the still-current shell");
  assert.equal(await (await cache.match("/staff/offline")).text(), body);
  await assertCachedDependencies(cache, dependencies);
  assert.equal((await cache.keys()).length, 257);
});

test("candidate cache-write failure preserves the old shell and a subsequent ordinary asset write still succeeds", async () => {
  const dependencies = ["/_next/static/quota-first.js", "/_next/static/quota-fails.js", "/_next/static/quota-last.js"];
  let quotaFailures = 0;
  const worker = harness(async (request) => absolute(request).endsWith("/staff/offline") ? html(dependencyHtml(dependencies)) : new Response("public bytes"), {
    beforeCachePut(url) {
      if (url.endsWith("quota-fails.js") && quotaFailures++ === 0) throw new DOMException("Test quota exceeded", "QuotaExceededError");
    },
  });
  const cache = await worker.caches.open(cacheName);
  const oldHtml = await seedOldShell(cache);
  await worker.prepare();
  assert.equal(quotaFailures, 1);
  assert.equal(await (await cache.match("/staff/offline")).text(), oldHtml);
  await assertCachedDependencies(cache, oldDependencies);
  assert.equal(await (await worker.fetchAndSettle("/_next/static/after-quota.js")).text(), "public bytes");
  assert.equal(await (await cache.match("/_next/static/after-quota.js")).text(), "public bytes");
  assert.equal(await (await cache.match("/staff/offline")).text(), oldHtml);
  await assertCachedDependencies(cache, oldDependencies);
});

test("candidate publication and ordinary cache trims share one mutation lock", { timeout: 5000 }, async () => {
  const dependencies = Array.from({ length: 256 }, (_, index) => `/_next/static/publish-${index}.js`);
  let releaseLastWrite;
  let reachedLastWrite;
  let reachedPublicFetch;
  const lastWriteStarted = new Promise((resolve) => { reachedLastWrite = resolve; });
  const lastWriteGate = new Promise((resolve) => { releaseLastWrite = resolve; });
  const publicFetchStarted = new Promise((resolve) => { reachedPublicFetch = resolve; });
  const body = dependencyHtml(dependencies);
  const worker = harness(async (request) => {
    const url = absolute(request);
    if (url.endsWith("/staff/offline")) return html(body);
    if (url.endsWith("during-publication.js")) reachedPublicFetch();
    return new Response("asset bytes");
  }, {
    async beforeCachePut(url) {
      if (url.endsWith("publish-255.js")) { reachedLastWrite(); await lastWriteGate; }
    },
  });
  const cache = await worker.caches.open(cacheName);
  const oldHtml = await seedOldShell(cache);
  const preparation = worker.prepare();
  await lastWriteStarted;
  assert.equal(await (await cache.match("/staff/offline")).text(), oldHtml);
  const publicFetch = worker.fetchAndSettle("/_next/static/during-publication.js");
  await publicFetchStarted;
  // Let the public request reach its cache mutation while publication is paused.
  // Without the shared write lock its trim evicts unpublished candidate assets.
  await new Promise((resolve) => setImmediate(resolve));
  releaseLastWrite();
  await Promise.all([preparation, publicFetch]);
  assert.equal(await (await cache.match("/staff/offline")).text(), body);
  await assertCachedDependencies(cache, dependencies);
  assert.equal((await cache.keys()).length, 257);
});
