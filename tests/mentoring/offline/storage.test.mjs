import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && context.parentURL?.includes("/lib/mentoring/") && !/\.[a-z]+$/i.test(specifier)) {
    try { return nextResolve(`${specifier}.ts`, context); } catch { /* Other installed modules use their own resolution. */ }
  }
  return nextResolve(specifier, context);
} });

const { createMentoringOfflineStore, isOfflineLeaseValid, projectWorkspace, applyOptimisticCommand, lockMentoringOfflineData, prepareMentoringOfflineAccess, isMentoringOfflineAccessPrepared } = await import("../../../lib/mentoring/offline.ts");

function fixture(accountId = "user_test_A", role = "mentor") {
  const now = Date.now();
  const actor = { id: `staff_${accountId}`, authUserId: accountId, organizationId: "org_test", role, active: true, version: 1, displayName: "צוות בדיקה", email: null, phone: null, coordinatorId: null, smsMuted: false };
  return { actor, staff: [actor], participants: [{
    participant: { id: "participant_1", organizationId: actor.organizationId, displayName: "חניכת בדיקה", phone: null, serviceType: "national", servicePlace: null, serviceRole: null, profileNotes: null, lifecycle: "active", version: 1, createdAt: new Date(now - 86_400_000).toISOString() },
    assignment: { id: "assignment_1", organizationId: actor.organizationId, participantId: "participant_1", mentorId: actor.id, coordinatorId: null, assignedAt: new Date(now - 86_400_000).toISOString(), version: 1 },
    nextAppointment: { id: "appointment_1", organizationId: actor.organizationId, participantId: "participant_1", mentorId: actor.id, scheduledAt: new Date(now + 86_400_000).toISOString(), version: 1 },
    contacts: [], reviews: [], protections: [], manualColor: null, manualColorAt: null,
  }], conflicts: [], serverTime: new Date(now - 1000).toISOString(), offlineValidUntil: new Date(now + 3_600_000).toISOString(), capabilities: { smsConfigured: false, smsSendingEnabled: false } };
}

async function setup(snapshot = fixture()) {
  const store = createMentoringOfflineStore(`mentoring-offline-test-${crypto.randomUUID()}`);
  const session = await store.saveSnapshot(snapshot, snapshot.actor.authUserId);
  return { store, session, scope: session.scope, snapshot };
}
const update = (operationId = crypto.randomUUID(), expectedVersion = 1, text = "הערה מקומית") => ({ type: "update_participant", operationId, participantId: "participant_1", expectedVersion, fields: { profileNotes: text } });
const accepted = (command) => ({ ok: true, acceptance: "accepted", operationId: command.operationId, replayed: false, participantId: command.participantId });

test("every field draft survives reopening its account-scoped store", async () => {
  const { store, scope } = await setup();
  await store.writeDraft(scope, "contact:participant_1", { notes: "שיחה עם החניכה", next: "2026-10-28T16:00" });
  assert.deepEqual(await store.readDraft(scope, "contact:participant_1"), { notes: "שיחה עם החניכה", next: "2026-10-28T16:00" });
  await store.clearDraft(scope, "contact:participant_1");
  assert.equal(await store.readDraft(scope, "contact:participant_1"), null);
});

test("rapid keystroke writes preserve the final draft in invocation order", async () => {
  const { store, scope } = await setup();
  await Promise.all(["ש", "שי", "שיח", "שיחה"].map((notes) => store.writeDraft(scope, "draft", { notes })));
  assert.deepEqual(await store.readDraft(scope, "draft"), { notes: "שיחה" });
});

test("changing verified account locks old drafts and queues and rejects stale form writes", async () => {
  const { store, scope } = await setup();
  await store.writeDraft(scope, "draft", { notes: "מידע לחשבון הראשון בלבד" });
  await store.enqueue(scope, update());
  const second = fixture("user_test_B");
  const otherSession = await store.saveSnapshot(second, second.actor.authUserId);
  assert.equal(await store.readDraft(otherSession.scope, "draft"), null);
  assert.deepEqual(await store.operations(otherSession.scope), []);
  await assert.rejects(store.writeDraft(scope, "draft", { notes: "כתיבה מאוחרת" }), { code: "account_changed" });
  assert.equal(await store.readSession("user_test_A"), null);
  assert.equal(await store.unsyncedCount(), 2);
  assert.deepEqual(await store.recoveryMetadata(otherSession.scope), []);
});

