import assert from "node:assert/strict";
import test from "node:test";
import { reconcileStoredDraft } from "./draft-state.ts";
import "../../tests/mentoring/server/typescript-loader.mjs";
const { canReviewParticipant, contactReviewState } = await import("./management-command-state.ts");
const { contactHasAcceptedBaseline } = await import("./contact-correction-state.ts");

const operationId = "78cfb518-4768-4c65-b34e-af023aeaa51e";
const participantId = "512a01ab-d40d-4fdc-909c-ebc69447cdce";
const contactId = "11b5d58a-5695-4a7f-ad7c-dee6715b1ad0";
const commands = [
  { type: "review_contact", participantId, contactId, revision: 4, decision: "approved" },
  { type: "review_contact", participantId, contactId, revision: 4, decision: "returned_for_correction" },
  { type: "set_sms_muted", muted: true },
  { type: "resolve_conflict", conflictId: "645acdf6-8217-48b9-a4bc-f7bc1a2b047d", decision: "keep_ceo" },
];

for (const payload of commands) {
  test(`prepared ${payload.type}:${payload.decision ?? "preference"} reopens with its original immutable action`, async () => {
    const action = { key: "selected-action", payload, successMessage: "הבקשה התקבלה" };
    const stored = {
      kind: "mentoring-form-draft-v1",
      value: action,
      intent: { operationId, signature: JSON.stringify(payload) },
    };
    const seen = [];
    const restored = await reconcileStoredDraft(stored, null, async (command) => {
      seen.push(command);
      return { ok: true, operationId, replayed: true, acceptance: "queued" };
    });
    assert.deepEqual(seen, [{ ...payload, operationId }]);
    assert.deepEqual(restored.value, action);
    assert.equal(restored.recovered.acceptance, "queued");
    assert.equal(restored.intent.operationId, operationId);
    if (payload.type === "review_contact") {
      assert.equal(seen[0].revision, 4, "a retry must not silently approve a newer contact revision");
    }
  });
}

test("a permission rejection retains the selected management action for review", async () => {
  const action = { key: "review", payload: commands[0], successMessage: "הבקשה התקבלה" };
  const restored = await reconcileStoredDraft({
    kind: "mentoring-form-draft-v1",
    value: action,
    intent: { operationId, signature: JSON.stringify(action.payload) },
  }, null, async () => ({ ok: false, error: { code: "forbidden", message: "ההרשאות השתנו" } }));
  assert.deepEqual(restored.value, action);
  assert.equal(restored.rejected, true);
  assert.equal(restored.intent, null);
});

test("expired authentication cannot discard a prepared management action", async () => {
  const action = { key: "sms", payload: commands[2], successMessage: "הבקשה התקבלה" };
  const stored = {
    kind: "mentoring-form-draft-v1",
    value: action,
    intent: { operationId, signature: JSON.stringify(action.payload) },
  };
  await assert.rejects(reconcileStoredDraft(stored, null, async () => ({
    ok: false,
    error: { code: "not_authenticated", message: "יש להיכנס מחדש" },
  })), /could not be reconciled/);
  assert.equal(stored.intent.operationId, operationId);
  assert.deepEqual(stored.value, action);
});

const now = "2026-10-26T10:00:00Z";
const coordinator = { id: "coordinator", organizationId: "org", role: "coordinator", active: true, version: 1 };
const participant = { id: "participant", organizationId: "org", displayName: "חניכה", lifecycle: "active", serviceType: null, phone: null, version: 1 };
const assignment = { id: "assignment", organizationId: "org", participantId: "participant", mentorId: "mentor", coordinatorId: coordinator.id, assignedAt: now, version: 1 };

test("server allowedActions takes precedence over role and projected assignment", () => {
  const view = { participant, assignment, allowedActions: ["view"] };
  assert.equal(canReviewParticipant(coordinator, view, now), false);
  assert.equal(canReviewParticipant({ ...coordinator, role: "ceo" }, view, now), false);
  assert.equal(canReviewParticipant(coordinator, { ...view, allowedActions: ["view", "approve"] }, now), true);
  assert.equal(canReviewParticipant(coordinator, { ...view, allowedActions: [] }, now), false);
});

test("a pending assignment cannot create approval rights before acceptance", () => {
  assert.equal(canReviewParticipant(coordinator, { participant, assignment }, now), false, "missing accepted metadata must not trust a projected assignment");
  assert.equal(canReviewParticipant(coordinator, { participant, assignment, acceptedAssignment: null }, now), false);
  assert.equal(canReviewParticipant(coordinator, { participant, assignment, acceptedAssignment: { ...assignment, coordinatorId: "another" } }, now), false);
  assert.equal(canReviewParticipant(coordinator, { participant, assignment: { ...assignment, coordinatorId: "another" }, acceptedAssignment: assignment }, now), true);
});

test("legacy permission fallback respects grants, expiry, staff status and deletion", () => {
  const grant = { id: "grant", organizationId: "org", participantId: participant.id, staffId: coordinator.id, active: true, actions: ["approve"], expiresAt: "2026-10-26T10:00:01Z" };
  const view = { participant, assignment: null, acceptedAssignment: null, accessGrants: [grant] };
  assert.equal(canReviewParticipant(coordinator, view, now), true);
  assert.equal(canReviewParticipant(coordinator, { ...view, accessGrants: [{ ...grant, actions: ["view"] }] }, now), false);
  assert.equal(canReviewParticipant(coordinator, { ...view, accessGrants: [{ ...grant, expiresAt: now }] }, now), false);
  assert.equal(canReviewParticipant({ ...coordinator, active: false }, { ...view, allowedActions: ["approve"] }, now), false);
  assert.equal(canReviewParticipant(coordinator, { ...view, participant: { ...participant, deletedAt: now }, allowedActions: ["approve"] }, now), false);
});

