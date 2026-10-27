import assert from "node:assert/strict";

// The caller owns the authenticated browser, fixture lifecycle, tracking and cleanup.
// Every rejected submission checks actual POST count, not just the operation map.
export async function runMentoringInputEdges(h) {
  const page = h.page;
  const id = h.fixture.participantId;
  const marker = `בדיקת דפדפן ${h.runId}`;
  const wait = (loc) => h.poll(() => loc.isEnabled(), Boolean, 10000);
  const noPost = async (fn) => {
    const before = h.commandRequestCount;
    let blockedPosts = 0;
    const handler = async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      blockedPosts += 1;
      await route.abort("blockedbyclient");
    };
    await page.route("**/api/mentoring/commands", handler);
    try {
      await fn();
      // Keep the scoped guard installed after the UI error to catch asynchronous submissions.
      await new Promise((resolve) => setTimeout(resolve, 750));
      assert.equal(blockedPosts, 0, "Invalid input attempted a command POST (intercepted before delivery)");
      assert.equal(h.commandRequestCount, before, "Invalid input must not send a command");
    } finally { await page.unroute("**/api/mentoring/commands", handler); }
  };
  const invalid = async (loc) => h.poll(() => loc.getAttribute("aria-invalid"), (v) => v === "true", 5000);
  const limit = async (loc, n) => { assert.equal(await loc.getAttribute("maxlength"), String(n)); await loc.fill("x".repeat(n + 10)); assert.equal((await loc.inputValue()).length, n); };
  const close = (d) => d.getByRole("button", { name: /^סגירה/ }).first().click();
  const option = async (control, name) => { await control.click(); await page.getByRole("option", { name, exact: true }).click(); };

  await h.scenario("Participant edit validates phone and service controls without submitting", async () => {
    await h.openParticipant(id, "פרטי החניכה והליווי");
    await page.getByRole("button", { name: "עריכת פרטים", exact: true }).click();
    const d = page.getByRole("dialog"), phone = d.locator("#participant-phone"), name = d.locator("#participant-name");
    await wait(name); const originalName = await name.inputValue(), originalPhone = await phone.inputValue();
    const service = d.locator("#participant-service"), originalService = (await service.innerText()).trim();
    try {
      for (const [selector, n] of [["#participant-name", 160], ["#participant-place", 240], ["#participant-role", 240], ["#participant-notes", 8000]]) {
        const input = d.locator(selector), previous = await input.inputValue(); await limit(input, n); await input.fill(previous);
      }
      await option(service, "שירות לאומי"); assert.match(await service.innerText(), /שירות לאומי/);
      await phone.fill("123"); await noPost(async () => { await d.getByRole("button", { name: "שמירת פרטים", exact: true }).click(); await invalid(phone); });
      assert.equal(await phone.inputValue(), "123");
      return { editTextLimits: [160, 240, 240, 8000], invalidPhoneRetained: true, serviceChoice: true, commands: 0 };
    } finally { await phone.fill(originalPhone); await name.fill(originalName); await option(service, originalService); await close(d); }
  });

  await h.scenario("Assignment lists only eligible mentor and coordinator choices", async () => {
    const state = await h.snapshot(); await h.openParticipant(id, "פרטי החניכה והליווי");
    await page.getByRole("button", { name: "שינוי שיוך", exact: true }).click();
    const d = page.getByRole("dialog"), mentor = d.locator("#assignment-mentor"), coordinator = d.locator("#assignment-coordinator"); await wait(mentor);
    const count = h.commandRequestCount;
    await mentor.click(); const mentors = await page.getByRole("option").allTextContents(); await page.keyboard.press("Escape");
    await coordinator.click(); const coordinators = await page.getByRole("option").allTextContents(); await page.keyboard.press("Escape");
    const currentMentor = state.staff.find((s) => s.id === h.fixture.mentorId), currentCoordinator = state.staff.find((s) => s.id === h.fixture.coordinatorId);
    assert.ok(mentors.includes(currentMentor.displayName)); assert.ok(!mentors.includes(currentCoordinator.displayName));
    assert.ok(coordinators.includes(currentCoordinator.displayName)); assert.ok(!coordinators.includes(currentMentor.displayName));
    assert.equal(h.commandRequestCount, count); await close(d);
    return { eligibleMentors: mentors.length, eligibleCoordinators: coordinators.length, wrongRolesExcluded: true, commands: 0 };
  });

  await h.scenario("Staff form role, coordinator and length choices remain local", async () => {
    await h.navigate("/staff/team"); await page.getByRole("button", { name: "הוספת חבר/ת צוות", exact: true }).click();
    const d = page.getByRole("dialog"), name = d.getByLabel("שם מלא", { exact: true }), email = d.getByLabel("כתובת דוא״ל להתחברות", { exact: true }); await wait(name);
    const before = h.commandRequestCount, oldName = await name.inputValue(), oldEmail = await email.inputValue();
    try {
      await limit(name, 200); await name.fill(oldName);
      await d.getByRole("button", { name: "רכז/ת", exact: true }).click(); assert.equal(await d.getByLabel("רכז/ת אחראי/ת", { exact: true }).count(), 0);
      await d.getByRole("button", { name: "חונך/ת", exact: true }).click();
      await d.getByLabel("רכז/ת אחראי/ת", { exact: true }).click();
      const choices = await page.getByRole("option").allTextContents(); assert.ok(choices.some((x) => x.includes("ללא שיוך"))); await page.keyboard.press("Escape");
      assert.equal(h.commandRequestCount, before); return { nameMax: 200, roleSwitches: true, coordinatorChoices: choices.length, commands: 0 };
    } finally { await name.fill(oldName); await email.fill(oldEmail); await close(d); }
  });

  await h.scenario("Staff edit validates fields and access dialog cancels safely", async () => {
    const state = await h.snapshot(), member = state.staff.find((s) => s.id === h.fixture.otherMentorId), actor = state.staff.find((s) => s.id === h.actorId);
    assert.ok(member?.active && actor?.active); await h.navigate("/staff/team");
    const table = page.getByRole("table", { name: "צוות הליווי" });
    const row = table.getByRole("row").filter({ has: page.getByText(member.displayName, { exact: true }) });
    const self = table.getByRole("row").filter({ has: page.getByText(actor.displayName, { exact: true }) });
    assert.equal(await self.getByRole("button", { name: "ביטול גישה", exact: true }).count(), 0);
    assert.equal(await self.getByRole("button", { name: "אין אפשרות לבטל את הגישה של החשבון שלך", exact: true }).count(), 1);
    await row.getByRole("button", { name: "עריכת פרטים", exact: true }).click();
    const d = page.getByRole("dialog"), name = d.getByLabel("שם מלא", { exact: true }), phone = d.getByLabel("טלפון צוות · רשות", { exact: true }), save = d.getByRole("button", { name: "שמירת פרטי צוות", exact: true });
    await wait(name); const originalName = await name.inputValue(), originalPhone = await phone.inputValue();
    try {
      await name.fill("   "); await noPost(async () => { await save.click(); await invalid(name); }); assert.equal(await name.inputValue(), "   ");
      await name.fill(originalName); await phone.fill("123"); await noPost(async () => { await save.click(); await invalid(phone); }); assert.equal(await phone.inputValue(), "123");
      await phone.fill(originalPhone); await d.getByRole("button", { name: "רכז/ת", exact: true }).click(); assert.equal(await d.getByLabel("רכז/ת אחראי/ת", { exact: true }).count(), 0);
      await d.getByRole("button", { name: "חונך/ת", exact: true }).click();
      const coordinator = d.getByLabel("רכז/ת אחראי/ת", { exact: true }); await coordinator.click(); const choices = await page.getByRole("option").allTextContents(); assert.ok(choices.some((x) => x.includes("ללא שיוך"))); await page.keyboard.press("Escape");
    } finally { await name.fill(originalName); await phone.fill(originalPhone); await close(d); }
    const before = h.commandRequestCount; await row.getByRole("button", { name: "ביטול גישה", exact: true }).click();
    const access = page.getByRole("dialog"); await wait(access.getByRole("button", { name: "אישור ביטול הגישה", exact: true })); await close(access);
    assert.equal(h.commandRequestCount, before); assert.equal((await h.snapshot()).staff.find((s) => s.id === member.id).active, true);
    return { whitespaceName: "rejected", invalidPhone: "rejected", enteredValuesRetained: true, roleAndCoordinatorChoices: true, selfDeactivationUnavailable: true, accessCancelled: true, commands: 0 };
  });

  await h.scenario("Synthetic staff activation dialog cancels and then restores original access", async () => {
    const memberId = h.fixture.otherMentorId, member = (await h.snapshot()).staff.find((s) => s.id === memberId);
    assert.ok(member?.active, "Only the run-owned active synthetic mentor may be changed.");
    const openAccess = async (name) => {
      await h.navigate("/staff/team");
      const row = page.getByRole("table", { name: "צוות הליווי" }).getByRole("row").filter({ has: page.getByText(member.displayName, { exact: true }) });
      await row.getByRole("button", { name, exact: true }).click(); return page.getByRole("dialog");
    };
    let deactivated = false;
    try {
      let d = await openAccess("ביטול גישה"); await wait(d.getByRole("button", { name: "אישור ביטול הגישה", exact: true }));
      deactivated = true; await h.action("set_staff_active", () => d.getByRole("button", { name: "אישור ביטול הגישה", exact: true }).click());
      await h.poll(h.snapshot, (value) => value.staff.find((s) => s.id === memberId)?.active === false);
      d = await openAccess("הפעלת גישה"); await wait(d.getByRole("button", { name: "אישור הפעלת הגישה", exact: true }));
      const before = h.commandRequestCount; await close(d); assert.equal(h.commandRequestCount, before);
      assert.equal((await h.snapshot()).staff.find((s) => s.id === memberId).active, false);
      return { syntheticDeactivationAccepted: true, activationCancelSentCommands: 0, originalAccessRestored: true };
    } finally {
      if (deactivated) {
        const current = (await h.snapshot()).staff.find((s) => s.id === memberId);
        if (!current.active) {
          const d = await openAccess("הפעלת גישה"); await wait(d.getByRole("button", { name: "אישור הפעלת הגישה", exact: true }));
          await h.action("set_staff_active", () => d.getByRole("button", { name: "אישור הפעלת הגישה", exact: true }).click());
          await h.poll(h.snapshot, (value) => value.staff.find((s) => s.id === memberId)?.active === true);
        }
      }
    }
  });

  await h.scenario("Authority forms require reasons, valid expiration and protected fields", async () => {
    const open = async (title) => { await h.openParticipant(id, "פרטי החניכה והליווי"); await page.getByRole("button", { name: title, exact: true }).click(); const d = page.getByRole("dialog"); await wait(d.locator("#authority-reason")); return d; };
    for (const [title, submit] of [["שינוי מצב הליווי", "שמירת השינוי"], ["העברת כרטיס לסל המחזור", "העברה לסל המחזור"]]) {
      const d = await open(title), reason = d.locator("#authority-reason"), button = d.getByRole("button", { name: submit, exact: true });
      await reason.fill("   "); assert.equal(await button.isDisabled(), true); await limit(reason, 2000); await reason.fill(""); await close(d);
    }
    let d = await open("הגנת מנכ״ל על רשומה");
    assert.equal(await d.getByRole("button", { name: "הסרת הגנה", exact: true }).isDisabled(), true);
    await d.getByRole("button", { name: "שדות נבחרים", exact: true }).click(); await d.locator("#authority-reason").fill(`${marker} protection`);
    await noPost(async () => { await d.getByRole("button", { name: "שמירת השינוי", exact: true }).click(); await invalid(d.getByRole("group", { name: "בחירת שדות מוגנים", exact: true })); });
    await d.locator("#authority-reason").fill(""); await close(d);
    d = await open("הרשאה אישית לכרטיס");
    const state = await h.snapshot(), mentor = state.staff.find((s) => s.id === h.fixture.mentorId);
    await option(d.getByLabel("חבר/ת צוות", { exact: true }), mentor.displayName);
    assert.equal(await d.getByRole("button", { name: "אישור תיעוד", exact: true }).isDisabled(), true);
    assert.equal(await d.getByRole("button", { name: "ביטול הרשאה", exact: true }).isDisabled(), true);
    const group = d.getByRole("group", { name: "בחירת הרשאות", exact: true });
    if (await group.getByRole("button", { name: "צפייה", exact: true }).getAttribute("aria-pressed") !== "true") await group.getByRole("button", { name: "צפייה", exact: true }).click();
    const expiration = d.locator("#authority-expiration"); await expiration.fill(h.localInput(new Date(Date.now() - 86400000))); await d.locator("#authority-reason").fill(`${marker} expired`);
    await noPost(async () => { await d.getByRole("button", { name: "שמירת השינוי", exact: true }).click(); await invalid(expiration); });
    await expiration.fill(""); await d.locator("#authority-reason").fill(""); await close(d);
    return { whitespaceReasonDisabled: true, reasonMax: 2000, emptyProtectedFieldsRejected: true, expiredGrantRejected: true, mentorApprovalDisabled: true, commands: 0 };
  });

  await h.scenario("Settings upper, fractional and required boundaries preserve inputs", async () => {
    await h.navigate("/staff/settings"); const hours = page.locator("#settings-offline-hours"), minutes = page.locator("#settings-reminder-minutes"), repeat = page.locator("#settings-repeat-hours"), reason = page.locator("#settings-reason"), save = page.getByRole("button", { name: "שמירת הגדרות הארגון", exact: true }); await wait(hours);
    const initial = [await hours.inputValue(), await minutes.inputValue(), await repeat.inputValue(), await reason.inputValue()];
    try {
      await reason.fill(`${marker} boundaries`);
      for (const [input, value] of [[hours, "25"], [hours, "1.5"], [minutes, "1441"], [minutes, "0.5"], [repeat, "169"], [repeat, "1.5"]]) {
        const previous = await input.inputValue(); await input.fill(value); await noPost(async () => { await save.click(); await invalid(input); }); assert.equal(await input.inputValue(), value); await input.fill(previous);
      }
      await reason.fill("   "); await noPost(async () => { await save.click(); await invalid(reason); }); await limit(reason, 2000);
      const toggle = page.getByRole("switch", { name: "תזכורות על איחור בקשר", exact: true }), original = await toggle.getAttribute("aria-checked"); await toggle.click(); assert.notEqual(await toggle.getAttribute("aria-checked"), original); await toggle.click();
      const audience = page.locator("#settings-audience"), label = (await audience.innerText()).trim(); await audience.click(); const options = await page.getByRole("option").allTextContents(); assert.ok(options.length >= 2); await page.keyboard.press("Escape"); assert.equal((await audience.innerText()).trim(), label);
      return { invalidUpperAndFractionalValues: 6, whitespaceReasonRejected: true, reasonMax: 2000, toggleAndAudience: true, commands: 0 };
    } finally { await hours.fill(initial[0]); await minutes.fill(initial[1]); await repeat.fill(initial[2]); await reason.fill(initial[3]); }
  });

  await h.scenario("Monthly review and participant filters handle long input and invalid month", async () => {
    await h.navigate("/staff/oversight"); const month = page.locator("#oversight-month"), summary = page.locator("#monthly-review-summary"); await wait(summary);
    const initialMonth = await month.inputValue(), initialSummary = await summary.inputValue(), reviewed = page.locator("#monthly-reviewed"), initialReviewed = await reviewed.getAttribute("aria-checked");
    try {
      await limit(summary, 20000); await month.fill(""); await invalid(month); assert.equal(await summary.inputValue(), "x".repeat(20000)); await month.fill(initialMonth);
      await reviewed.click(); assert.notEqual(await reviewed.getAttribute("aria-checked"), initialReviewed); await reviewed.click();
      await page.locator("#oversight-scope").click(); assert.ok((await page.getByRole("option").count()) >= 1); await page.keyboard.press("Escape");
    } finally { await summary.fill(initialSummary); await month.fill(initialMonth); }
    await h.navigate("/staff/participants"); const search = page.getByPlaceholder("שם, טלפון או מקום שירות", { exact: true }), text = `${marker} ${"x".repeat(1000)}`; await search.fill(text); assert.equal(await search.inputValue(), text);
    for (const selector of ["#service-filter", "#lifecycle-filter"]) { await page.locator(selector).click(); assert.ok((await page.getByRole("option").count()) > 0); await page.keyboard.press("Escape"); }
    await search.fill(""); return { summaryMax: 20000, invalidMonthRetainedSummary: true, reviewedSwitch: true, longSearch: true, filterChoices: true };
  });

  let contactParticipant, contactNotes;
  const contactReady = await h.scenario("Create separate tracked contact fixture for correction input tests", async () => {
    contactParticipant = await h.createParticipant("input-edges-contact");
    await h.assignParticipant(contactParticipant, h.fixture.mentorId, h.fixture.coordinatorId);
    await h.navigate(`/staff/contacts/new?participant=${contactParticipant}`);
    const notes = page.locator("#contact-notes"); await wait(notes); contactNotes = `${marker} input edges contact`;
    await page.locator("#contact-occurredAt").fill(h.localInput(new Date(Date.now() - 120000)));
    await page.locator("#contact-nextAppointmentAt").fill(h.localInput(new Date(Date.now() + 86400000)));
    await notes.fill(contactNotes);
    await h.action("record_contact", () => page.getByRole("button", { name: "שמירת התיעוד והפגישה הבאה", exact: true }).click());
    await h.poll(() => h.participant(contactParticipant), (view) => view?.contacts.some((entry) => entry.notes === contactNotes));
    return { separateParticipant: true, trackedContact: true };
  });
  if (contactReady) {
    const followup = async (title) => { await h.openParticipant(contactParticipant); await page.getByRole("button", { name: title, exact: true }).click(); const d = page.getByRole("dialog", { name: title, exact: true }); await wait(d.locator("textarea").last()); return d; };
    const entry = async (title) => {
      await h.openParticipant(contactParticipant); await page.getByRole("tab", { name: /^היסטוריית קשר/ }).click();
      const card = page.getByRole("tabpanel", { name: /^היסטוריית קשר/ }).locator("article").filter({ has: page.getByText(contactNotes, { exact: true }) });
      await card.getByRole("button", { name: title, exact: true }).click(); const d = page.getByRole("dialog", { name: title, exact: true }); await wait(d.getByLabel("סיבת השינוי", { exact: true })); return d;
    };
    await h.scenario("Contact correction and invalidation reject blank reasons and invalid dates", async () => {
      let d = await entry("תיקון דיווח"), reason = d.getByLabel("סיבת השינוי", { exact: true }), notes = d.getByLabel("סיכום הדיווח המתוקן", { exact: true });
      const priorNotes = await notes.inputValue(); await limit(notes, 20000); await notes.fill(priorNotes); await limit(reason, 2000); await reason.fill("   ");
      await noPost(async () => { await d.getByRole("button", { name: "שמירת השינוי", exact: true }).click(); await invalid(reason); });
      await reason.fill(`${marker} invalid date`); const occurred = d.getByLabel("מועד הקשר בפועל", { exact: true }), prior = await occurred.inputValue();
      await occurred.fill(h.localInput(new Date(Date.now() + 86400000)));
      await noPost(async () => { await d.getByRole("button", { name: "שמירת השינוי", exact: true }).click(); await invalid(occurred); });
      await occurred.fill(prior); await reason.fill(""); await close(d);
      d = await entry("פסילת דיווח"); reason = d.getByLabel("סיבת השינוי", { exact: true }); await reason.fill("   ");
      await noPost(async () => { await d.getByRole("button", { name: "פסילת הדיווח ושמירת הסיבה", exact: true }).click(); await invalid(reason); });
      await reason.fill(""); await close(d);
      return { correctionBlankReason: "rejected", futureDate: "rejected", invalidationBlankReason: "rejected", noteMax: 20000, reasonMax: 2000, commands: 0 };
    });
    await h.scenario("Reschedule and color controls enforce boundaries without changing history", async () => {
      let d = await followup("שינוי מועד הקשר הבא"), reason = d.getByLabel("סיבת השינוי", { exact: true }), next = d.getByLabel("מועד הקשר הבא", { exact: true });
      const initial = await next.inputValue(); await reason.fill(`${marker} missing date`); await next.fill("");
      await noPost(async () => { await d.getByRole("button", { name: "שמירת השינוי", exact: true }).click(); await invalid(next); });
      await next.fill(initial); await reason.fill("   "); await noPost(async () => { await d.getByRole("button", { name: "שמירת השינוי", exact: true }).click(); await invalid(reason); });
      await reason.fill(""); await close(d);
      d = await followup("עדכון מצב הליווי"); const color = d.getByLabel("מצב הליווי המדווח", { exact: true }), note = d.getByLabel("הערה לעדכון (לא חובה)", { exact: true });
      const colorBefore = (await color.innerText()).trim(), noteBefore = await note.inputValue(); await limit(note, 2000); await note.fill(noteBefore);
      await color.click(); const choices = await page.getByRole("option").allTextContents(); assert.equal(choices.length, 3); await page.keyboard.press("Escape"); assert.equal((await color.innerText()).trim(), colorBefore); await close(d);
      return { emptyDate: "rejected", blankReason: "rejected", colorChoices: choices.length, optionalNoteMax: 2000, commands: 0 };
    });
    await h.scenario("Restore form requires a reason on a separately tracked deleted fixture", async () => {
      await h.openParticipant(contactParticipant, "פרטי החניכה והליווי"); await page.getByRole("button", { name: "העברת כרטיס לסל המחזור", exact: true }).click();
      let d = page.getByRole("dialog"); await wait(d.locator("#authority-reason")); await d.locator("#authority-reason").fill(`${marker} prepare restore input`);
      await h.action("delete_participant", () => d.getByRole("button", { name: "העברה לסל המחזור", exact: true }).click());
      await h.poll(() => h.participant(contactParticipant), (view) => Boolean(view?.participant.deletedAt));
      await h.openParticipant(contactParticipant, "פרטי החניכה והליווי"); await page.getByRole("button", { name: "שחזור כרטיס מסל המחזור", exact: true }).click(); d = page.getByRole("dialog"); await wait(d.locator("#authority-reason"));
      await d.locator("#authority-reason").fill("   "); assert.equal(await d.getByRole("button", { name: "שחזור הכרטיס", exact: true }).isDisabled(), true);
      await limit(d.locator("#authority-reason"), 2000); await d.locator("#authority-reason").fill(`${marker} restore fixture`);
      await h.action("restore_participant", () => d.getByRole("button", { name: "שחזור הכרטיס", exact: true }).click());
      await h.poll(() => h.participant(contactParticipant), (view) => view?.participant.deletedAt === null);
      return { blankRestoreReasonDisabled: true, reasonMax: 2000, fixtureRestored: true };
    });
  }

}
