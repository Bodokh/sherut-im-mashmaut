import assert from "node:assert/strict";

// Runs only against the caller's assigned synthetic participant and real authenticated browser.
export async function runContactValidation(h) {
  const page = h.page, id = h.fixture.participantId, marker = `בדיקת דפדפן ${h.runId} contact`;
  const wait = (loc) => h.poll(() => loc.isEnabled(), Boolean, 15000);
  const option = async (control, name) => { await control.click(); await page.getByRole("option", { name, exact: true }).click(); await page.getByRole("option", { name, exact: true }).waitFor({ state: "hidden" }); };
  const invalid = async (loc) => {
    await h.poll(() => loc.getAttribute("aria-invalid"), v => v === "true", 5000);
    const described = await loc.getAttribute("aria-describedby");
    assert.ok(described, "Invalid control must name its error");
    assert.ok((await page.locator(`[id="${described}"]`).innerText()).trim(), "Error text must be visible");
    await h.poll(() => loc.evaluate(el => el === document.activeElement), Boolean, 5000);
  };
  const guard = async (fn) => {
    const before = h.commandRequestCount; let intercepted = 0;
    const handler = async route => { if (route.request().method() === "POST") { intercepted++; await route.abort("blockedbyclient"); } else await route.fallback(); };
    await page.route("**/api/mentoring/commands", handler);
    try { await fn(); await new Promise(resolve => setTimeout(resolve, 750)); assert.equal(intercepted, 0, "An invalid save attempted a command POST"); assert.equal(h.commandRequestCount, before); }
    finally { await page.unroute("**/api/mentoring/commands", handler); }
  };
  const limit = async (loc, n) => { assert.equal(await loc.getAttribute("maxlength"), String(n)); await loc.fill("x".repeat(n + 10)); assert.equal((await loc.inputValue()).length, n); };
  const close = async d => { await d.getByRole("button", { name: /^סגירה/ }).first().click(); await d.waitFor({ state: "hidden" }); };
  const open = async title => {
    await h.openParticipant(id); await page.getByRole("button", { name: title, exact: true }).click();
    const d = page.getByRole("dialog", { name: title, exact: true }); await wait(d.locator("textarea").last()); return d;
  };
  let notesText = `${marker} baseline`, contactId;
  const entry = async title => {
    await h.openParticipant(id); await page.getByRole("tab", { name: /^היסטוריית קשר/ }).click();
    const card = page.getByRole("tabpanel", { name: /^היסטוריית קשר/ }).locator("article").filter({ has: page.getByText(notesText, { exact: true }) });
    await card.getByRole("button", { name: title, exact: true }).click();
    const d = page.getByRole("dialog", { name: title, exact: true }); await wait(d.getByLabel("סיבת השינוי", { exact: true })); return d;
  };
  const installFault = async key => page.evaluate(key => {
    const descriptor = Object.getOwnPropertyDescriptor(IDBObjectStore.prototype, "put");
    if (!descriptor?.configurable || window.__contactQuotaOwned) throw new Error("Cannot install exclusive draft fault");
    const state = { descriptor, hits: 0 }; window.__contactQuotaOwned = state;
    Object.defineProperty(IDBObjectStore.prototype, "put", { ...descriptor, value: function (...args) {
      if (this.transaction.db.name === "sherut-mentoring-private-v1" && this.name === "drafts" && args[0]?.draftKey === key) { state.hits++; throw new DOMException("QA owned preparation fault", "QuotaExceededError"); }
      return descriptor.value.apply(this, args);
    }});
  }, key);
  const restoreFault = async () => page.evaluate(() => { const s = window.__contactQuotaOwned; if (!s) throw new Error("Missing owned quota fault"); Object.defineProperty(IDBObjectStore.prototype, "put", s.descriptor); delete window.__contactQuotaOwned; return s.hits; });
  const cleanupFault = async () => page.evaluate(() => { const s = window.__contactQuotaOwned; if (s) { Object.defineProperty(IDBObjectStore.prototype, "put", s.descriptor); delete window.__contactQuotaOwned; } }).catch(() => {});
  const saved = "הטיוטה נשמרה במכשיר הזה", failed = "השמירה האוטומטית נכשלה. יש להשאיר את הטופס פתוח ולשמור את הדיווח לפני היציאה.";

  const createValidation = await h.scenario("Contact create: native controls, limits and guarded invalid dates", async () => {
    await h.navigate(`/staff/contacts/new?participant=${id}`);
    const occurred = page.locator("#contact-occurredAt"), next = page.locator("#contact-nextAppointmentAt"), notes = page.locator("#contact-notes"), save = page.getByRole("button", { name: "שמירת התיעוד והפגישה הבאה", exact: true });
    await wait(notes); await limit(notes, 20000); await notes.fill(notesText);
    await occurred.fill(""); await next.fill(""); await guard(async () => { await save.click(); await invalid(occurred); });
    await occurred.fill("2026-03-27T02:30"); await next.fill(h.localInput(new Date(Date.now() + 172800000)));
    await guard(async () => { await save.click(); await invalid(occurred); });
    await occurred.fill(h.localInput(new Date(Date.now() + 86400000)));
    await guard(async () => { await save.click(); await invalid(occurred); });
    await occurred.fill(h.localInput(new Date(Date.now() - 120000))); await next.fill("");
    await guard(async () => { await save.click(); await invalid(next); });
    await next.fill(await occurred.inputValue());
    await guard(async () => { await save.click(); await invalid(next); });
    await next.fill(h.localInput(new Date(Date.now() - 180000)));
    await guard(async () => { await save.click(); await invalid(next); });
    assert.equal(await notes.inputValue(), notesText);
    const method = page.locator("#contact-method"), outcome = page.locator("#contact-outcome"), color = page.locator("#contact-color");
    await option(method, "פגישה פנים אל פנים"); await option(outcome, "לא היה מענה");
    assert.match(await method.innerText(), /שיחה טלפונית/); await method.click();
    assert.equal(await page.getByRole("option", { name: "פגישה פנים אל פנים", exact: true }).getAttribute("aria-disabled"), "true"); await page.keyboard.press("Escape");
    assert.equal(await next.count(), 0); await option(outcome, "הקשר הושלם");
    await color.click(); await page.getByRole("option", { name: "השארת הדיווח הקיים", exact: true }).waitFor({ state: "visible" }); const colors = await page.getByRole("option").allTextContents(); assert.equal(colors.length, 4); await page.keyboard.press("Escape");
    await option(color, "אדום — נדרש טיפול"); assert.match(await color.innerText(), /אדום/); await option(color, "השארת הדיווח הקיים");
    await page.locator("#contact-nextAppointmentAt").fill(h.localInput(new Date(Date.now() + 86400000)));
    return { actualDateBlankFutureAndNonexistentDST: "rejected", nextMissingEqualAndBeforeActual: "rejected", ariaAndFocus: true, notesRetained: true, notesMax: 20000, noAnswerForcesPhoneAndHidesNext: true, createColorChoices: colors.length, rejectedPosts: 0 };
  });
  if (!createValidation) return;
  const created = await h.scenario("Contact create: failed local draft preparation preserves input and retry saves once", async () => {
    const notes = page.locator("#contact-notes"), save = page.getByRole("button", { name: "שמירת התיעוד והפגישה הבאה", exact: true });
    await page.getByText(saved, { exact: true }).waitFor({ state: "visible" }); await installFault(`contact:${id}`);
    let hits;
    try {
      notesText = `${marker} quota creation`; await notes.fill(notesText); await page.getByText(failed, { exact: true }).waitFor({ state: "visible" });
      await guard(async () => { await save.click(); await page.getByText(/לא ניתן להכין את הבקשה לשמירה/).first().waitFor({ state: "visible" }); assert.equal(await notes.inputValue(), notesText); });
      hits = await restoreFault(); assert.ok(hits >= 2); await h.action("record_contact", () => save.click());
      const view = await h.poll(() => h.participant(id), v => v?.contacts.some(c => c.notes === notesText));
      const matching = view.contacts.filter(c => c.notes === notesText); assert.equal(matching.length, 1); contactId = matching[0].id;
      return { retained: true, postsBeforeRetry: 0, retryAccepted: true, matchingContacts: 1, faultHits: hits };
    } finally { await cleanupFault(); }
  });
  if (!created) return;
  await h.scenario("Contact revision and invalidation: reasons, dates and native text limits", async () => {
    let d = await entry("תיקון דיווח"), reason = d.getByLabel("סיבת השינוי", { exact: true }), notes = d.getByLabel("סיכום הדיווח המתוקן", { exact: true }), occurred = d.getByLabel("מועד הקשר בפועל", { exact: true });
    const method = d.getByLabel("אופן הקשר", { exact: true }), outcome = d.getByLabel("תוצאת הקשר", { exact: true });
    await option(method, "פגישה פנים אל פנים"); await option(outcome, "לא היה מענה"); assert.match(await method.innerText(), /שיחה טלפונית/);
    await method.click(); assert.equal(await page.getByRole("option", { name: "פגישה פנים אל פנים", exact: true }).getAttribute("aria-disabled"), "true"); await page.keyboard.press("Escape"); await option(outcome, "הקשר הושלם");
    const original = await notes.inputValue(), beforeDate = await occurred.inputValue(); await limit(notes, 20000); await notes.fill(original); await limit(reason, 2000);
    await reason.fill("   "); await guard(async () => { await d.getByRole("button", { name: "שמירת השינוי", exact: true }).click(); await invalid(reason); });
    await reason.fill(`${marker} bad date`); await occurred.fill(""); await guard(async () => { await d.getByRole("button", { name: "שמירת השינוי", exact: true }).click(); await invalid(occurred); });
    await occurred.fill(h.localInput(new Date(Date.now() + 86400000))); await guard(async () => { await d.getByRole("button", { name: "שמירת השינוי", exact: true }).click(); await invalid(occurred); });
    await occurred.fill(beforeDate); await reason.fill(""); await close(d);
    d = await entry("פסילת דיווח"); reason = d.getByLabel("סיבת השינוי", { exact: true }); await limit(reason, 2000); await reason.fill("   ");
    await guard(async () => { await d.getByRole("button", { name: "פסילת הדיווח ושמירת הסיבה", exact: true }).click(); await invalid(reason); });
    await reason.fill(""); await close(d);
    return { blankWhitespaceReasons: "rejected", emptyFutureActualDate: "rejected", noAnswerForcesPhone: true, notesMax: 20000, reasonMax: 2000, ariaAndFocus: true, rejectedPosts: 0 };
  });
  await h.scenario("Contact revision: failed local draft preparation preserves reason and retry saves once", async () => {
    const d = await entry("תיקון דיווח"), reason = d.getByLabel("סיבת השינוי", { exact: true }), notes = d.getByLabel("סיכום הדיווח המתוקן", { exact: true }), save = d.getByRole("button", { name: "שמירת השינוי", exact: true });
    await reason.fill(`${marker} baseline reason`); await d.getByText(saved, { exact: true }).waitFor({ state: "visible" }); await installFault(`contact-action:revise:${id}:${contactId}`); let hits;
    try {
      const reasonText = `${marker} quota correction`; await reason.fill(reasonText); await d.getByText(failed, { exact: true }).waitFor({ state: "visible" });
      await guard(async () => { await save.click(); await d.getByText(/לא ניתן להכין את הבקשה לשמירה/).first().waitFor({ state: "visible" }); assert.equal(await reason.inputValue(), reasonText); assert.equal(await notes.inputValue(), notesText); });
      hits = await restoreFault(); assert.ok(hits >= 2); await h.action("revise_contact", () => save.click());
      const view = await h.poll(() => h.participant(id), v => v?.contacts.find(c => c.id === contactId)?.revision === 2);
      assert.equal(view.contacts.find(c => c.id === contactId).revision, 2);
      return { retained: true, postsBeforeRetry: 0, retryAccepted: true, finalRevision: 2, faultHits: hits };
    } finally { await cleanupFault(); }
  });
  await h.scenario("Reschedule and color: invalid dates, reasons and option boundaries", async () => {
    let d = await open("שינוי מועד הקשר הבא"), reason = d.getByLabel("סיבת השינוי", { exact: true }), next = d.getByLabel("מועד הקשר הבא", { exact: true });
    const initial = await next.inputValue(); await reason.fill(`${marker} date`); await next.fill("");
    await guard(async () => { await d.getByRole("button", { name: "שמירת השינוי", exact: true }).click(); await invalid(next); });
    await next.fill(h.localInput(new Date(Date.now() - 86400000))); await guard(async () => { await d.getByRole("button", { name: "שמירת השינוי", exact: true }).click(); await invalid(next); });
    await next.fill(initial); await reason.fill("   "); await guard(async () => { await d.getByRole("button", { name: "שמירת השינוי", exact: true }).click(); await invalid(reason); });
    await reason.fill(""); await close(d);
    d = await open("עדכון מצב הליווי"); const color = d.getByLabel("מצב הליווי המדווח", { exact: true }), note = d.getByLabel("הערה לעדכון (לא חובה)", { exact: true });
    await limit(note, 2000); await note.fill(""); await color.click(); await page.getByRole("option").first().waitFor({ state: "visible" }); const choices = await page.getByRole("option").allTextContents(); assert.equal(choices.length, 3); await page.keyboard.press("Escape"); await close(d);
    return { missingAndPastReschedule: "rejected", whitespaceReason: "rejected", optionalNoteMax: 2000, colors: choices.length, ariaAndFocus: true, rejectedPosts: 0 };
  });
}
