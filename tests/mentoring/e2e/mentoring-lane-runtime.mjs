import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadEnvFile } from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";

assert.equal(process.env.MENTORING_QA_WRITES, "approved");
assert.notEqual(process.env.NODE_ENV, "production");
assert.ok(!process.env.VERCEL_ENV || process.env.VERCEL_ENV === "development");
if (!process.env.MENTORING_DATABASE_URL) loadEnvFile(new URL("../../../.env.local", import.meta.url));
assert.ok(process.env.CLERK_SECRET_KEY?.startsWith("sk_test_"));
assert.ok(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_"));
assert.equal(process.env.MENTORING_NEON_PROJECT_ID, "round-firefly-59684866");
const origin = new URL(process.env.MENTORING_BASE_URL ?? "http://localhost:3112");
assert.equal(origin.origin, "http://localhost:3112");
const storagePath = process.env.MENTORING_QA_STORAGE_STATE ?? "/tmp/sherut-mentoring-qa-private/storage-state.json";
assert.equal((await stat(storagePath)).mode & 0o077, 0);
const credentials = {email:"mentoring-owner+clerk_test@example.com",userId:"user_3LEdW1ZzcasOTeiCSsfxGV7UZTJ"};
const artifacts = resolve(process.env.MENTORING_E2E_ARTIFACTS ?? `/tmp/sherut-mentoring-qa-private/lane-${randomUUID()}`);
await mkdir(artifacts, { recursive: true, mode: 0o700 });
const runId = randomUUID().slice(0, 8);
const results = [], errors = [], submitted = new Map();
const possibleCreates = new Map(), responseTasks = new Set();
const manifest = {
  runId, organizationId: "11111111-1111-4111-8111-111111111111", actorId: null,
  actorOriginal: null, actorExpected: null, settingsOriginal: null,
  participantIds: [], staffIds: [], resourceIds: [], operationIds: [], monthlyReviewIds: [], settingsVersions: [],
  plannedCreates: [],
  sharedStaffIds: [],
  names: { participants: {}, staff: {} },
};
const manifestPath = resolve(artifacts, "fixture-manifest.json");
const database = new pg.Client({ connectionString: process.env.MENTORING_DATABASE_URL_UNPOOLED ?? process.env.MENTORING_DATABASE_URL, connectionTimeoutMillis: 10_000 });
let context, page, browser, cleanupResult;
let commandRequestCount = 0;
let writeTask = Promise.resolve();
let playwright;
try { playwright = await import("playwright"); }
catch {
  assert.ok(process.env.PLAYWRIGHT_MODULE_DIR);
  playwright = createRequire(resolve(process.env.PLAYWRIGHT_MODULE_DIR, "../package.json"))("playwright");
}
const clean = (value) => {
  let message = String(value).replace(/https?:\/\/[^\s]+/g, "[URL omitted]").replace(/eyJ[A-Za-z0-9_.-]+/g, "[token omitted]");
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
function assertLaneCommand(command) {
  assert.ok(command && typeof command.type === "string");
  assert.ok(!["update_organization_settings", "set_sms_muted", "resolve_conflict", "evaluate_reminders"].includes(command.type), "Shared changes are prohibited in parallel lanes.");
  if (process.env.MENTORING_LANE_PARTICIPANT_ONLY === "true") assert.ok(!["create_staff", "update_staff", "set_staff_active"].includes(command.type), "Participant-only lanes cannot change staff.");
  const availableStaff = [...manifest.staffIds, ...manifest.sharedStaffIds];
  if (["create_staff", "create_participant"].includes(command.type)) assert.ok(command.fields?.displayName?.includes(runId), "Created fixtures must carry this lane's marker.");
  if (command.participantId) assert.ok(manifest.participantIds.includes(command.participantId), "Participant is not owned by this lane.");
  if (command.staffId) assert.ok(availableStaff.includes(command.staffId), "Staff member is not in this lane's approved fixture group.");
  if (["update_staff", "set_staff_active"].includes(command.type)) assert.ok(manifest.staffIds.includes(command.staffId));
  if (command.mentorId) assert.ok(availableStaff.includes(command.mentorId));
  if (command.coordinatorId) assert.ok(availableStaff.includes(command.coordinatorId));
  if (command.fields?.coordinatorId) assert.ok(availableStaff.includes(command.fields.coordinatorId));
  if (command.contactId) assert.ok(manifest.resourceIds.includes(command.contactId));
  if (command.resourceId) assert.ok(manifest.resourceIds.includes(command.resourceId));
  if (command.fields?.displayName) assert.ok(command.fields.displayName.includes(runId), "Renamed fixtures must retain this lane's marker.");
  if (command.type === "save_monthly_review") {
    assert.ok(manifest.staffIds.includes(command.scopeStaffId));
    assert.ok(command.summary?.includes(runId));
  }
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
async function launch() {
  browser = await playwright.chromium.launch({headless: true, ...(process.env.CHROME_EXECUTABLE ? {executablePath: process.env.CHROME_EXECUTABLE} : {})});
  context = await browser.newContext({locale: "he-IL", timezoneId: "Asia/Jerusalem", viewport: {width:1440,height:1000}, storageState: storagePath});
  page = await context.newPage(); observe(page);
  // Persist the command and planned IDs before the browser can send it.
  await page.route("**/api/mentoring/commands", async route => {
    if (route.request().method() === "POST") { try { const command=route.request().postDataJSON(); assertLaneCommand(command); track(command); await saveManifest(); } catch (e) { errors.push(clean(e.message)); await route.abort(); return; } }
    await route.continue();
  });
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
      assert.ok(row.display_name.includes(runId), "Fixture no longer carries its lane marker.");
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
  const result = await action("assign_participant", () => dialog.getByRole("button", { name: "אישור השיוך", exact: true }).click());
  await dialog.waitFor({ state: "hidden", timeout: 45_000 });
  return result;
}
const h = {
  get page() { return page; }, get context() { return context; }, get actorId() { return manifest.actorId; },
  get commandRequestCount() { return commandRequestCount; },
  baseURL: origin.origin, runId, manifest, manifestPath, submitted, database, fixture: {},
  scenario, action, command, snapshot, poll, localInput, navigate, openParticipant, createStaff, createParticipant, assignParticipant, saveManifest, captureCurrent, select, track,
  participant: async (id = h.fixture.participantId) => (await snapshot()).participants.find((item) => item.participant.id === id),
  screenshot: async (name, { fullPage = true } = {}) => { const file = resolve(artifacts, `${name}.png`); await page.screenshot({ path: file, fullPage, mask: [page.locator('input[type="password"], #verification-code, #backup-code, [data-slot="input-otp-group"]')] }); return file; },

};



const ORGANIZATION = "11111111-1111-4111-8111-111111111111";
const QA_ACTOR = "15906dea-3538-46ab-ab2f-9ec651d15474";
const QA_EMAIL = "mentoring-owner+clerk_test@example.com";
const QA_AUTH_USER = "user_3LEdW1ZzcasOTeiCSsfxGV7UZTJ";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTOR_COLUMNS = ["id", "organization_id", "auth_user_id", "email", "display_name", "phone", "role", "active", "version", "coordinator_id", "sms_muted", "created_at", "updated_at"];
const SETTINGS_COLUMNS = ["organization_id", "version", "offline_lease_hours", "reminder_audience", "appointment_reminder_minutes_before", "overdue_reminders_enabled", "overdue_repeat_hours", "updated_at", "updated_by"];

function ids(value, name) {
  assert.ok(Array.isArray(value), `${name} must be an explicit ID array.`);
  assert.equal(new Set(value).size, value.length, `${name} must not contain duplicate IDs.`);
  for (const id of value) assert.match(id, UUID, `${name} contains an invalid ID.`);
  return value;
}

function validateManifest(manifest) {
  assert.match(manifest.runId, /^[0-9a-f]{8}$/);
  assert.equal(manifest.organizationId, ORGANIZATION);
  assert.equal(manifest.actorId, QA_ACTOR);
  for (const key of ["participantIds", "staffIds", "resourceIds", "operationIds", "monthlyReviewIds"]) ids(manifest[key], key);
  assert.ok(!manifest.staffIds.includes(QA_ACTOR));
  assert.ok(Array.isArray(manifest.settingsVersions));
  assert.equal(new Set(manifest.settingsVersions).size, manifest.settingsVersions.length);
  for (const version of manifest.settingsVersions) assert.ok(Number.isSafeInteger(version) && version > manifest.settingsOriginal.version);
  const original = manifest.actorOriginal;
  for (const key of ACTOR_COLUMNS) assert.ok(Object.hasOwn(original, key), `Capture actorOriginal.${key} before the test.`);
  assert.equal(original.id, QA_ACTOR);
  assert.equal(original.organization_id, ORGANIZATION);
  assert.equal(original.email, QA_EMAIL);
  assert.equal(original.auth_user_id, QA_AUTH_USER);
  assert.equal(original.role, "ceo");
  assert.equal(original.active, true);
  for (const key of SETTINGS_COLUMNS) assert.ok(Object.hasOwn(manifest.settingsOriginal, key), `Capture settingsOriginal.${key} before the test.`);
  assert.equal(manifest.settingsOriginal.organization_id, ORGANIZATION);
  assert.ok(Number.isSafeInteger(manifest.settingsOriginal.version) && manifest.settingsOriginal.version > 0);
  for (const [kind, expectedIds] of [["participants", manifest.participantIds], ["staff", manifest.staffIds]]) {
    assert.deepEqual(Object.keys(manifest.names[kind]).sort(), [...expectedIds].sort());
    for (const name of Object.values(manifest.names[kind])) assert.ok(typeof name === "string" && name.includes(manifest.runId));
  }
}

/** Remove only this run's database fixtures using a dedicated connected pg
 * Client (not a Pool.query transaction). The caller must hold the exclusive QA
 * window, close its browser first, and retain a private recovery manifest.
 * Importing this module never connects, reads credentials, or changes data.
 *
 * actorExpected must contain the latest raw membership row if the run changed
 * the QA identity's role, active state, SMS preference, or membership version.
 */
async function cleanupLane({ database, manifest }) {
  validateManifest(manifest);
  assert.equal(process.env.MENTORING_QA_WRITES, "approved", "Explicit development fixture cleanup approval is required.");
  assert.notEqual(process.env.NODE_ENV, "production");
  assert.ok(!process.env.VERCEL_ENV || process.env.VERCEL_ENV === "development");
  assert.equal(process.env.MENTORING_NEON_PROJECT_ID, "round-firefly-59684866");
  assert.ok(process.env.CLERK_SECRET_KEY?.startsWith("sk_test_"));
  assert.ok(database && typeof database.query === "function");
  // A pg Pool has connect/release semantics different from a dedicated Client.
  assert.ok(typeof database.totalCount !== "number", "Pass a dedicated pg Client or checked-out PoolClient.");
  const { participantIds, staffIds, resourceIds, operationIds, monthlyReviewIds, settingsVersions } = manifest;
  const participants = new Set(participantIds);
  const staff = new Set([...staffIds, ...manifest.sharedStaffIds, QA_ACTOR]);
  const resources = new Set(resourceIds);
  const operations = new Set(operationIds);
  const params = [ORGANIZATION, participantIds];
  let stage = "ownership validation";
  let transactionStarted = false;
  try {
    await database.query("BEGIN");
    transactionStarted = true;
    // Read-only identity guard; shared membership and organization settings are never locked or changed.
    const actor = (await database.query("SELECT * FROM mentoring.memberships WHERE organization_id=$1 AND id=$2", [ORGANIZATION, QA_ACTOR])).rows[0];
    assert.equal(actor?.email, QA_EMAIL); assert.equal(actor?.auth_user_id, QA_AUTH_USER); assert.equal(actor?.role, "ceo"); assert.equal(actor?.active, true);
    assert.equal(settingsVersions.length, 0, "Shared settings writes are not allowed in parallel lanes.");
    const ownedParticipants = (await database.query("SELECT * FROM mentoring.participants WHERE organization_id=$1 AND id=ANY($2::uuid[]) FOR UPDATE", params)).rows;
    assert.equal(ownedParticipants.length, participantIds.length);
    for (const row of ownedParticipants) {
      assert.equal(row.created_by, QA_ACTOR);
      assert.ok(row.display_name.includes(manifest.runId), "Participant name must retain lane marker.");
      assert.ok(resources.has(row.id));
    }
    const ownedStaff = (await database.query("SELECT * FROM mentoring.memberships WHERE organization_id=$1 AND id=ANY($2::uuid[]) FOR UPDATE", [ORGANIZATION, staffIds])).rows;
    assert.equal(ownedStaff.length, staffIds.length);
    for (const row of ownedStaff) {
      assert.equal(row.auth_user_id, null);
      assert.ok(row.display_name.includes(manifest.runId), "Staff name must retain lane marker.");
      assert.notEqual(row.id, QA_ACTOR);
    }
    const contacts = (await database.query("SELECT * FROM mentoring.contacts WHERE organization_id=$1 AND participant_id=ANY($2::uuid[]) FOR UPDATE", params)).rows;
    const contactIds = new Set(contacts.map((row) => row.id));
    for (const row of contacts) { assert.ok(resources.has(row.id)); assert.equal(row.actor_id, QA_ACTOR); }
    const ownedResources = (await database.query("SELECT * FROM mentoring.resource_ids WHERE organization_id=$1 AND id=ANY($2::uuid[]) FOR UPDATE", [ORGANIZATION, resourceIds])).rows;
    for (const row of ownedResources) assert.ok(row.kind === "participant" ? participants.has(row.id) : row.kind === "contact" && contactIds.has(row.id));
    assert.equal(ownedResources.length, participantIds.length + contacts.length);

    // Every delete below is preceded by a lock and attribution/scope checks.
    const childTables = ["reminder_attempts", "reminder_jobs", "outbox", "conflicts", "review_events", "contact_revisions", "appointment_history", "manual_color_history", "grants", "appointments", "assignments"];
    for (const table of childTables) {
      const rows = (await database.query(`SELECT * FROM mentoring.${table} WHERE organization_id=$1 AND participant_id=ANY($2::uuid[]) FOR UPDATE`, params)).rows;
      for (const row of rows) {
        assert.ok(participants.has(row.participant_id));
        for (const key of ["actor_id", "revised_by_staff_id", "reviewed_by_staff_id", "changed_by_staff_id", "set_by_staff_id", "last_evaluated_by", "claimed_by_staff_id", "granted_by_staff_id", "revoked_by_staff_id", "resolved_by"]) if (row[key] != null) assert.equal(row[key], QA_ACTOR);
        for (const key of ["mentor_id", "coordinator_id", "staff_id"]) if (row[key] != null) assert.ok(staff.has(row[key]));
        if (row.contact_id != null) assert.ok(contactIds.has(row.contact_id));
        if (row.operation_id != null) assert.ok(operations.has(row.operation_id));
        if (row.last_evaluated_operation_id != null) assert.ok(operations.has(row.last_evaluated_operation_id));
      }
    }
    const reviews = (await database.query("SELECT * FROM mentoring.reviews WHERE organization_id=$1 AND contact_id=ANY($2::uuid[]) FOR UPDATE", [ORGANIZATION, [...contactIds]])).rows;
    for (const row of reviews) assert.equal(row.reviewed_by_staff_id, QA_ACTOR);
    const protections = (await database.query("SELECT * FROM mentoring.ceo_protections WHERE organization_id=$1 AND resource_id=ANY($2::uuid[]) FOR UPDATE", [ORGANIZATION, resourceIds])).rows;
    for (const row of protections) { assert.equal(row.protected_by_staff_id, QA_ACTOR); if (row.unlocked_by_staff_id != null) assert.equal(row.unlocked_by_staff_id, QA_ACTOR); }
    const audit = (await database.query("SELECT * FROM mentoring.audit WHERE organization_id=$1 AND (participant_id=ANY($2::uuid[]) OR (actor_id=$3 AND operation_id=ANY($4::uuid[]))) FOR UPDATE", [ORGANIZATION, participantIds, QA_ACTOR, operationIds])).rows;
    for (const row of audit) { assert.equal(row.actor_id, QA_ACTOR); assert.ok(operations.has(row.operation_id)); if (row.participant_id != null) assert.ok(participants.has(row.participant_id)); }
    const operationRows = (await database.query("SELECT * FROM mentoring.operations WHERE organization_id=$1 AND actor_id=$2 AND operation_id=ANY($3::uuid[]) FOR UPDATE", [ORGANIZATION, QA_ACTOR, operationIds])).rows;
    for (const row of operationRows) { if (row.response.participantId != null) assert.ok(participants.has(row.response.participantId)); if (row.response.staffId != null) assert.ok(staffIds.includes(row.response.staffId)); }
    const monthly = (await database.query("SELECT * FROM mentoring.monthly_reviews WHERE organization_id=$1 AND id=ANY($2::uuid[]) FOR UPDATE", [ORGANIZATION, monthlyReviewIds])).rows;
    assert.equal(monthly.length, monthlyReviewIds.length);
    for (const row of monthly) { assert.ok(staffIds.includes(row.scope_staff_id)); assert.equal(row.updated_by, QA_ACTOR); assert.ok(row.summary.includes(manifest.runId)); }
    const monthlyHistory = (await database.query("SELECT * FROM mentoring.monthly_review_history WHERE organization_id=$1 AND review_id=ANY($2::uuid[]) FOR UPDATE", [ORGANIZATION, monthlyReviewIds])).rows;
    for (const row of monthlyHistory) { assert.equal(row.updated_by, QA_ACTOR); assert.ok(row.summary.includes(manifest.runId)); }

    // Reject references from outside the manifest before deleting staff or
    // operations. Foreign keys remain the final atomic backstop as well.
    const external = (await database.query(`SELECT
      (SELECT count(*) FROM mentoring.memberships WHERE organization_id=$1 AND coordinator_id=ANY($2::uuid[]) AND NOT (id=ANY($2::uuid[]) OR id=$3))::int AS memberships,
      (SELECT count(*) FROM mentoring.assignments WHERE organization_id=$1 AND (mentor_id=ANY($2::uuid[]) OR coordinator_id=ANY($2::uuid[])) AND NOT participant_id=ANY($4::uuid[]))::int AS assignments,
      (SELECT count(*) FROM mentoring.monthly_reviews WHERE organization_id=$1 AND scope_staff_id=ANY($2::uuid[]) AND NOT id=ANY($5::uuid[]))::int AS monthly,
      (SELECT count(*) FROM mentoring.reminder_jobs WHERE organization_id=$1 AND last_evaluated_operation_id=ANY($6::uuid[]) AND NOT participant_id=ANY($4::uuid[]))::int AS reminders`, [ORGANIZATION, staffIds, QA_ACTOR, participantIds, monthlyReviewIds, operationIds])).rows[0];
    assert.ok(Object.values(external).every((count) => count === 0), "A fixture has an external reference; preserve it for review.");

    stage = "fixture removal and snapshot restoration";
    for (const table of ["reminder_attempts", "reminder_jobs", "outbox", "conflicts", "review_events", "contact_revisions", "appointment_history", "manual_color_history", "grants"]) await database.query(`DELETE FROM mentoring.${table} WHERE organization_id=$1 AND participant_id=ANY($2::uuid[])`, params);
    await database.query("DELETE FROM mentoring.audit WHERE organization_id=$1 AND actor_id=$2 AND operation_id=ANY($3::uuid[])", [ORGANIZATION, QA_ACTOR, operationIds]);
    await database.query("DELETE FROM mentoring.reviews WHERE organization_id=$1 AND contact_id=ANY($2::uuid[])", [ORGANIZATION, [...contactIds]]);
    await database.query("DELETE FROM mentoring.ceo_protections WHERE organization_id=$1 AND resource_id=ANY($2::uuid[])", [ORGANIZATION, resourceIds]);
    for (const table of ["appointments", "contacts", "assignments"]) await database.query(`DELETE FROM mentoring.${table} WHERE organization_id=$1 AND participant_id=ANY($2::uuid[])`, params);
    await database.query("DELETE FROM mentoring.participants WHERE organization_id=$1 AND id=ANY($2::uuid[])", params);
    await database.query("DELETE FROM mentoring.resource_ids WHERE organization_id=$1 AND id=ANY($2::uuid[])", [ORGANIZATION, resourceIds]);
    await database.query("DELETE FROM mentoring.monthly_review_history WHERE organization_id=$1 AND review_id=ANY($2::uuid[])", [ORGANIZATION, monthlyReviewIds]);
    await database.query("DELETE FROM mentoring.monthly_reviews WHERE organization_id=$1 AND id=ANY($2::uuid[])", [ORGANIZATION, monthlyReviewIds]);
    await database.query("DELETE FROM mentoring.operations WHERE organization_id=$1 AND actor_id=$2 AND operation_id=ANY($3::uuid[])", [ORGANIZATION, QA_ACTOR, operationIds]);
    // Break only fixture-to-fixture coordinator references; all rows being
    // updated have already been validated and are deleted in this transaction.
    await database.query("UPDATE mentoring.memberships SET coordinator_id=NULL WHERE organization_id=$1 AND id=ANY($2::uuid[])", [ORGANIZATION, staffIds]);
    await database.query("DELETE FROM mentoring.memberships WHERE organization_id=$1 AND id=ANY($2::uuid[])", [ORGANIZATION, staffIds]);

    stage = "independent verification";
    const remaining = {};
    for (const table of [...childTables, "contacts", "participants"]) {
      const column = table === "participants" ? "id" : "participant_id";
      remaining[table] = (await database.query(`SELECT count(*)::int AS count FROM mentoring.${table} WHERE organization_id=$1 AND ${column}=ANY($2::uuid[])`, params)).rows[0].count;
    }
    for (const [table, column, values] of [["memberships", "id", staffIds], ["resource_ids", "id", resourceIds], ["monthly_reviews", "id", monthlyReviewIds], ["monthly_review_history", "review_id", monthlyReviewIds], ["reviews", "contact_id", [...contactIds]], ["ceo_protections", "resource_id", resourceIds]]) remaining[table] = (await database.query(`SELECT count(*)::int AS count FROM mentoring.${table} WHERE organization_id=$1 AND ${column}=ANY($2::uuid[])`, [ORGANIZATION, values])).rows[0].count;
    remaining.operations = (await database.query("SELECT count(*)::int AS count FROM mentoring.operations WHERE organization_id=$1 AND actor_id=$2 AND operation_id=ANY($3::uuid[])", [ORGANIZATION, QA_ACTOR, operationIds])).rows[0].count;
    remaining.audit = (await database.query("SELECT count(*)::int AS count FROM mentoring.audit WHERE organization_id=$1 AND actor_id=$2 AND operation_id=ANY($3::uuid[])", [ORGANIZATION, QA_ACTOR, operationIds])).rows[0].count;
    remaining.settings_history = (await database.query("SELECT count(*)::int AS count FROM mentoring.organization_settings_history WHERE organization_id=$1 AND version=ANY($2::integer[])", [ORGANIZATION, settingsVersions])).rows[0].count;
    assert.ok(Object.values(remaining).every((count) => count === 0));
    await database.query("COMMIT");
    transactionStarted = false;
    return { status: "passed", removedParticipants: ownedParticipants.length, removedStaff: ownedStaff.length, removedContacts: contacts.length, removedMonthlyReviews: monthly.length, remaining, approvedQaIdentityPreserved: true, sharedMembershipAndSettingsUntouched: true };
  } catch {
    if (transactionStarted) await database.query("ROLLBACK").catch(() => {});
    throw new Error(`Whole-system fixture cleanup was not confirmed during ${stage}. Verify only the manifest IDs before retrying; preserve the approved QA identity.`);
  }
}


let fatal;
try {
  await database.connect();
  const actor = await database.query("SELECT to_jsonb(m) AS value FROM mentoring.memberships m WHERE organization_id=$1 AND email=$2",[manifest.organizationId,credentials.email]);
  assert.equal(actor.rowCount,1); const row=actor.rows[0].value;
  assert.equal(row.id,"15906dea-3538-46ab-ab2f-9ec651d15474"); assert.equal(row.auth_user_id,credentials.userId); assert.equal(row.role,"ceo"); assert.equal(row.active,true);
  manifest.actorId=row.id; manifest.actorOriginal=row; manifest.actorExpected=row;
  manifest.settingsOriginal=(await database.query("SELECT to_jsonb(s) AS value FROM mentoring.organization_settings s WHERE organization_id=$1",[manifest.organizationId])).rows[0].value;
  if (process.env.MENTORING_LANE_SHARED_STAFF_FILE) {
    assert.equal(process.env.MENTORING_LANE_PARTICIPANT_ONLY,"true");
    const descriptorPath=process.env.MENTORING_LANE_SHARED_STAFF_FILE;
    assert.equal((await stat(descriptorPath)).mode & 0o077,0);
    const pool=JSON.parse(await readFile(descriptorPath,"utf8"));
    assert.equal((await stat(pool.manifestPath)).mode & 0o077,0);
    const owner=JSON.parse(await readFile(pool.manifestPath,"utf8"));
    assert.equal(owner.actorId,manifest.actorId); assert.equal(owner.organizationId,manifest.organizationId);
    const ids=[pool.coordinatorId,pool.mentorId,pool.otherMentorId];
    assert.equal(new Set(ids).size,3);
    for (const id of ids) assert.ok(owner.staffIds.includes(id));
    const rows=(await database.query("SELECT id,display_name,role,active,auth_user_id FROM mentoring.memberships WHERE organization_id=$1 AND id=ANY($2::uuid[])",[manifest.organizationId,ids])).rows;
    assert.equal(rows.length,3);
    for (const member of rows) { assert.equal(member.auth_user_id,null); assert.equal(member.active,true); assert.equal(member.display_name,owner.names.staff[member.id]); assert.ok(member.display_name.includes(owner.runId)); }
    assert.equal(rows.find(x=>x.id===pool.coordinatorId).role,"coordinator");
    assert.equal(rows.find(x=>x.id===pool.mentorId).role,"mentor");
    assert.equal(rows.find(x=>x.id===pool.otherMentorId).role,"mentor");
    manifest.sharedStaffIds=ids; Object.assign(h.fixture,{coordinatorId:pool.coordinatorId,mentorId:pool.mentorId,otherMentorId:pool.otherMentorId});
  }
  await saveManifest(); await launch(); await navigate("/staff"); const state=await snapshot();
  assert.equal(state.actor.id,manifest.actorId); assert.equal(state.actor.role,"ceo"); assert.equal(state.capabilities.smsConfigured,false); assert.equal(state.capabilities.smsSendingEnabled,false);
  if (process.env.MENTORING_LANE_PARTICIPANT_ONLY !== "true") {
    h.fixture.coordinatorId=await createStaff("coordinator","coordinator");
    h.fixture.mentorId=await createStaff("mentor","mentor",{coordinatorId:h.fixture.coordinatorId});
    h.fixture.otherMentorId=await createStaff("mentor","other",{coordinatorId:h.fixture.coordinatorId});
  }
  h.fixture.participantId=await createParticipant("participant");
  if (h.fixture.mentorId) await assignParticipant(h.fixture.participantId,h.fixture.mentorId,h.fixture.coordinatorId);
  const modulePath=process.argv[2], exportName=process.argv[3];
  assert.ok(modulePath && exportName,"Pass lane module path and exported function name.");
  const mod=await import(pathToFileURL(resolve(modulePath)).href); assert.equal(typeof mod[exportName],"function");
  await mod[exportName](h);
} catch(e) { fatal=clean(e.stack ?? e.message); console.error(JSON.stringify({fatal})); }
finally {
  await browser?.close().catch(()=>{}); await Promise.allSettled([...responseTasks]);
  try { await captureCurrent(); await writeTask; cleanupResult=await cleanupLane({database,manifest}); }
  catch(e) { cleanupResult={status:"failed",message:clean(e.message),manifest:manifestPath}; }
  await database.end().catch(()=>{});
  const report={runId,results,errors,cleanup:cleanupResult,fatal};
  await writeFile(resolve(artifacts,"report.json"),JSON.stringify(report,null,2),{mode:0o600});
  console.log(JSON.stringify({runId,passed:results.filter(x=>x.status==="passed").length,failed:results.filter(x=>x.status==="failed").length,cleanup:cleanupResult?.status,report:resolve(artifacts,"report.json")}));
  if(fatal || results.some(x=>x.status==="failed") || errors.length || cleanupResult?.status!=="passed") process.exitCode=1;
}
