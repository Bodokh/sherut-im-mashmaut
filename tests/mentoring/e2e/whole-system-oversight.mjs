import assert from "node:assert/strict";

const currentMonth = (instant) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit" }).formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}`;
};
const policyFields = ["offlineLeaseHours", "reminderAudience", "appointmentReminderMinutesBefore", "overdueRemindersEnabled", "overdueRepeatHours"];
const policyOf = (settings) => Object.fromEntries(policyFields.map((key) => [key, settings[key]]));

function expectedMetrics(snapshot, month, coordinatorId) {
  const participants = snapshot.participants.filter((view) => view.assignment?.coordinatorId === coordinatorId);
  const contacts = participants.flatMap((view) => view.contacts);
  const actual = contacts.filter((contact) => contact.invalidatedAt == null && currentMonth(contact.occurredAt) === month);
  return {
    "חניכות נוכחיות בהיקף הנבחר": participants.filter((view) => !view.participant.deletedAt && !view.deletedAt).length,
    "קשרים שהתקיימו בחודש": actual.filter((contact) => contact.outcome === "completed").length,
    "ניסיונות ללא מענה בחודש": actual.filter((contact) => contact.outcome === "no_answer").length,
    "דיווחים שהתקבלו בחודש": contacts.filter((contact) => currentMonth(contact.receivedAt) === month).length,
  };
}

async function metricValue(h, title) {
  const card = h.page.locator('[data-slot="card"]').filter({ has: h.page.getByText(title, { exact: true }) });
  assert.equal(await card.count(), 1, `Expected exactly one monthly metric for ${title}.`);
  const value = (await card.locator('[data-slot="card-title"]').textContent()).trim();
  assert.match(value, /^\d+$/, `Monthly metric ${title} must show an integer.`);
  return Number(value);
}

async function chooseMonthAndScope(h, month, coordinatorId) {
  await h.navigate("/staff/oversight");
  await h.page.locator("#oversight-month").fill(month);
  const coordinator = (await h.snapshot()).staff.find((member) => member.id === coordinatorId);
  assert.ok(coordinator);
  await h.select("היקף הסקירה", `הצוות של ${coordinator.displayName}`);
  await h.poll(() => h.page.locator("#oversight-month").inputValue(), (value) => value === month);
}

async function assertMetrics(h, expected) {
  for (const [title, count] of Object.entries(expected)) await h.poll(() => metricValue(h, title), (value) => value === count);
}

async function editPolicy(h, policy, reason) {
  await h.navigate("/staff/settings");
  await h.poll(() => h.page.locator("#settings-offline-hours").isEnabled(), Boolean);
  await h.page.locator("#settings-offline-hours").fill(String(policy.offlineLeaseHours));
  await h.select("למי מיועדות התזכורות", policy.reminderAudience === "all_staff" ? "לכל הצוות" : "לצוות הליווי האחראי");
  await h.page.locator("#settings-reminder-minutes").fill(String(policy.appointmentReminderMinutesBefore));
  const overdue = h.page.getByRole("switch", { name: "תזכורות על איחור בקשר", exact: true });
  if ((await overdue.getAttribute("aria-checked")) !== String(policy.overdueRemindersEnabled)) await overdue.click();
  await h.page.locator("#settings-repeat-hours").fill(policy.overdueRepeatHours === null ? "" : String(policy.overdueRepeatHours));
  await h.page.locator("#settings-reason").fill(reason);
  return h.action("update_organization_settings", () => h.page.getByRole("button", { name: "שמירת הגדרות הארגון", exact: true }).click());
}

/** Accepted database data and actual UI only. This module never opens a
 * browser, connects a database, changes a provider, or sends messages itself. */