test("queued review decisions never claim accepted approval and block duplicates", () => {
  const review = { contactId, revision: 4, decision: "approved", reviewedByStaffId: coordinator.id, reviewedAt: now, localPending: true };
  const pending = contactReviewState({}, review);
  assert.equal(pending.approved, false);
  assert.equal(pending.pendingReview, true);
  assert.equal(pending.canSubmit, false);
  const accepted = contactReviewState({}, { ...review, localPending: false });
  assert.equal(accepted.approved, true);
  assert.equal(accepted.pendingReview, false);
  assert.equal(accepted.canSubmit, false);
  assert.equal(contactReviewState({}, { ...review, decision: "returned_for_correction" }).canSubmit, false);
});

test("a locally queued contact is not reviewable before server acceptance", () => {
  const pending = contactReviewState({ localPending: true }, undefined);
  assert.equal(pending.pendingContact, true);
  assert.equal(pending.approved, false);
  assert.equal(pending.canSubmit, false);
  assert.equal(contactReviewState({ localPending: false }, undefined).canSubmit, true);
  assert.equal(contactReviewState({ invalidatedAt: now }, undefined).canSubmit, false);
});

test("a projected correction of a server-known contact queues review for its exact revision", async () => {
  const accepted = { id: contactId, revision: 1, localPending: false, localTimestamp: false };
  const corrected = { ...accepted, revision: 2, localPending: true, localTimestamp: true };
  const baseline = contactHasAcceptedBaseline({ contactRevisions: [accepted, corrected] }, corrected);
  const state = contactReviewState(corrected, undefined, baseline);
  assert.equal(state.pendingCorrection, true);
  assert.equal(state.approved, false, "reviewable pending content is still not accepted");
  assert.equal(state.canSubmit, true);

  const payload = { type: "review_contact", participantId, contactId: corrected.id, revision: corrected.revision, decision: "approved" };
  const stored = {
    kind: "mentoring-form-draft-v1",
    value: { key: `${corrected.id}:${corrected.revision}:approved`, payload, successMessage: "הבקשה התקבלה" },
    intent: { operationId, signature: JSON.stringify(payload) },
  };
  const commands = [];
  await reconcileStoredDraft(stored, null, async (command) => {
    commands.push(command);
    return { ok: true, operationId, replayed: true, acceptance: "queued" };
  });
  assert.deepEqual(commands, [{ ...payload, operationId }]);
  assert.equal(commands[0].revision, 2, "review follows the correction revision rather than the accepted baseline revision");
});

test("queued correction review never expands permission or bypasses queued review and invalidation locks", () => {
  const corrected = { id: contactId, revision: 2, localPending: true };
  const review = { contactId, revision: 2, decision: "approved", reviewedByStaffId: coordinator.id, reviewedAt: now, localPending: true };
  assert.equal(contactReviewState(corrected, review, true).canSubmit, false);
  assert.equal(contactReviewState({ ...corrected, invalidatedAt: now }, undefined, true).canSubmit, false);
  assert.equal(canReviewParticipant(coordinator, { participant, assignment, allowedActions: ["view"] }, now), false);
  assert.equal(canReviewParticipant(coordinator, { participant, assignment, acceptedAssignment: null }, now), false);
  assert.equal(canReviewParticipant(coordinator, { participant, assignment, acceptedAssignment: { ...assignment, coordinatorId: "another" }, accessGrants: [{ id: "view-only", organizationId: "org", participantId: participant.id, staffId: coordinator.id, active: true, actions: ["view"] }] }, now), false);
});

test("new local reports and acknowledgement-only projections have no accepted contact baseline", () => {
  const pending = { id: contactId, localPending: true, localTimestamp: true };
  for (const contact of [pending, { ...pending, localPending: false }]) {
    const baseline = contactHasAcceptedBaseline({ contactRevisions: [contact] }, contact);
    assert.equal(baseline, false);
    assert.equal(contactReviewState(contact, undefined, baseline).canSubmit, false);
  }
  assert.equal(contactHasAcceptedBaseline({ contactRevisions: [{ id: "another-contact" }] }, pending), false);
});

test("ACK-only approval remains terminal before the fresh snapshot arrives", () => {
  const contact = { id: contactId, revision: 2, localPending: false, localTimestamp: true };
  const review = { contactId, revision: 2, decision: "approved", reviewedByStaffId: coordinator.id, reviewedAt: now, localPending: false, localTimestamp: true };
  const state = contactReviewState(contact, review, true);
  assert.equal(state.approved, false, "ACK evidence does not establish the rendered server snapshot or timestamp");
  assert.equal(state.pendingReview, false, "the operation was acknowledged rather than waiting in the outbox");
  assert.equal(state.reviewAwaitingSnapshot, true);
  assert.equal(state.approvalRecorded, true);
  assert.equal(state.canSubmit, false, "an acknowledged approval cannot be duplicated or reversed on the same revision");
  assert.equal(contactReviewState({}, review, true).approved, false, "an accepted contact does not make a local review timestamp authoritative");
  assert.equal(contactReviewState({}, review, true).canSubmit, false);
});

test("ACK-only returned revision still permits a subsequent approval", () => {
  const review = { contactId, revision: 2, decision: "returned_for_correction", reviewedByStaffId: coordinator.id, reviewedAt: now, localPending: false, localTimestamp: true };
  const state = contactReviewState({ localPending: false, localTimestamp: true }, review, true);
  assert.equal(state.approved, false);
  assert.equal(state.reviewAwaitingSnapshot, true);
  assert.equal(state.approvalRecorded, false);
  assert.equal(state.canSubmit, true);
});
