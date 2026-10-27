import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

// A fresh isolated browser profile, backed by the private test Clerk session.
// This lane is read-only: any command POST is intercepted and aborted.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
const base = new URL(process.env.MENTORING_BASE_URL ?? "http://localhost:3112");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname));
assert.ok(process.env.MENTORING_QA_STORAGE_STATE, "A private authenticated test storage state is required.");
let playwright;
try { playwright = await import("playwright"); }
catch { playwright = createRequire(resolve(process.env.PLAYWRIGHT_MODULE_DIR, "../package.json"))("playwright"); }
const browser = await playwright.chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
const context = await browser.newContext({ storageState: process.env.MENTORING_QA_STORAGE_STATE, locale: "he-IL", timezoneId: "Asia/Jerusalem", viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(10000);
const results = [];
let posts = 0;
await page.route("**/api/mentoring/commands", async (route) => {
  if (route.request().method() === "POST") { posts++; await route.abort("blockedbyclient"); }
  else await route.fallback();
});
async function scenario(name, fn) {
  try { const detail = await fn(); results.push({ name, status: "passed", detail }); }
  catch (error) { results.push({ name, status: "failed", message: String(error.message) }); }
}
async function navigate(path) {
  await page.goto(new URL(path, base).href, { waitUntil: "domcontentloaded" });
  await page.locator("h1").first().waitFor({ state: "visible", timeout: 45000 });
}
async function invalid(input) {
  await input.waitFor({ state: "visible" });
  await page.waitForFunction((element) => element.getAttribute("aria-invalid") === "true", await input.elementHandle(), { timeout: 5000 });
}
async function noPost(fn) {
  const before = posts; await fn(); await delay(750);
  assert.equal(posts, before, "Invalid action attempted a command POST");
}
async function limit(input, max) {
  assert.equal(await input.getAttribute("maxlength"), String(max));
  await input.fill("x".repeat(max + 10));
  assert.equal((await input.inputValue()).length, max);
}
try {
  await scenario("Settings reject blank, below-minimum, above-maximum and fractional values", async () => {
    await navigate("/staff/settings");
    const hours = page.locator("#settings-offline-hours"), minutes = page.locator("#settings-reminder-minutes"), repeat = page.locator("#settings-repeat-hours"), reason = page.locator("#settings-reason");
    await hours.waitFor({ state: "visible" }); await page.waitForFunction(() => !document.querySelector("#settings-offline-hours")?.disabled);
    const save = page.getByRole("button", { name: "שמירת הגדרות הארגון", exact: true });
    await reason.fill("בדיקת גבולות מקומית");
    for (const [input, values] of [[hours, ["", "0", "25", "1.5"]], [minutes, ["", "-1", "1441", "0.5"]], [repeat, ["0", "169", "1.5"]]]) {
      const original = await input.inputValue();
      for (const value of values) {
        await input.fill(value);
        await noPost(async () => { await save.click(); await invalid(input); });
        assert.equal(await input.inputValue(), value);
        assert.equal(await input.evaluate((node) => document.activeElement === node), true, "First invalid input must receive focus");
      }
      await input.fill(original);
    }
    await reason.fill("   "); await noPost(async () => { await save.click(); await invalid(reason); });
    assert.equal(await reason.inputValue(), "   "); await limit(reason, 2000);
    const toggle = page.getByRole("switch", { name: "תזכורות על איחור בקשר", exact: true }), checked = await toggle.getAttribute("aria-checked");
    await toggle.click(); assert.notEqual(await toggle.getAttribute("aria-checked"), checked); await toggle.click();
    await page.locator("#settings-audience").click(); await page.getByRole("option").first().waitFor({ state: "visible" }); const options = await page.getByRole("option").allTextContents(); assert.ok(options.length >= 2); await page.keyboard.press("Escape");
    return { numericInvalidCases: 11, whitespaceReason: true, reasonMax: 2000, toggleAndAudience: true };
  });
  await scenario("Monthly review retains summary and blocks save with an invalid month", async () => {
    await navigate("/staff/oversight");
    const month = page.locator("#oversight-month"), summary = page.locator("#monthly-review-summary");
    await summary.waitFor({ state: "visible" }); await page.waitForFunction(() => !document.querySelector("#monthly-review-summary")?.disabled);
    const initialMonth = await month.inputValue(); await limit(summary, 20000);
    await month.fill(""); await invalid(month);
    await noPost(async () => { await page.getByRole("button", { name: "שמירת הסקירה", exact: true }).click(); });
    assert.equal(await summary.inputValue(), "x".repeat(20000));
    assert.equal(await month.evaluate((node) => document.activeElement === node), true, "Invalid month must receive focus");
    await month.fill(initialMonth); const reviewed = page.getByRole("switch", { name: "הסקירה החודשית הושלמה", exact: true }), original = await reviewed.getAttribute("aria-checked");
    await reviewed.click(); assert.notEqual(await reviewed.getAttribute("aria-checked"), original); await reviewed.click();
    await page.locator("#oversight-scope").click(); await page.getByRole("option").first().waitFor({ state: "visible" }); assert.ok((await page.getByRole("option").count()) >= 1); await page.keyboard.press("Escape");
    return { maxSummary: 20000, invalidMonth: "no POST, focus restored and text retained", reviewedSwitch: true, scopeChoices: true };
  });
  await scenario("Management pages load without invoking SMS, review or conflict actions", async () => {
    await navigate("/staff/settings"); const smsSwitch = page.getByRole("switch", { name: "קבלת תזכורות ב־SMS", exact: true }); await smsSwitch.waitFor({ state: "visible" });
    const before = posts; const sms = await smsSwitch.getAttribute("aria-checked");
    await navigate("/staff/reviews"); await navigate("/staff/conflicts"); await delay(750); assert.equal(posts, before);
    return { smsStateRead: sms, reviewAndConflictViews: "loaded", commands: 0 };
  });
} finally {
  await context.close(); await browser.close();
  console.log(JSON.stringify({ results, blockedCommandPosts: posts }, null, 2));
  if (results.some((item) => item.status === "failed")) process.exitCode = 1;
}
}

// The lane harness supplies a separately owned participant and handles its
// exact cleanup. These invalid actions never reach the command endpoint.
export async function runManagementValidation(h) {
  const page = h.page, id = h.fixture.participantId;
  const wait = (loc) => h.poll(() => loc.isEnabled(), Boolean, 10000);
  const invalid = async (loc) => h.poll(() => loc.getAttribute("aria-invalid"), (value) => value === "true", 5000);
  const noPost = async (fn) => {
    let intercepted = 0;
    const handler = async (route) => {
      if (route.request().method() === "POST") { intercepted++; await route.abort("blockedbyclient"); }
      else await route.fallback();
    };
    await page.route("**/api/mentoring/commands", handler);
    try { await fn(); await delay(750); assert.equal(intercepted, 0, "Invalid action attempted a POST"); }
    finally { await page.unroute("**/api/mentoring/commands", handler); }
  };
  const open = async (title) => {
    await h.openParticipant(id, "פרטי החניכה והליווי");
    await page.getByRole("button", { name: title, exact: true }).click();
    const dialog = page.getByRole("dialog"); await wait(dialog.locator("#authority-reason")); return dialog;
  };
  const close = (dialog) => dialog.getByRole("button", { name: "סגירה", exact: true }).click();
  await h.scenario("Lifecycle and delete reasons are required and limited", async () => {
    for (const [title, save] of [["שינוי מצב הליווי", "שמירת השינוי"], ["העברת כרטיס לסל המחזור", "העברה לסל המחזור"]]) {
      const dialog = await open(title), reason = dialog.locator("#authority-reason");
      try {
        await reason.fill("   "); assert.equal(await dialog.getByRole("button", { name: save, exact: true }).isDisabled(), true);
        assert.equal(await reason.getAttribute("maxlength"), "2000"); await reason.fill("x".repeat(2010)); assert.equal((await reason.inputValue()).length, 2000);
        if (title === "שינוי מצב הליווי") for (const label of ["ליווי פעיל", "ליווי בהשהיה", "ליווי סגור"]) await dialog.getByRole("button", { name: label, exact: true }).click();
      } finally { await reason.fill(""); await close(dialog); }
    }
    return { blankReasonDisabled: true, maxReason: 2000, lifecycleChoices: 3, commands: 0 };
  });
  await h.scenario("Protection rejects empty field selection", async () => {
    const participant = await h.participant(id);
    const active = participant.protectionStates.some((entry) => entry.resourceId === id && entry.active);
    const dialog = await open("הגנת מנכ״ל על רשומה");
    try {
      assert.equal(await dialog.getByRole("button", { name: "הסרת הגנה", exact: true }).isDisabled(), !active, "Unlock availability must match current protection");
      await dialog.getByRole("button", { name: "שדות נבחרים", exact: true }).click();
      const fields = dialog.getByRole("group", { name: "בחירת שדות מוגנים", exact: true });
      while (await fields.getByRole("button", { pressed: true }).count()) await fields.getByRole("button", { pressed: true }).first().click();
      assert.equal(await fields.getByRole("button", { pressed: true }).count(), 0);
      await dialog.locator("#authority-reason").fill(`בדיקה ${h.runId}`);
      await noPost(async () => { await dialog.getByRole("button", { name: "שמירת השינוי", exact: true }).click(); await invalid(fields); });
    } finally { await dialog.locator("#authority-reason").fill(""); await close(dialog); }
    return { emptyFieldsRejected: true, unlockReflectsCurrentProtection: true, commands: 0 };
  });
  await h.scenario("Grant rejects expired dates and restricts mentor actions", async () => {
    const dialog = await open("הרשאה אישית לכרטיס");
    try {
      const mentor = (await h.snapshot()).staff.find((staff) => staff.id === h.fixture.mentorId); assert.ok(mentor);
      await dialog.locator("#authority-reason").fill(`בדיקה ${h.runId}`);
      await noPost(async () => { await dialog.getByRole("button", { name: "שמירת השינוי", exact: true }).click(); await invalid(dialog.locator("#authority-staff")); });
      await dialog.getByLabel("חבר/ת צוות", { exact: true }).click(); await page.getByRole("option", { name: mentor.displayName, exact: true }).click();
      await h.poll(() => dialog.getByRole("button", { name: "אישור תיעוד", exact: true }).isDisabled(), Boolean, 5000);
      assert.equal(await dialog.getByRole("button", { name: "ביטול הרשאה", exact: true }).isDisabled(), true, "Revoke must be disabled without an active grant");
      const actions = dialog.getByRole("group", { name: "בחירת הרשאות", exact: true });
      while (await actions.getByRole("button", { pressed: true }).count()) await actions.getByRole("button", { pressed: true }).first().click();
      await noPost(async () => { await dialog.getByRole("button", { name: "שמירת השינוי", exact: true }).click(); await invalid(actions); });
      const view = actions.getByRole("button", { name: "צפייה", exact: true });
      if (await view.getAttribute("aria-pressed") !== "true") await view.click();
      const expires = dialog.locator("#authority-expiration"); await expires.fill(h.localInput(new Date(Date.now() - 86400000))); await dialog.locator("#authority-reason").fill(`בדיקה ${h.runId}`);
      await noPost(async () => { await dialog.getByRole("button", { name: "שמירת השינוי", exact: true }).click(); await invalid(expires); });
      await h.poll(() => expires.evaluate((node) => document.activeElement === node), Boolean, 5000);
    } finally { await dialog.locator("#authority-expiration").fill(""); await dialog.locator("#authority-reason").fill(""); await close(dialog); }
    return { missingStaffAndActionsRejected: true, expiredRejectedAndFocused: true, mentorApprovalDisabled: true, commands: 0 };
  });
  await h.scenario("Restore requires a reason for the run-owned recycled participant", async () => {
    const deletion = await open("העברת כרטיס לסל המחזור");
    await deletion.locator("#authority-reason").fill(`בדיקה ${h.runId}: העברה`);
    await h.action("delete_participant", () => deletion.getByRole("button", { name: "העברה לסל המחזור", exact: true }).click());
    await h.poll(() => h.participant(id), (view) => Boolean(view?.participant.deletedAt));
    await h.openParticipant(id, "פרטי החניכה והליווי");
    await page.getByRole("button", { name: "שחזור כרטיס מסל המחזור", exact: true }).click();
    const dialog = page.getByRole("dialog"), reason = dialog.locator("#authority-reason"), save = dialog.getByRole("button", { name: "שחזור הכרטיס", exact: true });
    await wait(reason); await reason.fill("   "); assert.equal(await save.isDisabled(), true);
    assert.equal(await reason.getAttribute("maxlength"), "2000"); await reason.fill("x".repeat(2010)); assert.equal((await reason.inputValue()).length, 2000);
    await reason.fill(`בדיקה ${h.runId}: שחזור`);
    await h.action("restore_participant", () => save.click());
    await h.poll(() => h.participant(id), (view) => view?.participant.deletedAt === null);
    return { whitespaceReasonDisabled: true, reasonMax: 2000, ownFixtureRestored: true };
  });
}