export async function runOversightScenarios(h) {
  const marker = `בדיקת דפדפן ${h.runId}`;
  assert.equal((await h.snapshot()).actor.role, "ceo");
  let receivedMonth, occurredMonth, lateContactId, lateParticipantId;
  const ready = await h.scenario("Monthly oversight distinguishes a previous-month contact from its current central receipt", async () => {
    const before = await h.snapshot();
    receivedMonth = currentMonth(before.serverTime);
    const [year, month] = receivedMonth.split("-").map(Number);
    const occurredAt = new Date(Date.UTC(year, month - 2, 15, 12));
    occurredMonth = currentMonth(occurredAt.toISOString());
    assert.notEqual(occurredMonth, receivedMonth);
    lateParticipantId = await h.createParticipant("oversight-late");
    h.fixture.oversightParticipantId = lateParticipantId;
    await h.assignParticipant(lateParticipantId, h.fixture.mentorId, h.fixture.coordinatorId);
    const notes = `${marker}: קשר מחודש קודם שדווח כעת`;
    await h.navigate(`/staff/contacts/new?participant=${lateParticipantId}`);
    await h.page.locator("#contact-occurredAt").fill(h.localInput(occurredAt));
    await h.page.locator("#contact-nextAppointmentAt").fill(h.localInput(new Date(Date.parse(before.serverTime) + 86_400_000)));
    await h.page.locator("#contact-notes").fill(notes);
    const { command } = await h.action("record_contact", () => h.page.getByRole("button", { name: "שמירת התיעוד והפגישה הבאה", exact: true }).click());
    lateContactId = command.operationId;
    const snapshot = await h.poll(h.snapshot, (value) => value.participants.find((view) => view.participant.id === lateParticipantId)?.contacts.some((contact) => contact.id === lateContactId));
    const entry = snapshot.participants.find((view) => view.participant.id === lateParticipantId).contacts.find((contact) => contact.id === lateContactId);
    assert.equal(currentMonth(entry.occurredAt), occurredMonth);
    assert.equal(currentMonth(entry.receivedAt), receivedMonth);
    assert.equal(entry.outcome, "completed");
    assert.equal(entry.invalidatedAt, null);
    await chooseMonthAndScope(h, occurredMonth, h.fixture.coordinatorId);
    const expected = expectedMetrics(snapshot, occurredMonth, h.fixture.coordinatorId);
    await assertMetrics(h, expected);
    const details = h.page.locator("details").filter({ has: h.page.getByText(h.manifest.names.participants[lateParticipantId], { exact: true }) }).first();
    await details.locator("summary").first().click();
    await details.getByText(notes, { exact: true }).waitFor({ state: "visible" });
    await details.getByText("נקלט לאחר סוף החודש", { exact: true }).waitFor({ state: "visible" });
    await details.getByText("מועד הקשר · בחודש הנבחר", { exact: true }).waitFor({ state: "visible" });
    await details.getByText("נקלט במערכת", { exact: true }).waitFor({ state: "visible" });
    return { occurredMonth, receivedMonth, historicalActualContactCount: expected["קשרים שהתקיימו בחודש"], receiptInDifferentMonth: true, screenshot: await h.screenshot("oversight-previous-month-desktop") };
  }, { criteria: ["AC-17", "TA-12"] });
  if (!ready) throw new Error("Monthly timing prerequisites failed; dependent oversight scenarios were not run.");

  const metricsReady = await h.scenario("The receipt month shows original reports separately from corrections and invalidations", async () => {
    const snapshot = await h.snapshot();
    await chooseMonthAndScope(h, receivedMonth, h.fixture.coordinatorId);
    const expected = expectedMetrics(snapshot, receivedMonth, h.fixture.coordinatorId);
    await assertMetrics(h, expected);
    await h.page.getByText("מועד הקשר ומועד הדיווח מוצגים בנפרד", { exact: true }).waitFor({ state: "visible" });
    const details = h.page.locator("details").filter({ has: h.page.getByText(h.manifest.names.participants[lateParticipantId], { exact: true }) }).first();
    await details.locator("summary").first().click();
    await details.getByText("נקלט במערכת · בחודש הנבחר", { exact: true }).waitFor({ state: "visible" });
    await details.getByText("מועד הקשר", { exact: true }).waitFor({ state: "visible" });
    const source = snapshot.participants.filter((view) => view.assignment?.coordinatorId === h.fixture.coordinatorId).flatMap((view) => view.contactRevisions ?? []);
    const corrections = source.filter((revision) => revision.changeKind === "correction" && currentMonth(revision.revisedAt) === receivedMonth).length;
    const invalidations = source.filter((revision) => revision.changeKind === "invalidation" && currentMonth(revision.revisedAt) === receivedMonth).length;
    assert.ok(corrections > 0 && invalidations > 0, "The contact-revision suite must precede monthly oversight.");
    await h.page.getByText(new RegExp(`בחודש הנבחר נקלטו גם\\s+${corrections} תיקוני\\s+דיווח ו־${invalidations} ביטולי דיווח`)).waitFor({ state: "visible" });
    return { originalReportsReceived: expected["דיווחים שהתקבלו בחודש"], correctionsReceived: corrections, invalidationsReceived: invalidations, lateOriginalReceiptIncluded: true, inferredWellbeingScore: false };
  }, { criteria: ["AC-17", "TA-12", "TA-13"] });
  if (!metricsReady) throw new Error("Current-month oversight metrics did not match accepted evidence.");

  const notesReady = await h.scenario("A synthetic team's monthly narrative retains attributed version history", async () => {
    await chooseMonthAndScope(h, receivedMonth, h.fixture.coordinatorId);
    const snapshot = await h.snapshot();
    assert.equal(snapshot.monthlyReviews?.some((review) => review.month === receivedMonth && review.scopeStaffId === h.fixture.coordinatorId) ?? false, false);
    const first = `${marker}: סקירת צוות ראשונה; תובנות מתוך דיווחי החונכות`;
    const second = `${marker}: סקירת צוות שנייה; החלטה להמשך מעקב`;
    await h.poll(() => h.page.locator("#monthly-review-summary").isEnabled(), Boolean);
    await h.page.locator("#monthly-review-summary").fill(first);
    const reviewed = h.page.getByRole("switch", { name: "הסקירה החודשית הושלמה", exact: true });
    if ((await reviewed.getAttribute("aria-checked")) !== "true") await reviewed.click();
    await h.action("save_monthly_review", () => h.page.getByRole("button", { name: "שמירת הסקירה", exact: true }).click());
    let current = await h.poll(h.snapshot, (value) => value.monthlyReviews?.some((review) => review.scopeStaffId === h.fixture.coordinatorId && review.month === receivedMonth && review.version === 1));
    let review = current.monthlyReviews.find((item) => item.scopeStaffId === h.fixture.coordinatorId && item.month === receivedMonth);
    assert.equal(review.summary, first); assert.equal(review.reviewed, true); assert.equal(review.updatedBy, h.actorId); assert.equal(review.ceoProtected, true);
    await h.page.getByRole("button", { name: "פתיחת טיוטה חדשה", exact: true }).click();
    await h.poll(() => h.page.locator("#monthly-review-summary").isEnabled(), Boolean);
    await h.page.locator("#monthly-review-summary").fill(second);
    await h.action("save_monthly_review", () => h.page.getByRole("button", { name: "שמירת הסקירה", exact: true }).click());
    current = await h.poll(h.snapshot, (value) => value.monthlyReviews?.some((review) => review.scopeStaffId === h.fixture.coordinatorId && review.month === receivedMonth && review.version === 2));
    review = current.monthlyReviews.find((item) => item.scopeStaffId === h.fixture.coordinatorId && item.month === receivedMonth);
    assert.equal(review.summary, second); assert.equal(review.updatedBy, h.actorId); assert.equal(review.reviewed, true); assert.equal(review.ceoProtected, true);
    const version1 = review.history.find((entry) => entry.version === 1);
    assert.equal(version1?.summary, first); assert.equal(version1.updatedBy, h.actorId); assert.equal(version1.reviewed, true);
    h.fixture.monthlyReviewId = review.id;
    h.fixture.monthlyReviewMonth = receivedMonth;
    await h.page.locator("summary").filter({ hasText: "היסטוריית הסקירה" }).click();
    await h.page.getByText(first, { exact: true }).waitFor({ state: "visible" });
    await h.page.reload({ waitUntil: "domcontentloaded" });
    await h.page.locator("#oversight-month").waitFor({ state: "visible" });
    const persisted = (await h.snapshot()).monthlyReviews.find((item) => item.id === review.id);
    assert.equal(persisted.version, 2); assert.equal(persisted.summary, second); assert.equal(persisted.history.length, 2);
    await chooseMonthAndScope(h, receivedMonth, h.fixture.coordinatorId);
    await h.page.locator("summary").filter({ hasText: "היסטוריית הסקירה" }).click();
    await h.page.getByText(first, { exact: true }).waitFor({ state: "visible" });
    return { syntheticTeamScope: true, versions: 2, originalPreserved: true, attributedToApprovedActor: true, ceoProtection: true, screenshot: await h.screenshot("oversight-review-history-desktop") };
  }, { criteria: ["AC-17", "TA-12"] });
  if (!notesReady) throw new Error("Monthly narrative history did not meet acceptance.");

  const settingsReady = await h.scenario("CEO validates, versions, and restores organization policy through real settings controls", async () => {
    assert.equal(h.fixture.nonFixtureParticipants, 0, "Organization-wide policy changes require an empty nonfixture participant baseline.");
    const original = policyOf((await h.snapshot()).settings);
    const initialVersion = (await h.snapshot()).settings.version;
    await h.navigate("/staff/settings");
    await h.poll(() => h.page.locator("#settings-offline-hours").isEnabled(), Boolean);
    await h.page.locator("#settings-offline-hours").fill("0");
    await h.page.locator("#settings-reason").fill(`${marker}: בדיקת טווח לא תקין`);
    const beforeInvalid = h.submitted.size;
    await h.page.getByRole("button", { name: "שמירת הגדרות הארגון", exact: true }).click();
    assert.equal(await h.page.locator("#settings-offline-hours").evaluate((input) => input.validity.rangeUnderflow), true);
    assert.equal(h.submitted.size, beforeInvalid);
    const changed = { ...original, reminderAudience: original.reminderAudience === "responsible_team" ? "all_staff" : "responsible_team", appointmentReminderMinutesBefore: original.appointmentReminderMinutesBefore === 15 ? 30 : 15, overdueRemindersEnabled: true, overdueRepeatHours: original.overdueRepeatHours === 12 ? 24 : 12 };
    await editPolicy(h, changed, `${marker}: שינוי מדיניות זמני לבדיקת המערכת`);
    const accepted = await h.poll(h.snapshot, (value) => value.settings.version === initialVersion + 1);
    assert.deepEqual(policyOf(accepted.settings), changed);
    assert.equal(accepted.settings.updatedBy, h.actorId);
    await editPolicy(h, original, `${marker}: החזרת מדיניות הארגון לערכי המקור`);
    const restored = await h.poll(h.snapshot, (value) => value.settings.version === initialVersion + 2);
    assert.deepEqual(policyOf(restored.settings), original);
    const history = await h.database.query("SELECT version,reason,updated_by FROM mentoring.organization_settings_history WHERE organization_id=$1 AND version=ANY($2::int[]) ORDER BY version", [h.manifest.organizationId, [initialVersion + 1, initialVersion + 2]]);
    assert.equal(history.rowCount, 2);
    for (const row of history.rows) { assert.equal(row.updated_by, h.actorId); assert.ok(row.reason.includes(h.runId)); }
    return { invalidRangeSentCommands: 0, versionedSaves: 2, originalPolicyRestoredViaUI: true, settingsHistoryAttributed: true };
  }, { criteria: ["AC-14", "AC-17"] });
  if (!settingsReady) throw new Error("Organization policy was not safely verified and restored.");

  const smsReady = await h.scenario("CEO SMS self-mute persists without changing other staff preferences", async () => {
    const before = await h.snapshot(), initialMuted = before.actor.smsMuted;
    await h.navigate("/staff/settings");
    const toggle = h.page.getByRole("switch", { name: "קבלת תזכורות ב־SMS", exact: true });
    await h.poll(() => toggle.isEnabled(), Boolean);
    await h.action("set_sms_muted", () => toggle.click());
    const muted = await h.poll(h.snapshot, (value) => value.actor.smsMuted !== initialMuted);
    for (const member of before.staff.filter((member) => member.id !== h.actorId)) assert.equal(muted.staff.find((item) => item.id === member.id)?.smsMuted, member.smsMuted);
    await h.page.reload({ waitUntil: "domcontentloaded" });
    await h.poll(() => h.page.getByRole("switch", { name: "קבלת תזכורות ב־SMS", exact: true }).isEnabled(), Boolean);
    assert.equal((await h.snapshot()).actor.smsMuted, !initialMuted);
    await h.action("set_sms_muted", () => h.page.getByRole("switch", { name: "קבלת תזכורות ב־SMS", exact: true }).click());
    const restored = await h.poll(h.snapshot, (value) => value.actor.smsMuted === initialMuted);
    assert.equal(restored.capabilities.smsConfigured, false); assert.equal(restored.capabilities.smsSendingEnabled, false);
    return { selfPreferencePersisted: true, otherStaffPreferencesUnchanged: true, originalSelfPreferenceRestored: true, providerDeliveryClaimed: false };
  }, { criteria: ["AC-14", "AC-15"] });
  if (!smsReady) throw new Error("CEO self-mute preference was not verified and restored.");

  const remindersReady = await h.scenario("Repeated real reminder scans keep canonical staff-only jobs blocked with no delivery claim", async () => {
    await h.navigate("/staff/reminders");
    const readiness = (await h.snapshot()).reminderReadiness;
    assert.ok(readiness);
    assert.equal(readiness.smsProviderConfigured, false); assert.equal(readiness.smsCredentialsConfigured, false); assert.equal(readiness.smsSendingEnabled, false);
    await h.page.getByText("טרם הוגדר — השליחה חסומה", { exact: true }).waitFor({ state: "visible" });
    await h.action("evaluate_reminders", () => h.page.getByRole("button", { name: "סריקת תזכורות", exact: true }).click());
    await h.page.getByText("סריקת התזכורות הושלמה והמידע עודכן. מצב השליחה מוצג בכל תזכורת.", { exact: true }).waitFor({ state: "visible" });
    const readJobs = () => h.database.query("SELECT id,participant_id,recipient_staff_id,occurrence_key,state,reason FROM mentoring.reminder_jobs WHERE organization_id=$1 AND participant_id=ANY($2::uuid[]) ORDER BY id", [h.manifest.organizationId, h.manifest.participantIds]);
    const first = await readJobs(); assert.ok(first.rowCount > 0);
    const snapshot = await h.snapshot(), staffIds = new Set(snapshot.staff.map((member) => member.id));
    const participantIds = new Set(h.manifest.participantIds);
    const active = first.rows.filter((job) => job.state !== "cancelled"); assert.ok(active.length > 0);
    for (const job of first.rows) { assert.ok(staffIds.has(job.recipient_staff_id)); assert.equal(participantIds.has(job.recipient_staff_id), false); assert.ok(!["dispatching", "provider_accepted", "delivered", "uncertain"].includes(job.state)); }
    for (const job of active) { assert.equal(job.state, "blocked"); assert.ok(["missing_sms_provider", "missing_sms_credentials", "sending_disabled", "invalid_staff_phone"].includes(job.reason)); }
    await h.page.getByText("השליחה חסומה", { exact: true }).first().waitFor({ state: "visible" });
    await h.action("evaluate_reminders", () => h.page.getByRole("button", { name: "סריקת תזכורות", exact: true }).click());
    await h.page.getByText("סריקת התזכורות הושלמה והמידע עודכן. מצב השליחה מוצג בכל תזכורת.", { exact: true }).waitFor({ state: "visible" });
    const second = await readJobs();
    assert.deepEqual(second.rows.map((job) => job.id), first.rows.map((job) => job.id));
    assert.equal(new Set(second.rows.map((job) => `${job.participant_id}:${job.recipient_staff_id}:${job.occurrence_key}`)).size, second.rowCount);
    const attempts = await h.database.query("SELECT count(*)::int AS n FROM mentoring.reminder_attempts WHERE organization_id=$1 AND participant_id=ANY($2::uuid[])", [h.manifest.organizationId, h.manifest.participantIds]);
    assert.equal(attempts.rows[0].n, 0);
    return { scans: 2, canonicalJobCount: second.rowCount, activeBlockedJobs: active.length, duplicateLogicalJobs: 0, onlyStaffRecipients: true, dispatchAttempts: 0, smsDeliveryTested: false, screenshot: await h.screenshot("reminders-blocked-desktop") };
  }, { criteria: ["AC-13", "AC-14", "AC-15"] });
  if (!remindersReady) throw new Error("Reminder canonical planning or blocked-state acceptance failed.");
}