test("scope removal rejects delayed drafts for removed participant IDs and nested management payloads", async () => {
  const { store, scope, snapshot } = await setup();
  const narrowed = { ...snapshot, participants: [] };
  await store.saveSnapshot(narrowed, scope.accountId);
  for (const key of ["contact:participant_1", "participant-profile:participant_1", "assignment:participant_1", "authority:grant:participant_1:new", "contact-action:revise:participant_1:contact_1"]) {
    await assert.rejects(store.writeDraft(scope, key, { notes: "מידע מטופס שההרשאה אליו בוטלה" }), { code: "account_changed" });
    assert.equal(await store.readDraft(scope, key), null);
  }
  await assert.rejects(store.writeDraft(scope, "management-action:reviews", { kind: "mentoring-form-draft-v1", value: { payload: { type: "review_contact", participantId: "participant_1" } }, intent: null }), { code: "account_changed" });
  assert.equal(await store.unsyncedCount(), 0);
});

test("quarantined blocked failures and acknowledged history retain immutable server evidence after explicit recovery", async () => {
  const { store, scope, snapshot } = await setup();
  const first = await store.enqueue(scope, update());
  const originalFailure = { ok: false, error: { code: "ceo_protected", conflictId: "central_conflict", message: "החלטת מנכ״ל נשמרה" } };
  await store.settle(scope, first, originalFailure);
  const second = await store.enqueue(scope, update(crypto.randomUUID(), 1, "פעולה שנבדקה"));
  await store.settle(scope, second, { ok: false, error: { code: "validation", message: "חסר שדה" } });
  await store.acknowledgeLocalFailure(scope, second.command.operationId);
  await store.quarantine("not_authenticated", scope);
  assert.equal(await store.readSession(scope.accountId), null);
  await store.saveSnapshot(snapshot, scope.accountId);
  const [vault] = await store.recoveryMetadata(scope);
  assert.equal(vault.pendingCount, 1); assert.equal(vault.historyCount, 1);
  const result = await store.recoverLocalWork(scope, vault.id);
  assert.equal(result.recoveredOperations, 2);
  const recovered = await store.operations(scope);
  assert.deepEqual(recovered[0].failure, originalFailure);
  assert.deepEqual(recovered[0].command, first.command);
  assert.equal(recovered[1].status, "acknowledged");
  assert.equal(recovered[1].acknowledgedAt, (await store.operations(scope))[1].acknowledgedAt);
});

test("one account cannot recover work into a different staff membership or organization", async () => {
  const { store, scope, snapshot } = await setup();
  await store.writeDraft(scope, "contact:participant_1", { notes: "הרשאה ישנה" });
  await store.quarantine("membership_changed", scope);
  const replacement = { ...snapshot, actor: { ...snapshot.actor, id: "new_membership", organizationId: "new_org" }, staff: [], participants: [] };
  const newSession = await store.saveSnapshot(replacement, scope.accountId);
  assert.deepEqual(await store.recoveryMetadata(newSession.scope), []);
  await assert.rejects(store.recoverLocalWork(newSession.scope, "locked:unknown"), { code: "account_changed" });
  assert.equal(await store.unsyncedCount(), 1);
});

