import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const AXE_VERSION = "4.12.1";
export const AXE_SHA256 = "66a8aaa95a8b044a7fd74a5435873bf04ff65a1ca75567c921b7509742085a14";
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
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
// Authentication widgets and cross-origin frames belong to separate acceptance.
const authentication = ".cl-rootBox, [data-clerk-component], input[type='password'], input[autocomplete='one-time-code']";

async function auditAxe(page, source) {
  await page.addScriptTag({ content: source });
  return page.evaluate(async ({ version, tags, authentication }) => {
    if (window.axe?.version !== version) return { status: "failed", code: "axe_version_mismatch" };
    // Enabled controls can appear while the dialog's fade/zoom is still active.
    const readinessStarted = performance.now();
    await new Promise((resolve) => setTimeout(resolve, 500));
    const readinessWaitMs = Math.round(performance.now() - readinessStarted);
    window.axe.configure({ noHtml: true, allowedOrigins: [] });
    const allowedIds = new Set(window.axe.getRules(tags).map((rule) => rule.ruleId));
    let timer;
    try {
      const result = await Promise.race([
        window.axe.run({ exclude: [authentication, "iframe"] }, {
          runOnly: { type: "tag", values: tags },
          resultTypes: ["violations", "incomplete"],
          selectors: false, ancestry: false, xpath: false, elementRef: false,
          iframes: false, preload: false, performanceTimer: false,
        }),
        new Promise((resolve) => { timer = setTimeout(() => resolve(null), 30_000); }),
      ]);
      if (!result) return { status: "failed", code: "axe_timeout", readinessWaitMs };
      // Only package-defined IDs and fixed severity enums cross the page boundary.
      // Never return nodes, selectors, HTML, names, values or failure summaries.
      const summarize = (rows) => rows.map((rule) => ({
        id: allowedIds.has(rule.id) ? rule.id : "unrecognized-rule",
        impact: ["minor", "moderate", "serious", "critical"].includes(rule.impact) ? rule.impact : null,
        count: rule.nodes.length,
      })).sort((a, b) => a.id.localeCompare(b.id));
      return {
        status: result.violations.length ? "failed" : result.incomplete.length ? "needs_review" : "passed",
        readinessWaitMs,
        violations: summarize(result.violations), incomplete: summarize(result.incomplete),
        passedRuleCount: result.passes.length, inapplicableRuleCount: result.inapplicable.length,
        excludedAuthenticationElements: document.querySelectorAll(authentication).length,
        excludedFrames: document.querySelectorAll("iframe").length,
      };
    } catch {
      return { status: "failed", code: "axe_scan_failed", readinessWaitMs };
    } finally { clearTimeout(timer); }
  }, { version: AXE_VERSION, tags, authentication });
}

async function textResizeSmoke(page, dialog) {
  return page.evaluate(async ({ authentication, dialog }) => {
    const scope = dialog ? document.querySelector("[role='dialog']") : document.querySelector("h1");
    const walker = scope && document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    let text = walker?.nextNode();
    while (text && !text.textContent.trim()) text = walker.nextNode();
    if (!text) return { status: "not_tested", code: "no_visible_text_probe" };
    const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, 1);
    const glyphBefore = range.getBoundingClientRect().height;
    if (glyphBefore <= 0) return { status: "not_tested", code: "no_visible_text_probe" };
    const nodes = [...document.querySelectorAll("body, body *")].filter((node) =>
      node instanceof HTMLElement && node.getClientRects().length && !node.closest(authentication) &&
      !["SCRIPT", "STYLE", "NOSCRIPT"].includes(node.tagName));
    if (nodes.length > 20_000) return { status: "not_tested", code: "dom_bound_exceeded" };
    // Capture every computed value before modifying any ancestor: no compounding.
    const saved = nodes.map((node) => {
      const computed = getComputedStyle(node);
      return {
        node, font: Number.parseFloat(computed.fontSize), line: Number.parseFloat(computed.lineHeight),
        original: ["font-size", "line-height"].map((property) =>
          [property, node.style.getPropertyValue(property), node.style.getPropertyPriority(property)]),
      };
    });
    const scroll = { x: scrollX, y: scrollY };
    const beforeWidth = document.documentElement.scrollWidth;
    try {
      for (const entry of saved) {
        entry.node.style.setProperty("font-size", `${entry.font * 2}px`, "important");
        if (Number.isFinite(entry.line)) entry.node.style.setProperty("line-height", `${entry.line * 2}px`, "important");
      }
      // transition-all also interpolates font-size: retain the strict predicate
      // while giving the controlled resize up to one second to finish.
      const fontsMatch = () => saved.every(({ node, font }) => Math.abs(Number.parseFloat(getComputedStyle(node).fontSize) - font * 2) <= 0.1);
      const fontSettleStarted = performance.now();
      const fontSettleDeadline = fontSettleStarted + 1_000;
      let fontsDoubled = fontsMatch();
      while (!fontsDoubled && performance.now() < fontSettleDeadline) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(50, Math.max(0, fontSettleDeadline - performance.now()))));
        fontsDoubled = fontsMatch();
      }
      const fontSettleWaitMs = Math.round(performance.now() - fontSettleStarted);
      // Reading glyph bounds forces layout; background-tab rAF is unnecessary.
      const glyphRatio = range.getBoundingClientRect().height / glyphBefore;
      const width = innerWidth, scrollWidth = document.documentElement.scrollWidth;
      const popup = dialog ? document.querySelector("[role='dialog']")?.getBoundingClientRect() : null;
      const popupFits = !dialog || Boolean(popup && popup.left >= -1 && popup.right <= width + 1);
      return {
        status: fontsDoubled && glyphRatio >= 1.8 && glyphRatio <= 2.2 && scrollWidth <= width + 1 && popupFits ? "passed" : "failed",
        resizedElementCount: saved.length, computedFontsDoubled: fontsDoubled,
        fontSettleWaitMs, fontSettleTimedOut: !fontsDoubled,
        glyphHeightRatio: Math.round(glyphRatio * 100) / 100,
        viewportWidth: width, beforeScrollWidth: beforeWidth, resizedScrollWidth: scrollWidth,
        dialogFitsHorizontally: popupFits,
      };
    } finally {
      for (const { node, original } of saved) {
        for (const [property, value, priority] of original) {
          if (value) node.style.setProperty(property, value, priority);
          else node.style.removeProperty(property);
        }
      }
      scrollTo(scroll.x, scroll.y);
    }
  }, { authentication, dialog });
}

