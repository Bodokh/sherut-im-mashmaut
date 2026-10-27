import assert from "node:assert/strict";

const DAY = 86_400_000;
const CONTACT_SUBMIT = "שמירת התיעוד והפגישה הבאה";
const OVERDUE = "נדרש קשר — חלפו שבעה ימים";
const SAVE_CHANGE = "שמירת השינוי";

function contactState(view) {
  return view.contacts.map((entry) => ({ id: entry.id, revision: entry.revision, occurredAt: entry.occurredAt, outcome: entry.outcome, invalidatedAt: entry.invalidatedAt ?? null })).sort((a, b) => a.id.localeCompare(b.id));
}

function latestValidContact(view) {
  return view.contacts.filter((entry) => entry.outcome === "completed" && entry.invalidatedAt == null).sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))[0];
}

async function editable(h, locator) {
  await locator.waitFor({ state: "visible" });
  await h.poll(() => locator.isEnabled(), Boolean);
}

async function openContact(h) {
  await h.navigate(`/staff/contacts/new?participant=${encodeURIComponent(h.fixture.participantId)}`);
  await editable(h, h.page.locator("#contact-notes"));
}

async function select(h, locator, label) {
  await locator.click();
  await h.page.getByRole("option", { name: label, exact: true }).click();
}

async function completed(h, { occurredAt, nextAt, notes }) {
  await openContact(h);
  await select(h, h.page.locator("#contact-outcome"), "הקשר הושלם");
  await h.page.locator("#contact-occurredAt").fill(h.localInput(occurredAt));
  await h.page.locator("#contact-nextAppointmentAt").fill(h.localInput(nextAt));
  await h.page.locator("#contact-notes").fill(notes);
  const accepted = await h.action("record_contact", () => h.page.getByRole("button", { name: CONTACT_SUBMIT, exact: true }).click());
  await h.page.waitForURL((url) => url.pathname === `/staff/participants/${h.fixture.participantId}`);
  return accepted;
}

async function openFollowupDialog(h, title) {
  await h.openParticipant(h.fixture.participantId);
  await h.page.getByRole("button", { name: title, exact: true }).click();
  const dialog = h.page.getByRole("dialog", { name: title, exact: true });
  await editable(h, dialog.locator("textarea").last());
  return dialog;
}

async function openEntryDialog(h, notes, title) {
  await h.openParticipant(h.fixture.participantId);
  await h.page.getByRole("tab", { name: /^היסטוריית קשר/ }).click();
  const article = h.page.getByRole("tabpanel", { name: /^היסטוריית קשר/ }).locator("article").filter({ has: h.page.getByText(notes, { exact: true }) });
  assert.equal(await article.count(), 1, "The exact current contact must have one visible history entry.");
  await article.getByRole("button", { name: title, exact: true }).click();
  const dialog = h.page.getByRole("dialog", { name: title, exact: true });
  await editable(h, dialog.getByLabel("סיבת השינוי", { exact: true }));
  return dialog;
}

async function submitDialog(h, type, dialog, button = SAVE_CHANGE) {
  const accepted = await h.action(type, () => dialog.getByRole("button", { name: button, exact: true }).click());
  await dialog.waitFor({ state: "hidden" });
  return accepted;
}

async function step(h, name, criteria, run) {
  if (!await h.scenario(name, run, { criteria })) throw new Error(`Contact acceptance stopped after failed prerequisite: ${name}`);
}

/** Real UI scenarios only. The harness supplies the one authorized Clerk
 * session, accepted assigned participant, command observation, and cleanup. */