test("settings, contact revisions, grant revisions and monthly reviews capture causal dependencies", async () => {
  const { store, scope } = await setup(fixture("user_test_A", "ceo"));
  const cases = [
    [{ type: "update_organization_settings", operationId: crypto.randomUUID(), expectedVersion: 1, settings: {}, reason: "עדכון" }, { type: "update_organization_settings", operationId: crypto.randomUUID(), expectedVersion: 2, settings: {}, reason: "המשך" }],
    [{ type: "save_monthly_review", operationId: crypto.randomUUID(), month: "2026-10", scopeStaffId: null, expectedVersion: null, summary: "א", reviewed: false }, { type: "save_monthly_review", operationId: crypto.randomUUID(), month: "2026-10", scopeStaffId: null, expectedVersion: 1, summary: "ב", reviewed: true }],
    [{ type: "revise_contact", operationId: crypto.randomUUID(), participantId: "participant_1", expectedVersion: 1, contactId: "contact_1", expectedRevision: 1 }, { type: "review_contact", operationId: crypto.randomUUID(), participantId: "participant_1", contactId: "contact_1", revision: 2, decision: "approved" }],
    [{ type: "set_access_grant", operationId: crypto.randomUUID(), participantId: "participant_1", expectedVersion: 2, expectedGrantVersion: null, staffId: "staff_other", actions: ["view"], reason: "א", expiresAt: null }, { type: "set_access_grant", operationId: crypto.randomUUID(), participantId: "participant_1", expectedVersion: 3, expectedGrantVersion: 1, staffId: "staff_other", actions: ["view", "edit"], reason: "ב", expiresAt: null }],
  ];
  for (const [before, after] of cases) {
    await store.enqueue(scope, before);
    const operation = await store.enqueue(scope, after);
    assert.ok(operation.dependsOnOperationIds.includes(before.operationId));
  }
});

test("accepted contact corrections remain immutable dependent intents through further correction, exact review, and invalidation", async () => {
  const snapshot = fixture("user_test_A", "coordinator");
  const view = snapshot.participants[0];
  view.allowedActions = ["view", "edit", "approve"];
  const occurredAt = new Date(Date.now() - 86_400_000).toISOString();
  view.contacts = [{ id: "accepted_contact", organizationId: "org_test", participantId: "participant_1", actorId: snapshot.actor.id, method: "phone", outcome: "completed", occurredAt, receivedAt: occurredAt, notes: "מקור שהתקבל במערכת", revision: 1 }];
  const { store, scope } = await setup(snapshot);
  const first = { type: "revise_contact", operationId: crypto.randomUUID(), participantId: "participant_1", expectedVersion: 1, contactId: "accepted_contact", expectedRevision: 1, expectedAppointmentVersion: 1, method: "phone", outcome: "completed", occurredAt, notes: "תיקון ראשון", reason: "תיקון" };
  const second = { ...first, operationId: crypto.randomUUID(), expectedVersion: 2, expectedRevision: 2, notes: "תיקון שני" };
  const review = { type: "review_contact", operationId: crypto.randomUUID(), participantId: "participant_1", contactId: "accepted_contact", revision: 3, decision: "approved" };
  const invalidate = { type: "invalidate_contact", operationId: crypto.randomUUID(), participantId: "participant_1", expectedVersion: 3, contactId: "accepted_contact", expectedRevision: 3, expectedAppointmentVersion: 1, reason: "פסילה לאחר תיקון" };
  const one = await store.enqueue(scope, first);
  const two = await store.enqueue(scope, second);
  const exactReview = await store.enqueue(scope, review);
  const invalidation = await store.enqueue(scope, invalidate);
  assert.deepEqual(two.dependsOnOperationIds, [first.operationId]);
  assert.deepEqual(exactReview.dependsOnOperationIds, [second.operationId]);
  assert.deepEqual(invalidation.dependsOnOperationIds, [second.operationId], "a review reads the revision; it never produces a new contact version");
  const projected = projectWorkspace(snapshot, await store.operations(scope)).participants[0];
  assert.equal(projected.participant.version, 4);
  assert.equal(projected.contacts[0].revision, 4);
  assert.equal(projected.contacts[0].notes, "תיקון שני");
  assert.ok(projected.contacts[0].invalidatedAt);
  assert.equal(projected.reviews.find((entry) => entry.contactId === "accepted_contact").revision, 3);
  assert.ok(projected.contactRevisions.some((entry) => entry.id === "accepted_contact" && entry.revision === 1 && !entry.localPending && !entry.localTimestamp), "the original server-known revision remains distinguishable from a newly queued contact");
  assert.equal(projected.nextAppointment.requiresReview, true);
  assert.equal(snapshot.participants[0].contacts[0].notes, "מקור שהתקבל במערכת");
  await assert.rejects(store.enqueue(scope, { ...first, notes: "שינוי אסור באותו מזהה" }), { code: "operation_reused" });
  await store.settle(scope, one, accepted(first));
  await store.settle(scope, two, accepted(second));
  await store.settle(scope, exactReview, { ok: false, error: { code: "validation", message: "החלטת הבקרה דורשת תיקון" } });
  const queued = await store.operations(scope);
  assert.deepEqual(queued.find((operation) => operation.command.operationId === invalidation.command.operationId).command, invalidate);
  assert.equal(queued.find((operation) => operation.command.operationId === review.operationId).status, "blocked");
  assert.equal(queued.find((operation) => operation.command.operationId === invalidate.operationId).status, "pending");
});

