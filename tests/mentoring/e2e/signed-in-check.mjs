import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";

if (process.env.MENTORING_QA_WRITES !== "approved") throw new Error("Explicit MENTORING_QA_WRITES=approved is required for development fixture writes.");
if (process.env.NODE_ENV === "production" || (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "development")) throw new Error("The fixture runner cannot run against a production environment.");
if (!process.env.MENTORING_DATABASE_URL) loadEnvFile(new URL("../../../.env.local", import.meta.url));
assert.ok(process.env.CLERK_SECRET_KEY?.startsWith("sk_test_"), "A Clerk development instance is required.");
assert.ok(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_"), "A Clerk development public configuration is required.");
assert.equal(process.env.MENTORING_NEON_PROJECT_ID, "round-firefly-59684866", "The runner is restricted to the approved mentoring development Neon project.");
const base = new URL(process.env.MENTORING_BASE_URL ?? "http://localhost:3000");
if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) || !["http:", "https:"].includes(base.protocol) || base.pathname !== "/" || base.search || base.hash || base.username || base.password) throw new Error("Use a local HTTP(S) origin only.");
const baseURL = base.origin;
const credentialPath = process.env.MENTORING_QA_CREDENTIALS_FILE;
if (!credentialPath) throw new Error("A private existing development QA credential file is required.");
assert.equal((await stat(credentialPath)).mode & 0o077, 0, "The existing QA credential file must not be group/world readable.");
const credentials = JSON.parse(await readFile(credentialPath, "utf8"));
assert.equal(credentials.email, "mentoring-owner+clerk_test@example.com", "This runner is restricted to the explicitly approved synthetic account.");
assert.ok(typeof credentials.password === "string" && credentials.password.length >= 15);
const artifacts = resolve(process.env.MENTORING_E2E_ARTIFACTS ?? "/tmp/sherut-mentoring-qa/signed-in");
await mkdir(artifacts, { recursive: true, mode: 0o700 });
const profile = await mkdtemp(resolve(artifacts, "private-profile-"));
let playwright;
try { playwright = await import("playwright"); }
catch {
  if (!process.env.PLAYWRIGHT_MODULE_DIR) throw new Error("Install Playwright or set PLAYWRIGHT_MODULE_DIR.");
  playwright = createRequire(resolve(process.env.PLAYWRIGHT_MODULE_DIR, "../package.json"))("playwright");
}
const launchOptions = {
  headless: true, locale: "he-IL", timezoneId: "Asia/Jerusalem", viewport: { width: 1440, height: 1000 },
  ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}),
};
let context = await playwright.chromium.launchPersistentContext(profile, launchOptions);
let page = context.pages()[0] ?? await context.newPage();
const results = [];
const browserErrors = [];
const navigationHistory = [];
const submitted = new Map();
const createdStaff = new Set();
const participants = new Set();
const resources = new Set();
const runId = randomUUID().slice(0, 8);
const names = { coordinator: `בדיקת דפדפן ${runId} רכזת`, mentor: `בדיקת דפדפן ${runId} חונכת`, participant: `בדיקת דפדפן ${runId} חניכה` };
let actorId;
let initialSmsMuted;
let participantId;
let completedContactId;
let offlineNotes;
let offlineCommandId;
let initialAppointment;

const cleanMessage = (value) => String(value).replaceAll(credentials.password, "[redacted]").replace(/https?:\/\/[^\s]+/g, "[URL omitted]");
function observe(target) {
  target.on("framenavigated", (frame) => { if (frame === target.mainFrame()) navigationHistory.push(new URL(frame.url()).pathname); });
  target.on("pageerror", (error) => browserErrors.push(cleanMessage(error.message)));
  target.on("request", (request) => {
    if (new URL(request.url()).pathname !== "/api/mentoring/commands" || request.method() !== "POST") return;
    try {
      const command = request.postDataJSON();
      if (typeof command.operationId === "string") submitted.set(command.operationId, command);
    } catch { /* Invalid requests are reported by the scenario itself. */ }
  });
  target.on("response", async (response) => {
    if (new URL(response.url()).pathname !== "/api/mentoring/commands" || response.request().method() !== "POST") return;
    try {
      const command = response.request().postDataJSON();
      const result = await response.json();
      if (!result.ok) return;
      if (command.type === "create_staff" && result.staffId) createdStaff.add(result.staffId);
      if (command.type === "create_participant" && result.participantId) { participants.add(result.participantId); resources.add(result.participantId); }
      if (command.type === "record_contact") resources.add(command.operationId);
    } catch { /* No provider/auth response bodies are recorded. */ }
  });
}
observe(page);

