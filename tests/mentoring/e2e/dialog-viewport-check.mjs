import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const base = new URL(process.env.MENTORING_BASE_URL ?? "http://localhost:3000");
if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)) {
  throw new Error("This dialog viewport runner only permits localhost.");
}
if (!["http:", "https:"].includes(base.protocol) || base.pathname !== "/" || base.search || base.hash || base.username || base.password) {
  throw new Error("MENTORING_BASE_URL must be a local HTTP(S) origin without a path, query, or credentials.");
}

const phase = process.env.DIALOG_VIEWPORT_PHASE ?? "after";
assert.ok(["before", "after"].includes(phase), "DIALOG_VIEWPORT_PHASE must be before or after.");
const artifacts = resolve(process.env.MENTORING_E2E_ARTIFACTS ?? "/opt/cursor/artifacts");
await mkdir(artifacts, { recursive: true });

let playwright;
try {
  playwright = await import("playwright");
} catch {
  if (!process.env.PLAYWRIGHT_MODULE_DIR) throw new Error("Install Playwright or set PLAYWRIGHT_MODULE_DIR.");
  playwright = createRequire(resolve(process.env.PLAYWRIGHT_MODULE_DIR, "../package.json"))("playwright");
}

const viewports = [
  { name: "tablet_landscape_1024x600", width: 1024, height: 600 },
  { name: "tablet_portrait_600x1024", width: 600, height: 1024 },
  { name: "phone_390x844", width: 390, height: 844 },
];
const popups = [
  { id: "add-staff", slot: "dialog-content", path: "/dialog-harness?popup=add-staff" },
  { id: "alert", slot: "alert-dialog-content", path: "/dialog-harness?popup=alert" },
];

const browser = await playwright.chromium.launch({
  headless: true,
  ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}),
});

const results = [];
const failures = [];

function record(name, fn) {
  try {
    fn();
    results.push({ name, status: "passed" });
  } catch (error) {
    failures.push({ name, message: error.message });
    results.push({ name, status: "failed", message: error.message });
  }
}

function slotSelector(slot) {
  return `[data-slot="${slot}"]`;
}

function assertFullyVisible(box, viewport, label) {
  assert.ok(box, `${label} is missing a bounding box`);
  assert.ok(box.width > 32 && box.height > 32, `${label} is too small: ${box.width}x${box.height}`);
  assert.ok(box.x >= -1, `${label} is cut off on the left (${box.x})`);
  assert.ok(box.y >= -1, `${label} is cut off at the top (${box.y})`);
  assert.ok(box.x + box.width <= viewport.width + 1, `${label} is cut off on the right (${box.x + box.width} > ${viewport.width})`);
  assert.ok(box.y + box.height <= viewport.height + 1, `${label} is cut off at the bottom (${box.y + box.height} > ${viewport.height})`);
}

function assertCentered(box, viewport, label) {
  const dx = Math.abs(box.x + box.width / 2 - viewport.width / 2);
  const dy = Math.abs(box.y + box.height / 2 - viewport.height / 2);
  assert.ok(dx <= 24, `${label} is not horizontally centred (dx=${dx.toFixed(1)})`);
  assert.ok(dy <= 24, `${label} is not vertically centred (dy=${dy.toFixed(1)})`);
}

async function simulateLimitedCss(page) {
  await page.addStyleTag({
    content: "html, body, [data-slot] { translate: none !important; }",
  });
  await page.evaluate(() => {
    const visit = (rules) => {
      for (const rule of rules) {
        if (rule.style) {
          for (const property of [...rule.style]) {
            const value = rule.style.getPropertyValue(property);
            if (value.includes("dvh") || property === "translate") {
              rule.style.removeProperty(property);
            }
          }
        }
        if (rule.cssRules) visit(rule.cssRules);
      }
    };
    for (const sheet of document.styleSheets) {
      try { visit(sheet.cssRules); } catch { /* cross-origin or constructed sheets */ }
    }
  });
}

async function capture(page, name, locator) {
  const path = resolve(artifacts, `${phase}_${name}.png`);
  await page.screenshot({ path, fullPage: false });
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  return { path, box, viewport };
}