test("self-mute captures its implicit staff version for a following immutable staff update", async () => {
  const { store, scope, snapshot } = await setup(fixture("user_test_A", "ceo"));
  const mute = await store.enqueue(scope, { type: "set_sms_muted", operationId: crypto.randomUUID(), muted: true });
  const updateStaff = await store.enqueue(scope, { type: "update_staff", operationId: crypto.randomUUID(), staffId: snapshot.actor.id, expectedVersion: 2, fields: { displayName: "שם חדש" } });
  assert.deepEqual(mute.resourceVersions, [{ key: `staff:${snapshot.actor.id}`, before: 1, after: 2 }]);
  assert.ok(updateStaff.dependsOnOperationIds.includes(mute.command.operationId));
  assert.equal((await store.operations(scope))[1].command.expectedVersion, 2);
});

test("prepared cache requires matching identity or explicitly permitted last-account offline recovery", async () => {
  const { store } = await setup();
  assert.equal(await store.readSession(null), null);
  assert.equal(await store.readSession("unknown-account"), null);
  assert.equal((await store.readSession(null, true))?.scope.accountId, "user_test_A");
});

test("lease expiry and a backwards clock lock data without deleting pending submissions", async () => {
  const { store, scope, session } = await setup();
  await store.enqueue(scope, update());
  assert.equal(isOfflineLeaseValid(session, Date.parse(session.snapshot.offlineValidUntil)), false);
  assert.equal(isOfflineLeaseValid(session, session.lastSeenAt - 60_001), false);
  assert.equal(await store.readSession(scope.accountId, false, Date.parse(session.snapshot.offlineValidUntil)), null);
  await assert.rejects(store.writeDraft(scope, "draft", {}, Date.parse(session.snapshot.offlineValidUntil)), { code: "expired" });
  assert.equal(await store.unsyncedCount(), 1);
});

test("inactive actors and overlong leases never become an offline working set", async () => {
  const { store } = await setup();
  const inactive = fixture(); inactive.actor.active = false;
  await assert.rejects(store.saveSnapshot(inactive, inactive.actor.authUserId), { code: "account_changed" });
  const tooLong = fixture(); tooLong.offlineValidUntil = new Date(Date.now() + 2 * 86_400_000).toISOString();
  await assert.rejects(store.saveSnapshot(tooLong, tooLong.actor.authUserId), { code: "expired" });
});

test("a device clock far behind trusted issuance cannot extend a lease beyond 24 hours", async () => {
  const { store, snapshot } = await setup();
  await assert.rejects(store.saveSnapshot(snapshot, snapshot.actor.authUserId, Date.now() - 365 * 86_400_000), { code: "expired" });
});

test("the queue preserves immutable operation identity and payload across retries", async () => {
  const { store, scope } = await setup();
  const command = update();
  const first = await store.enqueue(scope, command);
  const replay = await store.enqueue(scope, { fields: { profileNotes: command.fields.profileNotes }, expectedVersion: 1, participantId: "participant_1", operationId: command.operationId, type: command.type });
  assert.equal(first.key, replay.key);
  assert.equal((await store.operations(scope)).length, 1);
  await assert.rejects(store.enqueue(scope, { ...command, fields: { profileNotes: "תוכן אחר" } }), { code: "operation_reused" });
  command.fields.profileNotes = "שינוי לאחר ההכנסה";
  assert.equal((await store.operations(scope))[0].command.fields.profileNotes, "הערה מקומית");
});

