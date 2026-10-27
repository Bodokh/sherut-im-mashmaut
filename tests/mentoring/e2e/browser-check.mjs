import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const base = new URL(process.env.MENTORING_BASE_URL ?? "http://localhost:3000");
if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)) {
  throw new Error("This development acceptance runner only permits localhost.");
}
if (!["http:", "https:"].includes(base.protocol) || base.pathname !== "/" || base.search || base.hash || base.username || base.password) {
  throw new Error("MENTORING_BASE_URL must be a local HTTP(S) origin without a path, query, or credentials.");
}
const baseURL = base.origin;
const artifacts = resolve(process.env.MENTORING_E2E_ARTIFACTS ?? "/tmp/sherut-mentoring-qa/browser");
await mkdir(artifacts, { recursive: true });
let playwright;
try {
  playwright = await import("playwright");
} catch {
  if (!process.env.PLAYWRIGHT_MODULE_DIR) throw new Error("Install Playwright or set PLAYWRIGHT_MODULE_DIR to its node_modules directory.");
  const require = createRequire(resolve(process.env.PLAYWRIGHT_MODULE_DIR, "../package.json"));
  playwright = require("playwright");
}

const results = [];
const browser = await playwright.chromium.launch({
  headless: true,
  ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}),
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "he-IL", timezoneId: "Asia/Jerusalem" });
const page = await context.newPage();
const consoleErrors = [];
page.on("pageerror", (error) => consoleErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text().replace(/https?:\/\/[^\s]+/g, "[URL omitted]"));
});

async function scenario(name, run) {
  const startedAt = Date.now();
  try {
    const evidence = await run();
    results.push({ name, status: "passed", durationMs: Date.now() - startedAt, ...evidence });
  } catch (error) {
    const screenshot = resolve(artifacts, `failure-${results.length + 1}.png`);
    await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
    results.push({ name, status: "failed", durationMs: Date.now() - startedAt, message: error.message, screenshot });
  }
}

