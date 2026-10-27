import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { cleanupWholeSystem } from "./whole-system-cleanup.mjs";

// A second explicit guard prevents this broader suite from racing the root's
// serial integration fixtures or another browser's temporary membership role.
assert.equal(process.env.MENTORING_QA_WINDOW, "exclusive", "Wait for the root agent's exclusive browser/database window.");
assert.equal(process.env.MENTORING_QA_WRITES, "approved", "Explicit development fixture authorization is required.");
assert.notEqual(process.env.NODE_ENV, "production");
assert.ok(!process.env.VERCEL_ENV || process.env.VERCEL_ENV === "development");
if (!process.env.MENTORING_DATABASE_URL) loadEnvFile(new URL("../../../.env.local", import.meta.url));
assert.ok(process.env.CLERK_SECRET_KEY?.startsWith("sk_test_"));
assert.ok(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_"));
assert.equal(process.env.MENTORING_NEON_PROJECT_ID, "round-firefly-59684866");
const origin = new URL(process.env.MENTORING_BASE_URL ?? "http://localhost:3000");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname));
assert.ok(["http:", "https:"].includes(origin.protocol));
assert.equal(origin.pathname, "/");
assert.ok(!origin.search && !origin.hash && !origin.username && !origin.password);
const credentialFile = process.env.MENTORING_QA_CREDENTIALS_FILE;
assert.ok(credentialFile);
assert.equal((await stat(credentialFile)).mode & 0o077, 0);
const credentials = JSON.parse(await readFile(credentialFile, "utf8"));
assert.equal(credentials.email, "mentoring-owner+clerk_test@example.com");
assert.ok(typeof credentials.password === "string" && credentials.password.length >= 15);
const mode = process.env.MENTORING_QA_MODE ?? "full";
assert.ok(["full", "mentor-native"].includes(mode), "Use a reviewed browser acceptance mode.");
const artifacts = resolve(process.env.MENTORING_E2E_ARTIFACTS ?? (mode === "mentor-native" ? "/tmp/sherut-mentoring-qa/mentor-native" : "/tmp/sherut-mentoring-qa/whole-system"));
await mkdir(artifacts, { recursive: true, mode: 0o700 });
const runId = randomUUID().slice(0, 8);
const results = [], errors = [], profiles = [], submitted = new Map();
const possibleCreates = new Map(), responseTasks = new Set();
const manifest = {
  runId, organizationId: "11111111-1111-4111-8111-111111111111", actorId: null,
  actorOriginal: null, actorExpected: null, settingsOriginal: null,
  participantIds: [], staffIds: [], resourceIds: [], operationIds: [], monthlyReviewIds: [], settingsVersions: [],
  plannedCreates: [],
  names: { participants: {}, staff: {} },
};
const manifestPath = resolve(artifacts, "fixture-manifest.json");
const database = new pg.Client({ connectionString: process.env.MENTORING_DATABASE_URL_UNPOOLED ?? process.env.MENTORING_DATABASE_URL, connectionTimeoutMillis: 10_000 });
let context, page, profile, cleanupResult;
let commandRequestCount = 0;
let writeTask = Promise.resolve();
let playwright;
try { playwright = await import("playwright"); }
catch {
  assert.ok(process.env.PLAYWRIGHT_MODULE_DIR);
  playwright = createRequire(resolve(process.env.PLAYWRIGHT_MODULE_DIR, "../package.json"))("playwright");
}
const launchOptions = { headless: true, locale: "he-IL", timezoneId: "Asia/Jerusalem", viewport: { width: 1440, height: 1000 }, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) };
const clean = (value) => {
  let message = String(value).replaceAll(credentials.password, "[redacted]").replace(/https?:\/\/[^\s]+/g, "[URL omitted]").replace(/eyJ[A-Za-z0-9_.-]+/g, "[token omitted]");
  for (const value of Object.values(credentials)) if (typeof value === "string" && value.length >= 6 && value !== credentials.email) message = message.replaceAll(value, "[redacted]");
  return message;
};
const add = (key, id) => { if (id && !manifest[key].includes(id)) manifest[key].push(id); };
const saveManifest = () => {
  // One writer preserves the latest complete recovery manifest if a request
  // arrives while an earlier write is pending.
  const value = JSON.stringify(manifest, null, 2);
  writeTask = writeTask.catch(() => {}).then(() => writeFile(manifestPath, value, { mode: 0o600 }));
  return writeTask;
};
function track(command) {
  if (!command?.operationId) return;
  submitted.set(command.operationId, command); add("operationIds", command.operationId);
  if (command.type === "create_staff" || command.type === "create_participant") {
    possibleCreates.set(command.operationId, { id: command.operationId, type: command.type, displayName: command.fields.displayName });
    manifest.plannedCreates = [...possibleCreates.values()];
  }
  if (command.type === "record_contact") add("resourceIds", command.operationId);
  void saveManifest().catch(() => {});
}
function trackSuccess(command, result) {
  if (!result?.ok) return;
  if (command.type === "create_staff" && result.staffId) {
    add("staffIds", result.staffId); manifest.names.staff[result.staffId] = command.fields.displayName;
    if (result.staffId !== command.operationId) errors.push("Staff create response violated its deterministic ID contract; returned ID retained for ownership-checked cleanup.");
  }
  if (command.type === "create_participant" && result.participantId) {
    add("participantIds", result.participantId); add("resourceIds", result.participantId); manifest.names.participants[result.participantId] = command.fields.displayName;
    if (result.participantId !== command.operationId) errors.push("Participant create response violated its deterministic ID contract; returned ID retained for ownership-checked cleanup.");
  }
  void saveManifest().catch(() => {});
}
function observe(target) {
  target.on("pageerror", (error) => errors.push(clean(error.message)));
  target.on("console", (message) => { if (message.type() === "error" && /hydration|React error|Minified React|uncaught/i.test(message.text())) errors.push(clean(message.text())); });
  target.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/mentoring/commands" && request.method() === "POST") {
      commandRequestCount += 1;
      try { track(request.postDataJSON()); } catch { /* The case captures malformed command failures. */ }
    }
  });
  target.on("response", (response) => {
    if (new URL(response.url()).pathname !== "/api/mentoring/commands" || response.request().method() !== "POST") return;
    const task = (async () => {
      try { trackSuccess(response.request().postDataJSON(), await response.json()); }
      catch { /* Lost responses are recovered by querying only recorded create IDs. */ }
    })();
    responseTasks.add(task); void task.finally(() => responseTasks.delete(task));
  });
}
async function launch({ fresh = false, offline = false } = {}) {
  await context?.close();
  if (fresh || !profile) { profile = await mkdtemp(resolve(artifacts, "private-profile-")); profiles.push(profile); }
  context = await playwright.chromium.launchPersistentContext(profile, { ...launchOptions, offline });
  await context.setOffline(offline);
  page = context.pages()[0] ?? await context.newPage(); observe(page);
}
async function poll(read, predicate, timeout = 45_000) {
  const limit = Date.now() + timeout;
  do { const value = await read(); if (await predicate(value)) return value; await delay(300); } while (Date.now() < limit);
  throw new Error("Expected accepted browser/server state was not observed before the deadline.");
}
async function snapshot() {
  return page.evaluate(async () => {
    const response = await fetch("/api/mentoring/workspace", { cache: "no-store", headers: { "X-Mentoring-QA-Probe": "read" } });
    if (!response.ok) throw new Error(`Workspace returned ${response.status}`);
    return response.json();
  });
}
async function captureCurrent() {
  if (!manifest.actorId) return;
  manifest.actorExpected = (await database.query("SELECT to_jsonb(m) AS value FROM mentoring.memberships m WHERE organization_id=$1 AND id=$2", [manifest.organizationId, manifest.actorId])).rows[0]?.value;
  // A server commit whose response was lost still has the deterministic create
  // ID. Query only those recorded IDs; do not assume a failed create made a row.
  const planned = [...possibleCreates.values()];
  for (const [type, table, idsKey, namesKey] of [["create_staff", "memberships", "staffIds", "staff"], ["create_participant", "participants", "participantIds", "participants"]]) {
    const candidates = planned.filter((item) => item.type === type);
    if (!candidates.length) continue;
    const found = await database.query(`SELECT id,display_name FROM mentoring.${table} WHERE organization_id=$1 AND id=ANY($2::uuid[])`, [manifest.organizationId, candidates.map((item) => item.id)]);
    for (const row of found.rows) {
      const expected = possibleCreates.get(row.id); assert.equal(row.display_name, expected.displayName);
      add(idsKey, row.id); manifest.names[namesKey][row.id] = row.display_name;
      if (type === "create_participant") add("resourceIds", row.id);
    }
  }
  const reviews = await database.query("SELECT id FROM mentoring.monthly_reviews WHERE organization_id=$1 AND updated_by=$2 AND position($3 in summary)>0", [manifest.organizationId, manifest.actorId, runId]);
  for (const row of reviews.rows) add("monthlyReviewIds", row.id);
  const versions = await database.query("SELECT version FROM mentoring.organization_settings_history WHERE organization_id=$1 AND updated_by=$2 AND position($3 in reason)>0", [manifest.organizationId, manifest.actorId, runId]);
  for (const row of versions.rows) add("settingsVersions", row.version);
  await saveManifest();
}
async function navigate(path) {
  await page.goto(`${origin.origin}${path}`, { waitUntil: "domcontentloaded" });
  await page.locator("h1").first().waitFor({ state: "visible", timeout: 45_000 });
}
async function openParticipant(id, tabName) {
  await navigate(`/staff/participants/${id}`);
  await page.getByRole("heading", { name: manifest.names.participants[id] ?? possibleCreates.get(id)?.displayName, exact: true }).waitFor({ state: "visible" });
  if (tabName) await page.getByRole("tab", { name: tabName, exact: true }).click();
}
async function action(type, perform) {
  const waiting = page.waitForResponse((response) => {
    if (new URL(response.url()).pathname !== "/api/mentoring/commands" || response.request().method() !== "POST") return false;
    try { return response.request().postDataJSON().type === type; } catch { return false; }
  }, { timeout: 45_000 });
  waiting.catch(() => {}); await perform(); const response = await waiting;
  const result = await response.json(), command = response.request().postDataJSON();
  trackSuccess(command, result);
  assert.equal(result.ok, true, result.ok ? undefined : `${result.error.code}: ${result.error.message}`);
  assert.equal(result.acceptance, "accepted"); await captureCurrent();
  if (type === "create_staff") assert.equal(result.staffId, command.operationId, "Staff create IDs must equal their operation IDs.");
  if (type === "create_participant") assert.equal(result.participantId, command.operationId, "Participant create IDs must equal their operation IDs.");
  return { result, command, status: response.status() };
}
async function command(payload) {
  const value = { operationId: randomUUID(), ...payload }; track(value);
  const response = await page.evaluate(async ({ value, accountId }) => {
    const response = await fetch("/api/mentoring/commands", { method: "POST", headers: { "Content-Type": "application/json", "X-Mentoring-Account": accountId }, body: JSON.stringify(value) });
    return { status: response.status, body: await response.json() };
  }, { value, accountId: credentials.userId ?? "user_3LEdW1ZzcasOTeiCSsfxGV7UZTJ" });
  trackSuccess(value, response.body); await captureCurrent();
  if (response.body.ok && value.type === "create_staff") assert.equal(response.body.staffId, value.operationId);
  if (response.body.ok && value.type === "create_participant") assert.equal(response.body.participantId, value.operationId);
  return response;
}
async function scenario(name, fn, { criteria = [] } = {}) {
  const started = Date.now();
  try {
    const evidence = await fn(); await captureCurrent();
    results.push({ name, status: "passed", criteria, durationMs: Date.now() - started, evidence });
    console.log(JSON.stringify({ scenario: name, status: "passed", criteria })); return true;
  } catch (error) {
    const file = resolve(artifacts, `failure-${results.length + 1}.png`);
    await page?.screenshot({ path: file, fullPage: true, mask: [page.locator('input[type="password"], #verification-code, #backup-code, [data-slot="input-otp-group"]')] }).catch(() => {});
    results.push({ name, status: "failed", criteria, durationMs: Date.now() - started, message: clean(error.message), path: page?.url() ? new URL(page.url()).pathname : null, screenshot: file });
    console.log(JSON.stringify({ scenario: name, status: "failed", message: clean(error.message) })); return false;
  }
}
function localInput(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
async function login() {
  await navigate("/staff/login");
  await page.waitForFunction(() => document.getElementById("staff-email") && !document.getElementById("staff-email").disabled);
  await page.locator("#staff-email").fill(credentials.email); await page.locator("#staff-password").fill(credentials.password);
  await page.getByRole("button", { name: "כניסה למרחב הליווי", exact: true }).click();
  await page.waitForFunction(() => location.pathname === "/staff" || !!document.getElementById("verification-code"), null, { timeout: 45_000 });
  if (await page.locator("#verification-code").isVisible().catch(() => false)) {
    const code = credentials.developmentVerificationCode;
    assert.ok(typeof code === "string" && /^\d{6}$/.test(code), "The existing approved account requires its private development verification code.");
    const field = page.locator("#verification-code");
    await poll(() => field.isEnabled(), Boolean);
    await field.focus(); await field.press("ControlOrMeta+A"); await field.press("Backspace");
    await field.pressSequentially(code, { delay: 80 });
    assert.ok(await field.inputValue() === code, "The verification field must contain the complete private test code before submission.");
    await page.getByRole("button", { name: "אימות וכניסה", exact: true }).click();
  }
  await page.waitForURL((url) => url.pathname === "/staff", { timeout: 45_000 });
  await poll(snapshot, (state) => state.actor?.active);
}
async function select(label, name, scope = page) {
  await scope.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name, exact: true }).click();
}
const nameFor = (key, noun) => `בדיקת דפדפן ${runId} ${noun} ${key}`;
async function createStaff(role, key, options = {}) {
  await navigate("/staff/team"); await page.getByRole("button", { name: "הוספת חבר/ת צוות", exact: true }).click();
  const dialog = page.getByRole("dialog"), displayName = nameFor(key, role === "coordinator" ? "רכזת" : "חונכת");
  await dialog.getByLabel("שם מלא", { exact: true }).fill(displayName);
  const emailDomain = key.length > 24 ? `layout-verification.${runId}.example.com` : "example.com";
  await dialog.getByLabel("כתובת דוא״ל להתחברות", { exact: true }).fill(`mentoring-e2e-${runId}-${role}-${key.slice(0, 24)}@${emailDomain}`);
  const state = await snapshot();
  if (state.actor.role === "ceo") {
    if (role === "coordinator") await dialog.getByRole("button", { name: "רכז/ת", exact: true }).click();
    else if (options.coordinatorId) await select("רכז/ת אחראי/ת", state.staff.find((member) => member.id === options.coordinatorId).displayName, dialog);
  }
  const { result } = await action("create_staff", () => dialog.getByRole("button", { name: "אישור חברות בצוות", exact: true }).click());
  await dialog.waitFor({ state: "hidden" }); return result.staffId;
}
async function createParticipant(key) {
  await navigate("/staff/participants"); await page.getByRole("button", { name: "חניכה חדשה", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("שם החניכה", { exact: true }).fill(nameFor(key, "חניכה"));
  const { result } = await action("create_participant", () => dialog.getByRole("button", { name: "יצירת כרטיס", exact: true }).click());
  await page.waitForURL((url) => url.pathname === `/staff/participants/${result.participantId}`); return result.participantId;
}
async function assignParticipant(id, mentorId, coordinatorId) {
  await openParticipant(id, "פרטי החניכה והליווי");
  await page.getByRole("button", { name: /^(שיוך לחונך\/ת|שינוי שיוך)$/ }).click();
  const dialog = page.getByRole("dialog"), state = await snapshot();
  await select("חונך/ת אחראי/ת", state.staff.find((member) => member.id === mentorId).displayName, dialog);
  if (state.actor.role === "ceo") await select("רכז/ת אחראי/ת", coordinatorId ? state.staff.find((member) => member.id === coordinatorId).displayName : "ללא שיוך לרכז/ת", dialog);
  return action("assign_participant", () => dialog.getByRole("button", { name: "אישור השיוך", exact: true }).click());
}
async function roleWindow(role, fn, { coordinatorId = null } = {}) {
  assert.ok(["mentor", "coordinator"].includes(role));
  assert.ok(role === "mentor" || coordinatorId === null);
  if (coordinatorId !== null) {
    assert.ok(manifest.staffIds.includes(coordinatorId), "Only this run's synthetic coordinator may be bound to the temporary mentor.");
    const coordinator = (await database.query("SELECT role,active FROM mentoring.memberships WHERE organization_id=$1 AND id=$2", [manifest.organizationId, coordinatorId])).rows[0];
    assert.equal(coordinator?.role, "coordinator"); assert.equal(coordinator.active, true);
  }
  await captureCurrent(); const before = manifest.actorExpected;
  try {
    await database.query("UPDATE mentoring.memberships SET role=$3,coordinator_id=$4,sms_muted=false,version=version+1,updated_at=clock_timestamp() WHERE organization_id=$1 AND id=$2 AND email=$5", [manifest.organizationId, manifest.actorId, role, coordinatorId, credentials.email]);
    await captureCurrent(); await launch({ fresh: true }); await login();
    assert.equal((await snapshot()).actor.role, role); return await fn();
  } finally {
    await database.query("UPDATE mentoring.memberships SET role=$3,coordinator_id=$4,active=$5,sms_muted=$7,version=version+1,updated_at=clock_timestamp() WHERE organization_id=$1 AND id=$2 AND email=$6", [manifest.organizationId, manifest.actorId, before.role, before.coordinator_id, before.active, credentials.email, before.sms_muted]);
    await captureCurrent(); await launch({ fresh: true }); await login();
  }
}
async function warmShell() {
  await page.waitForFunction(async () => {
    if (!navigator.serviceWorker.controller) return false;
    const name = (await caches.keys()).find((name) => name.startsWith("mentoring-anonymous-shell-"));
    if (!name) return false;
    return Boolean(await (await caches.open(name)).match("/staff/offline"));
  }, null, { timeout: 45_000 });
}
const h = {
  get page() { return page; }, get context() { return context; }, get actorId() { return manifest.actorId; },
  get commandRequestCount() { return commandRequestCount; },
  baseURL: origin.origin, runId, manifest, submitted, database, fixture: {},
  scenario, action, command, snapshot, poll, localInput, navigate, openParticipant, createStaff, createParticipant, assignParticipant, roleWindow, saveManifest, captureCurrent, select, track,
  authenticateExisting: login,
  participant: async (id = h.fixture.participantId) => (await snapshot()).participants.find((item) => item.participant.id === id),
  screenshot: async (name, { fullPage = true } = {}) => { const file = resolve(artifacts, `${name}.png`); await page.screenshot({ path: file, fullPage, mask: [page.locator('input[type="password"], #verification-code, #backup-code, [data-slot="input-otp-group"]')] }); return file; },
  restartOffline: async () => { await warmShell(); await launch({ offline: true }); await navigate("/staff"); await page.getByText("אפשר להמשיך גם ללא חיבור", { exact: true }).waitFor({ state: "visible" }); },
  reconnect: async () => { await context.setOffline(false); await poll(snapshot, (state) => state.actor?.active); },
};

try {
  await database.connect();
  const actor = await database.query("SELECT to_jsonb(m) AS value FROM mentoring.memberships m WHERE organization_id=$1 AND email=$2", [manifest.organizationId, credentials.email]);
  assert.equal(actor.rowCount, 1); const actorRow = actor.rows[0].value;
  assert.equal(actorRow.role, "ceo"); assert.equal(actorRow.active, true);
  assert.equal(actorRow.auth_user_id, "user_3LEdW1ZzcasOTeiCSsfxGV7UZTJ");
  manifest.actorId = actorRow.id; manifest.actorOriginal = actorRow; manifest.actorExpected = actorRow;
  manifest.settingsOriginal = (await database.query("SELECT to_jsonb(s) AS value FROM mentoring.organization_settings s WHERE organization_id=$1", [manifest.organizationId])).rows[0]?.value;
  h.fixture.nonFixtureParticipants = Number((await database.query("SELECT count(*)::int AS n FROM mentoring.participants WHERE organization_id=$1", [manifest.organizationId])).rows[0].n);
  await saveManifest(); await launch({ fresh: true });
  assert.ok(await scenario("Real existing Clerk identity authenticates to the approved CEO membership", async () => { await login(); const state = await snapshot(); assert.equal(state.actor.id, manifest.actorId); assert.equal(state.actor.role, "ceo"); return { provider: "real Clerk development", membership: "existing approved CEO", extraProviderUsers: 0 }; }));
  assert.ok(await scenario("UI creates synthetic staff and a partial assigned participant", async () => {
    h.fixture.coordinatorId = await createStaff("coordinator", mode === "mentor-native" ? "long-coordinator-name-for-populated-layout-verification" : "primary");
    h.fixture.mentorId = await createStaff("mentor", mode === "mentor-native" ? "long-main-mentor-contact-email-for-layout-verification" : "primary", { coordinatorId: h.fixture.coordinatorId });
    h.fixture.otherMentorId = await createStaff("mentor", mode === "mentor-native" ? "long-secondary-mentor-email-for-populated-layout-check" : "other", { coordinatorId: h.fixture.coordinatorId });
    h.fixture.participantId = await createParticipant("primary");
    const before = await h.participant(); assert.equal(before.assignment, null); assert.equal(before.participant.phone, null);
    await assignParticipant(h.fixture.participantId, h.fixture.mentorId, h.fixture.coordinatorId);
    const after = await h.participant(); assert.equal(after.assignment.followupAnchorAt, after.assignment.assignedAt); assert.equal(after.contacts.length, 0);
    return { staffPreapprovals: 3, providerAccounts: 0, partialProfile: true, cadenceStartsAtAssignment: true };
  }, { criteria: ["AC-01", "AC-16", "AC-19"] }));
  if (mode === "mentor-native") {
    h.fixture.routineParticipantId = h.fixture.participantId;
    h.fixture.strictDraftsBeforeMentor = true;
    await (await import("./whole-system-mentor-offline.mjs")).runMentorOfflineScenario(h);
    await (await import("./whole-system-style.mjs")).runStyleScenarios(h);
  } else {
    assert.ok(await scenario("A second participant opens a fresh editable form after a normally accepted create", async () => {
    h.fixture.secondParticipantId = await createParticipant("continuation");
    assert.notEqual(h.fixture.secondParticipantId, h.fixture.participantId);
    const state = await snapshot();
    assert.ok(state.participants.some((item) => item.participant.id === h.fixture.participantId));
    assert.ok(state.participants.some((item) => item.participant.id === h.fixture.secondParticipantId));
    return { distinctAcceptedParticipants: 2, previousIntentReused: false, recoveredSaveInterstitialRequired: false };
  }, { criteria: ["AC-16", "TA-11"] }));
  await (await import("./whole-system-contacts.mjs")).runContactScenarios(h);
  await scenario("Four current populated workflow previews are captured", async () => {
    const files = {};
    const capture = async (name) => {
      await poll(() => page.locator("[data-sonner-toast]").count(), (count) => count === 0, 15_000);
      await page.evaluate(() => document.fonts.ready.then(() => true));
      return h.screenshot(name, { fullPage: false });
    };
    await page.setViewportSize({ width: 1440, height: 1000 });
    await navigate("/staff"); files.dashboard = await capture("curated-dashboard-desktop");
    await openParticipant(h.fixture.participantId, "שינויים ואחריות"); files.history = await capture("curated-participant-history-desktop");
    await navigate("/staff/oversight"); await page.locator("#oversight-month").waitFor({ state: "visible" });
    files.oversight = await capture("curated-oversight-desktop");
    await page.setViewportSize({ width: 390, height: 844 });
    await navigate(`/staff/contacts/new?participant=${h.fixture.participantId}`);
    await poll(() => page.locator("#contact-notes").isEnabled(), Boolean);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    files.mobileForm = await capture("curated-contact-form-mobile");
    await page.setViewportSize({ width: 1440, height: 1000 });
    console.log(JSON.stringify({ curatedPreviews: files })); return files;
  }, { criteria: ["AC-18", "TA-11"] });
  await (await import("./whole-system-oversight.mjs")).runOversightScenarios(h);
  await (await import("./whole-system-authority.mjs")).runAuthorityScenarios(h);
  await (await import("./whole-system-drafts.mjs")).runDraftScenarios(h);
  await (await import("./whole-system-offline.mjs")).runOfflineScenarios(h);
  }
  await scenario("Final populated desktop and mobile views remain usable with real shadcn controls", async () => {
    await h.reconnect();
    const screenshots = [];
    for (const [name, path] of [["dashboard", "/staff"], ["oversight", "/staff/oversight"], ["reminders", "/staff/reminders"], ["history", `/staff/participants/${h.fixture.participantId}`], ["contact-form", `/staff/contacts/new?participant=${h.fixture.participantId}`], ["team", "/staff/team"]]) {
      await page.setViewportSize({ width: 1440, height: 1000 }); await navigate(path);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      screenshots.push(await h.screenshot(`${name}-desktop`));
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      screenshots.push(await h.screenshot(`${name}-mobile`));
    }
    await page.getByRole("button", { name: "פתיחת תפריט ניווט", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "visible" }); await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    return { desktop: "1440×1000", mobile: "390×844", horizontalOverflow: false, keyboardSheetEscape: true, screenshots };
  }, { criteria: ["AC-18", "TA-11"] });
} catch (error) {
  results.push({ name: "Remaining dependent whole-system checks", status: "not_tested", reason: clean(error.message) });
} finally {
  await context?.close().catch(() => {});
  await Promise.allSettled([...responseTasks]);
  try { await captureCurrent(); }
  catch (error) { results.push({ name: "Final recovery manifest capture", status: "failed", message: clean(error.message) }); }
  // Database restoration must still run when disk persistence/capture fails.
  // The cleanup helper independently validates the in-memory manifest first.
  try { if (manifest.actorId) cleanupResult = await cleanupWholeSystem({ database, manifest }); }
  catch (error) { results.push({ name: "Exact fixture cleanup and membership/settings restoration", status: "failed", message: clean(error.message), manifest: manifestPath }); }
  await database.end().catch(() => {}); await writeTask.catch(() => {});
  for (const directory of profiles) await rm(directory, { recursive: true, force: true });
  if (errors.length) results.push({ name: "Unexpected fatal browser errors", status: "failed", messages: errors });
  const report = { checkedAt: new Date().toISOString(), mode, baseURL: origin.origin, runId, results, browserErrors: errors, cleanup: cleanupResult, offlineCoverage: h.fixture.offlineCoverage ?? null, notTested: ["Real SMS delivery/provider uncertainty", "Production deployment", "Other browser engines, physical devices, screen readers/full WCAG", "Disk exhaustion outside the controlled storage test"], summary: { passed: results.filter((item) => item.status === "passed").length, failed: results.filter((item) => item.status === "failed").length, notTested: results.filter((item) => item.status === "not_tested").length } };
  await writeFile(resolve(artifacts, "report.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ report: resolve(artifacts, "report.json"), summary: report.summary, cleanup: cleanupResult }));
  if (report.summary.failed || report.summary.notTested) process.exitCode = 1;
}
