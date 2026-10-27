import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";

// This test deliberately changes the test organization's policy. Run only in
// the root-coordinated serial window, after all fixture and pool cleanup.
assert.equal(process.env.MENTORING_QA_WRITES, "approved");
assert.equal(process.env.MENTORING_QA_SETTINGS_WINDOW, "exclusive");
assert.notEqual(process.env.NODE_ENV, "production");
assert.ok(!process.env.VERCEL_ENV || process.env.VERCEL_ENV === "development");
if (!process.env.MENTORING_DATABASE_URL) loadEnvFile(new URL("../../../.env.local", import.meta.url));
assert.ok(process.env.CLERK_SECRET_KEY?.startsWith("sk_test_"));
assert.ok(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_"));
assert.equal(process.env.MENTORING_NEON_PROJECT_ID, "round-firefly-59684866");
const origin = new URL(process.env.MENTORING_BASE_URL ?? "http://localhost:3112");
assert.equal(origin.origin, "http://localhost:3112");
const storage = process.env.MENTORING_QA_STORAGE_STATE ?? "/tmp/sherut-mentoring-qa-private/storage-state.json";
assert.equal((await stat(storage)).mode & 0o077, 0);
const organization = "11111111-1111-4111-8111-111111111111", actor = "15906dea-3538-46ab-ab2f-9ec651d15474";
const runId = randomUUID().slice(0, 8), marker = `בדיקת מדיניות ${runId}`;
const artifacts = resolve(`/tmp/sherut-mentoring-qa-private/policy-${randomUUID()}`);
await mkdir(artifacts, { recursive: true, mode: 0o700 });
const reportPath = resolve(artifacts, "report.json"), recoveryPath = resolve(artifacts, "recovery.json");
const database = new pg.Client({ connectionString: process.env.MENTORING_DATABASE_URL_UNPOOLED ?? process.env.MENTORING_DATABASE_URL, connectionTimeoutMillis: 10000 });
const fields = ["offlineLeaseHours", "reminderAudience", "appointmentReminderMinutesBefore", "overdueRemindersEnabled", "overdueRepeatHours"];
const policy = (settings) => Object.fromEntries(fields.map((key) => [key, settings[key]]));
const recovery = { runId, organization, actor, original: null, originalVersion: null, attempts: [] };
const results = [], errors = [];
let original, initialVersion, browser, context, page, allowed = null, restoration = "not_started", fatal = null;
const persist = () => writeFile(recoveryPath, JSON.stringify(recovery, null, 2), { mode: 0o600 });
async function zeroBaseline() {
  const row = (await database.query("SELECT (SELECT count(*) FROM mentoring.participants WHERE organization_id=$1)::int AS participants, (SELECT count(*) FROM mentoring.reminder_jobs WHERE organization_id=$1)::int AS jobs", [organization])).rows[0];
  assert.deepEqual(row, { participants: 0, jobs: 0 }, "Settings tests require zero participants and reminder jobs");
}
async function snapshot() {
  return page.evaluate(async () => {
    const response = await fetch("/api/mentoring/workspace", { cache: "no-store", headers: { "X-Mentoring-QA-Probe": "read" } });
    if (!response.ok) throw new Error(`Workspace returned ${response.status}`);
    return response.json();
  });
}
async function poll(read, predicate, timeout = 45000) {
  const deadline = Date.now() + timeout;
  do { const value = await read(); if (await predicate(value)) return value; await delay(300); } while (Date.now() < deadline);
  throw new Error("Expected server state was not observed before the deadline");
}
async function savePolicy(value, phase, expectedVersion) {
  await zeroBaseline();
  const before = await snapshot();
  assert.equal(before.settings.version, expectedVersion, "Settings version changed outside this serial test");
  await page.goto(new URL("/staff/settings", origin).href, { waitUntil: "domcontentloaded" });
  const hours = page.locator("#settings-offline-hours");
  await poll(() => hours.isEnabled(), Boolean);
  await hours.fill(String(value.offlineLeaseHours));
  await page.locator("#settings-reminder-minutes").fill(String(value.appointmentReminderMinutesBefore));
  await page.locator("#settings-repeat-hours").fill(value.overdueRepeatHours === null ? "" : String(value.overdueRepeatHours));
  const overdue = page.getByRole("switch", { name: "תזכורות על איחור בקשר", exact: true });
  if ((await overdue.getAttribute("aria-checked")) !== String(value.overdueRemindersEnabled)) await overdue.click();
  await page.locator("#settings-audience").click();
  await page.getByRole("option", { name: value.reminderAudience === "all_staff" ? "לכל הצוות" : "לצוות הליווי האחראי", exact: true }).click();
  await page.locator("#settings-reason").fill(`${marker} ${phase}`);
  allowed = { value, expectedVersion, phase };
  const responsePromise = page.waitForResponse((response) => {
    if (new URL(response.url()).pathname !== "/api/mentoring/commands" || response.request().method() !== "POST") return false;
    try { return response.request().postDataJSON().type === "update_organization_settings"; } catch { return false; }
  }, { timeout: 45000 });
  responsePromise.catch(() => {});
  await page.getByRole("button", { name: "שמירת הגדרות הארגון", exact: true }).click();
  const response = await responsePromise, result = await response.json();
  allowed = null;
  assert.equal(result.ok, true, JSON.stringify(result.error)); assert.equal(result.acceptance, "accepted");
  const after = await poll(snapshot, (state) => state.settings.version === expectedVersion + 1 && JSON.stringify(policy(state.settings)) === JSON.stringify(value));
  await page.getByText("הפעולה התקבלה במערכת", { exact: true }).waitFor({ state: "visible" });
  results.push({ phase, version: after.settings.version, persisted: policy(after.settings) });
  await persist();
  return after.settings.version;
}
try {
  await database.connect(); await zeroBaseline();
  let playwright;
  try { playwright = await import("playwright"); }
  catch { playwright = createRequire(resolve(process.env.PLAYWRIGHT_MODULE_DIR, "../package.json"))("playwright"); }
  browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
  context = await browser.newContext({ storageState: storage, locale: "he-IL", timezoneId: "Asia/Jerusalem", viewport: { width: 1440, height: 1000 } });
  page = await context.newPage();
  await page.goto(new URL("/staff/settings", origin).href, { waitUntil: "domcontentloaded" });
  await page.locator("#settings-offline-hours").waitFor({ state: "visible", timeout: 45000 });
  const initial = await snapshot();
  assert.equal(initial.actor.id, actor); assert.equal(initial.actor.role, "ceo"); assert.equal(initial.actor.active, true);
  assert.equal(initial.capabilities.smsSendingEnabled, false);
  original = policy(initial.settings); initialVersion = initial.settings.version;
  recovery.original = original; recovery.originalVersion = initialVersion; await persist();
  await page.route("**/api/mentoring/commands", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    let command;
    try { command = route.request().postDataJSON(); } catch { errors.push("Blocked malformed command"); return route.abort(); }
    if (!allowed || command.type !== "update_organization_settings" || command.expectedVersion !== allowed.expectedVersion || JSON.stringify(command.settings) !== JSON.stringify(allowed.value) || command.reason !== `${marker} ${allowed.phase}`) {
      errors.push("Blocked an unexpected command POST"); return route.abort();
    }
    recovery.attempts.push({ phase: allowed.phase, operationId: command.operationId, expectedVersion: command.expectedVersion, settings: command.settings });
    await persist(); await route.continue();
  });
  const min = { offlineLeaseHours: 1, reminderAudience: "responsible_team", appointmentReminderMinutesBefore: 0, overdueRemindersEnabled: false, overdueRepeatHours: 1 };
  const max = { offlineLeaseHours: 24, reminderAudience: "all_staff", appointmentReminderMinutesBefore: 1440, overdueRemindersEnabled: true, overdueRepeatHours: 168 };
  const noRepeat = { ...max, overdueRepeatHours: null };
  let version = initialVersion;
  for (const [phase, value] of [["minimum", min], ["maximum", max], ["optional-repeat-blank", noRepeat]]) version = await savePolicy(value, phase, version);
} catch (error) { fatal = String(error.message); }
finally {
  if (original && page) {
    try {
      await zeroBaseline();
      const current = await snapshot();
      if (current.settings.version !== initialVersion) {
        const history = (await database.query("SELECT version,updated_by,reason FROM mentoring.organization_settings_history WHERE organization_id=$1 AND version>$2 ORDER BY version", [organization, initialVersion])).rows;
        assert.equal(history.length, current.settings.version - initialVersion);
        assert.ok(history.every((row) => row.updated_by === actor && row.reason?.startsWith(marker)), "Another settings change occurred; do not overwrite it");
        await savePolicy(original, "restore", current.settings.version);
      }
      const restored = await snapshot(); assert.deepEqual(policy(restored.settings), original); await zeroBaseline();
      restoration = "verified";
    } catch (error) { restoration = `failed: ${String(error.message)}`; }
  }
  await context?.close().catch(() => {}); await browser?.close().catch(() => {}); await database.end().catch(() => {});
  await persist().catch(() => {});
  await writeFile(reportPath, JSON.stringify({ runId, initialVersion, results, restoration, fatal, errors, recoveryPath }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ report: reportPath, phasesPassed: results.length, restoration, fatal, errors }));
  if (fatal || restoration !== "verified" || errors.length || results.length !== 4) process.exitCode = 1;
}
