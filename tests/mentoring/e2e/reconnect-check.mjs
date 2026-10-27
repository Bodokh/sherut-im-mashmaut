import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { setTimeout as delay } from "node:timers/promises";

if (process.env.MENTORING_QA_WRITES !== "approved" || process.env.NODE_ENV === "production" || (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "development")) throw new Error("Explicit local development fixture approval is required.");
if (!process.env.MENTORING_DATABASE_URL) loadEnvFile(new URL("../../../.env.local", import.meta.url));
assert.ok(process.env.CLERK_SECRET_KEY?.startsWith("sk_test_"));
assert.equal(process.env.MENTORING_NEON_PROJECT_ID, "round-firefly-59684866");
const base = new URL(process.env.MENTORING_BASE_URL ?? "http://localhost:3000");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) && ["http:", "https:"].includes(base.protocol) && base.pathname === "/" && !base.search && !base.hash && !base.username && !base.password);
const credentialPath = process.env.MENTORING_QA_CREDENTIALS_FILE;
const manifestPath = process.env.MENTORING_QA_FIXTURE_MANIFEST;
if (!credentialPath || !manifestPath) throw new Error("Existing private credential and fixture manifest paths are required.");
assert.equal((await stat(credentialPath)).mode & 0o077, 0);
const credentials = JSON.parse(await readFile(credentialPath, "utf8"));
assert.equal(credentials.email, "mentoring-owner+clerk_test@example.com");
assert.ok(typeof credentials.password === "string" && credentials.password.length >= 15);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
assert.match(manifest.runId, /^[0-9a-f]{8}$/);
const participantId = manifest.participantIds[0];
assert.match(participantId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const artifacts = resolve(process.env.MENTORING_E2E_ARTIFACTS ?? "/tmp/sherut-mentoring-qa/production-reconnect");
await mkdir(artifacts, { recursive: true, mode: 0o700 });
const profile = await mkdtemp(resolve(artifacts, "private-profile-"));
let playwright;
try { playwright = await import("playwright"); }
catch { playwright = createRequire(resolve(process.env.PLAYWRIGHT_MODULE_DIR, "../package.json"))("playwright"); }
const options = { headless: true, locale: "he-IL", timezoneId: "Asia/Jerusalem", viewport: { width: 390, height: 844 }, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) };
let context = await playwright.chromium.launchPersistentContext(profile, options);
let page = context.pages()[0] ?? await context.newPage();
const report = { checkedAt: new Date().toISOString(), tests: [], profile, cleanupManifest: manifestPath };
const recordedOperations = new Set();
const pageErrors = [];
const componentConsoleErrors = [];
const apiResponses = [];
const observe = () => {
  page.on("pageerror", (error) => pageErrors.push(error.message.replaceAll(credentials.password, "[redacted]").replace(/https?:\/\/[^\s]+/g, "[URL omitted]").replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[JWT omitted]")));
  page.on("console", (message) => {
    if (message.type() === "error" && /Base UI|hydration|hydrating|Minified React error|does not match/i.test(message.text())) componentConsoleErrors.push(message.text().replaceAll(credentials.password, "[redacted]").replace(/https?:\/\/[^\s]+/g, "[URL omitted]"));
  });
  page.on("request", (request) => {
    if (new URL(request.url()).pathname !== "/api/mentoring/commands" || request.method() !== "POST") return;
    try { const command = request.postDataJSON(); if (command.type === "record_contact" && command.participantId === participantId) recordedOperations.add(command.operationId); } catch { /* no secret request bodies are captured */ }
  });
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (path === "/api/mentoring/workspace" || path === "/api/mentoring/commands") apiResponses.push({ path, status: response.status(), probe: response.request().headers()["x-mentoring-qa-probe"] === "1", at: Date.now() });
  });
};
observe();
const localInput = (date) => {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
};
async function workspace() {
  return page.evaluate(async () => { const response = await fetch("/api/mentoring/workspace", { cache: "no-store", credentials: "same-origin", headers: { "X-Mentoring-QA-Probe": "1" } }); return response.ok ? response.json() : null; });
}
async function waitForWorkspace(predicate, timeout = 60_000) {
  const end = Date.now() + timeout;
  do {
    try { const value = await workspace(); if (value && await predicate(value)) return value; } catch { /* a normal online document reload replaces the execution context */ }
    await delay(500);
  } while (Date.now() < end);
  throw new Error("The queued contact did not reach the authoritative workspace before the deadline.");
}
const notes = `בדיקת דפדפן ${manifest.runId}: חידוש חיבור ${randomUUID().slice(0, 6)}`;
try {
  await page.goto(`${base.origin}/staff/login`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.getElementById("staff-email") && !document.getElementById("staff-email").disabled);
  await page.locator("#staff-email").fill(credentials.email);
  await page.locator("#staff-password").fill(credentials.password);
  await page.getByRole("button", { name: "כניסה למרחב הליווי", exact: true }).click();
  await page.waitForFunction(() => location.pathname === "/staff" || !!document.getElementById("verification-code"));
  if (await page.locator("#verification-code").isVisible().catch(() => false)) {
    await page.waitForFunction(() => { const input = document.getElementById("verification-code"); return input && !input.matches(":disabled"); });
    await page.locator("#verification-code").focus();
    await page.locator("#verification-code").press("ControlOrMeta+A");
    await page.locator("#verification-code").press("Backspace");
    await page.locator("#verification-code").pressSequentially("424242", { delay: 80 });
    assert.equal(await page.locator("#verification-code").inputValue(), "424242");
    await page.getByRole("button", { name: "אימות וכניסה", exact: true }).click();
  }
  await page.waitForURL((url) => url.pathname === "/staff", { waitUntil: "domcontentloaded" });
  const before = await waitForWorkspace((value) => value.actor?.id === manifest.actorId);
  const participant = before.participants.find((item) => item.participant.id === participantId);
  assert.equal(participant?.participant.displayName, `בדיקת דפדפן ${manifest.runId} חניכה`);
  assert.ok(participant.assignment);
  const previousCount = participant.contacts.length;
  const appointmentVersion = participant.nextAppointment?.version ?? 0;
  await page.goto(`${base.origin}/staff/contacts/new?participant=${participantId}`);
  await page.locator("#contact-occurredAt").fill(localInput(new Date(Date.now() - 60_000)));
  await page.locator("#contact-nextAppointmentAt").fill(localInput(new Date(Date.now() + 172_800_000)));
  await page.locator("#contact-notes").fill(notes);
  await page.getByText("הטיוטה נשמרה במכשיר הזה", { exact: true }).waitFor({ state: "visible" });
  await page.waitForFunction(async () => {
    if (!navigator.serviceWorker.controller) return false;
    for (const name of await caches.keys()) if (name.startsWith("mentoring-anonymous-shell-")) { const cache = await caches.open(name); if (await cache.match("/staff/offline")) return true; }
    return false;
  }, null, { timeout: 45_000 });
  await context.close();
  context = await playwright.chromium.launchPersistentContext(profile, options);
  await context.addInitScript(() => { window.__mentoringQANetworkEvents = []; for (const event of ["online", "offline"]) window.addEventListener(event, () => window.__mentoringQANetworkEvents.push({ event, online: navigator.onLine, at: Date.now() })); });
  await context.setOffline(true);
  page = context.pages()[0] ?? await context.newPage(); observe();
  await page.goto(`${base.origin}/staff`, { waitUntil: "domcontentloaded" });
  await page.getByText("אפשר להמשיך גם ללא חיבור", { exact: true }).waitFor({ state: "visible" });
  await page.goto(`${base.origin}/staff/contacts/new?participant=${participantId}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction((expected) => { const input = document.getElementById("contact-notes"); return input && !input.matches(":disabled") && input.value === expected; }, notes);
  assert.equal(await page.locator("#contact-notes").inputValue(), notes);
  report.tests.push({ name: "Native browser close/reopen offline restores authorized records, routes and saved draft", status: "passed" });
  await page.screenshot({ path: resolve(artifacts, "offline-restored-draft-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "שמירת התיעוד והפגישה הבאה", exact: true }).click();
  await page.waitForURL((url) => url.pathname === `/staff/participants/${participantId}`, { waitUntil: "domcontentloaded" });
  await page.getByText(notes, { exact: true }).waitFor({ state: "visible" });
  await page.reload();
  await page.getByText(notes, { exact: true }).waitFor({ state: "visible" });
  report.tests.push({ name: "Offline completed contact stays queued and survives document reload", status: "passed" });
  await page.screenshot({ path: resolve(artifacts, "offline-queued-contact-mobile.png"), fullPage: true });
  await context.setOffline(false);
  const after = await waitForWorkspace((value) => value.participants.find((item) => item.participant.id === participantId)?.contacts.some((entry) => entry.notes === notes));
  const current = after.participants.find((item) => item.participant.id === participantId);
  const contact = current.contacts.find((entry) => entry.notes === notes);
  assert.equal(current.contacts.length, previousCount + 1);
  assert.equal(current.contacts.filter((entry) => entry.id === contact.id).length, 1);
  assert.equal(current.nextAppointment.version, appointmentVersion + 1);
  manifest.resourceIds = [...new Set([...manifest.resourceIds, contact.id])];
  manifest.operationIds = [...new Set([...manifest.operationIds, contact.id, ...recordedOperations])];
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 });
  await page.reload();
  await page.getByText(notes, { exact: true }).waitFor({ state: "visible" });
  const final = await workspace();
  assert.equal(final.participants.find((item) => item.participant.id === participantId).contacts.filter((entry) => entry.id === contact.id).length, 1);
  report.tests.push({ name: "Reconnection centrally accepts the same operation once, with one next appointment", status: "passed", duplicateContacts: 0 });
  await page.screenshot({ path: resolve(artifacts, "reconnected-contact-mobile.png"), fullPage: true });
  if (pageErrors.length) throw new Error(`Unexpected fatal browser errors: ${pageErrors.length}`);
  assert.deepEqual(componentConsoleErrors, []);
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.error = error.message.replaceAll(credentials.password, "[redacted]").replace(/https?:\/\/[^\s]+/g, "[URL omitted]");
  report.browserState = await page.evaluate(() => ({ online: navigator.onLine, clerkLoaded: Boolean(window.Clerk?.loaded), hasClerkUser: Boolean(window.Clerk?.user), hasClerkSession: Boolean(window.Clerk?.session), pathname: location.pathname, networkEvents: window.__mentoringQANetworkEvents ?? [] })).catch(() => null);
  await page.screenshot({ path: resolve(artifacts, "failure.png"), fullPage: true }).catch(() => {});
} finally {
  await context.close().catch(() => {});
  manifest.resourceIds = [...new Set([...manifest.resourceIds, ...recordedOperations])];
  manifest.operationIds = [...new Set([...manifest.operationIds, ...recordedOperations])];
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 });
  report.pageErrors = pageErrors;
  report.componentConsoleErrors = componentConsoleErrors;
  report.apiResponses = apiResponses;
  await writeFile(resolve(artifacts, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, tests: report.tests, error: report.error, browserState: report.browserState, report: resolve(artifacts, "report.json"), retainedPrivateProfile: profile }));
  if (!report.passed) process.exitCode = 1;
}