try {
  const probe = await playwright.chromium.launch({ headless: true });
  const probePage = await (await probe.newContext()).newPage();
  const ready = await probePage.goto(`${base.origin}/dialog-harness?popup=add-staff`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  assert.ok(ready, "The dialog harness did not respond.");
  assert.notEqual(ready.status(), 404, "The dialog harness is unavailable. Run against next dev, or next start with DIALOG_HARNESS=1.");
  assert.equal(ready.status(), 200, `Dialog harness returned HTTP ${ready.status()}.`);
  await probe.close();

  for (const viewport of viewports) {
    for (const popup of popups) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        locale: "he-IL",
        timezoneId: "Asia/Jerusalem",
      });
      const page = await context.newPage();
      const response = await page.goto(`${base.origin}${popup.path}`, { waitUntil: "networkidle", timeout: 60_000 });
      assert.equal(response?.status(), 200);
      assert.equal(await page.locator("html").getAttribute("dir"), "rtl");
      const locator = page.locator(slotSelector(popup.slot));
      await locator.waitFor({ state: "visible", timeout: 15_000 });
      await page.waitForTimeout(250);
      const shot = await capture(page, `${popup.id}_${viewport.name}`, locator);
      record(`${popup.id} ${viewport.name}`, () => {
        assertFullyVisible(shot.box, shot.viewport, `${phase} ${popup.id} ${viewport.name}`);
        assertCentered(shot.box, shot.viewport, `${phase} ${popup.id} ${viewport.name}`);
      });
      results.at(-1).screenshot = shot.path;
      results.at(-1).box = shot.box;
      await context.close();
    }
  }

  const limitedViewport = viewports[1];
  for (const popup of popups) {
    const context = await browser.newContext({
      viewport: { width: limitedViewport.width, height: limitedViewport.height },
      locale: "he-IL",
      timezoneId: "Asia/Jerusalem",
    });
    const page = await context.newPage();
    const response = await page.goto(`${base.origin}${popup.path}`, { waitUntil: "networkidle", timeout: 60_000 });
    assert.equal(response?.status(), 200);
    const locator = page.locator(slotSelector(popup.slot));
    await locator.waitFor({ state: "visible", timeout: 15_000 });
    await simulateLimitedCss(page);
    await page.waitForTimeout(250);
    const shot = await capture(page, `limited_css_${popup.id}_${limitedViewport.name}`, locator);
    record(`limited css ${popup.id} ${limitedViewport.name}`, () => {
      assertFullyVisible(shot.box, shot.viewport, `${phase} limited ${popup.id}`);
      assertCentered(shot.box, shot.viewport, `${phase} limited ${popup.id}`);
    });
    results.at(-1).screenshot = shot.path;
    results.at(-1).box = shot.box;
    if (popup.id === "add-staff") {
      const role = page.getByText("תפקיד במערכת", { exact: true });
      await role.scrollIntoViewIfNeeded();
      const roleVisible = await role.isVisible();
      record("limited css add-staff role reachable", () => {
        assert.equal(roleVisible, true, "The role field must remain reachable by scrolling.");
      });
    }
    await context.close();
  }

  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "he-IL" });
  const desktopPage = await desktop.newPage();
  await desktopPage.goto(`${base.origin}/dialog-harness?popup=add-staff`, { waitUntil: "networkidle", timeout: 60_000 });
  const desktopDialog = desktopPage.locator(slotSelector("dialog-content"));
  await desktopDialog.waitFor({ state: "visible" });
  const desktopShot = await capture(desktopPage, "add-staff_desktop_1280x800", desktopDialog);
  record("add-staff desktop 1280x800", () => {
    assertFullyVisible(desktopShot.box, desktopShot.viewport, `${phase} desktop add-staff`);
    assertCentered(desktopShot.box, desktopShot.viewport, `${phase} desktop add-staff`);
  });
  results.at(-1).screenshot = desktopShot.path;
  results.at(-1).box = desktopShot.box;
  await desktop.close();
} finally {
  await browser.close();
  await writeFile(resolve(artifacts, `${phase}_dialog-viewport-report.json`), JSON.stringify({ phase, results, failures }, null, 2));
}

console.log(JSON.stringify({ phase, passed: results.filter((item) => item.status === "passed").length, failed: failures.length, artifacts }, null, 2));
if (failures.length) {
  throw new Error(failures.map((item) => `${item.name}: ${item.message}`).join("\n"));
}