test("causally ordered edits project once and remain readable after central acceptance", async () => {
  const { store, scope, snapshot } = await setup();
  const first = update(crypto.randomUUID(), 1, "ראשון");
  const second = update(crypto.randomUUID(), 2, "שני");
  const one = await store.enqueue(scope, first);
  await store.enqueue(scope, second);
  let projected = projectWorkspace(snapshot, await store.operations(scope));
  assert.equal(projected.participants[0].participant.version, 3);
  assert.equal(projected.participants[0].participant.profileNotes, "שני");
  await store.settle(scope, one, accepted(first));
  const session = await store.readSession(scope.accountId);
  projected = projectWorkspace(session.snapshot, await store.operations(scope));
  assert.equal(projected.participants[0].participant.version, 3);
  assert.equal(projected.participants[0].participant.profileNotes, "שני");
  assert.equal((await store.readReceipt(scope, first)).acceptance, "accepted");
  await assert.rejects(store.readReceipt(scope, { ...first, fields: { profileNotes: "תוכן אחר" } }), { code: "operation_reused" });
});

test("conflicted payloads stay durable and readable without changing protected CEO data", async () => {
  const snapshot = fixture();
  snapshot.participants[0].participant.profileNotes = "החלטת מנכ״ל";
  snapshot.participants[0].protections = [{ organizationId: "org_test", resourceId: "participant_1", protectedByStaffId: "staff_ceo", protectedRevision: 1, active: true }];
  const { store, scope } = await setup(snapshot);
  const operation = await store.enqueue(scope, update());
  assert.equal(projectWorkspace(snapshot, [operation]).participants[0].participant.profileNotes, "החלטת מנכ״ל");
  await store.settle(scope, operation, { ok: false, error: { code: "ceo_protected", message: "נשמר לבדיקה" } });
  const stored = await store.operations(scope);
  assert.equal(stored[0].status, "blocked");
  const projected = projectWorkspace(snapshot, stored);
  assert.equal(projected.conflicts[0].id, `local:${operation.command.operationId}`);
  assert.match(projected.conflicts[0].submittedValue, /הערה מקומית/);
  assert.equal(projected.participants[0].participant.profileNotes, "החלטת מנכ״ל");
});

test("a server conflict and preserved local operation do not produce duplicate review cards", async () => {
  const { store, scope, snapshot } = await setup();
  const operation = await store.enqueue(scope, update());
  await store.settle(scope, operation, { ok: false, error: { code: "conflict", conflictId: "server-conflict", message: "נשמר במערכת" } });
  snapshot.conflicts = [{ id: "server-conflict", participantId: "participant_1", participantName: "חניכת בדיקה", authorName: "צוות", authoritativeValue: "נוכחי", submittedValue: "שינוי", createdAt: new Date().toISOString(), resolvedAt: null }];
  assert.equal(projectWorkspace(snapshot, await store.operations(scope)).conflicts.length, 1);
});

test("unanswered attempts preserve appointment and weekly anchor while completed contacts replace one obligation", async () => {
  const { store, scope, snapshot } = await setup();
  const common = { type: "record_contact", participantId: "participant_1", expectedVersion: 1, expectedAppointmentVersion: 1, method: "phone", occurredAt: new Date(Date.now() - 1000).toISOString(), notes: "תיעוד" };
  const failed = await store.enqueue(scope, { ...common, operationId: crypto.randomUUID(), outcome: "no_answer" });
  const afterAttempt = applyOptimisticCommand(snapshot, failed);
  assert.deepEqual(afterAttempt.participants[0].nextAppointment, snapshot.participants[0].nextAppointment);
  const completed = await store.enqueue(scope, { ...common, operationId: crypto.randomUUID(), outcome: "completed", nextAppointmentAt: new Date(Date.now() + 2 * 86_400_000).toISOString(), manualColor: "green" });
  const afterContact = applyOptimisticCommand(snapshot, completed);
  assert.equal(afterContact.participants[0].nextAppointment.version, 2);
  assert.equal(afterContact.participants[0].contacts.length, 1);
  assert.equal(afterContact.participants[0].contacts[0].id, completed.command.operationId);
  assert.equal(afterContact.participants[0].manualColor, "green");
});