export async function runContactScenarios(h) {
  const prefix = `בדיקת דפדפן ${h.runId}`;
  const notes = {
    incomplete: `${prefix}: טיוטה בלי מועד המשך`,
    old: `${prefix}: שיחה ישנה שהושלמה`,
    noAnswer: `${prefix}: ניסיון ללא מענה`,
    currentA: `${prefix}: שיחה חדשה גרסה א`,
    currentB: `${prefix}: סיכום מתוקן גרסה ב`,
    correctedTime: `${prefix}: תיקון מועד הקשר`,
  };
  let oldContact;
  let currentA;
  let appointmentAfterOld;
  let appointmentAfterSecond;
  let reviewedBy;

  await step(h, "Completed contact without a next appointment stays an incomplete durable draft", ["AC-20", "TA-11"], async () => {
    const initial = await h.participant();
    assert.equal(initial.contacts.length, 0, "The contact acceptance participant must start without contacts.");
    assert.ok(initial.assignment, "The participant must already be assigned.");
    assert.equal((await h.snapshot()).actor.role, "ceo");
    await openContact(h);
    await h.page.locator("#contact-occurredAt").fill(h.localInput(new Date(Date.now() - 5 * 60_000)));
    await h.page.locator("#contact-nextAppointmentAt").fill("");
    await h.page.locator("#contact-notes").fill(notes.incomplete);
    await h.page.getByText("הטיוטה נשמרה במכשיר הזה", { exact: true }).waitFor({ state: "visible" });
    let contactPosts = 0;
    const observe = (request) => {
      if (new URL(request.url()).pathname !== "/api/mentoring/commands" || request.method() !== "POST") return;
      try { if (request.postDataJSON().type === "record_contact") contactPosts += 1; } catch { /* Only well-formed command requests count. */ }
    };
    h.page.on("request", observe);
    try {
      await h.page.getByRole("button", { name: CONTACT_SUBMIT, exact: true }).click();
      await h.page.getByText("יש לבחור תאריך ושעה לקשר הבא.", { exact: true }).waitFor({ state: "visible" });
      assert.equal(await h.page.locator("#contact-nextAppointmentAt").getAttribute("aria-invalid"), "true");
      await h.poll(() => h.page.locator("#contact-nextAppointmentAt").evaluate((element) => element === document.activeElement), Boolean);
      assert.equal(contactPosts, 0);
      assert.equal((await h.participant()).contacts.length, 0);
    } finally { h.page.off("request", observe); }
    await openContact(h);
    assert.equal(await h.page.locator("#contact-notes").inputValue(), notes.incomplete);
    assert.equal(await h.page.locator("#contact-nextAppointmentAt").inputValue(), "");
    return { localDraftRestoredAfterReload: true, submittedCompletedContacts: 0, nextAppointmentValidationAndFocus: true };
  });

  await step(h, "An accepted historical phone contact updates tracking before management approval", ["AC-03", "AC-07", "AC-19"], async () => {
    const { command } = await completed(h, { occurredAt: new Date(Date.now() - 8 * DAY), nextAt: new Date(Date.now() + DAY), notes: notes.old });
    h.fixture.primaryContactId = command.operationId;
    const view = await h.poll(() => h.participant(), (value) => value.contacts.length === 1 && value.nextAppointment);
    oldContact = view.contacts.find((entry) => entry.id === command.operationId);
    appointmentAfterOld = view.nextAppointment;
    assert.equal(oldContact.method, "phone");
    assert.equal(oldContact.outcome, "completed");
    assert.equal(oldContact.revision, 1);
    assert.equal(typeof oldContact.actorId, "string");
    assert.ok(oldContact.actorId.length > 0, "An accepted contact must identify its author.");
    assert.equal(oldContact.actorId, (await h.snapshot()).actor.id);
    assert.equal(view.reviews.some((review) => review.contactId === oldContact.id), false);
    assert.equal(view.nextAppointment.sourceContactId, oldContact.id);
    await h.page.getByText(OVERDUE, { exact: true }).waitFor({ state: "visible" });
    return { acceptedPhoneContacts: 1, continuingAppointments: 1, managementApprovalRequiredForTracking: false, olderActualTimeProducesIndependentOverdueState: true };
  });

  await step(h, "Manual green is preserved while seven-day tracking remains overdue", ["AC-06", "TA-11"], async () => {
    const before = await h.participant();
    const dialog = await openFollowupDialog(h, "עדכון מצב הליווי");
    await select(h, dialog.getByLabel("מצב הליווי המדווח", { exact: true }), "ירוק — בוצע");
    await dialog.getByLabel("הערה לעדכון (לא חובה)", { exact: true }).fill(`${prefix}: צבע אינו אישור לקשר נוסף`);
    await submitDialog(h, "set_manual_color", dialog);
    const view = await h.poll(() => h.participant(), (value) => value.manualColor === "green");
    assert.deepEqual(contactState(view), contactState(before));
    assert.equal(view.nextAppointment.scheduledAt, before.nextAppointment.scheduledAt);
    assert.ok(view.manualColorHistory.some((entry) => entry.color === "green"));
    await h.page.getByText("ירוק — בוצע", { exact: true }).waitFor({ state: "visible" });
    await h.page.getByText(OVERDUE, { exact: true }).waitFor({ state: "visible" });
    return { manualGreen: true, calculatedOverdue: true, contactsAdded: 0 };
  });

  await step(h, "Moving an overdue appointment preserves the completed-contact anchor", ["AC-05", "AC-19"], async () => {
    const before = await h.participant();
    const dialog = await openFollowupDialog(h, "שינוי מועד הקשר הבא");
    await dialog.getByLabel("מועד הקשר הבא", { exact: true }).fill(h.localInput(new Date(Date.now() + 2 * DAY)));
    await dialog.getByLabel("סיבת השינוי", { exact: true }).fill(`${prefix}: הזזת מועד בלי איפוס מעקב`);
    await submitDialog(h, "reschedule_appointment", dialog);
    const view = await h.participant();
    assert.equal(view.nextAppointment.id, appointmentAfterOld.id);
    assert.equal(view.nextAppointment.version, before.nextAppointment.version + 1);
    assert.equal(latestValidContact(view).occurredAt, oldContact.occurredAt);
    assert.deepEqual(contactState(view), contactState(before));
    assert.ok(view.appointmentHistory.some((change) => change.changeKind === "rescheduled"));
    await h.page.getByText(OVERDUE, { exact: true }).waitFor({ state: "visible" });
    return { oneContinuingAppointment: true, actualContactAnchorUnchanged: true, overdueAfterReschedule: true };
  });

  await step(h, "An unanswered call adds history without resetting cadence or replacing the appointment", ["AC-02", "AC-19"], async () => {
    const before = await h.participant();
    await openContact(h);
    await select(h, h.page.locator("#contact-outcome"), "לא היה מענה");
    assert.equal(await h.page.locator("#contact-nextAppointmentAt").count(), 0);
    await h.page.locator("#contact-occurredAt").fill(h.localInput(new Date(Date.now() - 2 * 60_000)));
    await h.page.locator("#contact-notes").fill(notes.noAnswer);
    const { command } = await h.action("record_contact", () => h.page.getByRole("button", { name: "שמירת התיעוד", exact: true }).click());
    await h.page.waitForURL((url) => url.pathname === `/staff/participants/${h.fixture.participantId}`);
    const view = await h.poll(() => h.participant(), (value) => value.contacts.length === 2);
    assert.equal(view.contacts.find((entry) => entry.id === command.operationId).outcome, "no_answer");
    assert.equal(view.nextAppointment.id, before.nextAppointment.id);
    assert.equal(view.nextAppointment.version, before.nextAppointment.version);
    assert.equal(view.nextAppointment.scheduledAt, before.nextAppointment.scheduledAt);
    assert.equal(latestValidContact(view).occurredAt, oldContact.occurredAt);
    await h.page.getByText(OVERDUE, { exact: true }).waitFor({ state: "visible" });
    return { historyEntries: 2, successfulContacts: 1, appointmentUnchanged: true, overduePreserved: true };
  });

  await step(h, "A second successful contact keeps both reports and one continuing appointment", ["AC-04", "AC-07"], async () => {
    const before = await h.participant();
    const { command } = await completed(h, { occurredAt: new Date(Date.now() - 60 * 60_000), nextAt: new Date(Date.now() + 3 * DAY), notes: notes.currentA });
    h.fixture.latestContactId = command.operationId;
    const view = await h.poll(() => h.participant(), (value) => value.contacts.length === 3);
    currentA = view.contacts.find((entry) => entry.id === command.operationId);
    appointmentAfterSecond = view.nextAppointment;
    assert.equal(typeof currentA.actorId, "string");
    assert.ok(currentA.actorId.length > 0, "The new contact must identify its author.");
    assert.equal(currentA.actorId, (await h.snapshot()).actor.id);
    assert.equal(view.contacts.filter((entry) => entry.outcome === "completed" && !entry.invalidatedAt).length, 2);
    assert.equal(view.nextAppointment.id, before.nextAppointment.id);
    assert.equal(view.nextAppointment.version, before.nextAppointment.version + 1);
    assert.equal(view.nextAppointment.sourceContactId, currentA.id);
    assert.equal(view.reviews.some((review) => review.contactId === currentA.id), false);
    await h.poll(() => h.page.getByText(OVERDUE, { exact: true }).count(), (count) => count === 0);
    return { acceptedHistoryEntries: 3, successfulContacts: 2, continuingAppointmentRows: 1, trackingUpdatedBeforeApproval: true };
  });

  await step(h, "Management review decisions retain exact-revision attribution and immutable history", ["AC-07", "TA-07"], async () => {
    await h.navigate("/staff/reviews");
    const card = h.page.locator('[data-slot="card"]').filter({ has: h.page.getByText(notes.currentA, { exact: true }) });
    assert.equal(await card.count(), 1);
    reviewedBy = (await h.snapshot()).actor.id;
    // The supported UI locks review controls after approval. Return first,
    // then approve the same revision to exercise attributable immutable events.
    await h.action("review_contact", () => card.getByRole("button", { name: "החזרה להשלמה", exact: true }).click());
    const returned = await h.poll(() => h.participant(), (value) => value.reviews.some((review) => review.contactId === currentA.id && review.revision === 1 && review.decision === "returned_for_correction"));
    assert.ok(returned.reviewEvents.some((event) => event.contactId === currentA.id && event.revision === 1 && event.reviewedByStaffId === reviewedBy && event.decision === "returned_for_correction"));
    await h.action("review_contact", () => card.getByRole("button", { name: "אישור הדיווח", exact: true }).click());
    const view = await h.poll(() => h.participant(), (value) => value.reviewEvents.filter((event) => event.contactId === currentA.id && event.revision === 1).length === 2);
    assert.ok(view.reviewEvents.some((event) => event.contactId === currentA.id && event.revision === 1 && event.reviewedByStaffId === reviewedBy && event.decision === "approved"));
    assert.equal(view.nextAppointment.id, appointmentAfterSecond.id);
    assert.equal(view.nextAppointment.version, appointmentAfterSecond.version);
    assert.equal(view.nextAppointment.scheduledAt, appointmentAfterSecond.scheduledAt);
    return { reviewedRevision: 1, immutableReviewEvents: 2, reviewerAttributed: true, appointmentUnchanged: true };
  });

  await step(h, "A notes-only correction preserves approved revision A while revision B is unapproved", ["TA-07", "TA-13"], async () => {
    const before = await h.participant();
    const dialog = await openEntryDialog(h, notes.currentA, "תיקון דיווח");
    await dialog.getByLabel("סיכום הדיווח המתוקן", { exact: true }).fill(notes.currentB);
    await dialog.getByLabel("סיבת השינוי", { exact: true }).fill(`${prefix}: הבהרת סיכום בלבד`);
    assert.equal(await dialog.getByLabel("מועד הקשר הבא", { exact: true }).count(), 0);
    await submitDialog(h, "revise_contact", dialog);
    const view = await h.poll(() => h.participant(), (value) => value.contacts.find((entry) => entry.id === currentA.id)?.revision === 2);
    const current = view.contacts.find((entry) => entry.id === currentA.id);
    const revisionA = view.contactRevisions.find((entry) => entry.id === currentA.id && entry.revision === 1);
    const revisionB = view.contactRevisions.find((entry) => entry.id === currentA.id && entry.revision === 2);
    assert.equal(current.notes, notes.currentB);
    assert.equal(current.actorId, currentA.actorId);
    assert.equal(current.receivedAt, currentA.receivedAt);
    assert.equal(current.occurredAt, currentA.occurredAt);
    assert.equal(revisionA.notes, notes.currentA);
    assert.equal(revisionA.review?.decision, "approved");
    assert.equal(revisionA.review?.revision, 1);
    assert.equal(revisionB.review, null);
    assert.equal(revisionB.changeKind, "correction");
    assert.equal(revisionB.revisedByStaffId, reviewedBy);
    assert.equal(view.reviews.some((review) => review.contactId === currentA.id && review.revision === 2), false);
    assert.equal(view.nextAppointment.version, before.nextAppointment.version);
    assert.equal(view.nextAppointment.scheduledAt, before.nextAppointment.scheduledAt);
    const currentArticle = h.page.getByRole("tabpanel", { name: /^היסטוריית קשר/ }).locator("article").filter({ has: h.page.getByText(notes.currentB, { exact: true }) });
    await currentArticle.getByText("ממתין לבקרה", { exact: true }).waitFor({ state: "visible" });
    await h.page.getByRole("tab", { name: "שינויים ואחריות", exact: true }).click();
    const changes = h.page.getByRole("tabpanel", { name: "שינויים ואחריות", exact: true });
    await changes.getByText("ההחלטה מתייחסת לגרסה 1 של הדיווח.", { exact: true }).first().waitFor({ state: "visible" });
    await changes.getByText(notes.currentA, { exact: true }).waitFor({ state: "visible" });
    await changes.getByText(notes.currentB, { exact: true }).waitFor({ state: "visible" });
    return { approvedRevisionAStillAttributed: true, revisionBApproved: false, originalAuthorAndReceiptPreserved: true, appointmentUnchanged: true, readableHistory: true };
  });

  await step(h, "Correcting the latest actual contact time requires an explicit next appointment", ["TA-13", "TA-11"], async () => {
    const dialog = await openEntryDialog(h, notes.currentB, "תיקון דיווח");
    await dialog.getByLabel("מועד הקשר בפועל", { exact: true }).fill(h.localInput(new Date(Date.now() - 30 * 60_000)));
    const next = dialog.getByLabel("מועד הקשר הבא", { exact: true });
    await next.waitFor({ state: "visible" });
    await next.fill("");
    await dialog.getByLabel("סיבת השינוי", { exact: true }).fill(notes.correctedTime);
    const before = await h.participant();
    await dialog.getByRole("button", { name: SAVE_CHANGE, exact: true }).click();
    await dialog.getByText("יש לבחור פגישה הבאה לאחר מועד הקשר המתוקן.", { exact: true }).waitFor({ state: "visible" });
    assert.equal((await h.participant()).contacts.find((entry) => entry.id === currentA.id).revision, 2);
    await next.fill(h.localInput(new Date(Date.now() + 4 * DAY)));
    await submitDialog(h, "revise_contact", dialog);
    const view = await h.poll(() => h.participant(), (value) => value.contacts.find((entry) => entry.id === currentA.id)?.revision === 3);
    const current = view.contacts.find((entry) => entry.id === currentA.id);
    assert.notEqual(current.occurredAt, currentA.occurredAt);
    assert.equal(current.receivedAt, currentA.receivedAt);
    assert.equal(view.nextAppointment.id, before.nextAppointment.id);
    assert.equal(view.nextAppointment.version, before.nextAppointment.version + 1);
    assert.equal(view.nextAppointment.sourceContactId, current.id);
    assert.equal(view.nextAppointment.requiresReview, false);
    assert.ok(view.appointmentHistory.some((change) => change.changeKind === "contact_correction"));
    return { missingNextAppointmentRejected: true, acceptedCorrectedRevision: 3, oneContinuingAppointment: true, originalReceiptPreserved: true };
  });

  await step(h, "Invalidating the latest contact preserves revisions and approval while restoring the earlier cadence", ["TA-13", "AC-19"], async () => {
    const before = await h.participant();
    const dialog = await openEntryDialog(h, notes.currentB, "פסילת דיווח");
    await dialog.getByLabel("סיבת השינוי", { exact: true }).fill(`${prefix}: פסילת הדיווח החדש לצורך בדיקת היסטוריה`);
    await submitDialog(h, "invalidate_contact", dialog, "פסילת הדיווח ושמירת הסיבה");
    const view = await h.poll(() => h.participant(), (value) => value.contacts.find((entry) => entry.id === currentA.id)?.invalidatedAt);
    h.fixture.invalidatedContactId = currentA.id;
    const invalidated = view.contacts.find((entry) => entry.id === currentA.id);
    assert.equal(view.contacts.length, 3);
    assert.equal(invalidated.revision, 4);
    assert.equal(view.contactRevisions.filter((entry) => entry.id === currentA.id).length, 4);
    assert.equal(view.contactRevisions.find((entry) => entry.id === currentA.id && entry.revision === 1).review?.decision, "approved");
    assert.equal(view.reviewEvents.filter((event) => event.contactId === currentA.id && event.revision === 1).length, 2);
    assert.equal(view.nextAppointment.id, before.nextAppointment.id);
    assert.equal(view.nextAppointment.scheduledAt, before.nextAppointment.scheduledAt);
    assert.equal(view.nextAppointment.requiresReview, true);
    assert.ok(view.contactWarnings.includes("appointment_requires_review"));
    assert.equal(latestValidContact(view).id, oldContact.id);
    await h.page.getByText("צריך לבדוק את מועד הקשר הבא", { exact: true }).waitFor({ state: "visible" });
    await h.page.getByText(OVERDUE, { exact: true }).waitFor({ state: "visible" });
    const invalidatedArticle = h.page.getByRole("tabpanel", { name: /^היסטוריית קשר/ }).locator("article").filter({ has: h.page.getByText(notes.currentB, { exact: true }) });
    await invalidatedArticle.getByText("דיווח שבוטל", { exact: true }).waitFor({ state: "visible" });
    assert.equal(await invalidatedArticle.getByRole("button", { name: "תיקון דיווח", exact: true }).count(), 0);
    return { contactDeleted: false, immutableRevisions: 4, immutableReviewEvents: 2, priorContactAnchorRestored: true, appointmentRetainedForReview: true };
  });

  await step(h, "Explicit rescheduling clears the appointment warning without changing overdue contact history", ["AC-05", "TA-13"], async () => {
    const before = await h.participant();
    const dialog = await openFollowupDialog(h, "שינוי מועד הקשר הבא");
    await dialog.getByLabel("מועד הקשר הבא", { exact: true }).fill(h.localInput(new Date(Date.now() + 5 * DAY)));
    await dialog.getByLabel("סיבת השינוי", { exact: true }).fill(`${prefix}: מועד נבדק לאחר פסילת דיווח`);
    await submitDialog(h, "reschedule_appointment", dialog);
    const view = await h.participant();
    assert.equal(view.nextAppointment.id, before.nextAppointment.id);
    assert.equal(view.nextAppointment.version, before.nextAppointment.version + 1);
    assert.equal(view.nextAppointment.requiresReview, false);
    assert.equal(view.contactWarnings.includes("appointment_requires_review"), false);
    assert.deepEqual(contactState(view), contactState(before));
    assert.equal(latestValidContact(view).id, oldContact.id);
    assert.equal(view.manualColor, "green");
    await h.page.getByText(OVERDUE, { exact: true }).waitFor({ state: "visible" });
    await h.poll(() => h.page.getByText("צריך לבדוק את מועד הקשר הבא", { exact: true }).count(), (count) => count === 0);
    await h.page.getByRole("tab", { name: "שינויים ואחריות", exact: true }).click();
    await h.page.getByText("היסטוריית שינויים ואחריות", { exact: true }).waitFor({ state: "visible" });
    await h.page.getByText("ביטול דיווח קשר", { exact: true }).waitFor({ state: "visible" });
    h.fixture.contactNotes = { ...notes };
    return { appointmentWarningCleared: true, contactHistoryUnchanged: true, manualGreenAndOverdueRemain: true, screenshot: await h.screenshot("contact-revisions-history-desktop") };
  });
}
