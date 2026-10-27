import assert from "node:assert/strict";

const privateDatabase = "sherut-mentoring-private-v1";
const day = 86_400_000;
const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Read the actual browser's existing database without seeding/mutating it.
 * Only generated command intents and bounded state metadata leave the page. */
async function localState(h) {
  return h.page.evaluate(async (name) => {
    const databases = await indexedDB.databases();
    if (!databases.some((database) => database.name === name)) throw new Error("The prepared private database is missing.");
    const connection = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onupgradeneeded = () => { request.transaction.abort(); reject(new Error("Read-only inspection cannot create or upgrade a database.")); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("Read-only private state inspection failed."));
    });
    try {
      const transaction = connection.transaction(["session", "operations", "vaults", "drafts"], "readonly");
      const get = (request) => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error("Read-only private state request failed.")); });
      const [session, operations, vaults, drafts] = await Promise.all([
        get(transaction.objectStore("session").get("active")),
        get(transaction.objectStore("operations").getAll()),
        get(transaction.objectStore("vaults").getAll()),
        get(transaction.objectStore("drafts").getAll()),
      ]);
      return {
        active: session ? {
          scopeKey: session.scope.key,
          staff: session.snapshot.staff.map((member) => ({ id: member.id, active: member.active, role: member.role })),
          participantIds: session.snapshot.participants.map((view) => view.participant.id),
        } : null,
        operations: operations.map((operation) => ({ command: operation.command, status: operation.status, scopeKey: operation.scopeKey, sequence: operation.sequence, dependsOnOperationIds: operation.dependsOnOperationIds ?? [], failureCode: operation.failure?.error?.code ?? null })),
        vaults: vaults.map((vault) => ({ id: vault.id, reason: vault.reason })),
        drafts: drafts.map((draft) => ({ key: draft.key, scopeKey: draft.scopeKey, draftKey: draft.draftKey ?? JSON.parse(draft.key)[1], savedAt: draft.savedAt, recoveredAt: draft.recoveredAt ?? null })),
      };
    } finally { connection.close(); }
  }, privateDatabase);
}

async function remember(h, state) {
  for (const operation of state.operations) h.track(operation.command);
  await h.saveManifest();
  return state;
}

async function queued(h, type, perform, matches = () => true) {
  const before = new Set((await localState(h)).operations.map((operation) => operation.command.operationId));
  await perform();
  const state = await h.poll(() => localState(h), (state) => state.operations.some((operation) => !before.has(operation.command.operationId) && operation.command.type === type && matches(operation.command)));
  await remember(h, state);
  const operation = state.operations.find((operation) => !before.has(operation.command.operationId) && operation.command.type === type && matches(operation.command));
  assert.equal(operation.status, "pending");
  return operation;
}

async function acceptedQueue(h, operationIds) {
  await h.poll(() => localState(h), (state) => {
    const remaining = state.operations.filter((operation) => operationIds.includes(operation.command.operationId));
    const blocked = remaining.find((operation) => operation.status !== "pending");
    assert.ok(!blocked, blocked ? `Queued ${blocked.command.type} was preserved instead of accepted (${blocked.failureCode ?? blocked.status}).` : undefined);
    // Accepted operations leave the outbox only after their durable receipt is
    // written. A partial server snapshot must not stand in for a drained queue.
    return remaining.length === 0;
  });
}