async function poll(read, predicate, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  let value;
  do {
    value = await read();
    if (await predicate(value)) return value;
    await delay(400);
  } while (Date.now() < deadline);
  throw new Error("The expected centrally accepted state was not observed before the timeout.");
}
async function workspace() {
  return page.evaluate(async () => {
    const response = await fetch("/api/mentoring/workspace", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) throw new Error(`Workspace status ${response.status}`);
    return response.json();
  });
}
async function view() { return (await workspace()).participants.find((item) => item.participant.id === participantId); }
async function action(type, perform) {
  const received = page.waitForResponse((response) => {
    if (new URL(response.url()).pathname !== "/api/mentoring/commands" || response.request().method() !== "POST") return false;
    try { return response.request().postDataJSON().type === type; } catch { return false; }
  }, { timeout: 45_000 });
  // If the UI action itself fails, the response waiter still belongs to this
  // scenario; consume a later timeout/closed-context rejection before rethrowing.
  received.catch(() => {});
  await perform();
  const response = await received;
  const result = await response.json();
  assert.equal(result.ok, true, result.ok ? undefined : `${result.error.code}: ${result.error.message}`);
  assert.equal(result.acceptance, "accepted");
  const command = response.request().postDataJSON();
  if (type === "create_staff") assert.equal(result.staffId, command.operationId);
  if (type === "create_participant") assert.equal(result.participantId, command.operationId);
  return { result, command };
}
async function scenario(name, run) {
  const start = Date.now();
  try {
    const evidence = await run();
    results.push({ name, status: "passed", durationMs: Date.now() - start, evidence });
    console.log(JSON.stringify({ scenario: name, status: "passed", evidence }));
    return true;
  } catch (error) {
    const screenshot = resolve(artifacts, `failure-${results.length + 1}.png`);
    await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
    results.push({ name, status: "failed", durationMs: Date.now() - start, message: cleanMessage(error.message), location: new URL(page.url()).pathname, screenshot });
    console.log(JSON.stringify({ scenario: name, status: "failed", message: cleanMessage(error.message), screenshot }));
    return false;
  }
}
function localInput(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
async function screenshot(name) {
  const path = resolve(artifacts, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  return path;
}
async function createStaff(role) {
  await page.getByRole("button", { name: "הוספת חבר/ת צוות", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("שם מלא", { exact: true }).fill(names[role]);
  await dialog.getByLabel("כתובת דוא״ל להתחברות", { exact: true }).fill(`mentoring-e2e-${runId}-${role}@example.com`);
  if (role === "coordinator") await dialog.getByRole("button", { name: "רכז/ת", exact: true }).click();
  else {
    await dialog.getByLabel("רכז/ת אחראי/ת", { exact: true }).click();
    await page.getByRole("option", { name: names.coordinator, exact: true }).click();
  }
  const { result } = await action("create_staff", () => dialog.getByRole("button", { name: "אישור חברות בצוות", exact: true }).click());
  createdStaff.add(result.staffId);
  await dialog.waitFor({ state: "hidden" });
  await page.getByText(names[role], { exact: true }).first().waitFor({ state: "visible" });
  return result.staffId;
}

async function cleanup() {
  if (!actorId || (!createdStaff.size && !participants.size && !submitted.size)) return { removedFixtures: 0 };
  if (!process.env.MENTORING_DATABASE_URL) loadEnvFile(new URL("../../../.env.local", import.meta.url));
  const database = new pg.Client({ connectionString: process.env.MENTORING_DATABASE_URL_UNPOOLED ?? process.env.MENTORING_DATABASE_URL, connectionTimeoutMillis: 10_000 });
  await database.connect();
  const org = "11111111-1111-4111-8111-111111111111";
  try {
    await database.query("BEGIN");
    const operationIds = [...submitted.keys()];
    const participantIds = [...participants];
    const staffIds = [...createdStaff];
    for (const command of submitted.values()) if (command.type === "record_contact") resources.add(command.operationId);
    // Validate all ownership before deleting any dependent data. An unexpected
    // binding/name/ID aborts the entire cleanup transaction without a mutation.
    const ownedParticipants = await database.query("SELECT id,created_by,display_name FROM mentoring.participants WHERE organization_id=$1 AND id=ANY($2::uuid[]) FOR UPDATE", [org, participantIds]);
    assert.equal(ownedParticipants.rowCount, participantIds.length);
    for (const row of ownedParticipants.rows) {
      assert.equal(row.created_by, actorId);
      assert.equal(row.display_name, names.participant);
    }
    const ownedStaff = await database.query("SELECT id,auth_user_id,display_name FROM mentoring.memberships WHERE organization_id=$1 AND id=ANY($2::uuid[]) FOR UPDATE", [org, staffIds]);
    assert.equal(ownedStaff.rowCount, staffIds.length);
    for (const row of ownedStaff.rows) {
      assert.equal(row.auth_user_id, null);
      assert.ok(row.display_name === names.coordinator || row.display_name === names.mentor);
      assert.notEqual(row.id, actorId);
    }
    const ownedResources = await database.query("SELECT r.id,r.kind,c.participant_id FROM mentoring.resource_ids r LEFT JOIN mentoring.contacts c ON c.organization_id=r.organization_id AND c.id=r.id WHERE r.organization_id=$1 AND r.id=ANY($2::uuid[]) FOR UPDATE OF r", [org, [...resources]]);
    for (const row of ownedResources.rows) {
      assert.ok(row.kind === "participant" ? participants.has(row.id) : participants.has(row.participant_id));
    }
    await database.query("DELETE FROM mentoring.outbox WHERE organization_id=$1 AND participant_id=ANY($2::uuid[])", [org, participantIds]);
    await database.query("DELETE FROM mentoring.audit WHERE organization_id=$1 AND actor_id=$2 AND operation_id=ANY($3::uuid[])", [org, actorId, operationIds]);
    await database.query("DELETE FROM mentoring.conflicts WHERE organization_id=$1 AND participant_id=ANY($2::uuid[])", [org, participantIds]);
    await database.query("DELETE FROM mentoring.reviews WHERE organization_id=$1 AND contact_id IN (SELECT id FROM mentoring.contacts WHERE organization_id=$1 AND participant_id=ANY($2::uuid[]))", [org, participantIds]);
    await database.query("DELETE FROM mentoring.ceo_protections WHERE organization_id=$1 AND resource_id=ANY($2::uuid[])", [org, [...resources]]);
    for (const table of ["grants", "appointments", "contacts", "assignments"]) await database.query(`DELETE FROM mentoring.${table} WHERE organization_id=$1 AND participant_id=ANY($2::uuid[])`, [org, participantIds]);
    await database.query("DELETE FROM mentoring.participants WHERE organization_id=$1 AND id=ANY($2::uuid[]) AND display_name LIKE $3", [org, participantIds, `%${runId}%`]);
    await database.query("DELETE FROM mentoring.resource_ids WHERE organization_id=$1 AND id=ANY($2::uuid[])", [org, [...resources]]);
    await database.query("DELETE FROM mentoring.operations WHERE organization_id=$1 AND actor_id=$2 AND operation_id=ANY($3::uuid[])", [org, actorId, operationIds]);
    await database.query("DELETE FROM mentoring.memberships WHERE organization_id=$1 AND id=ANY($2::uuid[]) AND auth_user_id IS NULL AND display_name LIKE $3", [org, staffIds, `%${runId}%`]);
    if (typeof initialSmsMuted === "boolean") await database.query("UPDATE mentoring.memberships SET sms_muted=$3 WHERE organization_id=$1 AND id=$2", [org, actorId, initialSmsMuted]);
    await database.query("COMMIT");
    const remaining = await database.query("SELECT (SELECT count(*) FROM mentoring.participants WHERE id=ANY($1::uuid[]))::int AS participants,(SELECT count(*) FROM mentoring.memberships WHERE id=ANY($2::uuid[]))::int AS staff", [participantIds, staffIds]);
    assert.equal(remaining.rows[0].participants, 0);
    assert.equal(remaining.rows[0].staff, 0);
    return { removedParticipants: participantIds.length, removedStaff: staffIds.length, remaining: remaining.rows[0], approvedQACeoPreserved: true };
  } catch { await database.query("ROLLBACK").catch(() => {}); throw new Error("Fixture cleanup failed; remove only this runner's recorded IDs."); }
  finally { await database.end(); }
}

try {
  const authenticated = await scenario("Real Clerk password sign-in and available new-device verification bind the approved CEO membership", async () => {
    await page.goto(`${baseURL}/staff/login`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.getElementById("staff-email") && !document.getElementById("staff-email").disabled);
    await page.locator("#staff-email").fill(credentials.email);
    await page.locator("#staff-password").fill(credentials.password);
    await page.getByRole("button", { name: "כניסה למרחב הליווי", exact: true }).click();
    await page.waitForFunction(() => location.pathname === "/staff" || !!document.getElementById("verification-code") || !!document.querySelector('[role="alert"][data-variant="destructive"]'), null, { timeout: 45_000 });
    const otpRequested = await page.locator("#verification-code").isVisible().catch(() => false);
    let invalidCodeRecovered = false;
    if (otpRequested) {
      await page.locator("#verification-code").fill("111111");
      await page.getByRole("button", { name: "אימות וכניסה", exact: true }).click();
      await page.getByText("הקוד אינו תקין. בדקו אותו ונסו שוב.", { exact: true }).waitFor({ state: "visible" });
      invalidCodeRecovered = true;
      await page.locator("#verification-code").focus();
      await page.locator("#verification-code").press("ControlOrMeta+A");
      await page.locator("#verification-code").press("Backspace");
      assert.equal(await page.locator("#verification-code").inputValue(), "");
      await page.locator("#verification-code").pressSequentially("424242", { delay: 80 });
      assert.equal(await page.locator("#verification-code").inputValue(), "424242");
      await page.getByRole("button", { name: "אימות וכניסה", exact: true }).click();
    }
    await page.waitForURL((url) => url.pathname === "/staff", { timeout: 45_000 });
    await page.locator("h1").first().waitFor({ state: "visible", timeout: 30_000 });
    const snapshot = await poll(workspace, (value) => value.actor?.role === "ceo");
    actorId = snapshot.actor.id;
    initialSmsMuted = snapshot.actor.smsMuted;
    assert.equal(snapshot.actor.email, credentials.email);
    assert.equal(snapshot.actor.active, true);
    assert.equal(snapshot.capabilities.smsConfigured, false);
    assert.equal(snapshot.capabilities.smsSendingEnabled, false);
    return { role: "ceo", verifiedEmailBound: true, otpRequested, invalidCodeRecovered, productionEveryLoginOTPProven: false };
  });
  if (!authenticated) throw new Error("Dependent signed-in checks cannot run without the real authenticated CEO session.");

  await scenario("The signed-in offline HTML remains an anonymous shell without account data", async () => {
    const response = await context.request.get(`${baseURL}/staff/offline`);
    assert.equal(response.status(), 200);
    assert.equal(response.headers()["x-mentoring-shell"], "anonymous-v1");
    const html = await response.text();
    assert.equal(html.includes(credentials.email), false);
    assert.equal(html.includes(actorId), false);
    assert.equal(/\bauthUserId\b|\bofflineValidUntil\b/.test(html), false);
    return { authenticatedRequest: true, privateDataEmbedded: false };
  });

  const staffReady = await scenario("CEO creates coordinator and mentor preapprovals through functional dialogs and selects", async () => {
    await page.goto(`${baseURL}/staff/team`);
    await createStaff("coordinator");
    await createStaff("mentor");
    const snapshot = await workspace();
    const mentor = snapshot.staff.find((member) => member.displayName === names.mentor);
    const coordinator = snapshot.staff.find((member) => member.displayName === names.coordinator);
    assert.equal(mentor.coordinatorId, coordinator.id);
    assert.equal(mentor.authUserId, "");
    return { createdStaff: 2, providerAccountsCreated: 0, invitationsSent: 0, screenshot: await screenshot("team-desktop") };
  });
  if (!staffReady) throw new Error("Participant assignment checks depend on the two created staff preapprovals.");

  await scenario("CEO revokes and reactivates the synthetic mentor with an explicit confirmation", async () => {
    let row = page.getByRole("row").filter({ hasText: names.mentor });
    await row.getByRole("button", { name: "ביטול גישה", exact: true }).click();
    await action("set_staff_active", () => page.getByRole("button", { name: "אישור ביטול הגישה", exact: true }).click());
    await poll(workspace, (value) => value.staff.find((member) => member.displayName === names.mentor)?.active === false);
    row = page.getByRole("row").filter({ hasText: names.mentor });
    await action("set_staff_active", () => row.getByRole("button", { name: "הפעלת גישה", exact: true }).click());
    await poll(workspace, (value) => value.staff.find((member) => member.displayName === names.mentor)?.active === true);
    return { revocationAccepted: true, reactivationAccepted: true };
  });

  const assigned = await scenario("A partial participant is created, assigned once, and persists across a reload", async () => {
    await page.goto(`${baseURL}/staff/participants`);
    await page.getByRole("button", { name: "חניכה חדשה", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("שם החניכה", { exact: true }).fill(names.participant);
    const { result } = await action("create_participant", () => dialog.getByRole("button", { name: "יצירת כרטיס", exact: true }).click());
    participantId = result.participantId; participants.add(participantId); resources.add(participantId);
    const navigatedAutomatically = await page.waitForURL((url) => url.pathname === `/staff/participants/${participantId}`, { waitUntil: "domcontentloaded", timeout: 8_000 }).then(() => true).catch(() => false);
    if (!navigatedAutomatically) {
      await page.getByRole("link").filter({ hasText: names.participant }).first().click();
      await page.waitForURL((url) => url.pathname === `/staff/participants/${participantId}`, { waitUntil: "domcontentloaded" });
    }
    await page.getByRole("tab", { name: "פרטי החניכה והליווי", exact: true }).click();
    await page.getByRole("button", { name: "שיוך לחונך/ת", exact: true }).click();
    await page.getByLabel("חונך/ת אחראי/ת", { exact: true }).click();
    await page.getByRole("option", { name: names.mentor, exact: true }).click();
    await page.getByLabel("רכז/ת אחראי/ת", { exact: true }).click();
    await page.getByRole("option", { name: names.coordinator, exact: true }).click();
    await action("assign_participant", () => page.getByRole("button", { name: "אישור השיוך", exact: true }).click());
    await page.reload();
    await page.getByRole("heading", { name: names.participant, exact: true }).waitFor({ state: "visible" });
    const current = await view();
    assert.ok(current.assignment);
    assert.equal(current.participant.phone, null);
    assert.equal(current.participant.serviceType, null);
    assert.equal(current.contacts.length, 0);
    return { partialProfileAccepted: true, assignmentPreserved: true, navigatedAutomatically, screenshot: await screenshot("participant-desktop") };
  });
  if (!assigned) throw new Error("Contact checks require the assigned participant.");

  await scenario("Completed phone contact and one next appointment are accepted together", async () => {
    await page.goto(`${baseURL}/staff/contacts/new?participant=${participantId}`);
    await page.locator("#contact-occurredAt").fill(localInput(new Date(Date.now() - 300_000)));
    await page.locator("#contact-nextAppointmentAt").fill(localInput(new Date(Date.now() + 86_400_000)));
    await page.locator("#contact-notes").fill(`בדיקת דפדפן ${runId}: שיחה שהושלמה`);
    await page.locator("#contact-color").click();
    await page.getByRole("option", { name: "ירוק — הפגישה בוצעה", exact: true }).click();
    const { command } = await action("record_contact", () => page.getByRole("button", { name: "שמירת התיעוד והפגישה הבאה", exact: true }).click());
    completedContactId = command.operationId;
    const current = await poll(view, (value) => value?.contacts.length === 1 && !!value.nextAppointment);
    assert.equal(current.contacts[0].method, "phone");
    assert.equal(current.contacts[0].outcome, "completed");
    assert.equal(current.manualColor, "green");
    initialAppointment = current.nextAppointment;
    return { contacts: 1, nextAppointmentCount: 1, manualColor: "green", screenshot: await screenshot("completed-contact-desktop") };
  });

  await scenario("No-answer recording appends history without replacing the next appointment", async () => {
    await page.goto(`${baseURL}/staff/contacts/new?participant=${participantId}`);
    await page.locator("#contact-outcome").click();
    await page.getByRole("option", { name: "לא היה מענה", exact: true }).click();
    assert.equal(await page.locator("#contact-nextAppointmentAt").count(), 0);
    await page.locator("#contact-occurredAt").fill(localInput(new Date(Date.now() - 120_000)));
    await page.locator("#contact-notes").fill(`בדיקת דפדפן ${runId}: ללא מענה`);
    await action("record_contact", () => page.getByRole("button", { name: "שמירת התיעוד", exact: true }).click());
    const current = await poll(view, (value) => value?.contacts.length === 2);
    assert.deepEqual(current.nextAppointment, initialAppointment);
    assert.equal(current.contacts.filter((entry) => entry.outcome === "completed").length, 1);
    return { contacts: 2, successfulContacts: 1, appointmentUnchanged: true };
  });

  await scenario("Management approval applies to the exact recorded revision without moving the appointment", async () => {
    await page.goto(`${baseURL}/staff/reviews`);
    const card = page.locator('[data-slot="card"]').filter({ hasText: `בדיקת דפדפן ${runId}: שיחה שהושלמה` });
    await action("review_contact", () => card.getByRole("button", { name: "אישור הדיווח", exact: true }).click());
    const current = await poll(view, (value) => value?.reviews.some((review) => review.contactId === completedContactId && review.revision === 1 && review.decision === "approved"));
    assert.deepEqual(current.nextAppointment, initialAppointment);
    return { approvedRevision: 1, appointmentUnchanged: true };
  });

  await scenario("CEO SMS preference persists independently of the unconfigured sender", async () => {
    await page.goto(`${baseURL}/staff/settings`);
    const toggle = page.getByRole("switch");
    await action("set_sms_muted", () => toggle.click());
    await poll(workspace, (value) => value.actor.smsMuted !== initialSmsMuted);
    await action("set_sms_muted", () => toggle.click());
    await poll(workspace, (value) => value.actor.smsMuted === initialSmsMuted);
    return { preferenceSaved: true, originalPreferenceRestored: true, smsDeliveryTested: false };
  });

  await scenario("Populated desktop/mobile staff views and sidebar interactions remain responsive", async () => {
    await page.goto(`${baseURL}/staff`);
    await page.locator("h1").first().waitFor({ state: "visible" });
    const desktop = await screenshot("dashboard-desktop");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "פתיחת תפריט ניווט", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    const mobile = await screenshot("dashboard-mobile");
    await page.goto(`${baseURL}/staff/contacts/new?participant=${participantId}`);
    await page.locator("#contact-notes").waitFor({ state: "visible" });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    const contact = await screenshot("contact-form-mobile");
    return { desktop, mobile, contact, sidebarEscapeCloses: true };
  });

  await scenario("Prepared drafts and authorized records survive a cold offline browser restart", async () => {
    offlineNotes = `בדיקת דפדפן ${runId}: טיוטה ללא חיבור`;
    await page.locator("#contact-notes").fill(offlineNotes);
    await page.getByText("הטיוטה נשמרה במכשיר הזה", { exact: true }).waitFor({ state: "visible" });
    await page.waitForFunction(async () => {
      if (!navigator.serviceWorker.controller) return false;
      const names = await caches.keys();
      const cache = await caches.open(names.find((name) => name.startsWith("mentoring-anonymous-shell-")) ?? "missing");
      return !!await cache.match("/staff/offline");
    }, null, { timeout: 45_000 });
    await context.close();
    context = await playwright.chromium.launchPersistentContext(profile, { ...launchOptions, viewport: { width: 390, height: 844 } });
    await context.setOffline(true);
    page = context.pages()[0] ?? await context.newPage(); observe(page);
    await page.goto(`${baseURL}/staff`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.getByText("אפשר להמשיך גם ללא חיבור", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    await page.goto(`${baseURL}/staff/contacts/new?participant=${participantId}`, { waitUntil: "domcontentloaded" });
    await page.locator("#contact-notes").waitFor({ state: "visible", timeout: 30_000 });
    assert.equal(await page.locator("#contact-notes").inputValue(), offlineNotes);
    assert.equal(await page.evaluate(() => navigator.onLine), false);
    return { coldBrowserRestart: true, authorizedRecordVisible: true, draftRestored: true, screenshot: await screenshot("offline-draft-mobile") };
  });

  await scenario("Offline finalization remains queued, survives reload, and synchronizes once after reconnect", async () => {
    offlineNotes = `בדיקת דפדפן ${runId}: קשר שהושלם ללא חיבור`;
    await page.locator("#contact-occurredAt").fill(localInput(new Date(Date.now() - 60_000)));
    await page.locator("#contact-nextAppointmentAt").fill(localInput(new Date(Date.now() + 172_800_000)));
    await page.locator("#contact-notes").fill(offlineNotes);
    await page.getByRole("button", { name: "שמירת התיעוד והפגישה הבאה", exact: true }).click();
    await page.waitForURL((url) => url.pathname === `/staff/participants/${participantId}`);
    await page.getByText(offlineNotes, { exact: true }).waitFor({ state: "visible" });
    await page.reload();
    await page.getByText(offlineNotes, { exact: true }).waitFor({ state: "visible" });
    const queuedScreenshot = await screenshot("offline-queued-contact-mobile");
    const response = page.waitForResponse((item) => {
      if (new URL(item.url()).pathname !== "/api/mentoring/commands") return false;
      try { return item.request().postDataJSON().notes === offlineNotes; } catch { return false; }
    }, { timeout: 45_000 });
    await context.setOffline(false);
    const received = await response;
    const result = await received.json();
    assert.equal(result.ok, true);
    offlineCommandId = received.request().postDataJSON().operationId;
    resources.add(offlineCommandId);
    const current = await poll(view, (value) => value?.contacts.some((entry) => entry.id === offlineCommandId));
    assert.equal(current.contacts.filter((entry) => entry.id === offlineCommandId).length, 1);
    assert.equal(current.contacts.length, 3);
    assert.equal(current.nextAppointment.version, initialAppointment.version + 1);
    await page.reload();
    await page.getByText(offlineNotes, { exact: true }).waitFor({ state: "visible" });
    assert.equal((await view()).contacts.filter((entry) => entry.id === offlineCommandId).length, 1);
    return { queuedScreenshot, centrallyAcceptedAfterReconnect: true, duplicateContacts: 0, contacts: 3 };
  });
} catch (error) {
  results.push({ name: "Remaining dependent checks", status: "not_tested", reason: cleanMessage(error.message) });
} finally {
  await context?.close().catch(() => {});
  let cleanupResult;
  try { cleanupResult = await cleanup(); }
  catch (error) { results.push({ name: "Temporary fixture cleanup", status: "failed", message: cleanMessage(error.message) }); }
  await rm(profile, { recursive: true, force: true });
  if (browserErrors.length) results.push({ name: "Unexpected fatal browser errors", status: "failed", messages: browserErrors });
  const report = { checkedAt: new Date().toISOString(), baseURL, runId, results, navigationHistory, browserErrors, cleanup: cleanupResult, summary: { passed: results.filter((item) => item.status === "passed").length, failed: results.filter((item) => item.status === "failed").length, notTested: results.filter((item) => item.status === "not_tested").length } };
  const reportPath = resolve(artifacts, "report.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ report: reportPath, summary: report.summary, failures: results.filter((item) => item.status === "failed"), browserErrorCount: browserErrors.length, cleanup: cleanupResult }));
  if (report.summary.failed || report.summary.notTested) process.exitCode = 1;
}