test("offline creation uses the real deterministic participant identifier for subsequent immutable edits", async () => {
  const { store, scope, snapshot } = await setup(fixture("user_test_A", "coordinator"));
  const create = { type: "create_participant", operationId: crypto.randomUUID(), fields: { displayName: "חדשה" } };
  await store.enqueue(scope, create);
  await store.enqueue(scope, { ...update(), participantId: create.operationId, fields: { profileNotes: "המשך ללא חיבור" } });
  const projected = projectWorkspace(snapshot, await store.operations(scope));
  const created = projected.participants.find((view) => view.participant.id === create.operationId);
  assert.equal(created.participant.version, 2);
  assert.equal(created.participant.profileNotes, "המשך ללא חיבור");
});

test("drafts for an authorized offline-created participant survive revalidation before creation is acknowledged", async () => {
  const { store, scope, snapshot } = await setup(fixture("user_test_A", "coordinator"));
  const create = { type: "create_participant", operationId: crypto.randomUUID(), fields: { displayName: "חדשה ללא חיבור" } };
  await store.enqueue(scope, create);
  await store.writeDraft(scope, `participant-profile:${create.operationId}`, { profileNotes: "טיוטה אחרי יצירה מקומית" });
  assert.equal((await store.readDraft(scope, `participant-profile:${create.operationId}`)).profileNotes, "טיוטה אחרי יצירה מקומית");
  await store.saveSnapshot(snapshot, scope.accountId);
  assert.equal((await store.operations(scope)).length, 1);
  assert.deepEqual(await store.recoveryMetadata(scope), []);
  assert.equal((await store.readDraft(scope, `participant-profile:${create.operationId}`)).profileNotes, "טיוטה אחרי יצירה מקומית");
});

test("rejected new-record drafts recover as author-owned documents while the rejected intent stays blocked", async () => {
  const { store, scope, snapshot } = await setup(fixture("user_test_A", "coordinator"));
  const create = { type: "create_participant", operationId: crypto.randomUUID(), fields: { displayName: "טעון תיקון" } };
  const queued = await store.enqueue(scope, create);
  const key = `participant-profile:${create.operationId}`;
  await store.writeDraft(scope, key, { profileNotes: "תוכן שהוזן אחרי ניסיון היצירה", baseVersion: 1 });
  const rejection = { ok: false, error: { code: "validation", message: "נדרש תיקון בשם" } };
  await store.settle(scope, queued, rejection);
  assert.equal((await store.readDraft(scope, key)).profileNotes, "תוכן שהוזן אחרי ניסיון היצירה");
  await store.quarantine("not_authenticated", scope);
  await assert.rejects(store.recoveredDrafts(scope), { code: "account_changed" });
  await store.saveSnapshot(snapshot, scope.accountId);
  assert.deepEqual(await store.recoveredDrafts(scope), []);
  const [vault] = await store.recoveryMetadata(scope);
  const recovered = await store.recoverLocalWork(scope, vault.id);
  assert.equal(recovered.recoveredDrafts, 1);
  assert.equal(await store.readDraft(scope, key), null);
  assert.deepEqual(await store.readDraft(scope, "participant-profile:new"), { profileNotes: "תוכן שהוזן אחרי ניסיון היצירה", baseVersion: null });
  assert.deepEqual((await store.recoveredDrafts(scope)).map((draft) => [draft.key, draft.value.profileNotes]), [["participant-profile:new", "תוכן שהוזן אחרי ניסיון היצירה"]]);
  const operations = await store.operations(scope);
  assert.equal(operations[0].status, "blocked");
  assert.deepEqual(operations[0].failure, rejection);
  assert.equal(projectWorkspace(snapshot, operations).participants.some((view) => view.participant.id === create.operationId), false);
  const otherSnapshot = fixture("different_account", "ceo");
  const other = await store.saveSnapshot(otherSnapshot, otherSnapshot.actor.authUserId);
  assert.deepEqual(await store.recoveredDrafts(other.scope), []);
  await assert.rejects(store.recoveredDrafts(scope), { code: "account_changed" });
});