try {
  await scenario("Public home, about, and contact remain accessible without staff identity", async () => {
    const pages = [];
    for (const path of ["/", "/about", "/contact"]) {
      const response = await page.goto(`${baseURL}${path}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      assert.equal(response.status(), 200);
      await page.locator("h1").first().waitFor({ state: "visible" });
      assert.equal(await page.locator("html").getAttribute("lang"), "he");
      assert.equal(await page.locator("html").getAttribute("dir"), "rtl");
      assert.equal(await page.locator("body").evaluate((body) => body.classList.contains("staff-app")), false);
      const metrics = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      assert.ok(metrics.scrollWidth <= metrics.width + 1, `${path} overflows horizontally`);
      pages.push({ path, title: await page.title(), headings: await page.locator("h1").count() });
    }
    const screenshot = resolve(artifacts, "public-contact-desktop.png");
    await page.screenshot({ path: screenshot, fullPage: true });
    return { pages, screenshot };
  });

  await scenario("Hebrew-prefixed public URL retains its canonical redirect", async () => {
    const response = await context.request.get(`${baseURL}/he/about`, { maxRedirects: 0 });
    assert.equal(response.status(), 308);
    assert.equal(new URL(response.headers().location, baseURL).pathname, "/about");
    return { httpStatus: response.status(), destination: "/about" };
  });

  await scenario("Unauthenticated staff routes redirect to the fixed login page", async () => {
    const routes = [];
    for (const path of ["/staff", "/staff/participants", "/staff/team", "/staff/reviews"]) {
      const response = await context.request.get(`${baseURL}${path}`, { maxRedirects: 0 });
      assert.equal(response.status(), 307);
      assert.equal(new URL(response.headers().location, baseURL).pathname, "/staff/login");
      assert.notEqual(response.headers()["x-mentoring-shell"], "anonymous-v1");
      routes.push(path);
    }
    return { routes };
  });

  await scenario("Private APIs reject anonymous reads and commands without HTML redirects", async () => {
    const workspace = await context.request.get(`${baseURL}/api/mentoring/workspace`);
    assert.equal(workspace.status(), 401);
    assert.equal((await workspace.json()).error.code, "not_authenticated");
    assert.match(workspace.headers()["cache-control"], /no-store/);
    const command = await context.request.post(`${baseURL}/api/mentoring/commands`, {
      headers: { origin: base.origin, "content-type": "application/json" }, data: {},
    });
    assert.equal(command.status(), 401);
    assert.equal((await command.json()).error.code, "not_authenticated");
    const external = await context.request.post(`${baseURL}/api/mentoring/commands`, {
      headers: { origin: "https://external.invalid", "content-type": "application/json" }, data: {},
    });
    assert.equal(external.status(), 403);
    assert.equal((await external.json()).error.code, "forbidden");
    return { workspace: 401, sameOriginCommand: 401, externalOriginCommand: 403 };
  });

  await scenario("Only the generic anonymous offline entry is eligible for explicit shell caching", async () => {
    const response = await context.request.get(`${baseURL}/staff/offline`);
    assert.equal(response.status(), 200);
    assert.equal(response.headers()["x-mentoring-shell"], "anonymous-v1");
    const html = await response.text();
    // Detect names even when Next Flight inline strings escape their JSON quotes.
    // This checks the anonymous response only; a signed-in response needs its own assertion.
    assert.ok(!/\bauthUserId\b/.test(html));
    assert.ok(!/\bofflineValidUntil\b/.test(html));
    assert.ok(!html.includes("mentoring-owner+clerk_test"));
    for (const path of ["/staff/login", "/staff/signup"]) {
      const auth = await context.request.get(`${baseURL}${path}`);
      assert.equal(auth.status(), 200);
      assert.match(auth.headers()["cache-control"], /no-store/);
      assert.notEqual(auth.headers()["x-mentoring-shell"], "anonymous-v1");
    }
    return { genericShellStatus: 200, privateDataEmbedded: false, authPagesMarkedCacheable: false };
  });

  await scenario("Login and password recovery controls work by keyboard without submitting a credential", async () => {
    await page.goto(`${baseURL}/staff/login`, { waitUntil: "domcontentloaded" });
    await page.getByLabel("כתובת דוא״ל", { exact: true }).waitFor({ state: "visible" });
    await page.waitForFunction(() => !document.getElementById("staff-email")?.disabled, null, { timeout: 30_000 });
    const email = page.getByLabel("כתובת דוא״ל", { exact: true });
    await email.focus();
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "staff-password");
    await page.getByRole("button", { name: "שכחת את הסיסמה?", exact: true }).click();
    await page.getByRole("heading", { name: "חזרה לחשבון", exact: true }).waitFor({ state: "visible" });
    assert.equal(await page.locator("#staff-password").count(), 0);
    await page.getByRole("button", { name: "חזרה לכניסה", exact: true }).click();
    await page.locator("#staff-password").waitFor({ state: "visible" });
    const screenshot = resolve(artifacts, "staff-login-desktop.png");
    await page.screenshot({ path: screenshot, fullPage: true });
    return { screenshot, credentialSubmitted: false };
  });

  await scenario("Mobile public and login pages fit a 390px viewport", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    const pages = [];
    for (const path of ["/", "/about", "/contact", "/staff/login"]) {
      await page.goto(`${baseURL}${path}`, { waitUntil: "domcontentloaded" });
      await page.locator("h1").first().waitFor({ state: "visible" });
      const metrics = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      assert.ok(metrics.scrollWidth <= metrics.width + 1, `${path} overflows horizontally: ${metrics.scrollWidth}`);
      pages.push({ path, ...metrics });
    }
    const screenshot = resolve(artifacts, "staff-login-mobile.png");
    await page.screenshot({ path: screenshot, fullPage: true });
    return { pages, screenshot };
  });

  await scenario("Anonymous browser journeys have no uncaught or console errors", async () => {
    assert.deepEqual(consoleErrors, []);
    return { consoleErrorCount: 0 };
  });

  results.push({ name: "Signed-in provider, staff, participant/contact, and offline reconnect journeys", status: "not_tested", reason: "Awaiting explicit approval for the development-only Clerk QA account; no credential creation was attempted." });
} finally {
  await context.close();
  await browser.close();
  const report = { baseURL, checkedAt: new Date().toISOString(), results, consoleErrors, summary: { passed: results.filter((r) => r.status === "passed").length, failed: results.filter((r) => r.status === "failed").length, notTested: results.filter((r) => r.status === "not_tested").length } };
  await writeFile(resolve(artifacts, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ report: resolve(artifacts, "report.json"), summary: report.summary, failures: results.filter((r) => r.status === "failed"), consoleErrorCount: consoleErrors.length }));
  if (report.summary.failed) process.exitCode = 1;
}
