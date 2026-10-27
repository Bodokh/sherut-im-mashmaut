import assert from "node:assert/strict";

// Importing this module performs no network, authentication, or database work.
// The guarded harness owns the run-specific fixtures, mutation tracking and cleanup.
export async function runProfileValidationChecks(h, { assignmentOnly = false } = {}) {
  const { page } = h;
  const fixture = h.fixture;
  const wait = (input) => h.poll(() => input.isEnabled(), Boolean, 10000);
  const dialog = () => page.getByRole("dialog");
  const close = async (d) => {
    if (await d.isVisible().catch(() => false)) await d.getByRole("button", { name: /^סגירה/ }).first().click();
  };
  const marker = `בדיקת דפדפן ${h.runId}`;
  const choose = async (control, label) => { await control.click(); await page.getByRole("option", { name: label, exact: true }).click(); };
  const invalid = (input) => h.poll(() => input.getAttribute("aria-invalid"), (value) => value === "true", 5000);
  const noPost = async (fn) => {
    const before = h.commandRequestCount;
    let intercepted = 0;
    const route = async (request) => {
      if (request.request().method() !== "POST") return request.fallback();
      intercepted++; await request.abort("blockedbyclient");
    };
    await page.route("**/api/mentoring/commands", route);
    try {
      await fn();
      await new Promise((resolve) => setTimeout(resolve, 750));
      assert.equal(intercepted, 0, "Rejected input attempted a command POST");
      assert.equal(h.commandRequestCount, before);
    } finally { await page.unroute("**/api/mentoring/commands", route); }
  };
  const limit = async (input, maximum) => {
    const original = await input.inputValue();
    assert.equal(await input.getAttribute("maxlength"), String(maximum));
    await input.fill("x".repeat(maximum + 10));
    assert.equal((await input.inputValue()).length, maximum);
    await input.fill(original);
  };
  const openProfile = async () => {
    await h.openParticipant(fixture.participantId, "פרטי החניכה והליווי");
    await page.getByRole("button", { name: "עריכת פרטים", exact: true }).click();
    const d = dialog(); await wait(d.locator("#participant-name")); return d;
  };
  const openStaff = async () => {
    const member = (await h.snapshot()).staff.find((item) => item.id === fixture.otherMentorId);
    assert.ok(member && member.displayName.includes(h.runId), "Staff fixture must be owned by this run");
    await h.navigate("/staff/team");
    const row = page.getByRole("table", { name: "צוות הליווי" }).getByRole("row").filter({ has: page.getByText(member.displayName, { exact: true }) });
    await row.getByRole("button", { name: "עריכת פרטים", exact: true }).click();
    const d = dialog(); await wait(d.getByLabel("שם מלא", { exact: true })); return { d, row, member };
  };

  if (!assignmentOnly) await h.scenario("Participant inputs: length boundaries, service options and invalid phone", async () => {
    const d = await openProfile();
    const phone = d.locator("#participant-phone"), service = d.locator("#participant-service");
    const priorPhone = await phone.inputValue(), priorService = (await service.innerText()).trim();
    try {
      for (const [id, n] of [["name",160],["place",240],["role",240],["notes",8000]]) await limit(d.locator(`#participant-${id}`), n);
      for (const option of ["שירות לאומי", "שירות צבאי", "טרם נבחר"]) { await choose(service, option); assert.match(await service.innerText(), new RegExp(option)); }
      await phone.fill("123");
      await noPost(async () => { await d.getByRole("button", { name: "שמירת פרטים", exact: true }).click(); await invalid(phone); });
      assert.equal(await phone.inputValue(), "123");
      return { limits: [160,240,240,8000], serviceOptions: 3, invalidPhoneRetained: true, rejectedPosts: 0 };
    } finally { await phone.fill(priorPhone); await choose(service, priorService); await close(d); }
  });

  if (!assignmentOnly) await h.scenario("Staff create rejects required name, email and phone without sending commands", async () => {
    await h.navigate("/staff/team"); await page.getByRole("button", { name: "הוספת חבר/ת צוות", exact: true }).click();
    const d = dialog(), name = d.getByLabel("שם מלא", { exact: true }), email = d.getByLabel("כתובת דוא״ל להתחברות", { exact: true }), phone = d.getByLabel("טלפון צוות · רשות", { exact: true }), save = d.getByRole("button", { name: "אישור חברות בצוות", exact: true });
    await wait(name);
    try {
      await limit(name, 200);
      for (const [n,e,p,target] of [["   ","", "",name],[`${marker} צוות`,"", "",email],[`${marker} צוות`,"bad@invalid", "",email],[`${marker} צוות`,`profiles-${h.runId}@example.com`,"123",phone]]) {
        await name.fill(n); await email.fill(e); await phone.fill(p);
        await noPost(async () => { await save.click(); await invalid(target); });
        assert.equal(await target.inputValue(), target === name ? n : target === email ? e : p);
      }
      await phone.fill(""); await d.getByRole("button", { name: "רכז/ת", exact: true }).click();
      assert.equal(await d.getByLabel("רכז/ת אחראי/ת", { exact: true }).count(), 0);
      await d.getByRole("button", { name: "חונך/ת", exact: true }).click();
      await d.getByLabel("רכז/ת אחראי/ת", { exact: true }).click();
      assert.ok((await page.getByRole("option").allTextContents()).some((value) => value.includes("ללא שיוך")));
      await page.keyboard.press("Escape");
      return { blankName: true, blankAndMalformedEmail: true, invalidPhone: true, roleAndCoordinator: true, rejectedPosts: 0 };
    } finally { await name.fill(""); await email.fill(""); await phone.fill(""); await close(d); }
  });

  if (!assignmentOnly) await h.scenario("Staff edit validates input and access cancellation protects self", async () => {
    const state = await h.snapshot(), actor = state.staff.find((item) => item.id === h.actorId);
    const { d, row, member } = await openStaff();
    const name = d.getByLabel("שם מלא", { exact: true }), phone = d.getByLabel("טלפון צוות · רשות", { exact: true }), save = d.getByRole("button", { name: "שמירת פרטי צוות", exact: true });
    const priorName = await name.inputValue(), priorPhone = await phone.inputValue();
    try {
      await limit(name, 200); await name.fill("   ");
      await noPost(async () => { await save.click(); await invalid(name); });
      await name.fill(priorName); await phone.fill("123");
      await noPost(async () => { await save.click(); await invalid(phone); });
      assert.equal(await phone.inputValue(), "123");
      await phone.fill(priorPhone); await d.getByRole("button", { name: "רכז/ת", exact: true }).click();
      assert.equal(await d.getByLabel("רכז/ת אחראי/ת", { exact: true }).count(), 0);
      await d.getByRole("button", { name: "חונך/ת", exact: true }).click();
    } finally { await name.fill(priorName); await phone.fill(priorPhone); await close(d); }
    const self = page.getByRole("table", { name: "צוות הליווי" }).getByRole("row").filter({ has: page.getByText(actor.displayName, { exact: true }) });
    assert.equal(await self.getByRole("button", { name: "אין אפשרות לבטל את הגישה של החשבון שלך", exact: true }).count(), 1);
    await noPost(async () => { await row.getByRole("button", { name: "ביטול גישה", exact: true }).click(); await close(dialog()); });
    assert.equal((await h.snapshot()).staff.find((item) => item.id === member.id).active, true);
    return { invalidName: true, invalidPhone: true, selfDeactivationUnavailable: true, accessCancel: true, rejectedPosts: 0 };
  });

  if (!assignmentOnly) await h.scenario("Participant phone saves local and international numbers and clears", async () => {
    for (const [input, expected] of [["0501234567", "+972501234567"], ["+12025550123", "+12025550123"], ["", null]]) {
      const d = await openProfile(), phone = d.locator("#participant-phone");
      await phone.fill(input);
      const { command } = await h.action("update_participant", () => d.getByRole("button", { name: "שמירת פרטים", exact: true }).click());
      assert.equal(command.fields.phone, expected);
      await h.poll(h.participant, (view) => view.participant.phone === expected);
    }
    return { local: "+972501234567", international: "+12025550123", clear: null };
  });

  await h.scenario("Assignment requires a mentor and limits choices by role", async () => {
    const unassignedId = await h.createParticipant("unassigned-check");
    await h.openParticipant(unassignedId, "פרטי החניכה והליווי");
    await page.getByRole("button", { name: /^(שיוך לחונך\/ת|שינוי שיוך)$/ }).click();
    const d = dialog(), mentor = d.locator("#assignment-mentor"), coordinator = d.locator("#assignment-coordinator"); await wait(mentor);
    const state = await h.snapshot(), m = state.staff.find((item) => item.id === fixture.mentorId), c = state.staff.find((item) => item.id === fixture.coordinatorId);
    assert.ok(m && c);
    try {
      await noPost(async () => { await d.getByRole("button", { name: "אישור השיוך", exact: true }).click(); await invalid(mentor); });
      await mentor.click(); await page.getByRole("option", { name: m.displayName, exact: true }).waitFor({ state: "visible" });
      const mentors = await page.getByRole("option").allTextContents();
      await page.getByRole("option", { name: m.displayName, exact: true }).click();
      await coordinator.click(); await page.getByRole("option", { name: c.displayName, exact: true }).waitFor({ state: "visible" });
      const coordinators = await page.getByRole("option").allTextContents();
      await page.getByRole("option", { name: "ללא שיוך לרכז/ת", exact: true }).click();
      assert.ok(mentors.includes(m.displayName)); assert.ok(!mentors.includes(c.displayName));
      assert.ok(coordinators.includes(c.displayName)); assert.ok(!coordinators.includes(m.displayName));
      return { mentorAndCoordinatorChoices: true, wrongRolesExcluded: true, unselectedMentorRejected: true };
    } catch (error) {
      await h.screenshot("assignment-options-failure-state").catch(() => {});
      throw error;
    } finally { await close(d); }
  });
  // The injected fault is scoped to the current authenticated IndexedDB draft.
  // Keep the native descriptor and restore only the exact shim installed here.
  const quota = async ({ key, d, baseline, change, retained, save, type }) => {
    const stored = () => page.evaluate(async (draftKey) => {
      const db = await new Promise((resolve, reject) => { const r = indexedDB.open("sherut-mentoring-private-v1"); r.onupgradeneeded = () => r.transaction.abort(); r.onerror = () => reject(r.error); r.onsuccess = () => resolve(r.result); });
      try {
        const tx = db.transaction(["session", "drafts"], "readonly");
        const read = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
        const session = await read(tx.objectStore("session").get("active"));
        if (session?.scope?.accountId !== window.Clerk?.user?.id) throw new Error("Wrong session scope");
        return await read(tx.objectStore("drafts").get(JSON.stringify([session.scope.key, draftKey])));
      } finally { db.close(); }
    }, key);
    const row = await h.poll(stored, (value) => value?.value?.intent === null && value?.value?.value?.[baseline.field] === baseline.value);
    const baselineRow = JSON.stringify(row);
    await d.getByText("הטיוטה נשמרה במכשיר הזה", { exact: true }).waitFor({ state: "visible" });
    await page.evaluate(async (draftKey) => {
      if (window.__profileQuota) throw new Error("Another quota fault is active");
      const account = window.Clerk?.loaded && window.Clerk.user?.id;
      if (!account) throw new Error("Real Clerk identity required");
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("sherut-mentoring-private-v1");
        request.onupgradeneeded = () => request.transaction.abort();
        request.onerror = () => reject(request.error); request.onsuccess = () => resolve(request.result);
      });
      let scope;
      try {
        const tx = db.transaction("session", "readonly");
        const session = await new Promise((resolve, reject) => { const request = tx.objectStore("session").get("active"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
        if (session?.scope?.accountId !== account || !session.snapshot?.actor?.active) throw new Error("Wrong session scope");
        scope = session.scope.key;
      } finally { db.close(); }
      const descriptor = Object.getOwnPropertyDescriptor(IDBObjectStore.prototype, "put");
      if (!descriptor?.configurable || typeof descriptor.value !== "function") throw new Error("Cannot install quota fault");
      const state = { descriptor, hits: 0, shim: null };
      state.shim = function (...args) {
        const row = args[0];
        if (window.Clerk?.user?.id === account && this.transaction.db.name === "sherut-mentoring-private-v1" && this.name === "drafts" && row?.draftKey === draftKey && row?.scopeKey === scope) {
          state.hits++; throw new DOMException("QA profile quota fault", "QuotaExceededError");
        }
        return descriptor.value.apply(this, args);
      };
      Object.defineProperty(IDBObjectStore.prototype, "put", { ...descriptor, value: state.shim });
      window.__profileQuota = state;
    }, key);
    const restore = () => page.evaluate(() => {
      const state = window.__profileQuota;
      if (!state || IDBObjectStore.prototype.put !== state.shim) throw new Error("Owned quota shim changed before restore");
      Object.defineProperty(IDBObjectStore.prototype, "put", state.descriptor);
      delete window.__profileQuota; return state.hits;
    });
    let installed = true;
    try {
      await noPost(async () => {
        await change();
        await d.getByText("השמירה האוטומטית נכשלה. יש להשאיר את הטופס פתוח ולשמור את הדיווח לפני היציאה.", { exact: true }).waitFor({ state: "visible" });
        await save.click();
        await d.getByText(/לא ניתן להכין את (הבקשה לשמירה|בקשת השיוך)/).first().waitFor({ state: "visible" });
        await retained();
        assert.equal(JSON.stringify(await stored()), baselineRow, "The last durable draft must remain unchanged during quota failure");
      });
      const hits = await restore(); installed = false; assert.ok(hits >= 2);
      const before = h.commandRequestCount;
      const { command } = await h.action(type, () => save.click());
      await new Promise((resolve) => setTimeout(resolve, 750));
      assert.equal(h.commandRequestCount, before + 1, "Retry must send exactly one command");
      return { faultedDraftWrites: hits, retainedInput: true, commandsBeforeRetry: 0, commandsOnRetry: 1, operationId: command.operationId };
    } finally { if (installed) await restore(); }
  };

  if (!assignmentOnly) await h.scenario("Participant edit survives draft quota failure and retries once", async () => {
    const d = await openProfile(), place = d.locator("#participant-place");
    await place.fill(`${marker} baseline`);
    const value = `${marker} quota profile`;
    return quota({ key: `participant-profile:${fixture.participantId}`, d, baseline: { field: "servicePlace", value: `${marker} baseline` }, change: () => place.fill(value), retained: async () => assert.equal(await place.inputValue(), value), save: d.getByRole("button", { name: "שמירת פרטים", exact: true }), type: "update_participant" });
  });

  if (!assignmentOnly) await h.scenario("Staff edit survives draft quota failure and retries once", async () => {
    const { d } = await openStaff(), phone = d.getByLabel("טלפון צוות · רשות", { exact: true });
    await phone.fill("0501234567");
    return quota({ key: `staff-edit:${fixture.otherMentorId}`, d, baseline: { field: "phone", value: "+972501234567" }, change: () => phone.fill("0507654321"), retained: async () => assert.match((await phone.inputValue()).replace(/[^0-9]/g, ""), /507654321$/), save: d.getByRole("button", { name: "שמירת פרטי צוות", exact: true }), type: "update_staff" });
  });

  await h.scenario("Assignment survives draft quota failure and retries once", async () => {
    const state = await h.snapshot();
    const first = state.staff.find((item) => item.id === fixture.mentorId);
    const second = state.staff.find((item) => item.id === fixture.otherMentorId);
    assert.ok(first?.active && first.role === "mentor" && second?.active && second.role === "mentor" && first.id !== second.id, "Assignment retry requires two verified active mentors");
    await h.openParticipant(fixture.participantId, "פרטי החניכה והליווי");
    await page.getByRole("button", { name: /^(שיוך לחונך\/ת|שינוי שיוך)$/ }).click();
    const d = dialog(), mentor = d.locator("#assignment-mentor"); await wait(mentor);
    await choose(mentor, second.displayName);
    await choose(mentor, first.displayName);
    return quota({ key: `assignment:${fixture.participantId}`, d, baseline: { field: "mentorId", value: first.id }, change: () => choose(mentor, second.displayName), retained: async () => assert.equal((await mentor.innerText()).trim(), second.displayName), save: d.getByRole("button", { name: "אישור השיוך", exact: true }), type: "assign_participant" });
  });

}

export async function runAssignmentValidationChecks(h) {
  return runProfileValidationChecks(h, { assignmentOnly: true });
}