test("IndexedDB quota failures preserve the last saved draft and never create a phantom queue entry", async () => {
  const { store, scope } = await setup();
  await store.writeDraft(scope, "contact:participant_1", { notes: "נשמר לפני הכשל" });
  const originalPut = IDBObjectStore.prototype.put;
  const originalAdd = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.put = function(...args) { if (this.name === "drafts") throw new DOMException("quota exhausted", "QuotaExceededError"); return originalPut.apply(this, args); };
  IDBObjectStore.prototype.add = function(...args) { if (this.name === "operations") throw new DOMException("quota exhausted", "QuotaExceededError"); return originalAdd.apply(this, args); };
  try {
    await assert.rejects(store.writeDraft(scope, "contact:participant_1", { notes: "ניסיון שלא נשמר" }), { name: "QuotaExceededError" });
    await assert.rejects(store.enqueue(scope, update()), { name: "QuotaExceededError" });
  } finally { IDBObjectStore.prototype.put = originalPut; IDBObjectStore.prototype.add = originalAdd; }
  assert.deepEqual(await store.readDraft(scope, "contact:participant_1"), { notes: "נשמר לפני הכשל" });
  assert.deepEqual(await store.operations(scope), []);
  assert.equal(await store.unsyncedCount(), 1);
});

test("recovered-draft deletion atomically rejects stale confirmation after a form or another tab rewrites its key", async () => {
  const { store, scope, snapshot } = await setup();
  await store.writeDraft(scope, "contact:participant_1", { notes: "טקסט ששוחזר" });
  await store.quarantine("not_authenticated", scope);
  await store.saveSnapshot(snapshot, scope.accountId);
  const [vault] = await store.recoveryMetadata(scope);
  await store.recoverLocalWork(scope, vault.id);
  const [document] = await store.recoveredDrafts(scope);
  await store.writeDraft(scope, document.key, { notes: "טיוטה חדשה מטופס אחר" }, Date.parse(document.savedAt));
  await assert.rejects(store.clearRecoveredDraft(scope, document.key, document.savedAt, document.recoveredAt), { code: "superseded" });
  assert.deepEqual(await store.readDraft(scope, document.key), { notes: "טיוטה חדשה מטופס אחר" });
  assert.deepEqual(await store.recoveredDrafts(scope), []);
  await store.quarantine("not_authenticated", scope);
  await store.saveSnapshot(snapshot, scope.accountId);
  const [again] = await store.recoveryMetadata(scope);
  await store.recoverLocalWork(scope, again.id);
  const [unchanged] = await store.recoveredDrafts(scope);
  await store.clearRecoveredDraft(scope, unchanged.key, unchanged.savedAt, unchanged.recoveredAt);
  assert.equal(await store.readDraft(scope, unchanged.key), null);
});

test("reassignment carries the original follow-up anchor and current appointment", async () => {
  const { store, scope, snapshot } = await setup(fixture("user_test_A", "ceo"));
  const operation = await store.enqueue(scope, { type: "assign_participant", operationId: crypto.randomUUID(), participantId: "participant_1", expectedVersion: 1, mentorId: "new_mentor", coordinatorId: null });
  const projected = applyOptimisticCommand(snapshot, operation).participants[0];
  assert.equal(projected.assignment.followupAnchorAt, snapshot.participants[0].assignment.assignedAt);
  assert.equal(projected.nextAppointment.scheduledAt, snapshot.participants[0].nextAppointment.scheduledAt);
  assert.equal(projected.nextAppointment.mentorId, "new_mentor");
  assert.equal(projected.nextAppointment.version, 2);
});

test("logout cleanup covers drafts, pending changes, accepted receipts, and stale writes", async () => {
  const { store, scope } = await setup();
  await store.writeDraft(scope, "draft", { notes: "טיוטה" });
  const command = update();
  const operation = await store.enqueue(scope, command);
  assert.equal(await store.unsyncedCount(), 2);
  await store.settle(scope, operation, accepted(command));
  assert.equal(await store.unsyncedCount(), 1);
  await store.clear();
  assert.equal(await store.readSession(scope.accountId), null);
  assert.equal(await store.unsyncedCount(), 0);
  await assert.rejects(store.writeDraft(scope, "draft", { notes: "מאוחר" }), { code: "account_changed" });
});

test("a stale asynchronous snapshot cannot reopen a changed account", async () => {
  const { store, snapshot } = await setup();
  await assert.rejects(store.saveSnapshot(snapshot, snapshot.actor.authUserId, Date.now(), () => false), { code: "account_changed" });
});

