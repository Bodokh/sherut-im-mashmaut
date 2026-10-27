import assert from "node:assert/strict";

const desktop = { width: 1440, height: 1000 };
const mobile = { width: 390, height: 844 };

/** Browser instrumentation only. No workspace records, commands, identity, or
 * stored business data are created or modified by this module. */
function installPageGuard({ key, binding }) {
  if (sessionStorage.getItem(key) !== "enabled" || window[key]) return;
  const originalFetch = window.fetch;
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const blocked = new WeakMap();
  const state = { enabled: true };
  const mutation = (url, method) => new URL(String(url), location.href).pathname.startsWith("/api/mentoring/") && !["GET", "HEAD", "OPTIONS"].includes(String(method).toUpperCase());
  const record = () => { void window[binding]().catch(() => {}); };
  const guardedFetch = function (input, options) {
    const url = input instanceof Request ? input.url : input;
    const method = options?.method ?? (input instanceof Request ? input.method : "GET");
    if (state.enabled && mutation(url, method)) { record(); return Promise.reject(new DOMException("Read-only style check blocks mentoring mutations.", "SecurityError")); }
    return originalFetch.call(this, input, options);
  };
  const guardedOpen = function (method, url, ...rest) { blocked.set(this, mutation(url, method)); return originalOpen.call(this, method, url, ...rest); };
  const guardedSend = function (...args) {
    if (state.enabled && blocked.get(this)) { record(); throw new DOMException("Read-only style check blocks mentoring mutations.", "SecurityError"); }
    return originalSend.apply(this, args);
  };
  window.fetch = guardedFetch; XMLHttpRequest.prototype.open = guardedOpen; XMLHttpRequest.prototype.send = guardedSend;
  window[key] = {
    restore() {
      state.enabled = false;
      if (window.fetch === guardedFetch) window.fetch = originalFetch;
      if (XMLHttpRequest.prototype.open === guardedOpen) XMLHttpRequest.prototype.open = originalOpen;
      if (XMLHttpRequest.prototype.send === guardedSend) XMLHttpRequest.prototype.send = originalSend;
      delete window[key]; sessionStorage.removeItem(key);
    },
  };
}

async function readOnlyGuards(h) {
  const context = h.context, page = h.page;
  const key = `__mentoringStyleGuard_${h.runId}_${Date.now()}`;
  const binding = `${key}_attempt`;
  const counts = { pageBlocked: 0, networkBlocked: 0, mutationRequests: 0 };
  let active = true;
  const pattern = /\/api\/mentoring\//;
  const request = value => {
    if (active && new URL(value.url()).origin === h.baseURL && pattern.test(new URL(value.url()).pathname) && !["GET", "HEAD", "OPTIONS"].includes(value.method())) counts.mutationRequests++;
  };
  const handler = async route => {
    const value = route.request();
    const url = new URL(value.url());
    if (url.origin === h.baseURL && url.pathname.startsWith("/api/mentoring/") && !["GET", "HEAD", "OPTIONS"].includes(value.method())) { counts.networkBlocked++; await route.abort("blockedbyclient"); }
    else await route.continue();
  };
  const restore = async () => {
    try {
      await h.page.evaluate(key => { window[key]?.restore(); sessionStorage.removeItem(key); }, key);
    } finally {
      try { await context.unroute(pattern, handler); }
      finally { context.off("request", request); active = false; }
    }
  };
  try {
    await context.exposeBinding(binding, () => { if (active) counts.pageBlocked++; });
    await context.route(pattern, handler);
    context.on("request", request);
    await context.addInitScript(installPageGuard, { key, binding });
    await page.evaluate(key => sessionStorage.setItem(key, "enabled"), key);
    await page.evaluate(installPageGuard, { key, binding });
    return { counts, restore };
  } catch (error) { await restore().catch(() => {}); throw error; }
}

const noOverflow = async h => {
  const value = await h.page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.ok(value.document <= value.viewport + 1 && value.body <= value.viewport + 1, `Horizontal overflow: ${JSON.stringify(value)}`);
  return value;
};

async function capture(h, name) {
  await h.page.evaluate(() => document.fonts.ready.then(() => true));
  const file = await h.screenshot(name, { fullPage: false });
  console.log(JSON.stringify({ curatedStylePreview: { name, file } }));
  return file;
}

