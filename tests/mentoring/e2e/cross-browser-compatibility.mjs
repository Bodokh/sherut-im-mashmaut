import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadEnvFile } from "node:process";

// The same approved identity is temporarily reassigned by the broad suite.
// Do not run this read-only check until its owner grants a stable role window.
assert.equal(process.env.MENTORING_QA_WINDOW, "stable-read-only", "Wait for the browser acceptance lead's stable read-only runtime slot.");
assert.notEqual(process.env.NODE_ENV, "production");
assert.ok(!process.env.VERCEL_ENV || process.env.VERCEL_ENV === "development");
if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) loadEnvFile(new URL("../../../.env.local", import.meta.url));
assert.ok(process.env.CLERK_SECRET_KEY?.startsWith("sk_test_"), "Only the approved Clerk development configuration is allowed.");
assert.ok(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_"), "Only the approved Clerk development configuration is allowed.");
assert.equal(process.env.MENTORING_NEON_PROJECT_ID, "round-firefly-59684866");
const origin = new URL(process.env.MENTORING_BASE_URL ?? "http://localhost:3000");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname));
assert.ok(["http:", "https:"].includes(origin.protocol));
assert.equal(origin.pathname, "/");
assert.ok(!origin.search && !origin.hash && !origin.username && !origin.password);
const credentialFile = process.env.MENTORING_QA_CREDENTIALS_FILE;
assert.ok(credentialFile, "An existing approved private credential file is required.");
assert.equal((await stat(credentialFile)).mode & 0o077, 0);
let credentials;
try { credentials = JSON.parse(await readFile(credentialFile, "utf8")); }
catch { throw new Error("The approved private credential file could not be read or parsed."); }
assert.ok(credentials && typeof credentials === "object" && !Array.isArray(credentials), "The approved private credential file must contain an object.");
assert.ok(credentials.email === "mentoring-owner+clerk_test@example.com", "Only the existing approved QA identity is allowed.");
assert.ok(typeof credentials.password === "string" && credentials.password.length >= 15);
const artifacts = resolve(process.env.MENTORING_E2E_ARTIFACTS ?? "/tmp/mentoring-browser-compat");
const buildId = (await readFile(new URL("../../../.next/BUILD_ID", import.meta.url), "utf8")).trim();
if (process.env.MENTORING_QA_EXPECTED_BUILD_ID) assert.equal(buildId, process.env.MENTORING_QA_EXPECTED_BUILD_ID, "The approved production build must remain frozen.");
assert.ok(!/\.\s*(?:route|unroute|routeFromHAR)\s*\(/.test(await readFile(new URL(import.meta.url), "utf8")), "The compatibility driver must install zero protocol routes.");
await mkdir(artifacts, { recursive: true, mode: 0o700 });
await chmod(artifacts, 0o700);
let playwright, playwrightVersion;
try {
  playwright = await import("playwright");
  playwrightVersion = createRequire(import.meta.url)("playwright/package.json").version;
}
catch {
  assert.ok(process.env.PLAYWRIGHT_MODULE_DIR, "Install Playwright or set PLAYWRIGHT_MODULE_DIR.");
  const requirePlaywright = createRequire(resolve(process.env.PLAYWRIGHT_MODULE_DIR, "../package.json"));
  playwright = requirePlaywright("playwright");
  playwrightVersion = requirePlaywright("playwright/package.json").version;
}
if (process.env.MENTORING_QA_EXPECTED_PLAYWRIGHT_VERSION) assert.equal(playwrightVersion, process.env.MENTORING_QA_EXPECTED_PLAYWRIGHT_VERSION, "The approved Playwright runtime must be loaded exactly.");
const engines = (process.env.MENTORING_QA_BROWSERS ?? "firefox,webkit").split(",");
assert.ok(engines.length > 0 && engines.every((engine) => ["firefox", "webkit"].includes(engine)));
assert.equal(new Set(engines).size, engines.length);
const focusedReload = process.env.MENTORING_QA_FOCUSED_RELOAD === "true";
const focusedReloadCount = focusedReload ? Number(process.env.MENTORING_QA_RELOAD_COUNT ?? "1") : 1;
assert.ok(Number.isInteger(focusedReloadCount) && focusedReloadCount >= 1 && focusedReloadCount <= 2, "The bounded gate permits one or two normal reloads.");
const requireFirstPartyScripts = process.env.MENTORING_QA_REQUIRE_FIRST_PARTY_SCRIPTS === "true";
const focusedOfflineDraft = process.env.MENTORING_QA_FOCUSED_OFFLINE_DRAFT === "true";
assert.ok(!focusedOfflineDraft || focusedReload, "Select the focused mode for its native offline draft gate.");
const optionalHelpers = process.env.MENTORING_QA_OPTIONAL_HELPERS === "true";
assert.ok(!optionalHelpers || (focusedReload && !focusedOfflineDraft), "Optional helpers require their bounded authenticated mode without a repeated native matrix.");
const accessibilityDiagnostic = process.env.MENTORING_QA_ACCESSIBILITY_DIAGNOSTIC === "true";
assert.ok(!accessibilityDiagnostic || optionalHelpers, "The bounded diagnostic requires the optional authenticated mode.");
const skipStorage = process.env.MENTORING_QA_SKIP_STORAGE === "true";
assert.ok(!skipStorage || (optionalHelpers && !accessibilityDiagnostic), "Skipping the completed storage proof is restricted to the optional accessibility run.");
const routeControl = process.env.MENTORING_QA_ROUTE_CONTROL === "true";
const signedInContinueControl = process.env.MENTORING_QA_SIGNED_IN_CONTINUE_CONTROL === "true";
const allowSignedInContinue = process.env.MENTORING_QA_ALLOW_SIGNED_IN_CONTINUE === "true";
const skipPublicLayouts = process.env.MENTORING_QA_SKIP_PUBLIC_LAYOUTS === "true";
const noRouteFromStart = true;
const unregisterControl = process.env.MENTORING_QA_WORKER_UNREGISTER_CONTROL === "true";
const resourceEvidence = process.env.MENTORING_QA_RESOURCE_EVIDENCE === "true";
const sdkPassthroughControl = process.env.MENTORING_QA_SDK_PASSTHROUGH_CONTROL === "true";
const servedSdkControl = process.env.MENTORING_QA_SERVED_SDK_CONTROL === "true";
const workerTraceControl = process.env.MENTORING_QA_WORKER_TRACE_CONTROL === "true";
assert.ok(!routeControl && !sdkPassthroughControl && !unregisterControl && !servedSdkControl && !workerTraceControl && !signedInContinueControl, "Historical behavioral diagnostic controls are disabled in the final route-free driver.");
assert.ok(!(routeControl || signedInContinueControl || unregisterControl || resourceEvidence || sdkPassthroughControl || servedSdkControl || workerTraceControl) || focusedReload, "Online isolation controls require the focused diagnostic mode.");
assert.ok(!(routeControl && noRouteFromStart), "Choose one routing control.");
assert.ok(!sdkPassthroughControl || noRouteFromStart, "The worker response override must be the only Playwright route.");
assert.ok(!servedSdkControl || (noRouteFromStart && !sdkPassthroughControl), "The served-source diagnostic requires no Playwright routing or response override.");
assert.ok(!workerTraceControl || (noRouteFromStart && !sdkPassthroughControl && !servedSdkControl), "Worker trace mode permits no routing or behavioral worker control.");
assert.ok(!focusedOfflineDraft || !(sdkPassthroughControl || servedSdkControl || workerTraceControl || routeControl || unregisterControl || signedInContinueControl), "Strict native offline acceptance cannot use diagnostic worker or authentication controls.");
let workerSource, candidateWorker, workerCandidateHash;
let servedWorkerHash;
if (sdkPassthroughControl) {
  workerSource = await readFile(new URL("../../../public/staff-sw.js", import.meta.url), "utf8");
  const anchor = '  if (!isPublicAsset(url) || (url.origin !== self.location.origin && request.credentials === "include")) return;';
  assert.equal(workerSource.split(anchor).length, 2, "The reviewed worker branch must occur exactly once.");
  candidateWorker = workerSource.replace(anchor, '  if (url.origin !== self.location.origin && isPublicAsset(url) && url.pathname.startsWith("/npm/@clerk/clerk-js@") && url.pathname.endsWith("/dist/clerk.browser.js")) return;\n' + anchor);
  workerCandidateHash = createHash("sha256").update(candidateWorker).digest("hex");
}
if (servedSdkControl || workerTraceControl || process.env.MENTORING_QA_EXPECTED_WORKER_SHA) {
  workerSource = await readFile(new URL("../../../public/staff-sw.js", import.meta.url), "utf8");
  if (servedSdkControl) {
    const guard = '  if (url.origin !== self.location.origin && isPublicAsset(url) && url.pathname.startsWith("/npm/@clerk/clerk-js@") && url.pathname.endsWith("/dist/clerk.browser.js")) return;';
    assert.equal(workerSource.split(guard).length, 2, "The authorized diagnostic guard must occur exactly once.");
  }
  if (workerTraceControl) assert.ok(workerSource.includes('"MENTORING_PUBLIC_SCRIPT_TRACE_RESULT"'), "The source owner must install the reviewed trace getter.");
  servedWorkerHash = createHash("sha256").update(workerSource).digest("hex");
  assert.match(process.env.MENTORING_QA_EXPECTED_WORKER_SHA ?? "", /^[a-f0-9]{64}$/);
  assert.equal(servedWorkerHash, process.env.MENTORING_QA_EXPECTED_WORKER_SHA, "The source owner must freeze the exact reviewed diagnostic worker.");
}
const viewports = { desktop: { width: 1440, height: 1000 }, mobileSize: { width: 390, height: 844 } };
const routes = [
  ["/staff", /^שלום,/],
  ["/staff/participants", "החניכות"],
  ["/staff/team", "הצוות שלנו"],
  ["/staff/reviews", "אישור דיווחים"],
  ["/staff/settings", "החשבון וההתראות"],
  ["/staff/oversight", "סקירה חודשית"],
  ["/staff/reminders", "תזכורות"],
  ["/staff/conflicts", "התנגשויות בסנכרון"],
];
const results = [], browserVersions = {}, browserRuntimes = {}, profilesRemoved = [];
const clean = (value) => {
  let message = String(value);
  for (const secret of Object.values(credentials)) if (typeof secret === "string" && secret.length >= 6) message = message.replaceAll(secret, "[redacted]");
  return message.replace(/https?:\/\/[^\s]+/g, "[URL omitted]").replace(/\S*(?:clerk\.com|clerk\.accounts\.dev)\S*/g, "[Clerk URL omitted]").replace(/\S*(?:localhost(?::\d+)?|127\.0\.0\.1(?::\d+)?|\[::1\](?::\d+)?)(?:\/|%2f)\S*/gi, "[local URL omitted]").replace(/\/__clerk\/\S+/g, "[Clerk proxy path omitted]").replace(/eyJ[A-Za-z0-9_.-]+/g, "[token omitted]").replace(/\b(?:sess|client|user|ins|instance|org|sia|sua|sign_in|sign_up)_[A-Za-z0-9]+\b/g, "[provider identifier omitted]").replace(/\b(?:pk|sk)_(?:test|live)_[A-Za-z0-9+/_=-]+/g, "[key omitted]").replace(/\bnonce-[A-Za-z0-9+/_=-]+/g, "[nonce omitted]").replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email omitted]");
};
const safeReason = (value) => {
  const line = clean(String(value)).split("\n")[0];
  return line.replace(/\{.*$/, "[structured content omitted]").replace(/\[\s*(?:"|-?\d|\{|\[|true|false|null).*$/, "[structured content omitted]").slice(0, 800);
};
const reportPath = resolve(artifacts, "report.json");
const maskedFields = 'input[type="password"], #staff-email, #verification-code, #backup-code, [data-slot="input-otp-group"]';
let context, page, currentEngine, currentProfile, browserErrors, blockedMutations;
let workspaceRequests, workspaceRequestMap, navigationStartedAt = 0, navigationShell = null;
let browserErrorDetails;
let providerProtectionProbeErrors;
let publicScriptRequests, documentRequests, publicRequestMap;
let consoleErrorCount, consoleWarningCount;
let consoleErrorDetails;
let workerOverrideServedCount;
let softNavigationRequests, softNavigationMap, rscFallbackObserved, softNavigationCaptureTruncated;
let transportRequestMap, transportEvents, fetchDiagnosticEvents, passiveExceptionSignals;
let requestSequence, documentEpoch, requestedOffline, correlationHistoryTruncated;
function originKind(url) {
  if (url.origin === origin.origin) return "self";
  if (url.hostname === "clerk.com" || url.hostname.endsWith(".clerk.com") || url.hostname.endsWith(".clerk.accounts.dev")) return "provider";
  return "other";
}
function allowlistedRoute(url) {
  return url.origin === origin.origin && ["/", "/about", "/contact", "/staff", "/staff/login", "/staff/participants", "/staff/team", "/staff/settings", "/staff/reviews", "/staff/oversight", "/staff/reminders", "/staff/conflicts", "/staff/contacts/new"].includes(url.pathname) ? url.pathname : null;
}
function publicScriptModule(url) {
  if (url.origin === origin.origin && url.pathname.startsWith("/_next/static/")) return url.pathname;
  const pathname = url.origin === origin.origin && url.pathname.startsWith("/__clerk/") ? url.pathname.slice("/__clerk".length) : url.pathname;
  if (/^\/npm\/@clerk\/clerk-(?:js|ui)@[^/]+\/dist\/clerk\.(?:browser|ui)\.js$/.test(pathname)) return "Clerk public SDK";
  if (/^\/npm\/@clerk\/ui@[^/]+\/dist\/ui\.browser\.js$/.test(pathname)) return "Clerk public UI";
  return null;
}
function localDocumentPath(url) {
  return url.origin === origin.origin && ["/staff", "/staff/login", "/staff/offline"].includes(url.pathname) ? url.pathname : "other-document";
}
function logicalTarget(url) {
  const publicModule = publicScriptModule(url);
  return { originKind: originKind(url), target: allowlistedRoute(url) ??
    (url.origin === origin.origin && url.pathname === "/api/mentoring/workspace" ? "/api/mentoring/workspace" : null) ??
    (publicModule?.startsWith("/_next/static/") ? "Next public asset (path omitted)" : publicModule) ??
    (url.origin === origin.origin && url.pathname.startsWith("/__clerk/") ? "Clerk private API (path omitted)" : "other-resource") };
}
function logicalErrorTarget(error) {
  // Playwright's native-message split can discard the first slash in "http://".
  const nativeSplit = /^Fetch API cannot load https?$/.test(error.name) && /^\/(?!\/)/.test(error.message);
  const joined = nativeSplit ? `${error.name}:/${error.message}` : `${error.name}:${error.message}`;
  const source = `${error.message}\n${joined}\n${error.name}${error.message}`.match(/https?:\s*\/\/[^\s)'"<>]+/)?.[0];
  if (!source) return null;
  try { return logicalTarget(new URL(source.replace(/^(https?):\s*\/\//, "$1://"))); }
  catch { return null; }
}
function relatedTransport(diagnostic, event) {
  return Math.abs(diagnostic.at - event.at) <= 1_500 && diagnostic.logicalTarget &&
    diagnostic.logicalTarget.target !== "other-resource" && diagnostic.logicalTarget.target === event.target && diagnostic.logicalTarget.originKind === event.originKind;
}
function recordTransport(event) {
  transportEvents.push(event);
  if (transportEvents.length > 128) { transportEvents.shift(); correlationHistoryTruncated = true; }
  for (const diagnostic of fetchDiagnosticEvents) {
    if (relatedTransport(diagnostic, event) && diagnostic.relatedTransport.length < 12) diagnostic.relatedTransport.push(event);
  }
}
function fetchDiagnosticCorrelation() {
  return {
    navigationRequestEpoch: documentEpoch, requestedOffline, historyTruncated: correlationHistoryTruncated,
    association: "time and logical target only; causation is not established",
    passiveSignalAbsenceIsInconclusive: true,
    diagnostics: fetchDiagnosticEvents.map((entry) => ({ ...entry,
      nearbyPassiveSignals: passiveExceptionSignals.filter((signal) => Math.abs(signal.at - entry.at) <= 1_500).slice(0, 12),
    })),
  };
}

async function saveReport() {
  const report = {
    checkedAt: new Date().toISOString(), baseURL: origin.origin, buildId, playwrightVersion, browserVersions, browserRuntimes, viewports,
    environment: "local production-build server; real existing Clerk development identity",
    scope: accessibilityDiagnostic ? "One authenticated dialog accessibility diagnostic; collection is not AA acceptance" : optionalHelpers ? skipStorage ? "Focused authenticated accessibility checks; storage proof is not repeated" : "Focused authenticated storage-fault and accessibility checks" : focusedReload ? focusedOfflineDraft ? "Focused normal authenticated reload and strict native offline draft check" : "Focused authenticated reload check" : "Read-only desktop browser engines and mobile-sized desktop browser viewports",
    protocolRouteCalls: 0, protocolRouteSourceScanPassed: true,
    publicLayoutsRepeated: !focusedReload && !skipPublicLayouts,
    notTested: ["Physical Safari/macOS or iPhone/iPad", "Installed Firefox/Edge/Chrome release builds", "Android/iOS real devices", "Production SMS delivery", "Strict production every-login OTP", "Cross-browser domain writes or conflict/revocation workflows"],
    results, profilesRemoved,
    summary: {
      passed: results.filter((result) => result.status === "passed").length,
      failed: results.filter((result) => result.status === "failed").length,
      notTested: results.filter((result) => result.status === "not_tested").length,
    },
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 });
  return report;
}
async function screenshot(name) {
  const path = resolve(artifacts, `${currentEngine}-${name}.png`);
  await page.screenshot({ path, fullPage: true, mask: [page.locator(maskedFields)] });
  await chmod(path, 0o600);
  return path;
}
async function scenario(name, run) {
  const started = Date.now();
  try {
    const evidence = await run();
    results.push({ engine: currentEngine, name, status: "passed", durationMs: Date.now() - started, evidence });
    console.log(JSON.stringify({ engine: currentEngine, scenario: name, status: "passed" }));
    await saveReport();
    return true;
  } catch (error) {
    const diagnostics = await browserDiagnostics({ probeCache: resourceEvidence }).catch(() => ({ unavailable: true }));
    const image = await screenshot(`failure-${results.length + 1}`).catch(() => null);
    results.push({ engine: currentEngine, name, status: "failed", durationMs: Date.now() - started, message: clean(error.message), path: page?.url().startsWith(origin.origin) ? new URL(page.url()).pathname : null, screenshot: image, diagnostics });
    console.log(JSON.stringify({ engine: currentEngine, scenario: name, status: "failed", message: clean(error.message), firstUnexpectedSoftNavigationFailure: diagnostics.firstUnexpectedSoftNavigationFailure ?? null, firstFatalPageErrors: diagnostics.firstFatalPageErrors ?? [] }));
    await saveReport();
    return false;
  }
}
function observe(target) {
  target.on("pageerror", (error) => {
    const raw = `${error.name}\n${error.message}`;
    const hosts = raw.match(/\b(?:[a-z0-9-]+\.)+[a-z0-9-]+\b/gi) ?? [];
    const knownProbeHost = hosts.some((host) => host.toLowerCase() === "client.protect.clerk.com" || /^1-[a-z0-9]+-[a-z0-9]+-p\.client\.protect\.clerk\.com$/i.test(host));
    const providerProbeCors = knownProbeHost && /access control|cross.origin|cors/i.test(raw);
    if (/Fetch API cannot load|access control|cross.origin|cors/i.test(raw)) {
      if (fetchDiagnosticEvents.length < 16) {
        const diagnostic = { at: Date.now(), navigationRequestEpoch: documentEpoch, requestedOffline, providerProbe: providerProbeCors, logicalTarget: logicalErrorTarget(error), relatedTransport: [] };
        diagnostic.relatedTransport = transportEvents.filter((event) => relatedTransport(diagnostic, event)).slice(-12);
        fetchDiagnosticEvents.push(diagnostic);
      } else correlationHistoryTruncated = true;
    }
    if (providerProbeCors) providerProtectionProbeErrors.push("Clerk protection probe CORS");
    else browserErrors.push("fatal application page error");
    const message = safeReason(error.message);
    let moduleLocation = "native-or-unavailable";
    for (const line of String(error.stack ?? "").split("\n")) {
      const source = line.match(/https?:\/\/[^\s)]+/)?.[0];
      if (!source) continue;
      try {
        const url = new URL(source);
        if (url.origin === origin.origin && url.pathname.startsWith("/_next/static/")) { moduleLocation = url.pathname; break; }
        if (url.pathname.startsWith("/npm/@clerk/") || (url.origin === origin.origin && url.pathname.startsWith("/__clerk/npm/@clerk/"))) { moduleLocation = "Clerk public SDK"; break; }
      } catch { /* Keep only allowlisted module locations, never raw stacks. */ }
    }
    const detail = { category: providerProbeCors ? "provider-protection-probe-cors" : "application-page-error", name: clean(error.name).slice(0, 80), message, moduleLocation };
    if (browserErrorDetails.length < 3) browserErrorDetails.push(detail);
    else if (!providerProbeCors) {
      const replace = browserErrorDetails.findIndex((entry) => entry.category === "provider-protection-probe-cors");
      if (replace >= 0) browserErrorDetails[replace] = detail;
    }
  });
  target.on("console", (message) => {
    if (/Failed to fetch RSC payload.*Falling back to browser navigation/i.test(message.text())) rscFallbackObserved = true;
    if (message.type() === "error") {
      consoleErrorCount += 1;
      const text = message.text();
      const relevant = /clerk|script|service.?worker|fetch|network|resource|cors|blocked|NS_ERROR|integrity|mime/i.test(text);
      const reason = safeReason(text);
      if (!consoleErrorDetails.some((entry) => entry.message === reason)) {
        let moduleLocation = "native-or-unavailable";
        const location = message.location();
        try {
          const url = new URL(location.url);
          moduleLocation = publicScriptModule(url) ?? "other-module";
        } catch { /* No raw source URL is retained. */ }
        const entry = { message: reason, moduleLocation, line: location.lineNumber, column: location.columnNumber, relevant };
        if (consoleErrorDetails.length < 3) consoleErrorDetails.push(entry);
        else if (relevant) {
          const replace = consoleErrorDetails.findIndex((item) => !item.relevant);
          if (replace >= 0) consoleErrorDetails[replace] = entry;
        }
      }
    }
    if (message.type() === "warning") consoleWarningCount += 1;
    if (message.type() === "error" && /hydration|React error|Minified React|uncaught/i.test(message.text())) browserErrors.push("fatal console error");
  });
  target.on("request", (request) => {
    const url = new URL(request.url());
    const headers = request.headers();
    const nextActionPresent = Object.prototype.hasOwnProperty.call(headers, "next-action");
    const rscHeaderPresent = Object.prototype.hasOwnProperty.call(headers, "rsc");
    const previousSoft = request.redirectedFrom() ? softNavigationMap.get(request.redirectedFrom()) : null;
    const eligibleSoft = (url.origin === origin.origin && allowlistedRoute(url) && (url.searchParams.has("_rsc") || rscHeaderPresent || nextActionPresent)) || previousSoft;
    if (eligibleSoft && !previousSoft && softNavigationRequests.length >= 64) softNavigationCaptureTruncated = true;
    if ((previousSoft || softNavigationRequests.length < 64) && eligibleSoft) {
      const record = previousSoft?.record ?? { kind: nextActionPresent ? "next-action" : "rsc", path: allowlistedRoute(url), failed: false, steps: [] };
      if (!previousSoft && softNavigationRequests.length < 64) softNavigationRequests.push(record);
      if (record.steps.length < 12) {
        const step = { method: request.method(), path: allowlistedRoute(url), originKind: originKind(url), rscHeaderPresent, nextActionPresent, status: null, finished: false, failed: false };
        record.steps.push(step); softNavigationMap.set(request, { record, step });
      } else softNavigationCaptureTruncated = true;
    }
    if (url.origin === origin.origin && url.pathname === "/api/mentoring/workspace" && request.method() === "GET") {
      const entry = { startedAt: Date.now(), status: null, finished: false, failed: false };
      workspaceRequests.push(entry); workspaceRequestMap.set(request, entry);
    }
    const scriptModule = request.resourceType() === "script" ? publicScriptModule(url) : null;
    if (scriptModule) {
      const entry = { module: scriptModule, firstPartyRequest: url.origin === origin.origin, sourceUsesProxy: url.origin === origin.origin && url.pathname.startsWith("/__clerk/npm/"), startedAt: Date.now(), status: null, contentType: null, fromServiceWorker: null, finished: false, failed: false };
      publicScriptRequests.push(entry); publicRequestMap.set(request, entry);
    }
    let mainNavigation = false;
    if (request.isNavigationRequest()) {
      try { mainNavigation = request.frame() === target.mainFrame(); }
      catch { /* Requests without a frame do not terminate diagnostic cleanup. */ }
    }
    if (mainNavigation) {
      documentEpoch += 1;
      const previous = request.redirectedFrom();
      const entry = { path: localDocumentPath(url), redirectedFrom: previous ? localDocumentPath(new URL(previous.url())) : null, startedAt: Date.now(), status: null, finished: false, failed: false };
      documentRequests.push(entry); publicRequestMap.set(request, entry);
    }
    const resourceType = request.resourceType();
    const targetMetadata = logicalTarget(url);
    if (["fetch", "xhr", "document"].includes(resourceType) && targetMetadata.target !== "other-resource") {
      const metadata = { sequence: ++requestSequence, ...targetMetadata, resourceType,
        method: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(request.method()) ? request.method() : "OTHER",
        requestEpoch: documentEpoch, requestOffline: requestedOffline };
      transportRequestMap.set(request, metadata);
      if (mainNavigation) recordTransport({ ...metadata, at: Date.now(), event: "document-request", eventEpoch: documentEpoch, requestedOffline });
    }
  });
  target.on("framenavigated", (frame) => {
    if (frame === target.mainFrame()) recordTransport({ ...logicalTarget(new URL(frame.url())), at: Date.now(), event: "document-commit", eventEpoch: documentEpoch, requestedOffline });
  });
  target.on("response", (response) => {
    const transport = transportRequestMap.get(response.request());
    if (transport) recordTransport({ ...transport, at: Date.now(), event: "response", status: response.status(), eventEpoch: documentEpoch, requestedOffline });
    const soft = softNavigationMap.get(response.request());
    if (soft) { soft.step.status = response.status(); soft.step.responseOriginKind = originKind(new URL(response.url())); soft.step.fromServiceWorker = response.fromServiceWorker(); }
    const entry = workspaceRequestMap.get(response.request());
    if (entry) entry.status = response.status();
    const publicEntry = publicRequestMap.get(response.request());
    if (publicEntry) {
      publicEntry.status = response.status();
      publicEntry.contentType = response.headers()["content-type"]?.split(";")[0] ?? null;
      publicEntry.fromServiceWorker = response.fromServiceWorker();
      publicEntry.firstPartyResponse = new URL(response.url()).origin === origin.origin;
      if ("path" in publicEntry) publicEntry.anonymousShell = response.headers()["x-mentoring-shell"] === "anonymous-v1";
    }
  });
  target.on("requestfinished", (request) => {
    const transport = transportRequestMap.get(request);
    if (transport) recordTransport({ ...transport, at: Date.now(), event: "finished", status: request.existingResponse()?.status() ?? null, eventEpoch: documentEpoch, requestedOffline });
    const soft = softNavigationMap.get(request); if (soft) soft.step.finished = true;
    const entry = workspaceRequestMap.get(request); if (entry) entry.finished = true;
    const publicEntry = publicRequestMap.get(request); if (publicEntry) publicEntry.finished = true;
  });
  target.on("requestfailed", (request) => {
    const transport = transportRequestMap.get(request);
    if (transport) {
      const failure = safeReason(request.failure()?.errorText ?? "Unknown transport error");
      recordTransport({ ...transport, at: Date.now(), event: "failed", status: request.existingResponse()?.status() ?? null,
        failure, cancellationText: /ERR_ABORTED|NS_BINDING_ABORTED|cancelled|canceled/i.test(failure), eventEpoch: documentEpoch, requestedOffline });
    }
    const soft = softNavigationMap.get(request);
    if (soft) {
      soft.step.failed = true; soft.step.failure = safeReason(request.failure()?.errorText ?? "Unknown transport error");
      soft.record.failed = true; soft.record.failedAt = Date.now();
      soft.record.expectedAbort = /ERR_ABORTED|NS_BINDING_ABORTED|cancelled|canceled/i.test(soft.step.failure);
    }
    const entry = workspaceRequestMap.get(request); if (entry) entry.failed = true;
    const publicEntry = publicRequestMap.get(request); if (publicEntry) publicEntry.failed = true;
  });
}
async function browserDiagnostics({ probeCache = false } = {}) {
  if (!page || page.isClosed()) return { pageClosed: true };
  const state = await page.evaluate(async ({ expectedOrigin, probeCache, queryWorkerTrace }) => {
    const clerk = window.Clerk;
    const locks = navigator.locks?.query ? await Promise.race([
      navigator.locks.query().then((value) => ({
        held: value.held.map(({ name, mode }) => ({ name: name === "mentoring-private-sync" ? name : "other-lock", mode })),
        pending: value.pending.map(({ name, mode }) => ({ name: name === "mentoring-private-sync" ? name : "other-lock", mode })),
      })),
      new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), 2_000)),
    ]) : { unsupported: true };
    const logicalModule = (url) => {
      if (url.origin === expectedOrigin && url.pathname.startsWith("/_next/static/")) return url.pathname;
      const pathname = url.origin === expectedOrigin && url.pathname.startsWith("/__clerk/") ? url.pathname.slice("/__clerk".length) : url.pathname;
      if (/^\/npm\/@clerk\/clerk-(?:js|ui)@[^/]+\/dist\/clerk\.(?:browser|ui)\.js$/.test(pathname)) return "Clerk public SDK";
      if (/^\/npm\/@clerk\/ui@[^/]+\/dist\/ui\.browser\.js$/.test(pathname)) return "Clerk public UI";
      return null;
    };
    const resources = performance.getEntriesByType("resource");
    const scripts = [...document.scripts].filter((script) => script.src).flatMap((script) => {
      const scriptModule = logicalModule(new URL(script.src)); if (!scriptModule) return [];
      const timing = resources.filter((entry) => entry.name === script.src).at(-1);
      const url = new URL(script.src);
      return [{ module: scriptModule, sourceFirstParty: url.origin === expectedOrigin, sourceUsesProxy: url.origin === expectedOrigin && url.pathname.startsWith("/__clerk/npm/"), async: script.async, defer: script.defer, connected: script.isConnected, performanceEntryPresent: Boolean(timing),
        ...(timing ? { initiatorType: timing.initiatorType, duration: timing.duration, responseEnd: timing.responseEnd, transferSize: timing.transferSize, encodedBodySize: timing.encodedBodySize, decodedBodySize: timing.decodedBodySize, timingDetailsExposed: timing.responseStart > 0 || timing.transferSize > 0 } : {}) }];
    });
    const nav = performance.getEntriesByType("navigation")[0];
    let cacheHealth = { probed: false };
    if (probeCache) {
      const bounded = (task) => Promise.race([task, new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), 2_000))]);
      try {
        const keys = await bounded(caches.keys().then((names) => ({ names })));
        if (keys.timedOut) cacheHealth = { probed: true, keysTimedOut: true };
        else {
          const name = keys.names.find((item) => item.startsWith("mentoring-anonymous-shell-"));
          cacheHealth = { probed: true, keysCompleted: true, staffCachePresent: Boolean(name), totalCacheCount: keys.names.length };
          if (name) {
            const opened = await bounded(caches.open(name).then((cache) => ({ cache })));
            if (opened.timedOut) cacheHealth.openTimedOut = true;
            else {
              cacheHealth.openCompleted = true;
              const entries = await bounded(opened.cache.keys().then((items) => ({ count: items.length })));
              if (entries.timedOut) cacheHealth.entryKeysTimedOut = true;
              else cacheHealth.entryCount = entries.count;
            }
          }
        }
      } catch { cacheHealth = { ...cacheHealth, deniedOrUnavailable: true }; }
    }
    let workerTrace = { queried: false };
    if (queryWorkerTrace) {
      const controller = navigator.serviceWorker?.controller;
      if (!controller) workerTrace = { queried: true, controllerPresent: false };
      else workerTrace = await new Promise((resolve) => {
        const channel = new MessageChannel();
        const timeout = setTimeout(() => { channel.port1.close(); resolve({ queried: true, timedOut: true }); }, 2_500);
        channel.port1.onmessage = (event) => {
          clearTimeout(timeout); channel.port1.close();
          const data = event.data;
          if (data?.type !== "MENTORING_PUBLIC_SCRIPT_TRACE_RESULT" || !Array.isArray(data.trace)) { resolve({ queried: true, invalidReply: true }); return; }
          const enums = {
            script: ["sdk", "ui"],
            stage: ["event-entry", "respond-with-before", "respond-with-after", "cache-open-before", "cache-open-after", "cache-match-before", "cache-match-after", "cache-match-skipped", "fetch-before", "fetch-after", "clone-before", "clone-after", "wait-until-before", "wait-until-after", "publication-start", "cache-put-before", "cache-put-after", "trim-before", "trim-after", "publication-complete", "publication-failed", "foreground-return", "fetch-rejected", "fallback-match-before", "fallback-match-after", "fallback-return", "fetch-throw", "handled-fulfilled", "handled-rejected"],
            mode: ["cors", "no-cors", "same-origin", "navigate", "websocket", "other"],
            destination: ["", "script", "worker", "serviceworker", "sharedworker", "document", "image", "style", "font", "manifest", "fetch", "other"],
            credentials: ["omit", "same-origin", "include", "other"], redirect: ["follow", "error", "manual", "other"],
            cache: ["default", "no-store", "reload", "no-cache", "force-cache", "only-if-cached", "other"],
            type: ["basic", "cors", "default", "error", "opaque", "opaqueredirect", "other"],
          };
          const booleans = ["requestSameOrigin", "signalAborted", "redirected", "responseURLPresent", "responseSameOrigin", "bodyUsed", "bodyLocked", "cacheAvailable", "cacheHit"];
          const trace = []; let ignoredFields = 0, invalidRecords = 0;
          for (const row of data.trace.slice(-192)) {
            if (!row || typeof row !== "object" || !enums.script.includes(row.script) || !enums.stage.includes(row.stage)) { invalidRecords += 1; continue; }
            const entry = {};
            for (const [key, value] of Object.entries(row)) {
              if (key === "at" && Number.isFinite(value) && value >= 0) entry[key] = value;
              else if (key === "status" && Number.isInteger(value) && value >= 0 && value <= 599) entry[key] = value;
              else if (Object.prototype.hasOwnProperty.call(enums, key) && enums[key].includes(value)) entry[key] = value;
              else if (booleans.includes(key) && typeof value === "boolean") entry[key] = value;
              else ignoredFields += 1;
            }
            trace.push(entry);
          }
          resolve({ queried: true, enabled: data.enabled === true, limit: data.limit === 192 ? 192 : null, trace, ignoredFields, invalidRecords });
        };
        try { controller.postMessage({ type: "MENTORING_PUBLIC_SCRIPT_TRACE" }, [channel.port2]); }
        catch { clearTimeout(timeout); channel.port1.close(); resolve({ queried: true, messageFailed: true }); }
      });
    }
    return {
      clerkObjectExists: Boolean(clerk), clerkLoadFunctionExists: typeof clerk?.load === "function",
      clerkReactBootstrapRan: Boolean(window.__clerk_publishable_key), clerkUIConstructorExists: Boolean(window.__internal_ClerkUICtor),
      nextBootstrapObjectExists: Boolean(window.next),
      nextFlightStillBuffered: Array.isArray(window.__next_f) && window.__next_f.push === Array.prototype.push,
      clerkLoaded: Boolean(clerk?.loaded), clerkUserPresent: Boolean(clerk?.user), clerkSessionPresent: Boolean(clerk?.session),
      online: navigator.onLine, readyState: document.readyState, serviceWorkerControlled: Boolean(navigator.serviceWorker?.controller),
      initiallyServiceWorkerControlled: Boolean(window.__mentoringQAInitialSWControl),
      workspaceSkeletonPresent: Boolean(document.querySelector('[aria-label="טוענת את סביבת הליווי"]')),
      loginFormPresent: Boolean(document.getElementById("staff-email")), locks, scripts, cacheHealth,
      securityPolicyViolations: window.__mentoringQASecurityPolicyViolations ?? [],
      workerTrace,
      navigationTiming: nav ? { responseStart: nav.responseStart, responseEnd: nav.responseEnd, domInteractive: nav.domInteractive, domContentLoadedEventStart: nav.domContentLoadedEventStart, loadEventStart: nav.loadEventStart, redirectCount: nav.redirectCount, transferSize: nav.transferSize, encodedBodySize: nav.encodedBodySize, decodedBodySize: nav.decodedBodySize } : null,
    };
  }, { expectedOrigin: origin.origin, probeCache, queryWorkerTrace: workerTraceControl });
  const sinceNavigation = (entries) => entries.filter((entry) => entry.startedAt >= navigationStartedAt).map(({ startedAt, ...entry }) => ({ ...entry, afterNavigationMs: startedAt - navigationStartedAt }));
  return {
    ...state, navigationShell, blockedMentoringMutationCount: blockedMutations.length,
    workspaceRequestsSinceNavigation: workspaceRequests.filter((entry) => entry.startedAt >= navigationStartedAt).map(({ startedAt, ...entry }) => ({ ...entry, afterNavigationMs: startedAt - navigationStartedAt })),
    fatalBrowserErrorCount: browserErrors.length + providerProtectionProbeErrors.length,
    fatalApplicationErrorCount: browserErrors.length,
    providerProtectionProbeCorsCount: providerProtectionProbeErrors.length,
    firstFatalPageErrors: [...browserErrorDetails],
    fetchDiagnosticCorrelation: fetchDiagnosticCorrelation(),
    consoleErrorCount, consoleWarningCount,
    firstConsoleErrors: [...consoleErrorDetails],
    rscFallbackObserved,
    softNavigationCaptureTruncated,
    firstSuccessfulRsc: softNavigationRequests.find((entry) => entry.kind === "rsc" && !entry.failed && entry.steps.at(-1)?.status === 200 && entry.steps.at(-1)?.finished) ?? null,
    firstSuccessfulAuthCacheInvalidation: softNavigationRequests.find((entry) => entry.kind === "next-action" && !entry.failed && entry.steps.at(-1)?.status === 200 && entry.steps.at(-1)?.finished) ?? null,
    firstSoftNavigationFailure: softNavigationRequests.filter((entry) => entry.failed).sort((a, b) => a.failedAt - b.failedAt)[0] ?? null,
    firstUnexpectedSoftNavigationFailure: softNavigationRequests.filter((entry) => entry.failed && !entry.expectedAbort).sort((a, b) => a.failedAt - b.failedAt)[0] ?? null,
    softNavigationRequestCount: softNavigationRequests.length,
    playwrightRoutingFromStart: !noRouteFromStart || sdkPassthroughControl,
    mentoringApiRoutingFromStart: !noRouteFromStart,
    sdkPassthroughControl, workerOverrideServedCount, workerCandidateHash,
    servedSdkControl, servedWorkerHash,
    workerTraceControl,
    publicScriptsSinceNavigation: sinceNavigation(publicScriptRequests),
    documentsSinceNavigation: sinceNavigation(documentRequests),
  };
}
async function launch(viewport, startOffline = false) {
  requestedOffline = startOffline;
  const executable = playwright[currentEngine].executablePath();
  browserRuntimes[currentEngine] = { executable, revision: executable.match(new RegExp(`${currentEngine}-(\\d+)(?:[/\\\\]|$)`))?.[1] ?? null };
  context = await playwright[currentEngine].launchPersistentContext(currentProfile, {
    headless: true, viewport, locale: "he-IL", timezoneId: "Asia/Jerusalem", serviceWorkers: "allow", offline: startOffline,
  });
  await context.exposeBinding("__mentoringQARecordBlocked", (_source, attempt) => {
    blockedMutations.push({ path: attempt.path, method: attempt.method });
  });
  await context.exposeBinding("__mentoringQARecordExceptionSignal", (_source, signal) => {
    if (!["window-error", "unhandledrejection"].includes(signal?.kind)) return;
    if (passiveExceptionSignals.length < 128) passiveExceptionSignals.push({ kind: signal.kind, at: Date.now(), navigationRequestEpoch: documentEpoch, requestedOffline });
    else correlationHistoryTruncated = true;
  });
  await context.addInitScript(({ expectedOrigin }) => {
    const recordSignal = (kind) => { void window.__mentoringQARecordExceptionSignal({ kind }).catch(() => {}); };
    addEventListener("error", (event) => { if (event instanceof ErrorEvent) recordSignal("window-error"); });
    addEventListener("unhandledrejection", () => recordSignal("unhandledrejection"));
    Object.defineProperty(window, "__mentoringQAInitialSWControl", { value: Boolean(navigator.serviceWorker?.controller) });
    const securityPolicyViolations = [];
    Object.defineProperty(window, "__mentoringQASecurityPolicyViolations", { value: securityPolicyViolations });
    addEventListener("securitypolicyviolation", (event) => {
      let blockedResource = ["inline", "eval"].includes(event.blockedURI) ? event.blockedURI : "other-resource";
      try {
        const url = new URL(event.blockedURI);
        const pathname = url.origin === expectedOrigin && url.pathname.startsWith("/__clerk/") ? url.pathname.slice("/__clerk".length) : url.pathname;
        if (url.origin === expectedOrigin && url.pathname.startsWith("/_next/static/")) blockedResource = url.pathname;
        else if (/^\/npm\/@clerk\/clerk-(?:js|ui)@[^/]+\/dist\/clerk\.(?:browser|ui)\.js$/.test(pathname)) blockedResource = "Clerk public SDK";
        else if (/^\/npm\/@clerk\/ui@[^/]+\/dist\/ui\.browser\.js$/.test(pathname)) blockedResource = "Clerk public UI";
      } catch { /* No raw blocked URI, policy, nonce, or sample is retained. */ }
      securityPolicyViolations.push({ directive: event.effectiveDirective, disposition: event.disposition, blockedResource });
    });
    const attempted = [];
    Object.defineProperty(window, "__mentoringQAMutations", { value: attempted });
    const forbidden = (rawURL, rawMethod) => {
      const url = new URL(rawURL, location.href), method = String(rawMethod ?? "GET").toUpperCase();
      if (url.origin !== expectedOrigin || !url.pathname.startsWith("/api/mentoring/") || ["GET", "HEAD", "OPTIONS"].includes(method)) return false;
      const attempt = { path: url.pathname, method };
      attempted.push(attempt);
      void window.__mentoringQARecordBlocked(attempt);
      return true;
    };
    const fetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      if (forbidden(url, method)) return Promise.reject(new Error("Read-only compatibility check blocked a mentoring mutation."));
      return fetch(input, init);
    };
    const opened = new WeakMap(), open = XMLHttpRequest.prototype.open, send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      opened.set(this, { method, url: String(url) });
      return open.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function (...args) {
      const request = opened.get(this);
      if (request && forbidden(request.url, request.method)) throw new Error("Read-only compatibility check blocked a mentoring mutation.");
      return send.apply(this, args);
    };
    const beacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url, data) => {
      if (forbidden(String(url), "POST")) return false;
      return beacon(url, data);
    };
  }, { expectedOrigin: origin.origin });
  // No browser trace/storageState/network payload is saved: authentication is real.
  // Guard accidental UI submissions before they can reach a mentoring endpoint.
  context.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin === origin.origin && url.pathname.startsWith("/api/mentoring/") && !["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      // Also observe service-worker requests, which may bypass Playwright routes.
      blockedMutations.push({ path: url.pathname, method: request.method() });
    }
  });
  await context.setOffline(startOffline);
  page = context.pages()[0] ?? await context.newPage();
  observe(page);
  browserVersions[currentEngine] ??= context.browser()?.version() ?? "unavailable";
}
async function assertNoMutations() {
  const pageAttempts = await page.evaluate(() => window.__mentoringQAMutations ?? []);
  assert.deepEqual(pageAttempts, [], "A page attempted a mentoring mutation.");
  assert.deepEqual(blockedMutations, [], "A mentoring mutation was attempted; reconnect is forbidden.");
}
async function navigate(path, heading, headingTimeout = 45_000) {
  navigationStartedAt = Date.now(); navigationShell = null;
  const response = await page.goto(`${origin.origin}${path}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  navigationShell = response?.headers()["x-mentoring-shell"] === "anonymous-v1" ? "anonymous-v1" : "not-anonymous-shell";
  assert.equal(new URL(page.url()).pathname, path);
  assert.ok([200, 304].includes(response?.status()), `${path} did not return a successful document or valid HTTP cache revalidation.`);
  if (heading) await page.getByRole("heading", { name: heading, exact: typeof heading === "string", level: 1 }).waitFor({ state: "visible", timeout: headingTimeout });
  else await page.locator("h1").first().waitFor({ state: "visible", timeout: headingTimeout });
}
async function workspace() {
  return page.evaluate(async () => {
    const response = await fetch("/api/mentoring/workspace", { cache: "no-store", headers: { "X-Mentoring-QA-Probe": "read" } });
    if (!response.ok) throw new Error(`Workspace returned ${response.status}`);
    return response.json();
  });
}
async function layout() {
  const value = await page.evaluate(() => ({
    width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
    lang: document.documentElement.lang, dir: document.documentElement.dir,
    bodyDirection: getComputedStyle(document.body).direction,
  }));
  assert.equal(value.lang, "he"); assert.equal(value.dir, "rtl"); assert.equal(value.bodyDirection, "rtl");
  assert.ok(value.scrollWidth <= value.width + 1, `Horizontal overflow: ${value.scrollWidth} > ${value.width}`);
  return value;
}
async function popupFits(popup) {
  const box = await popup.boundingBox();
  assert.ok(box, "The dialog must have a visible box.");
  const viewport = page.viewportSize();
  assert.ok(box.x >= -1 && box.x + box.width <= viewport.width + 1, "The dialog overflows horizontally.");
  assert.ok(box.y >= -1 && box.y + box.height <= viewport.height + 1, "The dialog overflows vertically.");
  return { width: Math.round(box.width), height: Math.round(box.height) };
}
async function surfaceColors(locator) {
  return locator.evaluate((node) => {
    const canvas = document.createElement("canvas"); canvas.width = 1; canvas.height = 1;
    const context = canvas.getContext("2d");
    const rgba = (color) => {
      context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data];
    };
    const over = (front, back) => front.slice(0, 3).map((channel, index) => channel * front[3] / 255 + back[index] * (1 - front[3] / 255));
    const luminance = (color) => color.slice(0, 3).map((value) => value / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
    const ancestors = [];
    for (let element = node; element; element = element.parentElement) ancestors.push(element);
    let background = [255, 255, 255];
    for (const element of ancestors.reverse()) background = over(rgba(getComputedStyle(element).backgroundColor), background);
    const style = getComputedStyle(node), foreground = rgba(style.color), border = rgba(style.borderTopColor);
    return {
      backgroundRGBA: rgba(style.backgroundColor), effectiveBackgroundRGB: background.map(Math.round),
      foregroundRGBA: foreground, borderRGBA: border, borderWidth: parseFloat(style.borderTopWidth),
      backgroundLuminance: luminance(background), textContrast: contrast(over(foreground, background), background),
      borderContrast: contrast(over(border, background), background),
    };
  });
}
async function settleVisuals() {
  await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const finite = document.getAnimations().filter((animation) => animation.playState === "running" && animation.effect?.getTiming().iterations !== Infinity);
    await Promise.all(finite.map((animation) => animation.finished.catch(() => {})));
  });
}
async function login() {
  await navigate("/staff/login");
  await page.waitForFunction(() => document.getElementById("staff-email") && !document.getElementById("staff-email").disabled);
  await page.locator("#staff-email").focus(); await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "staff-password");
  await page.locator("#staff-email").fill(credentials.email); await page.locator("#staff-password").fill(credentials.password);
  await page.getByRole("button", { name: "כניסה למרחב הליווי", exact: true }).click();
  await page.waitForFunction(() => location.pathname === "/staff" || !!document.getElementById("verification-code"), null, { timeout: 45_000 });
  const otpRequested = await page.locator("#verification-code").isVisible().catch(() => false);
  if (otpRequested) {
    const code = credentials.developmentVerificationCode;
    assert.ok(typeof code === "string" && /^\d{6}$/.test(code), "The approved account needs its private development verification code.");
    const field = page.locator("#verification-code");
    await page.waitForFunction(() => {
      const field = document.getElementById("verification-code");
      return field && !field.disabled;
    }, null, { timeout: 45_000 });
    await field.focus(); await field.press("ControlOrMeta+A"); await field.press("Backspace");
    await field.pressSequentially(code, { delay: 80 });
    assert.ok(await field.inputValue() === code, "The verification field must contain the complete private test code before submission.");
    await page.getByRole("button", { name: "אימות וכניסה", exact: true }).click();
  }
  let usedSignedInContinue = false;
  try { await page.waitForURL((url) => url.pathname === "/staff", { timeout: allowSignedInContinue ? 10_000 : focusedReload ? 20_000 : 45_000 }); }
  catch (error) {
    if (!signedInContinueControl && !allowSignedInContinue) throw error;
    const diagnostics = await browserDiagnostics();
    results.push({ engine: currentEngine, name: "Automatic post-verification navigation", status: "failed", message: clean(error.message), path: new URL(page.url()).pathname, diagnostics, screenshot: await screenshot("automatic-auth-navigation-failure") });
    await saveReport();
    assert.ok(await page.evaluate(() => Boolean(window.Clerk?.loaded && window.Clerk?.user && window.Clerk?.session)), "Continue requires the existing real signed-in Clerk session.");
    const continueAction = page.getByText("המשך למרחב הליווי", { exact: true });
    await continueAction.waitFor({ state: "visible", timeout: 5_000 });
    await continueAction.click({ timeout: 10_000 });
    usedSignedInContinue = true;
    await page.waitForURL((url) => url.pathname === "/staff", { timeout: 20_000 });
  }
  await page.getByRole("heading", { name: /^שלום,/, level: 1 }).waitFor({ state: "visible", timeout: 45_000 });
  const state = await workspace();
  assert.equal(state.actor.role, "ceo"); assert.equal(state.actor.active, true);
  assert.equal(state.actor.email, credentials.email);
  await page.getByText("Online", { exact: true }).waitFor({ state: "visible" });
  if (requireFirstPartyScripts) {
    for (const family of ["Clerk public SDK", "Clerk public UI"]) {
      const attempts = publicScriptRequests.filter((entry) => entry.module === family);
      assert.ok(attempts.length > 0 && attempts.every((entry) => entry.firstPartyRequest && entry.sourceUsesProxy), "Every public Clerk script attempt must use the first-party proxy.");
      const delivered = attempts.filter((entry) => entry.status === 200 && entry.finished);
      assert.ok(delivered.length > 0, "Both public Clerk script families must complete real delivery.");
      assert.ok(delivered.every((entry) => entry.firstPartyRequest && entry.firstPartyResponse && entry.sourceUsesProxy), "Public Clerk script source and final response URLs must remain first-party.");
    }
  }
  return { existingApprovedIdentity: true, role: state.actor.role, otpRequested, keyboardEmailToPassword: true, providerUsersCreated: 0, participantCount: state.participants.length, usedSignedInContinue, diagnostics: resourceEvidence ? await browserDiagnostics() : undefined };
}
async function dialogKeyboard(triggerName, inputLabel, imageName) {
  const trigger = page.getByRole("button", { name: triggerName, exact: true });
  await trigger.focus(); await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog"); await dialog.waitFor({ state: "visible" });
  const input = dialog.getByLabel(inputLabel, { exact: true });
  await input.waitFor({ state: "visible" });
  await page.waitForFunction((label) => {
    const inputs = [...document.querySelectorAll('[role="dialog"] input')];
    return inputs.some((item) => item.labels?.[0]?.textContent === label && !item.matches(":disabled"));
  }, inputLabel);
  await settleVisuals(); await input.focus();
  await page.waitForFunction((label) => document.activeElement?.labels?.[0]?.textContent === label, inputLabel, { timeout: 1_500 });
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Tab");
    await page.waitForFunction(() => !!document.activeElement?.closest('[role="dialog"]'), null, { timeout: 1_500 });
  }
  const bounds = await popupFits(dialog), image = await screenshot(imageName);
  await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
  await page.waitForFunction((name) => document.activeElement?.textContent?.trim() === name, triggerName);
  return { bounds, screenshot: image, focusStayedInsideModal: true, escapeRestoresTriggerFocus: true, submitted: false };
}
async function runOfflineDraft({ focusOnly = false } = {}) {
  const draftName = `טיוטת תאימות דפדפן ${currentEngine}`;
  await navigate("/staff/participants", "החניכות");
  await page.getByRole("button", { name: "חניכה חדשה", exact: true }).click();
  const onlineDialog = page.getByRole("dialog");
  await onlineDialog.getByLabel("שם החניכה", { exact: true }).fill(draftName);
  await onlineDialog.getByText("הטיוטה נשמרה במכשיר הזה", { exact: true }).waitFor({ state: "visible" });
  await page.keyboard.press("Escape"); await onlineDialog.waitFor({ state: "hidden" });
  await navigate("/staff", /^שלום,/);
  await page.waitForFunction(async () => {
    if (!navigator.serviceWorker?.controller) return false;
    const name = (await caches.keys()).find((item) => item.startsWith("mentoring-anonymous-shell-"));
    return !!name && !!await (await caches.open(name)).match("/staff/offline");
  }, null, { timeout: 60_000 });
  const before = await workspace();
  const response = await context.request.get(`${origin.origin}/staff/offline`);
  assert.equal(response.status(), 200); assert.equal(response.headers()["x-mentoring-shell"], "anonymous-v1");
  const html = await response.text();
  assert.equal(html.includes(credentials.email), false); assert.equal(html.includes(before.actor.id), false);
  await context.close(); context = null; page = null;
  await launch(viewports.mobileSize, true);
  await navigate("/staff/participants", "החניכות");
  await page.getByText("אפשר להמשיך גם ללא חיבור", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.getByText("Offline", { exact: true }).waitFor({ state: "visible" });
  assert.equal(await page.evaluate(() => navigator.onLine), false);
  await page.getByRole("button", { name: "חניכה חדשה", exact: true }).click();
  const offlineDialog = page.getByRole("dialog");
  const name = offlineDialog.getByLabel("שם החניכה", { exact: true });
  await page.waitForFunction((expected) => document.getElementById("participant-name")?.value === expected, draftName, { timeout: 30_000 });
  assert.equal(await name.inputValue(), draftName);
  const draftScreenshot = await screenshot("offline-unsubmitted-participant-draft-mobileSize");
  await page.keyboard.press("Escape"); await offlineDialog.waitFor({ state: "hidden" });
  const pages = focusOnly ? [{ path: "/staff/participants", ...await layout() }] : [];
  for (const [path, heading] of focusOnly ? [] : routes.filter(([path]) => ["/staff", "/staff/participants", "/staff/settings", "/staff/oversight", "/staff/reminders"].includes(path))) {
    await navigate(path, heading);
    await page.getByText("אפשר להמשיך גם ללא חיבור", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    await page.getByText("Offline", { exact: true }).waitFor({ state: "visible" });
    assert.equal(await page.evaluate(() => navigator.onLine), false);
    pages.push({ path, ...await layout() });
  }
  const image = await screenshot("offline-workspace-mobileSize");
  await assertNoMutations();
  requestedOffline = false;
  await context.setOffline(false);
  await navigate("/staff", /^שלום,/);
  await page.getByText("Online", { exact: true }).waitFor({ state: "visible" });
  const after = await workspace(); assert.ok(after.actor.id === before.actor.id, "The reconnected workspace must belong to the same approved identity."); assert.equal(after.actor.role, "ceo");
  await assertNoMutations();
  return { serviceWorkerPrepared: true, nativeColdRestart: true, offlineFromContextConstruction: true, anonymousShellHasPrivateData: false, authorizedWorkspaceRestored: true, unsubmittedParticipantDraftRestored: true, acceptedParticipantCount: before.participants.length, populatedParticipantPersistenceTested: false, mentoringMutationAttempts: 0, pages, sameIdentityReconnected: true, screenshot: image, draftScreenshot, diagnostics: await browserDiagnostics() };
}

for (const engine of engines) {
  currentEngine = engine; browserErrors = []; browserErrorDetails = []; providerProtectionProbeErrors = []; blockedMutations = [];
  workspaceRequests = []; workspaceRequestMap = new Map();
  publicScriptRequests = []; documentRequests = []; publicRequestMap = new Map();
  softNavigationRequests = []; softNavigationMap = new Map(); rscFallbackObserved = false; softNavigationCaptureTruncated = false;
  transportRequestMap = new WeakMap(); transportEvents = []; fetchDiagnosticEvents = []; passiveExceptionSignals = [];
  requestSequence = 0; documentEpoch = 0; requestedOffline = false; correlationHistoryTruncated = false;
  consoleErrorCount = 0; consoleWarningCount = 0;
  consoleErrorDetails = [];
  workerOverrideServedCount = 0;
  currentProfile = await mkdtemp(resolve(artifacts, `${engine}-private-profile-`));
  await chmod(currentProfile, 0o700);
  try {
    if (!await scenario("Fresh engine launches with an isolated private profile", async () => {
      await launch(viewports.desktop); return { version: browserVersions[engine], profile: "fresh temporary profile" };
    })) continue;
    if (!focusedReload && !skipPublicLayouts) await scenario("Public pages and login fit desktop and mobile-sized RTL layouts", async () => {
      const pages = [];
      for (const [size, viewport] of Object.entries(viewports)) {
        await page.setViewportSize(viewport);
        for (const path of ["/", "/about", "/contact", "/staff/login"]) {
          await navigate(path); pages.push({ path, size, ...await layout() });
        }
        await screenshot(`login-${size}`);
      }
      await page.setViewportSize(viewports.desktop); return { pages };
    });
    await page.setViewportSize(viewports.desktop);
    const authenticated = await scenario("Existing approved Clerk identity signs in and binds the CEO membership", login);
    if (!authenticated) {
      results.push({ engine, name: "Signed-in routes, dialogs, and prepared offline reload", status: "not_tested", reason: "The dependent real sign-in scenario failed." });
      continue;
    }
    if (sdkPassthroughControl || servedWorkerHash) {
      const diagnosticWorker = sdkPassthroughControl || servedSdkControl || workerTraceControl;
      const applied = await scenario(!diagnosticWorker ? "Frozen worker is hash verified, controlling, and prepared" : servedSdkControl || workerTraceControl ? "Authorized served diagnostic worker is verified, controlling, and prepared" : "Private worker response override is installed, controlling, and prepared", async () => {
        if (servedWorkerHash) {
          const response = await context.request.get(`${origin.origin}/staff-sw.js`);
          assert.equal(response.status(), 200);
          const hash = createHash("sha256").update(await response.text()).digest("hex");
          assert.equal(hash, servedWorkerHash, "The actual served worker must match the source owner's frozen diagnostic hash.");
        }
        await page.waitForFunction(async () => {
          if (!navigator.serviceWorker?.controller) return false;
          const name = (await caches.keys()).find((item) => item.startsWith("mentoring-anonymous-shell-"));
          return !!name && !!await (await caches.open(name)).match("/staff/offline");
        }, null, { timeout: 30_000 });
        if (sdkPassthroughControl) assert.ok(workerOverrideServedCount > 0, "The private worker override did not intercept an installation; this control was not applied.");
        if (workerTraceControl) {
          const diagnostics = await browserDiagnostics();
          assert.equal(diagnostics.workerTrace.enabled, true, "The reviewed worker metadata getter must respond before the reload.");
          assert.equal(diagnostics.workerTrace.limit, 192);
        }
        return { workerOverrideServedCount, workerCandidateHash, servedWorkerHash, publicSdkOnly: diagnosticWorker && !workerTraceControl ? true : undefined, publicScriptMetadataOnly: workerTraceControl, workerTraceControl, workerHashVerified: Boolean(servedWorkerHash), diagnosticOnlineOnly: diagnosticWorker ? true : undefined, offlineAcceptance: diagnosticWorker ? false : undefined };
      });
      if (!applied) continue;
    }
    const reloaded = await scenario("First authenticated full reload initializes the real workspace", async () => {
      await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 30_000 });
      const reloads = [];
      for (let index = 0; index < focusedReloadCount; index += 1) {
        const started = Date.now();
        await navigate("/staff", /^שלום,/, focusedReload ? 20_000 : 45_000);
        await page.getByText("Online", { exact: true }).waitFor({ state: "visible" });
        const state = await workspace(); assert.equal(state.actor.role, "ceo");
        const diagnostics = await browserDiagnostics();
        assert.equal(diagnostics.initiallyServiceWorkerControlled, true, "A normal reload must start under the real staff worker.");
        assert.equal(diagnostics.serviceWorkerControlled, true);
        reloads.push({ ordinal: index + 1, durationMs: Date.now() - started, diagnostics, layout: await layout() });
      }
      return { ...reloads.at(-1).diagnostics, ...reloads.at(-1).layout, consecutiveNormalReloads: focusedReloadCount, reloads };
    });
    if (reloaded && (!focusedReload || focusedOfflineDraft || optionalHelpers)) {
      const seamless = await scenario("Protected client navigation avoids RSC transport failure or browser fallback", async () => {
        await page.setViewportSize(viewports.desktop);
        rscFallbackObserved = false;
        const documentsBefore = documentRequests.length;
        await page.locator('a[href="/staff/participants"]').filter({ visible: true }).first().click({ timeout: 10_000 });
        await page.waitForURL((url) => url.pathname === "/staff/participants", { waitUntil: "domcontentloaded", timeout: 20_000 });
        await page.getByRole("heading", { name: "החניכות", exact: true, level: 1 }).waitFor({ state: "visible", timeout: 20_000 });
        const diagnostics = await browserDiagnostics();
        assert.equal(documentRequests.length, documentsBefore, "The protected client navigation unexpectedly performed a full document navigation.");
        assert.equal(diagnostics.softNavigationCaptureTruncated, false, "The bounded transport evidence was truncated before the gate completed.");
        assert.equal(diagnostics.rscFallbackObserved, false, "Next fell back to browser navigation after an RSC fetch failure.");
        assert.equal(diagnostics.firstUnexpectedSoftNavigationFailure, null, "A real RSC or auth cache-invalidation request failed.");
        return { protectedDestinationVisible: true, rscFallbackObserved: false, newDocumentNavigations: documentRequests.length - documentsBefore, softNavigationCaptureTruncated: false, softNavigationRequestCount: diagnostics.softNavigationRequestCount, firstSuccessfulRsc: diagnostics.firstSuccessfulRsc, firstSuccessfulAuthCacheInvalidation: diagnostics.firstSuccessfulAuthCacheInvalidation };
      });
      if (!seamless) {
        results.push({ engine, name: "Dependent browser journeys", status: "not_tested", reason: "The route-free RSC gate failed; dependent journeys stop at the first transport failure." });
        continue;
      }
    }
    if (reloaded && optionalHelpers) {
      if (!accessibilityDiagnostic && !skipStorage) {
      const { runDraftStorageFaultScenario } = await import("./storage-faults.mjs");
      let storageFailureEvidence = null;
      const storagePassed = await scenario("Owned local draft quota failure preserves input and retries without commands", async () => {
        try { return await runDraftStorageFaultScenario({ page, origin: origin.origin, runId: "webkit-local-storage", assertNoMutations }); }
        catch (error) { storageFailureEvidence = error.storageFaultEvidence ?? null; throw error; }
      });
      if (!storagePassed && storageFailureEvidence) { results.at(-1).storageFaultEvidence = storageFailureEvidence; await saveReport(); }
      await assertNoMutations();
      }
      const started = Date.now();
      let evidence;
      try {
        const h = { page, navigate, assertNoMutations };
        const options = { axeSourcePath: process.env.MENTORING_QA_AXE_SOURCE_PATH };
        if (accessibilityDiagnostic) {
          const diagnosticPath = resolve(process.env.MENTORING_QA_A11Y_DIAGNOSTIC_MODULE ?? "");
          assert.equal(diagnosticPath, "/tmp/mentoring-accessibility-diagnostic.mjs");
          const diagnosticSha = createHash("sha256").update(await readFile(diagnosticPath)).digest("hex");
          assert.equal(diagnosticSha, process.env.MENTORING_QA_A11Y_DIAGNOSTIC_SHA, "Only the reviewed frozen private diagnostic may execute.");
          const { runAccessibilityDiagnostic } = await import(pathToFileURL(diagnosticPath).href);
          evidence = await runAccessibilityDiagnostic(h, options);
        } else {
          const { runAccessibilityChecks } = await import("./accessibility-check.mjs");
          evidence = await runAccessibilityChecks(h, options);
        }
      }
      catch { evidence = { status: "failed", code: "accessibility_helper_failed" }; }
      // Accessibility returns only sanitized counts; never capture its DOM or screenshot on a finding.
      const status = evidence.status === "passed" || (accessibilityDiagnostic && evidence.status === "completed") ? "passed" : evidence.status === "needs_review" ? "not_tested" : "failed";
      const name = accessibilityDiagnostic ? "Bounded dialog diagnostic collected without an AA acceptance claim" : "Automated accessibility and doubled-text reflow checks";
      results.push({ engine, name, status, durationMs: Date.now() - started, evidence });
      console.log(JSON.stringify({ engine, scenario: name, status }));
      await assertNoMutations(); await saveReport();
      const errorStatus = browserErrors.length === 0 ? "passed" : "failed";
      results.push({ engine, name: "Optional checks retain zero mutations and strict application error accounting", status: errorStatus,
        evidence: { mentoringMutationAttempts: 0, fatalApplicationErrors: browserErrors.length, providerProtectionProbeCorsCount: providerProtectionProbeErrors.length, diagnostics: await browserDiagnostics() } });
      await saveReport();
      continue;
    }
    if (reloaded && focusedReload && focusedOfflineDraft) await scenario("Focused strict native offline restart restores an unsubmitted local draft", () => runOfflineDraft());
    if (!reloaded || focusedReload) {
      results.push({ engine, name: "Remaining full route, media, keyboard, and offline matrix", status: "not_tested", reason: reloaded ? "Focused mode defers the remaining full matrix." : "The authenticated reload failed; dependent journeys are stopped without repeating the same skeleton timeout." });
      await scenario("No mentoring mutations or uncaught application errors occurred", async () => {
        await assertNoMutations(); assert.equal(browserErrors.length, 0, "Fatal browser errors occurred; see bounded diagnostic details.");
        return { mentoringMutationRequests: 0, fatalApplicationErrors: 0, providerProtectionProbeCorsCount: providerProtectionProbeErrors.length };
      });
      continue;
    }
    for (const [size, viewport] of Object.entries(viewports)) {
      await scenario(`Signed-in workspace routes fit the ${size} viewport`, async () => {
        await page.setViewportSize(viewport); const pages = [];
        for (const [path, heading] of routes) {
          await navigate(path, heading); pages.push({ path, ...await layout() });
          await screenshot(`${path.split("/").filter(Boolean).join("-")}-${size}`);
        }
        return { pages, participantDetail: "No participant fixture is created for this read-only run." };
      });
      await scenario(`Participant filters, dialog, and keyboard focus work at ${size}`, async () => {
        await navigate("/staff/participants", "החניכות");
        await page.getByLabel("סוג השירות", { exact: true }).click();
        await page.getByRole("option", { name: "שירות לאומי", exact: true }).click();
        assert.ok((await page.locator("#service-filter").textContent())?.includes("שירות לאומי"), "The selected national-service label must remain visible.");
        await page.locator("#service-filter").click();
        await page.getByRole("option", { name: "כל סוגי השירות", exact: true }).click();
        const evidence = await dialogKeyboard("חניכה חדשה", "שם החניכה", `participant-dialog-${size}`);
        return { ...evidence, serviceFilterWorks: true, ...await layout() };
      });
      await scenario(`Unsubmitted staff preapproval dialog works at ${size}`, async () => {
        await navigate("/staff/team", "הצוות שלנו");
        return dialogKeyboard("הוספת חבר/ת צוות", "שם מלא", `staff-dialog-${size}`);
      });
    }
    await scenario("Mobile-sized navigation opens by keyboard and Escape restores focus", async () => {
      await page.setViewportSize(viewports.mobileSize); await navigate("/staff", /^שלום,/);
      const trigger = page.getByRole("button", { name: "פתיחת תפריט ניווט", exact: true });
      await trigger.focus(); await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog"); await dialog.waitFor({ state: "visible" });
      const bounds = await popupFits(dialog);
      await dialog.getByRole("link", { name: "החניכות", exact: true }).waitFor({ state: "visible" });
      const image = await screenshot("navigation-mobileSize");
      await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
      await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "פתיחת תפריט ניווט", null, { timeout: 1_500 });
      assert.equal(await trigger.evaluate((node) => node === document.activeElement), true);
      return { bounds, screenshot: image, keyboardOpen: true, escapeRestoresFocus: true, ...await layout() };
    });
    await scenario("Light staff surfaces remain readable under light and dark system preferences", async () => {
      const comparisons = [];
      try {
        for (const [size, viewport] of Object.entries(viewports)) {
          await page.setViewportSize(viewport); await navigate("/staff/participants", "החניכות");
          await page.getByRole("button", { name: "חניכה חדשה", exact: true }).click();
          const dialog = page.getByRole("dialog");
          await dialog.getByLabel("שם החניכה", { exact: true }).waitFor({ state: "visible" });
          await page.waitForFunction(() => {
            const field = document.getElementById("participant-name");
            return field && !field.matches(":disabled");
          });
          const measured = {};
          for (const scheme of ["light", "dark"]) {
            await page.emulateMedia({ colorScheme: scheme });
            assert.equal(await page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches), scheme === "dark");
            await page.mouse.move(0, 0);
            await page.evaluate(() => document.activeElement?.blur());
            await settleVisuals();
            assert.equal(await page.locator(".staff-app").evaluate((node) => getComputedStyle(node).colorScheme), "light");
            const surfaces = {};
            for (const [name, locator] of [
              ["input", dialog.getByLabel("שם החניכה", { exact: true })],
              ["select", dialog.getByLabel("סוג השירות", { exact: true })],
              ["outlineButton", dialog.getByRole("button", { name: "סגירה", exact: true })],
            ]) {
              const colors = await surfaceColors(locator);
              assert.ok(colors.backgroundLuminance >= 0.8, `${size}/${scheme}/${name} surface became dark.`);
              assert.ok(colors.textContrast >= 4.5, `${size}/${scheme}/${name} text contrast is below 4.5:1.`);
              assert.ok(colors.borderWidth >= 1 && colors.borderRGBA[3] > 0, `${size}/${scheme}/${name} border disappeared.`);
              if (name !== "outlineButton") assert.ok(colors.borderContrast >= 3, `${size}/${scheme}/${name} boundary contrast is below 3:1.`);
              surfaces[name] = colors;
            }
            measured[scheme] = { surfaces, screenshot: await screenshot(`surfaces-${size}-${scheme}`), ...await layout() };
          }
          for (const name of Object.keys(measured.light.surfaces)) {
            for (const field of ["backgroundRGBA", "effectiveBackgroundRGB", "foregroundRGBA", "borderRGBA", "borderWidth"]) {
              assert.deepEqual(measured.dark.surfaces[name][field], measured.light.surfaces[name][field], `${size}/${name}/${field} changed with the system color preference.`);
            }
          }
          comparisons.push({ size, ...measured });
          await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
        }
      } finally { await page.emulateMedia({ colorScheme: "light" }); }
      return { comparisons, systemMediaQueriesActuallyMatched: true, staffNativeColorScheme: "light", unsubmitted: true };
    });
    await scenario("Prepared shell and authorized workspace survive a cold offline engine restart", () => runOfflineDraft());
    await scenario("No mentoring mutations or uncaught application errors occurred", async () => {
      await assertNoMutations(); assert.equal(browserErrors.length, 0, "Fatal browser errors occurred; see bounded diagnostic details.");
      return { mentoringMutationRequests: 0, fatalApplicationErrors: 0, providerProtectionProbeCorsCount: providerProtectionProbeErrors.length, invitationOrEmailActionClicked: false };
    });
  } catch (error) {
    results.push({ engine, name: "Remaining engine checks", status: "not_tested", reason: clean(error.message) });
  } finally {
    if (providerProtectionProbeErrors.length) results.push({ engine, name: "Clerk protection-probe cross-origin health", status: "not_tested", reason: "The browser blocked the vendor protection probe with a CORS/access-control error; this provider boundary is reported separately from application errors.", observedErrors: providerProtectionProbeErrors.length });
    // Closing a private offline profile requires no reconnect. In particular,
    // never reconnect a profile after a read-only mutation guard has fired.
    await context?.close().catch(() => {}); context = null; page = null;
    await rm(currentProfile, { recursive: true, force: true }); profilesRemoved.push(engine);
    await saveReport();
  }
}
const report = await saveReport();
console.log(JSON.stringify({ report: reportPath, summary: report.summary, playwrightVersion, browserVersions, browserRuntimes, profilesRemoved, failures: results.filter((item) => item.status === "failed").map(({ engine, name, message }) => ({ engine, name, message })) }));
if (report.summary.failed || report.summary.notTested) process.exitCode = 1;