test("cross-tab stale snapshots cannot overwrite a newer accepted receipt or logout", async () => {
  const { store, scope, snapshot } = await setup();
  const revisionBeforeFetch = await store.cacheRevision(scope.accountId);
  const operation = await store.enqueue(scope, update());
  await store.settle(scope, operation, accepted(operation.command));
  await assert.rejects(store.saveSnapshot(snapshot, scope.accountId, Date.now(), () => true, revisionBeforeFetch), { code: "superseded" });
  assert.equal((await store.readSession(scope.accountId)).snapshot.participants[0].participant.version, 2);
  await store.clear();
  await assert.rejects(store.saveSnapshot(snapshot, scope.accountId, Date.now(), () => true, revisionBeforeFetch), { code: "superseded" });
});

test("opaque snapshot CAS tokens reject account and same-account ABA after quarantine resets revisions", async () => {
  const { store, scope, snapshot } = await setup();
  const stale = await store.activeCacheRevision();
  const originalRevision = (await store.readSession(scope.accountId)).cacheRevision;
  await store.quarantine("account_changed", scope);
  const second = fixture("user_test_B");
  const other = await store.saveSnapshot(second, second.actor.authUserId);
  assert.equal(other.cacheRevision, originalRevision);
  await assert.rejects(store.saveSnapshot(snapshot, scope.accountId, Date.now(), () => true, stale), { code: "superseded" });
  assert.equal((await store.readSession(second.actor.authUserId)).scope.accountId, second.actor.authUserId);
  await store.quarantine("auth_changed", other.scope);
  const renewed = await store.saveSnapshot(snapshot, scope.accountId);
  assert.equal(renewed.cacheRevision, originalRevision);
  await assert.rejects(store.saveSnapshot(snapshot, scope.accountId, Date.now(), () => true, stale), { code: "superseded" });
});

test("recovery acknowledges failure without deleting its payload or blocking an independent fresh intent", async () => {
  const { store, scope, snapshot } = await setup();
  const rejected = await store.enqueue(scope, update());
  const dependent = await store.enqueue(scope, update(crypto.randomUUID(), 2, "תלוי בעדכון הקודם"));
  assert.equal(dependent.dependsOnOperationId, rejected.command.operationId);
  await store.settle(scope, rejected, { ok: false, error: { code: "validation", message: "נדרש תיקון" } });
  const fresh = await store.enqueue(scope, update(crypto.randomUUID(), 1, "כוונה חדשה מול הגרסה הנוכחית"));
  assert.equal(fresh.dependsOnOperationId, undefined);
  await store.acknowledgeLocalFailure(scope, rejected.command.operationId);
  const operations = await store.operations(scope);
  const archived = operations.find((operation) => operation.command.operationId === rejected.command.operationId);
  assert.equal(archived.status, "acknowledged");
  assert.equal(archived.command.fields.profileNotes, "הערה מקומית");
  assert.equal(archived.failure.error.code, "validation");
  assert.equal(await store.unsyncedCount(), 2);
  const history = projectWorkspace(snapshot, operations).conflicts.find((conflict) => conflict.id === `local:${rejected.command.operationId}`);
  assert.ok(history.resolvedAt);
});

test("independent logout lock closes residual cache even if IndexedDB cannot be cleared", () => {
  const local = new Map(); const session = new Map(); let cookie = "";
  const storage = (map) => ({ getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) });
  globalThis.window = { localStorage: storage(local), sessionStorage: storage(session) };
  globalThis.document = { get cookie() { return cookie; }, set cookie(value) { cookie = value.split(";")[0]; } };
  globalThis.location = { protocol: "https:" };
  try {
    assert.equal(isMentoringOfflineAccessPrepared(), false);
    prepareMentoringOfflineAccess();
    assert.equal(isMentoringOfflineAccessPrepared(), true);
    lockMentoringOfflineData();
    assert.equal(isMentoringOfflineAccessPrepared(), false);
    local.clear(); session.clear();
    assert.equal(isMentoringOfflineAccessPrepared(), false, "the independent cookie lock survives storage recovery");
  } finally { delete globalThis.window; delete globalThis.document; delete globalThis.location; }
});