async function dashboardBoxes(h) {
  return h.page.evaluate(() => {
    const box = element => { const rect = element.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom, height: rect.height }; };
    const top = [...document.querySelector('section[aria-label="תמונת המצב"]').children].map(box);
    const attention = document.getElementById("attention");
    const lower = [...attention.parentElement.children].filter(element => element.matches('[data-slot="card"]')).map(box);
    const footers = [...document.querySelectorAll('#mentoring-content [data-slot="card"]')].flatMap(card => {
      const footer = [...card.children].find(child => child.matches('[data-slot="card-footer"]'));
      if (!footer) return [];
      return [{ card: box(card), footer: box(footer), bottomGap: card.getBoundingClientRect().bottom - footer.getBoundingClientRect().bottom, paddingBottom: getComputedStyle(card).paddingBottom }];
    });
    return { top, lower, footers };
  });
}

function assertBoxes(value, sameRows) {
  assert.equal(value.top.length, 3); assert.equal(value.lower.length, 2); assert.equal(value.footers.length, 4);
  if (sameRows) for (const row of [value.top, value.lower]) {
    assert.ok(Math.max(...row.map(box => box.height)) - Math.min(...row.map(box => box.height)) <= 1, `Unequal card heights: ${JSON.stringify(row)}`);
    assert.ok(Math.max(...row.map(box => box.top)) - Math.min(...row.map(box => box.top)) <= 1, `Misaligned card tops: ${JSON.stringify(row)}`);
  }
  for (const footer of value.footers) {
    assert.ok(Math.abs(footer.bottomGap) <= 1, `White strip below footer: ${JSON.stringify(footer)}`);
    assert.equal(parseFloat(footer.paddingBottom), 0);
  }
}

async function header(h, expected) {
  await h.poll(() => h.page.locator('[data-connection]').textContent(), text => text.trim() === expected);
  const result = await h.page.evaluate(() => {
    const node = document.querySelector('[data-slot="sidebar-inset"] > header');
    const navigation = node.firstElementChild;
    const box = element => { const rect = element.getBoundingClientRect(); return { top: rect.top, height: rect.height, middle: rect.top + rect.height / 2 }; };
    return { label: node.querySelector('[data-connection]').textContent.trim(), header: box(node), navigation: box(navigation), separator: box(navigation.querySelector('[data-slot="separator"]')), trigger: box(navigation.querySelector('[data-slot="sidebar-trigger"]')), title: box(navigation.querySelector("p")) };
  });
  assert.equal(result.label, expected); assert.ok(Math.abs(result.separator.height - 20) <= .5, `Divider height: ${result.separator.height}`);
  for (const key of ["navigation", "separator", "trigger", "title"]) assert.ok(Math.abs(result[key].middle - result.header.middle) <= 1, `Header centers: ${JSON.stringify(result)}`);
  return result;
}

async function colors(h, selector) {
  return h.page.locator(selector).evaluate((element, selector) => {
    const style = getComputedStyle(element), canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const rgba = color => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].map((n, i) => i === 3 ? n / 255 : n); };
    const mix = (a, b) => { const alpha = a[3] + b[3] * (1 - a[3]); return alpha ? [0, 1, 2].map(i => (a[i] * a[3] + b[i] * b[3] * (1 - a[3])) / alpha).concat(alpha) : [0, 0, 0, 0]; };
    const background = start => { let result = [0, 0, 0, 0]; for (let node = start; node; node = node.parentElement) { result = mix(result, rgba(getComputedStyle(node).backgroundColor)); if (result[3] > .999) break; } return mix(result, [255, 255, 255, 1]); };
    const luminance = rgb => { const parts = rgb.slice(0, 3).map(value => { const n = value / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; }); return .2126 * parts[0] + .7152 * parts[1] + .0722 * parts[2]; };
    const ratio = (a, b) => { const first = luminance(a), second = luminance(b); return (Math.max(first, second) + .05) / (Math.min(first, second) + .05); };
    const inside = background(element), outside = background(element.parentElement), border = mix(rgba(style.borderTopColor), outside), text = mix(rgba(style.color), inside);
    return { selector, osDark: matchMedia("(prefers-color-scheme: dark)").matches, colorScheme: style.colorScheme, inside, outside, border, text, normalBorderVsOutside: ratio(border, outside), normalBorderVsInside: ratio(border, inside), textContrast: ratio(text, inside), focused: element === document.activeElement, focusVisible: element.matches(":focus-visible") };
  }, selector);
}

