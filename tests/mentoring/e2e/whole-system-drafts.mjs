import assert from "node:assert/strict";

const SAVED = "הטיוטה נשמרה במכשיר הזה";
const PROFILE_TAB = "פרטי החניכה והליווי";
const text = (runId, key) => `בדיקת דפדפן ${runId}: טיוטת ${key}`;

/**
 * Real form input durability. The caller owns the authenticated, development-only
 * fixture window, native persistent profile, report, and exact-ID cleanup.
 * Importing this module performs no browser, server, or database operations.
 */
export async function runDraftScenarios(h) {
  await h.page.setViewportSize({ width: 1440, height: 1000 });
  const initial = await h.snapshot();
  assert.equal(initial.actor.role, "ceo", "Draft coverage requires the accepted CEO scope.");
  const participantId = h.fixture.participantId;
  const view = initial.participants.find((entry) => entry.participant.id === participantId);
  assert.ok(view?.assignment && view.nextAppointment, "Draft coverage requires an assigned participant and continuing appointment.");
  assert.equal(view.participant.lifecycle, "active", "Draft coverage requires an active participant.");
  const contact = view.contacts.find((entry) => !entry.invalidatedAt && entry.notes);
  assert.ok(contact, "Correction and invalidation drafts require one accepted, valid contact with identifiable synthetic notes.");
  const mentor = initial.staff.find((entry) => entry.id === h.fixture.mentorId);
  const otherMentor = initial.staff.find((entry) => entry.id === h.fixture.otherMentorId);
  const alternateMentor = [mentor, otherMentor].find((entry) => entry?.active && entry.id !== view.assignment.mentorId);
  const coordinator = initial.staff.find((entry) => entry.id === h.fixture.coordinatorId);
  assert.ok(mentor && otherMentor && alternateMentor && coordinator, "Synthetic staff fixtures and a different active mentor are required for independently keyed staff, assignment, and team-review forms.");
  assert.notEqual(alternateMentor.id, view.assignment.mentorId, "The assignment draft must differ from the accepted server assignment.");
  const draftStaffPhone = mentor.phone === "0500000001" ? "0500000002" : "0500000001";
  assert.notEqual(draftStaffPhone, mentor.phone, "The staff draft must differ from the accepted server phone.");
  const monthParts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit",
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  const month = `${monthParts.year}-${monthParts.month}`;
  const existingGrant = view.accessGrants?.[0];
  assert.ok(existingGrant, "Existing-grant draft isolation requires one tracked grant or revocation tombstone from the authority scenario.");
  const future = h.localInput(new Date(Date.now() + 5 * 86_400_000));
  const descriptors = [];

  async function currentDialog() {
    const dialog = h.page.getByRole("dialog");
    await dialog.waitFor({ state: "visible" });
    return dialog;
  }
  async function closeDialog() {
    const dialog = h.page.getByRole("dialog");
    await h.page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
  }
  async function openParticipant(tab) {
    // These helpers must hydrate cached UI offline; they must not require a GET.
    await h.openParticipant(participantId, tab);
  }
  async function waitSaved(scope) {
    await scope.getByText(SAVED, { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
  }
  async function fillEnabled(field, value) {
    await field.waitFor({ state: "visible" });
    await h.poll(() => field.isEnabled(), (enabled) => enabled, 20_000);
    await field.fill(value);
  }
  async function assertValue(field, expected) {
    await field.waitFor({ state: "visible" });
    await h.poll(() => field.inputValue(), (value) => value === expected, 20_000);
    assert.equal(await field.inputValue(), expected);
  }
  async function choose(trigger, option) {
    await h.poll(() => trigger.isEnabled(), (enabled) => enabled, 20_000);
    await trigger.click();
    await h.page.getByRole("option", { name: option, exact: true }).click();
  }
  function addInputDraft({ key, open, fields, close = closeDialog }) {
    descriptors.push({
      key, open,
      async stage(scope) {
        for (const { locator, value } of fields(scope)) await fillEnabled(locator, value);
        await waitSaved(scope);
      },
      async verify(scope) {
        for (const { locator, value } of fields(scope)) await assertValue(locator, value);
      },
      close,
    });
  }
  async function authorityOpen(title, id = participantId) {
    await h.openParticipant(id, PROFILE_TAB);
    await h.page.getByRole("button", { name: title, exact: true }).click();
    return currentDialog();
  }
  async function contactOpen(title) {
    await openParticipant();
    const article = h.page.getByRole("tabpanel", { name: /^היסטוריית קשר/ }).getByRole("article").filter({ hasText: contact.notes });
    await article.getByRole("button", { name: title, exact: true }).click();
    return currentDialog();
  }
  async function followupOpen(title) {
    await openParticipant();
    await h.page.getByRole("button", { name: title, exact: true }).click();
    return currentDialog();
  }
  async function staffOpen(mode) {
    await h.navigate("/staff/team");
    const row = h.page.getByRole("row").filter({ hasText: mentor.displayName });
    await row.getByRole("button", { name: mode, exact: true }).click();
    return currentDialog();
  }
  async function monthlyOpen(scopeStaffId) {
    await h.navigate("/staff/oversight");
    const monthField = h.page.locator("#oversight-month");
    await fillEnabled(monthField, month);
    if (scopeStaffId) await choose(h.page.locator("#oversight-scope"), `הצוות של ${coordinator.displayName}`);
    else {
      const scope = h.page.locator("#oversight-scope");
      if (!(await scope.innerText()).includes("כל הארגון")) await choose(scope, "כל הארגון");
    }
    const field = h.page.locator("#monthly-review-summary");
    await field.waitFor({ state: "visible" });
    return h.page.locator('[data-slot="card"]').filter({ has: field });
  }

  let restoreParticipantId = h.fixture.restoreParticipantId;
  if (!restoreParticipantId) {
    const created = await h.createParticipant("draft-restore");
    restoreParticipantId = typeof created === "string" ? created : created.participantId;
    assert.ok(restoreParticipantId, "The tracked restore-only participant must be created by the actual UI.");
    const dialog = await authorityOpen("העברת כרטיס לסל המחזור", restoreParticipantId);
    await fillEnabled(dialog.locator("#authority-reason"), text(h.runId, "מחיקת הכנה לשחזור"));
    await h.action("delete_participant", () => dialog.getByRole("button", { name: "העברה לסל המחזור", exact: true }).click());
    await dialog.waitFor({ state: "hidden" });
    h.fixture.restoreParticipantId = restoreParticipantId;
  }

  addInputDraft({
    key: "participant-profile:new",
    async open() {
      await h.navigate("/staff/participants");
      await h.page.getByRole("button", { name: "חניכה חדשה", exact: true }).click();
      return currentDialog();
    },
    fields: (scope) => [
      { locator: scope.locator("#participant-name"), value: text(h.runId, "חניכה חדשה") },
      { locator: scope.locator("#participant-notes"), value: text(h.runId, "כרטיס חדש") },
    ],
  });
  addInputDraft({
    key: `participant-profile:${participantId}`,
    async open() {
      await openParticipant();
      await h.page.getByRole("button", { name: "עריכת פרטים", exact: true }).click();
      return currentDialog();
    },
    fields: (scope) => [{ locator: scope.locator("#participant-notes"), value: text(h.runId, "עריכת כרטיס") }],
  });
  descriptors.push({
    key: `assignment:${participantId}`,
    async open() {
      await openParticipant(PROFILE_TAB);
      await h.page.getByRole("button", { name: "שינוי שיוך", exact: true }).click();
      return currentDialog();
    },
    async stage(scope) {
      await choose(scope.locator("#assignment-mentor"), alternateMentor.displayName);
      await waitSaved(scope);
    },
    async verify(scope) {
      await h.poll(() => scope.locator("#assignment-mentor").innerText(), (value) => value.includes(alternateMentor.displayName), 20_000);
    },
    close: closeDialog,
  });
  addInputDraft({
    key: `contact:${participantId}`,
    async open() {
      await h.navigate(`/staff/contacts/new?participant=${encodeURIComponent(participantId)}`);
      await h.page.locator("#contact-notes").waitFor({ state: "visible" });
      return h.page.locator("form").filter({ has: h.page.locator("#contact-notes") });
    },
    fields: (scope) => [
      { locator: scope.locator("#contact-nextAppointmentAt"), value: future },
      { locator: scope.locator("#contact-notes"), value: text(h.runId, "תיעוד קשר") },
    ],
    close: async () => {},
  });
  addInputDraft({
    key: `contact-action:revise:${participantId}:${contact.id}`,
    open: () => contactOpen("תיקון דיווח"),
    fields: (scope) => [
      { locator: scope.getByLabel("סיכום הדיווח המתוקן", { exact: true }), value: text(h.runId, "תיקון דיווח") },
      { locator: scope.getByLabel("סיבת השינוי", { exact: true }), value: text(h.runId, "סיבת תיקון") },
    ],
  });
  addInputDraft({
    key: `contact-action:invalidate:${participantId}:${contact.id}`,
    open: () => contactOpen("פסילת דיווח"),
    fields: (scope) => [{ locator: scope.getByLabel("סיבת השינוי", { exact: true }), value: text(h.runId, "פסילת דיווח") }],
  });
  addInputDraft({
    key: `contact-action:reschedule:${participantId}:followup`,
    open: () => followupOpen("שינוי מועד הקשר הבא"),
    fields: (scope) => [
      { locator: scope.getByLabel("מועד הקשר הבא", { exact: true }), value: future },
      { locator: scope.getByLabel("סיבת השינוי", { exact: true }), value: text(h.runId, "שינוי מועד") },
    ],
  });
  addInputDraft({
    key: `contact-action:color:${participantId}:followup`,
    open: () => followupOpen("עדכון מצב הליווי"),
    fields: (scope) => [{ locator: scope.getByLabel("הערה לעדכון (לא חובה)", { exact: true }), value: text(h.runId, "צבע ידני") }],
  });
  addInputDraft({
    key: "staff-preapproval:new",
    async open() {
      await h.navigate("/staff/team");
      await h.page.getByRole("button", { name: "הוספת חבר/ת צוות", exact: true }).click();
      return currentDialog();
    },
    fields: (scope) => [
      { locator: scope.getByLabel("שם מלא", { exact: true }), value: text(h.runId, "חברות בצוות") },
      { locator: scope.getByLabel("כתובת דוא״ל להתחברות", { exact: true }), value: `mentoring-draft-${h.runId}@example.com` },
    ],
  });
  addInputDraft({
    key: `staff-edit:${mentor.id}`,
    open: () => staffOpen("עריכת פרטים"),
    fields: (scope) => [{ locator: scope.getByLabel("טלפון צוות · רשות", { exact: true }), value: draftStaffPhone }],
  });
  const authorityForms = [
    ["lifecycle", "שינוי מצב הליווי", participantId],
    ["grant", "הרשאה אישית לכרטיס", participantId],
    ["protection", "הגנת מנכ״ל על רשומה", participantId],
    ["delete", "העברת כרטיס לסל המחזור", participantId],
    ["restore", "שחזור כרטיס מסל המחזור", restoreParticipantId],
  ];
  for (const [mode, title, id] of authorityForms) addInputDraft({
    key: `authority:${mode}:${id}:new`,
    open: () => authorityOpen(title, id),
    fields: (scope) => [{ locator: scope.locator("#authority-reason"), value: text(h.runId, `ניהול ${mode}`) }],
  });
  addInputDraft({
    key: `authority:grant:${participantId}:${existingGrant.staffId}`,
    async open() {
      await openParticipant(PROFILE_TAB);
      // The authority card renders grant summaries in the snapshot order.
      await h.page.getByRole("button", { name: "שינוי או ביטול הרשאה", exact: true }).first().click();
      return currentDialog();
    },
    fields: (scope) => [{ locator: scope.locator("#authority-reason"), value: text(h.runId, "עריכת הרשאה קיימת") }],
  });
  for (const scopeStaffId of [null, coordinator.id]) addInputDraft({
    key: `monthly-review:${month}:${scopeStaffId ?? "organization"}`,
    open: () => monthlyOpen(scopeStaffId),
    fields: (scope) => [{ locator: scope.locator("#monthly-review-summary"), value: text(h.runId, scopeStaffId ? "סקירת צוות" : "סקירת ארגון") }],
    close: async () => {},
  });
  addInputDraft({
    key: "organization-settings",
    async open() {
      await h.navigate("/staff/settings");
      const field = h.page.locator("#settings-reason");
      await field.waitFor({ state: "visible" });
      return h.page.locator("form").filter({ has: field });
    },
    fields: (scope) => [
      { locator: scope.locator("#settings-reminder-minutes"), value: "37" },
      { locator: scope.locator("#settings-reason"), value: text(h.runId, "מדיניות ארגון") },
    ],
    close: async () => {},
  });

  const operationCountBefore = h.submitted.size;
  const commandRequestCountBefore = h.commandRequestCount;
  assert.ok(Number.isInteger(commandRequestCountBefore) && commandRequestCountBefore >= 0, "The caller must expose a monotonic commandRequestCount across native browser/context replacements.");
  const staged = await h.scenario("All editable form variants save distinct local drafts without submitting commands", async () => {
    for (const descriptor of descriptors) {
      const scope = await descriptor.open();
      await descriptor.stage(scope);
      await descriptor.close();
    }
    assert.equal(h.submitted.size, operationCountBefore, "Filling and closing draft forms must not submit a command.");
    assert.equal(h.commandRequestCount, commandRequestCountBefore, "Filling and closing draft forms must not issue a command POST, including replays.");
    return { editableDraftVariants: descriptors.length, keys: descriptors.map((entry) => entry.key), unintendedCommandRequests: 0, newOperationIds: 0 };
  }, { criteria: ["AC-10", "AC-20", "TA-10", "TA-11"] });
  if (!staged) throw new Error("Draft staging failed; the native restart verification cannot be claimed.");

  const restored = await h.scenario("Every staged editable form restores its exact values after a native offline browser restart", async () => {
    await h.restartOffline();
    await h.page.setViewportSize({ width: 1440, height: 1000 });
    assert.equal(await h.page.evaluate(() => navigator.onLine), false);
    const verified = [];
    for (const descriptor of descriptors) {
      const scope = await descriptor.open();
      await descriptor.verify(scope);
      verified.push(descriptor.key);
      await descriptor.close();
    }
    assert.equal(h.submitted.size, operationCountBefore, "Restoring local drafts must not submit a command.");
    assert.equal(h.commandRequestCount, commandRequestCountBefore, "Restoring local drafts must not issue a command POST, including replays.");
    return { nativeBrowserRestart: true, storageStateRestorationUsed: false, editableDraftVariants: verified.length, verifiedKeys: verified, unintendedCommandRequests: 0, newOperationIds: 0, screenshot: await h.screenshot("all-form-drafts-restored-offline") };
  }, { criteria: ["AC-10", "TA-10", "TA-11"] });
  await h.reconnect();
  if (!restored) throw new Error("One or more editable draft forms did not restore after the native offline restart.");
  assert.equal(h.submitted.size, operationCountBefore, "Reconnecting unsubmitted drafts must not send a command.");
  assert.equal(h.commandRequestCount, commandRequestCountBefore, "Reconnecting unsubmitted drafts must not issue a command POST, including replays.");
  return {
    editableDraftVariants: descriptors.length,
    submissionOnlyIntentKeys: [
      "staff-access:<staff-id>", "management-action:reviews", "management-action:settings", "management-action:conflicts",
    ],
    submissionOnlyIntentEvidence: "No user-editable inputs exist in these forms. Their submitted-intent durability must be covered by the caller's pending-command/recovery scenarios.",
  };
}