/**
 * The owner supplies an already authenticated, guarded read-only h context and
 * a private local copy of the pinned official axe source. Never launches a
 * browser, loads credentials, writes app data or submits a form.
 *
 * Store this returned report directly. Do not pass failures through a generic
 * screenshot/DOM-diagnostic recorder: its privacy boundary is stricter.
 */
export async function runAccessibilityChecks(h, { axeSourcePath } = {}) {
  const report = {
    standard: "WCAG 2.1 A/AA automated subset", axeVersion: AXE_VERSION, axeSha256: AXE_SHA256,
    scope: "Eight authenticated staff routes and the unsubmitted participant dialog; top document only",
    textResizeMethod: "Computed text and line-height doubled, verified with computed fonts and a rendered glyph; horizontal reflow smoke only",
    limits: ["Native browser zoom not tested", "Text resize is a controlled approximation, not native text-only zoom", "Authentication widgets and frames excluded", "No screen reader or full WCAG certification", "No content-loss, clipping or full interaction proof at enlarged text"],
    steps: [],
  };
  let source;
  try {
    const bytes = await readFile(axeSourcePath);
    if (createHash("sha256").update(bytes).digest("hex") !== AXE_SHA256) throw new Error();
    source = bytes.toString("utf8");
  } catch { return { ...report, status: "failed", code: "axe_source_unavailable_or_unapproved" }; }
  let originalViewport;
  try {
    originalViewport = h.page.viewportSize();
    await h.assertNoMutations();
    await h.page.setViewportSize({ width: 1440, height: 1000 });
    for (const [route, heading] of routes) {
      const step = { route, view: "page" };
      try {
        await h.navigate(route, heading);
        await h.page.locator(".staff-app #mentoring-content").waitFor({ state: "visible", timeout: 15_000 });
        step.axe = await auditAxe(h.page, source);
        step.textResize = await textResizeSmoke(h.page, false);
      } catch { step.status = "failed"; step.code = "route_audit_failed"; }
      report.steps.push(step);
      await h.assertNoMutations();
    }
    const step = { route: "/staff/participants", view: "new-participant-dialog" };
    try {
      await h.navigate("/staff/participants", "החניכות");
      await h.page.getByRole("button", { name: "חניכה חדשה", exact: true }).click({ timeout: 10_000 });
      const dialog = h.page.getByRole("dialog");
      await dialog.getByLabel("שם החניכה", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
      await h.page.locator("#participant-name:enabled").waitFor({ state: "visible", timeout: 15_000 });
      step.axe = await auditAxe(h.page, source);
      step.textResize = await textResizeSmoke(h.page, true);
      await h.page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden", timeout: 5_000 });
    } catch { step.status = "failed"; step.code = "dialog_audit_failed"; }
    report.steps.push(step);
    await h.assertNoMutations();
  } catch { report.code = "read_only_guard_or_context_failed"; }
  finally {
    try {
      if (originalViewport) await h.page.setViewportSize(originalViewport);
      await h.assertNoMutations();
    } catch { report.code = "read_only_guard_or_context_failed"; }
  }
  const findings = report.steps.flatMap((step) => [step.status, step.axe?.status, step.textResize?.status]);
  report.status = report.code || findings.includes("failed") ? "failed" : findings.includes("not_tested") || findings.includes("needs_review") ? "needs_review" : "passed";
  report.auditedViewCount = report.steps.length;
  report.mentoringMutationAttempts = report.code === "read_only_guard_or_context_failed" ? "unverified" : 0;
  return report;
}