async function editable(h, locator) { await locator.waitFor({ state: "visible" }); await h.poll(() => locator.isEnabled(), Boolean); }

/** Called by the exclusive parent only after actual mentor/offline acceptance.
 * Importing this module performs no browser startup, authentication, file or
 * environment reads, database work, provider calls, or fixture creation. */
export async function runStyleScenarios(h) {
  const initial = await h.snapshot();
  assert.equal(initial.actor.role, "ceo");
  const participant = initial.participants.find(view => view.participant.id === h.fixture.participantId);
  assert.ok(participant && participant.contacts.length >= 2, "Style checks require the populated participant with two accepted contacts.");
  const fixtureStaff = initial.staff.filter(member => h.manifest.staffIds.includes(member.id));
  assert.ok(fixtureStaff.length >= 3, "Style checks require at least three actual fixture staff rows.");
  const longestEmail = Math.max(...fixtureStaff.map(member => member.email?.length ?? 0));
  const longestCoordinatorName = Math.max(0, ...fixtureStaff.filter(member => member.role === "coordinator").map(member => member.displayName.length));
  assert.ok(longestEmail >= 64 && longestCoordinatorName >= 64, "The real style fixture must include long email and coordinator-name rows (64+ characters).");
  const guards = await readOnlyGuards(h), previews = {}, results = [];
  try {
    results.push(await h.scenario("Populated dashboard cards have equal row heights and flush footer bottoms", async () => {
      await h.page.setViewportSize(desktop); await h.navigate("/staff");
      const boxes = await dashboardBoxes(h); const geometry = await noOverflow(h);
      previews.dashboard = await capture(h, "curated-style-dashboard-desktop");
      assertBoxes(boxes, true); return { boxes, geometry, screenshot: previews.dashboard };
    }, { criteria: ["AC-18", "TA-11"] }));
    results.push(await h.scenario("Online and Offline header states retain the centered 20px divider", async () => {
      await h.page.setViewportSize(desktop); await h.navigate("/staff");
      const online = await header(h, "Online"); let offline;
      try { await h.context.setOffline(true); offline = await header(h, "Offline"); }
      finally { await h.context.setOffline(false); }
      await header(h, "Online"); await h.page.setViewportSize(mobile);
      const mobileHeader = await header(h, "Online"), mobileBoxes = await dashboardBoxes(h), geometry = await noOverflow(h);
      assertBoxes(mobileBoxes, false);
      return { online, offline, mobileHeader, mobileFooterBoxes: mobileBoxes.footers, geometry };
    }, { criteria: ["AC-18", "TA-11"] }));
    results.push(await h.scenario("Long populated team rows fit and expose a 44px icon edit control with tooltip", async () => {
      await h.page.setViewportSize(desktop); await h.navigate("/staff/team");
      const geometry = await noOverflow(h);
      const table = await h.page.locator("table").evaluate(node => ({ width: node.getBoundingClientRect().width, parentWidth: node.parentElement.clientWidth }));
      assert.ok(table.width <= table.parentWidth + 1, `The desktop table exceeds its visible container: ${JSON.stringify(table)}`);
      const edit = h.page.getByRole("button", { name: "עריכת פרטים", exact: true }).first(); await edit.waitFor();
      const button = await edit.evaluate(node => { const rect = node.getBoundingClientRect(); return { width: rect.width, height: rect.height, label: node.getAttribute("aria-label"), visibleText: node.textContent.trim(), icons: node.querySelectorAll("svg").length }; });
      previews.team = await capture(h, "curated-style-team-desktop");
      assert.ok(button.width >= 44 && button.height >= 44); assert.equal(button.label, "עריכת פרטים"); assert.equal(button.visibleText, ""); assert.ok(button.icons > 0);
      await edit.hover();
      const popup = h.page.locator('[data-slot="tooltip-content"]').filter({ hasText: /^עריכת פרטי הצוות$/ });
      await popup.waitFor({ state: "visible" });
      const tooltip = { text: (await popup.innerText()).trim(), role: await popup.getAttribute("role"), triggerLabel: await edit.getAttribute("aria-label") };
      assert.equal(tooltip.text, "עריכת פרטי הצוות"); assert.equal(tooltip.triggerLabel, "עריכת פרטים");
      await edit.click(); const dialog = h.page.getByRole("dialog"); await dialog.waitFor(); await editable(h, dialog.getByLabel("שם מלא", { exact: true }));
      await h.page.setViewportSize(mobile); const mobileGeometry = await noOverflow(h);
      await dialog.getByRole("button", { name: "סגירה ושמירת הטיוטה", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
      return { fixtureStaff: fixtureStaff.length, longestEmail, longestCoordinatorName, geometry, mobileGeometry, table, button, tooltip, openedWithoutSubmission: true, screenshot: previews.team };
    }, { criteria: ["AC-18", "TA-11"] }));
    results.push(await h.scenario("Contact inputs selects and textareas stay light and readable in OS light and dark modes", async () => {
      await h.page.setViewportSize(desktop); await h.navigate(`/staff/contacts/new?participant=${h.fixture.participantId}`); await editable(h, h.page.locator("#contact-notes"));
      const fields = [];
      try {
        for (const scheme of ["light", "dark"]) {
          await h.page.emulateMedia({ colorScheme: scheme });
          for (const [kind, selector] of [["input", "#contact-occurredAt"], ["select", "#contact-method"], ["textarea", "#contact-notes"]]) {
            await editable(h, h.page.locator(selector)); await h.page.locator("#mentoring-content h1").first().click();
            const normal = await colors(h, selector);
            await h.page.locator(selector).focus(); await h.page.keyboard.press("Tab"); await h.page.keyboard.press("Shift+Tab");
            const focused = await colors(h, selector); fields.push({ scheme, kind, normal, focused });
            assert.ok(normal.inside.slice(0, 3).every(channel => channel >= 245), `Darkened field: ${JSON.stringify({ scheme, kind, rgb: normal.inside })}`);
            assert.ok(normal.normalBorderVsOutside >= 3 && normal.normalBorderVsInside >= 3, `Field boundary below 3:1: ${JSON.stringify({ scheme, kind, ratio: normal.normalBorderVsOutside })}`);
            assert.ok(normal.textContrast >= 4.5); assert.ok(focused.focusVisible && focused.normalBorderVsOutside >= 3);
          }
        }
      } finally { await h.page.emulateMedia({ colorScheme: "light" }); }
      await h.page.setViewportSize(mobile); const geometry = await noOverflow(h);
      await h.page.locator('[data-slot="card"]').filter({ has: h.page.getByText("פרטי הקשר", { exact: true }) }).evaluate(node => window.scrollTo(0, window.scrollY + node.getBoundingClientRect().top - 96));
      previews.mobileForm = await capture(h, "curated-style-contact-form-mobile");
      return { fields, geometry, screenshot: previews.mobileForm };
    }, { criteria: ["AC-18", "TA-11"] }));
    results.push(await h.scenario("Populated monthly oversight remains readable without desktop overflow", async () => {
      await h.page.setViewportSize(desktop); await h.navigate("/staff/oversight"); await h.page.locator("#oversight-month").waitFor();
      const geometry = await noOverflow(h); previews.oversight = await capture(h, "curated-style-oversight-desktop");
      return { geometry, screenshot: previews.oversight };
    }, { criteria: ["AC-18", "TA-11"] }));
  } finally {
    try { await h.context.setOffline(false); await h.page.emulateMedia({ colorScheme: "light" }); await h.page.setViewportSize(desktop); }
    finally { await guards.restore(); }
  }
  results.push(await h.scenario("Style verification performed no mentoring mutations and restored its guards", async () => {
    assert.deepEqual(guards.counts, { pageBlocked: 0, networkBlocked: 0, mutationRequests: 0 });
    return { ...guards.counts, guardsRestored: true, screenshots: previews };
  }, { criteria: ["AC-18", "TA-11"] }));
  return { passed: results.every(Boolean), previews };
}