async function closeQueuedContactAction(h, dialog) {
  const state = await h.poll(async () => {
    // Revision changes can unmount the history article and its dialog. The
    // followup actions stay mounted and require an explicit acknowledgement.
    if (!await dialog.isVisible()) return "hidden";
    return await dialog.getByText("השינוי ממתין לאישור המערכת", { exact: true }).isVisible() ? "acknowledged" : "pending";
  }, (state) => state !== "pending");
  if (state === "acknowledged") await dialog.getByRole("button", { name: "סגירה", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
}

async function offlineStaff(h, role, key, coordinator) {
  await h.navigate("/staff/team");
  await h.page.getByRole("button", { name: "הוספת חבר/ת צוות", exact: true }).click();
  const dialog = h.page.getByRole("dialog");
  const name = `בדיקת דפדפן ${h.runId} ${role === "coordinator" ? "רכזת" : "חונכת"} ${key}`;
  await dialog.getByLabel("שם מלא", { exact: true }).fill(name);
  await dialog.getByLabel("כתובת דוא״ל להתחברות", { exact: true }).fill(`mentoring-e2e-${h.runId}-${key}@example.com`);
  await dialog.getByRole("button", { name: role === "coordinator" ? "רכז/ת" : "חונך/ת", exact: true }).click();
  if (coordinator) {
    await dialog.getByLabel("רכז/ת אחראי/ת", { exact: true }).click();
    await h.page.getByRole("option", { name: new RegExp(`^${escapePattern(coordinator.name)}(?: · בקשת חברות ממתינה לאישור)?$`) }).click();
  }
  const operation = await queued(h, "create_staff", () => dialog.getByRole("button", { name: "אישור חברות בצוות", exact: true }).click());
  await dialog.waitFor({ state: "hidden" });
  const row = h.page.getByRole("row").filter({ hasText: name });
  await row.getByText("בקשת חברות ממתינה לאישור", { exact: true }).waitFor({ state: "visible" });
  assert.equal(await row.getByText("גישה פעילה", { exact: true }).count(), 0);
  const state = await localState(h);
  assert.equal(state.active.staff.some((member) => member.id === operation.command.operationId), false);
  return { id: operation.command.operationId, name, operation };
}

async function offlineParticipant(h, key) {
  await h.navigate("/staff/participants");
  await h.page.getByRole("button", { name: "חניכה חדשה", exact: true }).click();
  const dialog = h.page.getByRole("dialog");
  const name = `בדיקת דפדפן ${h.runId} חניכה ${key}`;
  await dialog.getByLabel("שם החניכה", { exact: true }).fill(name);
  const operation = await queued(h, "create_participant", () => dialog.getByRole("button", { name: "יצירת כרטיס", exact: true }).click());
  const id = operation.command.operationId;
  // Queued creates stay on the list until central acceptance; open the local
  // projected card explicitly instead of inventing an automatic redirect.
  await dialog.waitFor({ state: "hidden" });
  await h.openParticipant(id);
  await h.page.getByRole("heading", { name, exact: true }).waitFor({ state: "visible" });
  return { id, name, operation };
}

async function offlineAssignment(h, participant, mentor, coordinator) {
  await h.openParticipant(participant.id, "פרטי החניכה והליווי");
  await h.page.getByRole("button", { name: "שיוך לחונך/ת", exact: true }).click();
  const dialog = h.page.getByRole("dialog");
  await h.select("חונך/ת אחראי/ת", mentor.name, dialog);
  await h.select("רכז/ת אחראי/ת", coordinator.name, dialog);
  const operation = await queued(h, "assign_participant", () => dialog.getByRole("button", { name: "אישור השיוך", exact: true }).click());
  await dialog.waitFor({ state: "hidden" });
  return operation;
}

async function offlineContact(h, participantId, notes) {
  await h.navigate(`/staff/contacts/new?participant=${participantId}`);
  await h.page.locator("#contact-occurredAt").fill(h.localInput(new Date(Date.now() - 120_000)));
  await h.page.locator("#contact-nextAppointmentAt").fill(h.localInput(new Date(Date.now() + day)));
  await h.page.locator("#contact-notes").fill(notes);
  const operation = await queued(h, "record_contact", async () => {
    await h.page.getByRole("button", { name: "שמירת התיעוד והפגישה הבאה", exact: true }).click();
    // The real queued-contact path performs a full shell navigation. Wait for
    // that known transition before inspecting the persisted queue.
    await h.page.waitForURL((url) => url.pathname === `/staff/participants/${participantId}`);
    await h.page.getByRole("tabpanel", { name: /^היסטוריית קשר/ }).getByText(notes, { exact: true }).waitFor({ state: "visible" });
  }, (command) => command.notes === notes);
  await h.page.getByRole("tabpanel", { name: /^היסטוריית קשר/ }).getByText(notes, { exact: true }).waitFor({ state: "visible" });
  return operation;
}

async function authority(h, participantId, title, type, configure, reason) {
  await h.openParticipant(participantId, "פרטי החניכה והליווי");
  await h.page.getByRole("button", { name: title, exact: true }).click();
  const dialog = h.page.getByRole("dialog");
  await configure(dialog);
  await dialog.getByLabel("סיבה לפעולה", { exact: true }).fill(reason);
  const submit = type === "delete_participant" ? "העברה לסל המחזור" : type === "restore_participant" ? "שחזור הכרטיס" : "שמירת השינוי";
  const operation = await queued(h, type, () => dialog.getByRole("button", { name: submit, exact: true }).click());
  await dialog.waitFor({ state: "hidden" });
  return operation;
}

async function policyForm(h, policy, reason) {
  const continueDraft = h.page.getByRole("button", { name: "פתיחת טיוטה חדשה", exact: true });
  if (await continueDraft.isVisible().catch(() => false)) await continueDraft.click();
  const staleDraft = h.page.getByRole("button", { name: "עיינתי בהגדרות הפעילות — המשך עריכת הטיוטה", exact: true });
  if (await staleDraft.isVisible().catch(() => false)) await staleDraft.click();
  await h.page.getByLabel("תוקף גישה ללא חיבור, בשעות", { exact: true }).fill(String(policy.offlineLeaseHours));
  await h.select("למי מיועדות התזכורות", policy.reminderAudience === "responsible_team" ? "לצוות הליווי האחראי" : "לכל הצוות");
  await h.page.getByLabel("תזכורת לפני מועד הקשר, בדקות", { exact: true }).fill(String(policy.appointmentReminderMinutesBefore));
  const overdue = h.page.locator('[data-slot="card"]').filter({ hasText: "מדיניות ליווי ותזכורות" }).getByRole("switch");
  if ((await overdue.getAttribute("aria-checked")) !== String(policy.overdueRemindersEnabled)) await overdue.click();
  await h.page.getByLabel("חזרה על תזכורות איחור, בשעות", { exact: true }).fill(policy.overdueRepeatHours === null ? "" : String(policy.overdueRepeatHours));
  await h.page.getByLabel("סיבה לשינוי המדיניות", { exact: true }).fill(reason);
  if (await staleDraft.isVisible().catch(() => false)) await staleDraft.click();
}

async function completedChainCounts(h, participantId, staffIds, contactId) {
  const result = await h.database.query(`SELECT
    (SELECT count(*) FROM mentoring.participants WHERE organization_id=$1 AND id=$2)::int AS participants,
    (SELECT count(*) FROM mentoring.memberships WHERE organization_id=$1 AND id=ANY($3::uuid[]))::int AS staff,
    (SELECT count(*) FROM mentoring.assignments WHERE organization_id=$1 AND participant_id=$2 AND ended_at IS NULL)::int AS assignments,
    (SELECT count(*) FROM mentoring.contacts WHERE organization_id=$1 AND participant_id=$2 AND id=$4)::int AS contacts,
    (SELECT count(*) FROM mentoring.appointments WHERE organization_id=$1 AND participant_id=$2 AND is_current)::int AS appointments,
    (SELECT count(*) FROM (SELECT occurrence_key,recipient_staff_id FROM mentoring.reminder_jobs WHERE organization_id=$1 AND participant_id=$2 GROUP BY occurrence_key,recipient_staff_id HAVING count(*)>1) duplicates)::int AS duplicate_jobs`,
  [h.manifest.organizationId, participantId, staffIds, contactId]);
  return result.rows[0];
}

/** These are executable acceptance scenarios, not an invocation. The parent
 * owns the exclusive DB/browser window, real authentication and final cleanup. */
export async function runOfflineScenarios(h) {
  assert.equal(typeof h.track, "function", "The harness must durably track queued fixture IDs.");
  const prefix = `בדיקת דפדפן ${h.runId}`;
  const chain = {};
  assert.ok(await h.scenario("Offline UI creates a dependent staff/participant/assignment/contact chain without granting provisional staff access", async () => {
    await h.context.setOffline(true);
    chain.coordinator = await offlineStaff(h, "coordinator", "offline-coordinator");
    chain.mentor = await offlineStaff(h, "mentor", "offline-mentor", chain.coordinator);
    chain.participant = await offlineParticipant(h, "offline-chain");
    chain.assignment = await offlineAssignment(h, chain.participant, chain.mentor, chain.coordinator);
    chain.notes = `${prefix}: שרשרת ללא חיבור`;
    chain.contact = await offlineContact(h, chain.participant.id, chain.notes);
    const state = await remember(h, await localState(h));
    const byId = new Map(state.operations.map((operation) => [operation.command.operationId, operation]));
    assert.ok(byId.get(chain.mentor.id).dependsOnOperationIds.includes(chain.coordinator.id));
    assert.ok(byId.get(chain.assignment.command.operationId).dependsOnOperationIds.includes(chain.participant.id));
    assert.ok(byId.get(chain.assignment.command.operationId).dependsOnOperationIds.includes(chain.mentor.id));
    assert.ok(byId.get(chain.contact.command.operationId).dependsOnOperationIds.includes(chain.assignment.command.operationId));
    assert.equal(state.active.participantIds.includes(chain.participant.id), false);
    await h.navigate("/staff/reviews");
    const card = h.page.locator('[data-slot="card"]').filter({ hasText: chain.notes });
    await card.getByText("הדיווח ממתין לאישור המערכת", { exact: true }).waitFor({ state: "visible" });
    assert.equal(await card.getByRole("button", { name: "אישור הדיווח", exact: true }).isDisabled(), true);
    const central = await completedChainCounts(h, chain.participant.id, [chain.coordinator.id, chain.mentor.id], chain.contact.command.operationId);
    assert.deepEqual(central, { participants: 0, staff: 0, assignments: 0, contacts: 0, appointments: 0, duplicate_jobs: 0 });
    h.fixture.offlineParticipantId = chain.participant.id;
    return { queuedCommands: 5, dependencyEdgesVerified: true, provisionalStaffAccessGranted: false, centralRecordsBeforeReconnect: 0, approvalWaitsForCentralContact: true, screenshot: await h.screenshot("offline-dependent-chain") };
  }, { criteria: ["AC-10", "AC-21", "TA-10", "TA-11"] }));

  assert.ok(await h.scenario("The dependent queue survives a native cold restart and automatically reconnects exactly once", async () => {
    const ids = [chain.coordinator.id, chain.mentor.id, chain.participant.id, chain.assignment.command.operationId, chain.contact.command.operationId];
    await h.restartOffline();
    await h.openParticipant(chain.participant.id);
    await h.page.getByRole("tabpanel", { name: /^היסטוריית קשר/ }).getByText(chain.notes, { exact: true }).waitFor({ state: "visible" });
    const state = await localState(h);
    assert.equal(ids.every((id) => state.operations.some((operation) => operation.command.operationId === id && operation.status === "pending")), true);
    await h.reconnect();
    await acceptedQueue(h, ids);
    const current = await h.poll(() => h.participant(chain.participant.id), (view) => view?.contacts.some((contact) => contact.id === chain.contact.command.operationId));
    assert.equal(current.assignment.mentorId, chain.mentor.id);
    assert.equal(current.assignment.coordinatorId, chain.coordinator.id);
    assert.equal(current.contacts.length, 1);
    assert.ok(current.nextAppointment);
    const counts = await completedChainCounts(h, chain.participant.id, [chain.coordinator.id, chain.mentor.id], chain.contact.command.operationId);
    assert.deepEqual(counts, { participants: 1, staff: 2, assignments: 1, contacts: 1, appointments: 1, duplicate_jobs: 0 });
    const replay = await h.command(chain.contact.command);
    assert.equal(replay.body.ok, true);
    assert.equal(replay.body.replayed, true);
    assert.deepEqual(await completedChainCounts(h, chain.participant.id, [chain.coordinator.id, chain.mentor.id], chain.contact.command.operationId), counts);
    return { nativeProfileReopenedOffline: true, automaticReconnect: true, acceptedContactCount: 1, continuingAppointmentCount: 1, duplicateReminderOccurrences: 0, originalOperationReplay: true };
  }, { criteria: ["AC-10", "AC-13", "AC-21", "TA-01", "TA-10"] }));

  assert.ok(await h.scenario("Management can queue review of an accepted revision offline and central approval waits for reconnect", async () => {
    await h.navigate("/staff/reviews");
    await h.context.setOffline(true);
    const card = h.page.locator('[data-slot="card"]').filter({ hasText: chain.notes });
    chain.review = await queued(h, "review_contact", () => card.getByRole("button", { name: "אישור הדיווח", exact: true }).click(), (command) => command.contactId === chain.contact.command.operationId);
    await card.getByText("החלטת הבדיקה ממתינה לאישור המערכת", { exact: true }).waitFor({ state: "visible" });
    const central = await h.database.query("SELECT count(*)::int AS count FROM mentoring.reviews WHERE organization_id=$1 AND contact_id=$2", [h.manifest.organizationId, chain.contact.command.operationId]);
    assert.equal(central.rows[0].count, 0);
    await h.restartOffline();
    await h.navigate("/staff/reviews");
    await h.page.locator('[data-slot="card"]').filter({ hasText: chain.notes }).getByText("החלטת הבדיקה ממתינה לאישור המערכת", { exact: true }).waitFor({ state: "visible" });
    await h.reconnect();
    await acceptedQueue(h, [chain.review.command.operationId]);
    const current = await h.poll(() => h.participant(chain.participant.id), (view) => view?.reviews.some((review) => review.contactId === chain.contact.command.operationId && review.revision === 1 && review.decision === "approved"));
    assert.equal(current.reviews.filter((review) => review.contactId === chain.contact.command.operationId && review.revision === 1).length, 1);
    return { acceptedRevisionReviewed: 1, localReviewDisplayedPending: true, centralApprovalBeforeReconnect: false, persistedAcrossRestart: true };
  }, { criteria: ["AC-07", "AC-10", "TA-07", "TA-10", "TA-11"] }));

  assert.ok(await h.scenario("Offline correction, invalidation, rescheduling, color and CEO administrative intents preserve their version chain", async () => {
    await h.context.setOffline(true);
    await h.openParticipant(chain.participant.id, "פרטי החניכה והליווי");
    await h.page.getByRole("button", { name: "עריכת פרטים", exact: true }).click();
    let dialog = h.page.getByRole("dialog");
    const profileNotes = `${prefix}: פרטי כרטיס שנערכו ללא חיבור`;
    await dialog.getByLabel("מידע נוסף לליווי", { exact: true }).fill(profileNotes);
    const profileUpdate = await queued(h, "update_participant", () => dialog.getByRole("button", { name: "שמירת פרטים", exact: true }).click());
    await dialog.waitFor({ state: "hidden" });
    await h.openParticipant(chain.participant.id, /^היסטוריית קשר/);
    await h.page.getByRole("button", { name: "תיקון דיווח", exact: true }).click();
    dialog = h.page.getByRole("dialog");
    const correctedNotes = `${prefix}: תיקון מקומי בשרשרת`;
    await dialog.getByLabel("סיכום הדיווח המתוקן", { exact: true }).fill(correctedNotes);
    await dialog.getByLabel("סיבת השינוי", { exact: true }).fill(`${prefix}: תיקון סיכום`);
    const correction = await queued(h, "revise_contact", () => dialog.getByRole("button", { name: "שמירת השינוי", exact: true }).click());
    await closeQueuedContactAction(h, dialog);
    assert.ok(correction.dependsOnOperationIds.includes(profileUpdate.command.operationId));
    await h.navigate("/staff/reviews");
    const correctedCard = h.page.locator('[data-slot="card"]').filter({ hasText: correctedNotes });
    const correctedApproval = await queued(h, "review_contact", () => correctedCard.getByRole("button", { name: "אישור הדיווח", exact: true }).click(), (command) => command.contactId === chain.contact.command.operationId && command.revision === 2 && command.decision === "approved");
    assert.ok(correctedApproval.dependsOnOperationIds.includes(correction.command.operationId));
    await correctedCard.getByRole("button", { name: "בקשת הבדיקה ממתינה", exact: true }).waitFor({ state: "visible" });
    assert.equal(await correctedCard.getByRole("button", { name: "בקשת הבדיקה ממתינה", exact: true }).isDisabled(), true);
    await h.openParticipant(chain.participant.id, /^היסטוריית קשר/);
    // This contact was centrally accepted before going offline. Subsequent
    // local revisions must remain editable with explicit causal dependencies;
    // reconnecting between every edit would not prove complete offline work.
    await h.page.getByRole("button", { name: "פסילת דיווח", exact: true }).click();
    dialog = h.page.getByRole("dialog");
    await dialog.getByLabel("סיבת השינוי", { exact: true }).fill(`${prefix}: פסילה לבדיקה`);
    const invalidation = await queued(h, "invalidate_contact", () => dialog.getByRole("button", { name: "פסילת הדיווח ושמירת הסיבה", exact: true }).click());
    assert.ok(invalidation.dependsOnOperationIds.includes(correction.command.operationId));
    await closeQueuedContactAction(h, dialog);
    await h.page.getByRole("button", { name: "שינוי מועד הקשר הבא", exact: true }).click();
    dialog = h.page.getByRole("dialog");
    await dialog.getByLabel("מועד הקשר הבא", { exact: true }).fill(h.localInput(new Date(Date.now() + 2 * day)));
    await dialog.getByLabel("סיבת השינוי", { exact: true }).fill(`${prefix}: שינוי מועד ללא שיחה חדשה`);
    await queued(h, "reschedule_appointment", () => dialog.getByRole("button", { name: "שמירת השינוי", exact: true }).click());
    await closeQueuedContactAction(h, dialog);
    await h.page.getByRole("button", { name: "עדכון מצב הליווי", exact: true }).click();
    dialog = h.page.getByRole("dialog");
    await dialog.getByLabel("מצב הליווי המדווח", { exact: true }).click();
    await h.page.getByRole("option", { name: "כתום — בעיכוב", exact: true }).click();
    await dialog.getByLabel("הערה לעדכון (לא חובה)", { exact: true }).fill(`${prefix}: צבע ידני`);
    await queued(h, "set_manual_color", () => dialog.getByRole("button", { name: "שמירת השינוי", exact: true }).click());
    await closeQueuedContactAction(h, dialog);
    await authority(h, chain.participant.id, "הרשאה אישית לכרטיס", "set_access_grant", async (form) => {
      const state = await localState(h);
      assert.ok(state.active.staff.some((member) => member.id === h.fixture.otherMentorId));
      await h.select("חבר/ת צוות", h.manifest.names.staff[h.fixture.otherMentorId], form);
      await form.getByRole("button", { name: "עריכה", exact: true }).click();
    }, `${prefix}: הרשאה מקומית לבדיקה`);
    await authority(h, chain.participant.id, "הגנת מנכ״ל על רשומה", "set_ceo_protection", async (form) => {
      await form.getByRole("button", { name: "הסרת הגנה", exact: true }).click();
    }, `${prefix}: פתיחת הגנה לאחר אישור`);
    await authority(h, chain.participant.id, "שינוי מצב הליווי", "set_participant_lifecycle", async (form) => {
      await form.getByRole("button", { name: "ליווי בהשהיה", exact: true }).click();
    }, `${prefix}: השהיה מקומית`);
    await authority(h, chain.participant.id, "שינוי מצב הליווי", "set_participant_lifecycle", async (form) => {
      await form.getByRole("button", { name: "ליווי פעיל", exact: true }).click();
    }, `${prefix}: המשך ליווי מקומי`);
    const pending = await remember(h, await localState(h));
    const newTypes = ["update_participant", "revise_contact", "review_contact", "invalidate_contact", "reschedule_appointment", "set_manual_color", "set_access_grant", "set_ceo_protection", "set_participant_lifecycle"];
    for (const type of newTypes) assert.ok(pending.operations.some((operation) => operation.command.participantId === chain.participant.id && operation.command.type === type && operation.status === "pending"));
    const before = await h.database.query("SELECT revision,invalidated_at FROM mentoring.contacts WHERE organization_id=$1 AND id=$2", [h.manifest.organizationId, chain.contact.command.operationId]);
    assert.equal(before.rows[0].revision, 1); assert.equal(before.rows[0].invalidated_at, null);
    const centralReview = await h.database.query("SELECT count(*)::int AS count FROM mentoring.reviews WHERE organization_id=$1 AND contact_id=$2 AND revision=2", [h.manifest.organizationId, chain.contact.command.operationId]);
    assert.equal(centralReview.rows[0].count, 0);
    await h.restartOffline();
    await h.openParticipant(chain.participant.id);
    await h.reconnect();
    await acceptedQueue(h, pending.operations.filter((operation) => operation.command.participantId === chain.participant.id && operation.status === "pending").map((operation) => operation.command.operationId));
    const accepted = await h.poll(() => h.participant(chain.participant.id), (view) => view?.contacts.some((contact) => contact.id === chain.contact.command.operationId && contact.revision === 3 && contact.invalidatedAt != null) && view.participant.lifecycle === "active" && view.accessGrants?.some((grant) => grant.staffId === h.fixture.otherMentorId && grant.active));
    assert.equal(accepted.manualColor, "orange");
    assert.equal(accepted.participant.profileNotes, profileNotes);
    assert.equal(accepted.nextAppointment.requiresReview, false);
    assert.equal(accepted.contactRevisions.filter((entry) => entry.id === chain.contact.command.operationId).length, 3);
    for (const revision of [1, 2]) {
      assert.equal(accepted.reviews.some((review) => review.contactId === chain.contact.command.operationId && review.revision === revision && review.decision === "approved"), true);
      assert.equal(accepted.reviewEvents.some((review) => review.contactId === chain.contact.command.operationId && review.revision === revision && review.decision === "approved"), true);
      assert.equal(accepted.contactRevisions.find((entry) => entry.id === chain.contact.command.operationId && entry.revision === revision)?.review?.decision, "approved");
    }
    assert.equal(accepted.reviews.some((review) => review.contactId === chain.contact.command.operationId && review.revision === 3 && review.decision === "approved"), false);
    assert.equal(accepted.contactRevisions.find((entry) => entry.id === chain.contact.command.operationId && entry.revision === 3)?.review, null);
    assert.equal((await localState(h)).operations.some((operation) => operation.command.participantId === chain.participant.id && operation.status === "pending"), false);
    return { pendingCommandTypes: newTypes, subsequentRevisionEditsRemainOffline: true, knownPendingRevisionApprovalQueuedOffline: true, dependencies: { correctionFollowsProfile: true, reviewFollowsCorrection: true, invalidationFollowsCorrection: true }, contactDialogClosureVerified: true, immutableRevisions: 3, historicalApprovalRevisions: [1, 2], invalidatedRevision3RemainsUnapproved: true, appointmentWarningClearedByExplicitReschedule: true, finalLifecycle: "active", screenshot: await h.screenshot("offline-admin-chain-accepted") };
  }, { criteria: ["AC-10", "AC-13", "TA-07", "TA-10", "TA-13"] }));

  assert.ok(await h.scenario("Offline staff edit and access changes retain accepted authority until each reconnect", async () => {
    const staffId = await h.createStaff("mentor", "offline-spare", { coordinatorId: chain.coordinator.id });
    const name = h.manifest.names.staff[staffId];
    const before = (await h.snapshot()).staff.find((member) => member.id === staffId);
    const phone = before.phone === "0500000007" ? "0500000008" : "0500000007";
    await h.context.setOffline(true);
    await h.navigate("/staff/team");
    let row = h.page.getByRole("row").filter({ hasText: name });
    await row.getByRole("button", { name: "עריכת פרטים", exact: true }).click();
    let dialog = h.page.getByRole("dialog");
    await dialog.getByLabel("טלפון צוות · רשות", { exact: true }).fill(phone);
    const edit = await queued(h, "update_staff", () => dialog.getByRole("button", { name: "שמירת פרטי צוות", exact: true }).click());
    await dialog.waitFor({ state: "hidden" });
    row = h.page.getByRole("row").filter({ hasText: name });
    await row.getByRole("button", { name: "ביטול גישה", exact: true }).click();
    dialog = h.page.getByRole("dialog");
    const revoke = await queued(h, "set_staff_active", () => dialog.getByRole("button", { name: "אישור ביטול הגישה", exact: true }).click(), (command) => command.staffId === staffId && !command.active);
    await dialog.waitFor({ state: "hidden" });
    await row.getByText("גישה פעילה", { exact: true }).waitFor({ state: "visible" });
    const local = await localState(h);
    assert.equal(local.active.staff.find((member) => member.id === staffId).active, true);
    const central = await h.database.query("SELECT phone,active,version FROM mentoring.memberships WHERE organization_id=$1 AND id=$2", [h.manifest.organizationId, staffId]);
    assert.equal(central.rows[0].phone, before.phone); assert.equal(central.rows[0].active, true); assert.equal(central.rows[0].version, before.version);
    await h.restartOffline(); await h.navigate("/staff/team"); await h.reconnect();
    await acceptedQueue(h, [edit.command.operationId, revoke.command.operationId]);
    await h.poll(h.snapshot, (state) => state.staff.some((member) => member.id === staffId && member.phone === phone && !member.active));
    await h.page.getByRole("row").filter({ hasText: name }).getByRole("button", { name: "הפעלת גישה", exact: true }).waitFor({ state: "visible" });
    await h.context.setOffline(true); await h.navigate("/staff/team");
    row = h.page.getByRole("row").filter({ hasText: name });
    await row.getByRole("button", { name: "הפעלת גישה", exact: true }).click();
    dialog = h.page.getByRole("dialog");
    const activate = await queued(h, "set_staff_active", () => dialog.getByRole("button", { name: "אישור הפעלת הגישה", exact: true }).click(), (command) => command.staffId === staffId && command.active);
    await dialog.waitFor({ state: "hidden" });
    await row.getByText("ללא גישה", { exact: true }).waitFor({ state: "visible" });
    await h.reconnect();
    await acceptedQueue(h, [activate.command.operationId]);
    await h.poll(h.snapshot, (state) => state.staff.some((member) => member.id === staffId && member.active && member.phone === phone));
    return { unassignedSyntheticStaff: true, queuedEditPersisted: true, revocationDidNotInventLocalAuthority: true, activationWaitedForCentralAcceptance: true, finalAccessRestored: true };
  }, { criteria: ["AC-09", "AC-10", "TA-10", "TA-11"] }));

  assert.ok(await h.scenario("Offline delete waits for acceptance before restore becomes available and offline restore preserves history", async () => {
    const id = await h.createParticipant("offline-recycle");
    const before = await h.participant(id);
    await h.context.setOffline(true);
    const deletion = await authority(h, id, "העברת כרטיס לסל המחזור", "delete_participant", async () => {}, `${prefix}: העברה מקומית לסל`);
    await h.page.getByText("בקשת ההעברה לסל המחזור ממתינה לאישור", { exact: true }).waitFor({ state: "visible" });
    assert.equal(await h.page.getByRole("button", { name: "שחזור כרטיס מסל המחזור", exact: true }).count(), 0);
    const centralBefore = await h.database.query("SELECT deleted_at FROM mentoring.participants WHERE organization_id=$1 AND id=$2", [h.manifest.organizationId, id]);
    assert.equal(centralBefore.rows[0].deleted_at, null);
    await h.restartOffline(); await h.openParticipant(id); await h.reconnect();
    await acceptedQueue(h, [deletion.command.operationId]);
    await h.poll(() => h.participant(id), (view) => Boolean(view?.participant.deletedAt));
    await h.navigate("/staff/settings");
    await h.page.getByText(h.manifest.names.participants[id], { exact: true }).waitFor({ state: "visible" });
    await h.context.setOffline(true);
    const restoration = await authority(h, id, "שחזור כרטיס מסל המחזור", "restore_participant", async () => {}, `${prefix}: שחזור מקומי מהסל`);
    const stillDeleted = await h.database.query("SELECT deleted_at FROM mentoring.participants WHERE organization_id=$1 AND id=$2", [h.manifest.organizationId, id]);
    assert.ok(stillDeleted.rows[0].deleted_at);
    await h.restartOffline(); await h.openParticipant(id); await h.reconnect();
    await acceptedQueue(h, [restoration.command.operationId]);
    const restored = await h.poll(() => h.participant(id), (view) => view && view.participant.deletedAt === null);
    assert.equal(restored.participant.lifecycle, before.participant.lifecycle);
    assert.equal(restored.contacts.length, before.contacts.length);
    assert.equal(restored.authorityHistory.some((event) => event.action === "delete_participant"), true);
    assert.equal(restored.authorityHistory.some((event) => event.action === "restore_participant"), true);
    return { deletePersistedAcrossRestart: true, prematureRestorePrevented: true, recycleBinVisible: true, restorePersistedAcrossRestart: true, previousLifecycleRestored: true, historyRetained: true };
  }, { criteria: ["AC-09", "AC-10", "TA-10", "TA-11"] }));

  assert.ok(await h.scenario("Offline monthly note, policy, reminder scan and CEO self-mute intents synchronize without provider delivery", async () => {
    assert.equal(h.fixture.nonFixtureParticipants, 0, "Organization policy tests require the confirmed empty nonfixture baseline.");
    const before = await h.snapshot();
    const policy = { offlineLeaseHours: before.settings.offlineLeaseHours, reminderAudience: before.settings.reminderAudience, appointmentReminderMinutesBefore: before.settings.appointmentReminderMinutesBefore, overdueRemindersEnabled: before.settings.overdueRemindersEnabled, overdueRepeatHours: before.settings.overdueRepeatHours };
    const changedPolicy = { ...policy, appointmentReminderMinutesBefore: policy.appointmentReminderMinutesBefore === 15 ? 30 : 15 };
    const summary = `${prefix}: סקירה חודשית שנכתבה ללא חיבור`;
    let policyChanged = false;
    let policyOperation;
    const monthlyOperationIds = [];
    const queueMonthly = async (type, perform, matches) => {
      const operation = await queued(h, type, perform, matches);
      monthlyOperationIds.push(operation.command.operationId);
      return operation;
    };
    try {
      await h.context.setOffline(true);
      await h.navigate("/staff/oversight");
      await h.select("היקף הסקירה", `הצוות של ${chain.coordinator.name}`);
      await h.page.getByLabel("תובנות והמשך מעקב", { exact: true }).fill(summary);
      await queueMonthly("save_monthly_review", () => h.page.getByRole("button", { name: "שמירת הסקירה", exact: true }).click(), (command) => command.scopeStaffId === chain.coordinator.id && command.summary === summary);
      await h.navigate("/staff/settings");
      await policyForm(h, changedPolicy, `${prefix}: מדיניות מקומית זמנית`);
      policyOperation = await queueMonthly("update_organization_settings", () => h.page.getByRole("button", { name: "שמירת הגדרות הארגון", exact: true }).click());
      const sms = h.page.locator('[data-slot="card"]').filter({ has: h.page.getByText("תזכורות לצוות", { exact: true }) }).getByRole("switch");
      await queueMonthly("set_sms_muted", () => sms.click(), (command) => command.muted !== before.actor.smsMuted);
      await queueMonthly("set_sms_muted", () => sms.click(), (command) => command.muted === before.actor.smsMuted);
      await h.navigate("/staff/reminders");
      await queueMonthly("evaluate_reminders", () => h.page.getByRole("button", { name: "סריקת תזכורות", exact: true }).click());
      const central = await h.database.query("SELECT version,appointment_reminder_minutes_before FROM mentoring.organization_settings WHERE organization_id=$1", [h.manifest.organizationId]);
      assert.equal(central.rows[0].version, before.settings.version);
      assert.equal(central.rows[0].appointment_reminder_minutes_before, policy.appointmentReminderMinutesBefore);
      await h.restartOffline(); await h.navigate("/staff/reminders"); await h.reconnect();
      await acceptedQueue(h, monthlyOperationIds);
      const accepted = await h.poll(h.snapshot, (state) => state.settings.appointmentReminderMinutesBefore === changedPolicy.appointmentReminderMinutesBefore && state.monthlyReviews.some((review) => review.scopeStaffId === chain.coordinator.id && review.summary === summary));
      policyChanged = true;
      assert.equal(accepted.actor.smsMuted, before.actor.smsMuted);
      assert.equal(accepted.reminderReadiness.smsProviderConfigured, false);
      assert.equal(accepted.reminderReadiness.smsSendingEnabled, false);
      assert.equal(accepted.reminders.some((reminder) => ["dispatching", "provider_accepted", "delivered"].includes(reminder.state)), false);
      await h.captureCurrent();
      return { syntheticCoordinatorMonthlyNote: true, acceptedPolicyVersion: accepted.settings.version, reminderScanQueued: true, smsSelfMuteAndRestoreQueued: true, noProviderDeliveryClaim: true, screenshot: await h.screenshot("offline-monthly-policy-reminders-accepted") };
    } finally {
      await h.context.setOffline(false);
      if (policyOperation) await h.poll(() => localState(h), (state) => !state.operations.some((operation) => operation.status === "pending" && (operation.command.operationId === policyOperation.command.operationId || operation.command.type === "set_sms_muted")));
      const latest = await h.snapshot().catch(() => null);
      if (policyChanged || (latest && latest.settings.appointmentReminderMinutesBefore !== policy.appointmentReminderMinutesBefore)) {
        await h.navigate("/staff/settings");
        await policyForm(h, policy, `${prefix}: החזרת המדיניות המקורית`);
        await h.action("update_organization_settings", () => h.page.getByRole("button", { name: "שמירת הגדרות הארגון", exact: true }).click());
        const restored = await h.snapshot();
        for (const [key, value] of Object.entries(policy)) assert.equal(restored.settings[key], value);
      }
      const finalActor = (await h.snapshot()).actor;
      if (finalActor.smsMuted !== before.actor.smsMuted) {
        await h.navigate("/staff/settings");
        const sms = h.page.locator('[data-slot="card"]').filter({ has: h.page.getByText("תזכורות לצוות", { exact: true }) }).getByRole("switch");
        await h.action("set_sms_muted", () => sms.click());
        assert.equal((await h.snapshot()).actor.smsMuted, before.actor.smsMuted);
      }
    }
  }, { criteria: ["AC-10", "AC-14", "AC-17", "TA-10", "TA-11", "TA-12"] }));

  assert.ok(await h.scenario("The CEO can queue a real preserved conflict decision offline without replacing the protected version", async () => {
    assert.ok(h.fixture.offlineConflictId && h.fixture.offlineConflictNotes, "The authority suite must preserve its second real server conflict for this scenario.");
    const before = await h.participant();
    assert.equal(before.participant.profileNotes, h.fixture.protectedAuthorityValue);
    const conflict = (await h.snapshot()).conflicts.find((item) => item.id === h.fixture.offlineConflictId);
    assert.ok(conflict); assert.equal(conflict.resolvedAt, null);
    await h.navigate("/staff/conflicts"); await h.context.setOffline(true);
    const card = h.page.locator('[data-slot="card"]').filter({ hasText: h.fixture.offlineConflictNotes });
    const resolution = await queued(h, "resolve_conflict", () => card.getByRole("button", { name: "שמירת גרסת המנכ״ל וסגירה", exact: true }).click(), (command) => command.conflictId === h.fixture.offlineConflictId);
    const central = await h.database.query("SELECT resolved_at FROM mentoring.conflicts WHERE organization_id=$1 AND id=$2", [h.manifest.organizationId, h.fixture.offlineConflictId]);
    assert.equal(central.rows[0].resolved_at, null);
    await h.restartOffline(); await h.navigate("/staff/conflicts");
    await h.page.locator('[data-slot="card"]').filter({ hasText: h.fixture.offlineConflictNotes }).getByRole("button", { name: "שמירת גרסת המנכ״ל וסגירה", exact: true }).waitFor({ state: "visible" });
    await h.reconnect();
    await acceptedQueue(h, [resolution.command.operationId]);
    await h.poll(h.snapshot, (state) => Boolean(state.conflicts.find((item) => item.id === h.fixture.offlineConflictId)?.resolvedAt));
    assert.equal((await h.participant()).participant.profileNotes, h.fixture.protectedAuthorityValue);
    return { realPreservedConflict: true, decisionQueuedAcrossRestart: true, acceptedAfterReconnect: true, authoritativeCeoValueUnchanged: true, preservedSubmittedValueRetained: true };
  }, { criteria: ["AC-10", "AC-11", "TA-04", "TA-10", "TA-15"] }));

  assert.ok(await h.scenario("Revocation quarantines pending work and same-identity recovery requires explicit review without automatic replay", async () => {
    const before = (await h.database.query("SELECT to_jsonb(m) AS value FROM mentoring.memberships m WHERE organization_id=$1 AND id=$2", [h.manifest.organizationId, h.actorId])).rows[0].value;
    assert.equal(before.active, true); assert.equal(before.role, "ceo");
    assert.equal(before.email, "mentoring-owner+clerk_test@example.com");
    assert.equal(before.auth_user_id, "user_3LEdW1ZzcasOTeiCSsfxGV7UZTJ");
    const notes = `${prefix}: דיווח נעול לאחר ביטול גישה`;
    const draftNotes = `${prefix}: טיוטת פרופיל לשחזור`;
    let operation;
    try {
      await h.context.setOffline(true);
      operation = await offlineContact(h, chain.participant.id, notes);
      await h.openParticipant(chain.participant.id, "פרטי החניכה והליווי");
      await h.page.getByRole("button", { name: "עריכת פרטים", exact: true }).click();
      const dialog = h.page.getByRole("dialog");
      await dialog.getByLabel("מידע נוסף לליווי", { exact: true }).fill(draftNotes);
      await dialog.getByText("הטיוטה נשמרה במכשיר הזה", { exact: true }).waitFor({ state: "visible" });
      await dialog.getByRole("button", { name: "סגירה", exact: true }).click();
      const revoked = await h.database.query("UPDATE mentoring.memberships SET active=false,version=version+1,updated_at=clock_timestamp() WHERE organization_id=$1 AND id=$2 AND auth_user_id=$3 AND active=true", [h.manifest.organizationId, h.actorId, before.auth_user_id]);
      assert.equal(revoked.rowCount, 1);
      await h.captureCurrent();
      await h.context.setOffline(false);
      await h.page.getByText(/^(?:החשבון אינו מורשה לפתוח את סביבת הליווי|סביבת הליווי נעולה עד לאימות מחדש)$/).waitFor({ state: "visible", timeout: 45_000 });
      assert.equal(await h.page.getByText(notes, { exact: true }).count(), 0);
      assert.equal(await h.page.getByRole("heading", { name: chain.participant.name, exact: true }).count(), 0);
      // The visible lock is immediate; IndexedDB quarantine commits afterward.
      // Wait for the specific immutable operation to move into a real vault.
      const locked = await h.poll(() => localState(h), (state) => state.active === null && state.operations.some((item) => item.command.operationId === operation.command.operationId && state.vaults.some((vault) => vault.id === item.scopeKey)));
      assert.equal(locked.active, null);
      assert.ok(locked.vaults.length > 0);
      assert.ok(locked.operations.some((item) => item.command.operationId === operation.command.operationId && locked.vaults.some((vault) => vault.id === item.scopeKey)));
      const denied = await h.page.evaluate(async () => {
        const response = await fetch("/api/mentoring/workspace", { cache: "no-store" });
        const body = await response.json(); return { status: response.status, code: body.error?.code };
      });
      assert.ok([401, 403].includes(denied.status)); assert.equal(denied.code, "not_staff");
      const central = await h.database.query("SELECT count(*)::int AS count FROM mentoring.contacts WHERE organization_id=$1 AND id=$2", [h.manifest.organizationId, operation.command.operationId]);
      assert.equal(central.rows[0].count, 0);
    } finally {
      const restored = await h.database.query("UPDATE mentoring.memberships SET active=$3,role=$4,coordinator_id=$5,version=version+1,updated_at=clock_timestamp() WHERE organization_id=$1 AND id=$2 AND auth_user_id=$6", [h.manifest.organizationId, h.actorId, before.active, before.role, before.coordinator_id, before.auth_user_id]);
      assert.equal(restored.rowCount, 1);
      await h.captureCurrent();
      await h.context.setOffline(false);
    }
    await h.navigate("/staff/conflicts");
    if (new URL(h.page.url()).pathname === "/staff/login") { await h.authenticateExisting(); await h.navigate("/staff/conflicts"); }
    const recovery = h.page.getByRole("region", { name: "שחזור עבודה מקומית", exact: true });
    await recovery.getByRole("button", { name: "פתיחת העבודה לבדיקה", exact: true }).first().waitFor({ state: "visible" });
    assert.equal(await h.page.getByText(notes, { exact: true }).count(), 0);
    await recovery.getByRole("button", { name: "פתיחת העבודה לבדיקה", exact: true }).first().click();
    await h.page.getByText("העבודה המקומית עודכנה", { exact: true }).waitFor({ state: "visible" });
    await h.page.getByText(notes, { exact: true }).waitFor({ state: "visible" });
    await recovery.getByText("טיוטות ששוחזרו לבדיקה", { exact: true }).waitFor({ state: "visible" });
    const document = recovery.locator("details").filter({ hasText: draftNotes });
    assert.equal(await document.count(), 1);
    await document.locator("summary").click();
    await document.getByText(draftNotes, { exact: true }).waitFor({ state: "visible" });
    // Base UI's non-native Button supplies role=button to its rendered anchor.
    const formLink = document.locator("a[href]").filter({ hasText: "לפתיחת הטופס המקורי" });
    assert.equal(await formLink.getAttribute("href"), `/staff/participants/${chain.participant.id}`);
    assert.equal(/mentoring-form-draft-v1|baseVersion|operationId|signature/.test(await document.innerText()), false);
    const recovered = await localState(h);
    const saved = recovered.operations.find((item) => item.command.operationId === operation.command.operationId);
    assert.equal(saved.status, "blocked");
    assert.equal(saved.scopeKey, recovered.active.scopeKey);
    await h.page.reload({ waitUntil: "domcontentloaded" });
    await h.page.getByText(notes, { exact: true }).waitFor({ state: "visible" });
    const after = await h.database.query("SELECT count(*)::int AS count FROM mentoring.contacts WHERE organization_id=$1 AND id=$2", [h.manifest.organizationId, operation.command.operationId]);
    assert.equal(after.rows[0].count, 0);
    const card = h.page.locator('[data-slot="card"]').filter({ hasText: notes });
    await card.getByRole("button", { name: "עיינתי בעדכון השמור", exact: true }).click();
    await h.page.getByRole("alertdialog").getByRole("button", { name: "עיינתי בעדכון השמור", exact: true }).click();
    await card.getByText("נקרא ונשמר", { exact: true }).waitFor({ state: "visible" });
    await h.openParticipant(chain.participant.id, "פרטי החניכה והליווי");
    await h.page.getByRole("button", { name: "עריכת פרטים", exact: true }).click();
    await h.poll(() => h.page.getByRole("dialog").getByLabel("מידע נוסף לליווי", { exact: true }).inputValue(), (value) => value === draftNotes);
    const restoredScreenshot = await h.screenshot("revoked-work-recovered-for-review");
    // Verify the original form before deleting this chosen synthetic document.
    // The other staged/recovered forms must remain intact after confirmation.
    await h.navigate("/staff/conflicts");
    // Keep the underlying region addressable while the confirmation makes its
    // siblings inert/aria-hidden; it remains the same document collection.
    const recoveredDocuments = h.page.getByRole("region", { name: "שחזור עבודה מקומית", exact: true, includeHidden: true });
    await recoveredDocuments.getByText("טיוטות ששוחזרו לבדיקה", { exact: true }).waitFor({ state: "visible" });
    const beforeDelete = await localState(h);
    const documentMetadata = beforeDelete.drafts.filter((draft) => draft.scopeKey === beforeDelete.active.scopeKey && draft.recoveredAt);
    assert.ok(documentMetadata.length >= 2, "Document-deletion acceptance needs at least two real recovered drafts from the staged forms.");
    const selected = documentMetadata.filter((draft) => draft.draftKey === `participant-profile:${chain.participant.id}`);
    assert.equal(selected.length, 1);
    const preserved = documentMetadata.filter((draft) => draft.key !== selected[0].key);
    const documentCount = await recoveredDocuments.locator("details").count();
    assert.equal(documentCount, documentMetadata.length);
    const selectedDocument = recoveredDocuments.locator("details").filter({ hasText: draftNotes });
    assert.equal(await selectedDocument.count(), 1);
    if (!await selectedDocument.evaluate((element) => element.open)) await selectedDocument.locator("summary").click();
    const commandCount = h.submitted.size;
    const commandRequestCount = h.commandRequestCount;
    assert.ok(Number.isInteger(commandRequestCount));
    await selectedDocument.getByRole("button", { name: "מחיקת הטיוטה המשוחזרת", exact: true }).click();
    const confirmation = h.page.getByRole("alertdialog");
    await confirmation.getByRole("button", { name: "מחיקת הטיוטה מהמכשיר", exact: true }).waitFor({ state: "visible" });
    // Opening the confirmation alone must not remove anything.
    assert.equal(await recoveredDocuments.locator("details").count(), documentCount);
    assert.equal((await localState(h)).drafts.some((draft) => draft.key === selected[0].key), true);
    await confirmation.getByRole("button", { name: "מחיקת הטיוטה מהמכשיר", exact: true }).click();
    await confirmation.waitFor({ state: "hidden" });
    const afterDelete = await h.poll(() => localState(h), (state) => !state.drafts.some((draft) => draft.key === selected[0].key));
    const remainingDocuments = afterDelete.drafts.filter((draft) => draft.scopeKey === afterDelete.active.scopeKey && draft.recoveredAt);
    assert.equal(remainingDocuments.length, documentMetadata.length - 1);
    for (const original of preserved) {
      const remaining = remainingDocuments.find((draft) => draft.key === original.key);
      assert.ok(remaining); assert.equal(remaining.savedAt, original.savedAt); assert.equal(remaining.recoveredAt, original.recoveredAt);
    }
    await h.poll(() => recoveredDocuments.locator("details").count(), (count) => count === documentCount - 1);
    assert.equal(await selectedDocument.count(), 0);
    assert.ok(await recoveredDocuments.locator("details > summary").count() >= 1);
    assert.equal(afterDelete.operations.find((item) => item.command.operationId === operation.command.operationId).status, "acknowledged");
    assert.equal(h.submitted.size, commandCount);
    assert.equal(h.commandRequestCount, commandRequestCount);
    const unchangedCentral = await h.database.query("SELECT count(*)::int AS count FROM mentoring.contacts WHERE organization_id=$1 AND id=$2", [h.manifest.organizationId, operation.command.operationId]);
    assert.equal(unchangedCentral.rows[0].count, 0);
    return { currentServerAuthorityEnforced: true, pendingContactAcceptedDuringRevocation: false, privateLiveViewRemoved: true, quarantinedWorkPreserved: true, sameIdentityRecoveryViaUI: true, recoveredDocumentReadable: true, technicalIntentOmitted: true, originalFormLinkPresent: true, recoveryAutosent: false, explicitReviewAcknowledged: true, unsentProfileDraftRestored: true, selectedRecoveredDocumentDeletedAfterConfirmation: true, otherRecoveredDocumentsPreserved: preserved.length, recoveredDocumentRaceTested: false, restoredScreenshot, screenshot: await h.screenshot("recovered-document-deletion-preserves-other-drafts") };
  }, { criteria: ["AC-08", "AC-10", "AC-12", "TA-05", "TA-10", "TA-14"] }));

  // Lost-response transport fault injection, disk exhaustion, and external SMS
  // behavior are deliberately not inferred from these normal-browser journeys.
  h.fixture.offlineCoverage = { nativeRestart: true, dependentCreates: true, revisionReview: true, administrativeChain: true, staffEditAndAccess: true, deleteRestore: true, monthlySettingsRemindersSms: true, serverConflictResolution: true, sameIdentityRecovery: true, recoveredDocumentDeletion: true, notExercisedHere: ["storage exhaustion", "lost-response transport interruption", "superseded recovered-document confirmation race (unit coverage only)"] };
  // Load this final, separately reviewed role journey only when the CEO phases
  // finish; importing this module never starts another browser or server.
  await (await import("./whole-system-mentor-offline.mjs")).runMentorOfflineScenario(h);
}
