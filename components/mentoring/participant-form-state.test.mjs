import assert from "node:assert/strict";
import test from "node:test";
import { assignmentScope, canEditParticipant, changedParticipantFields, createdParticipantFields, fieldIsProtected, participantFormFields } from "./participant-form-state.ts";
import { reconcileStoredDraft } from "./draft-state.ts";

const actor = { id: "coordinator", role: "coordinator", organizationId: "org", active: true };
const participant = { id: "participant", organizationId: "org", version: 4, displayName: "רות", phone: "0501234567", serviceType: "national", servicePlace: "חיפה", serviceRole: null, profileNotes: "ליווי אישי", createdBy: actor.id };
const values = { displayName: "רות", phone: "0501234567", serviceType: "national", servicePlace: "ירושלים", serviceRole: "", profileNotes: "ליווי אישי", baseVersion: 4 };
const protection = { organizationId: "org", resourceId: "participant", active: true, fieldPaths: ["phone"], protectedByStaffId: "ceo", protectedRevision: 4 };
const view = { participant, assignment: null, protections: [] };
const staff = [
  actor,
  { id: "own-mentor", organizationId: "org", role: "mentor", active: true, coordinatorId: actor.id },
  { id: "other-mentor", organizationId: "org", role: "mentor", active: true, coordinatorId: "other-coordinator" },
  { id: "inactive-mentor", organizationId: "org", role: "mentor", active: false, coordinatorId: actor.id },
  { id: "foreign-mentor", organizationId: "other-org", role: "mentor", active: true, coordinatorId: actor.id },
];

const emptyCreateValues = { displayName: "", phone: "", serviceType: "unknown", servicePlace: "", serviceRole: "", profileNotes: "", baseVersion: null };

test("a CEO name-only create protects the supplied name while an authorized mentor can fill the blank phone", () => {
  const fields = createdParticipantFields({ ...emptyCreateValues, displayName: " רות " });
  assert.deepEqual(fields, { displayName: "רות" });
  const scoped = [{ ...protection, fieldPaths: Object.keys(fields) }];
  const mentor = { ...actor, id: "mentor", role: "mentor" };
  const created = { ...participant, displayName: "רות", phone: null, serviceType: null, servicePlace: null, serviceRole: null, profileNotes: null, createdBy: "ceo" };
  assert.equal(canEditParticipant(mentor, { ...view, participant: created, allowedActions: ["view", "edit"] }), true);
  assert.equal(fieldIsProtected(mentor, participant.id, scoped, "displayName"), true);
  assert.equal(fieldIsProtected(mentor, participant.id, scoped, "phone"), false);
  assert.deepEqual(changedParticipantFields({ ...emptyCreateValues, displayName: "שם חלופי", phone: "0501112222" }, created, mentor, scoped), { phone: "0501112222" });
});

test("create preserves every supplied input after normalization", () => {
  assert.deepEqual(createdParticipantFields({ displayName: " רות ", phone: " 0501112222 ", serviceType: "military", servicePlace: " חיפה ", serviceRole: " תפקיד בשירות ", profileNotes: " פרטים לליווי ", baseVersion: null }), {
    displayName: "רות", phone: "0501112222", serviceType: "military", servicePlace: "חיפה", serviceRole: "תפקיד בשירות", profileNotes: "פרטים לליווי",
  });
});

test("an entirely blank create omits every field including an empty name", () => {
  assert.deepEqual(createdParticipantFields({ ...emptyCreateValues, displayName: "  ", phone: "  ", servicePlace: "  ", serviceRole: "  ", profileNotes: "  " }), {});
});

test("updating populated optional inputs to blank still sends explicit null clears", () => {
  assert.deepEqual(changedParticipantFields({ ...emptyCreateValues, displayName: participant.displayName, baseVersion: participant.version }, { ...participant, serviceRole: "תפקיד קיים" }, actor, []), {
    phone: null, serviceType: null, servicePlace: null, serviceRole: null, profileNotes: null,
  });
});

for (const acceptance of ["queued", "accepted"]) {
  test(`a legacy prepared create replays its full null payload and original identity when ${acceptance}`, async () => {
    const draftValues = { ...emptyCreateValues, displayName: "רות" };
    const payload = { type: "create_participant", fields: participantFormFields(draftValues) };
    const operationId = "0bb726ac-2921-4794-a8b1-9c52cb3f8437";
    const stored = { kind: "mentoring-form-draft-v1", value: draftValues, intent: { operationId, signature: JSON.stringify(payload) } };
    const restored = await reconcileStoredDraft(stored, emptyCreateValues, async (command) => {
      assert.deepEqual(command, { ...payload, operationId });
      assert.equal(command.fields.phone, null);
      assert.equal(Object.keys(command.fields).length, 6);
      return { ok: true, operationId, acceptance, replayed: true, participantId: operationId };
    });
    assert.equal(restored.recovered.acceptance, acceptance);
    assert.equal(restored.intent.operationId, operationId);
    assert.equal(restored.intent.signature, stored.intent.signature);
    assert.deepEqual(restored.value, draftValues);
  });
}

test("profile save includes only normalized changes, omitting unchanged protected keys", () => {
  assert.deepEqual(changedParticipantFields(values, participant, actor, [protection]), { servicePlace: "ירושלים" });
  assert.deepEqual(changedParticipantFields({ ...values, servicePlace: " חיפה ", phone: " 0501234567 " }, participant, actor, [protection]), {});
});

test("a newly protected field stays out of a saved draft's payload without blocking other changes", () => {
  assert.deepEqual(changedParticipantFields({ ...values, phone: "0522222222" }, participant, actor, [protection]), { servicePlace: "ירושלים" });
  assert.equal(fieldIsProtected(actor, participant.id, [protection], "phone"), true);
  assert.equal(fieldIsProtected(actor, participant.id, [protection], "profileNotes"), false);
});

test("assignment and lifecycle protection do not lock unrelated profile fields", () => {
  for (const fieldPaths of [["assignment"], ["lifecycle"]]) {
    const scoped = [{ ...protection, fieldPaths }];
    assert.equal(fieldIsProtected(actor, participant.id, scoped, "profileNotes"), false);
    assert.deepEqual(changedParticipantFields(values, participant, actor, scoped), { servicePlace: "ירושלים" });
  }
});

for (const fieldPaths of [null, []]) {
  test(`whole-record protection (${JSON.stringify(fieldPaths)}) blocks all non-CEO profile fields`, () => {
    const protections = [{ ...protection, fieldPaths }];
    assert.deepEqual(changedParticipantFields(values, participant, actor, protections), {});
    assert.deepEqual(changedParticipantFields(values, participant, { ...actor, role: "ceo" }, protections), { servicePlace: "ירושלים" });
  });
}

test("inactive, unrelated, and foreign protection rows never disable a field", () => {
  assert.equal(fieldIsProtected(actor, participant.id, [{ ...protection, active: false }, { ...protection, resourceId: "another" }, { ...protection, organizationId: "foreign" }], "phone"), false);
});

test("coordinator initial assignments offer only active mentors in their own team and organization", () => {
  const scope = assignmentScope(actor, view, staff);
  assert.equal(scope.canAssign, true);
  assert.deepEqual(scope.mentors.map((member) => member.id), ["own-mentor"]);
  assert.deepEqual(scope.coordinators.map((member) => member.id), [actor.id]);
});

test("replacement of an existing primary mentor is CEO-only", () => {
  const assigned = { ...view, assignment: { mentorId: "own-mentor", coordinatorId: actor.id } };
  assert.equal(assignmentScope(actor, assigned, staff).canAssign, false);
  assert.equal(assignmentScope({ ...actor, role: "ceo" }, assigned, staff).canAssign, true);
});

test("a view-only grant on an unassigned card does not offer coordinator assignment", () => {
  const grant = { staffId: actor.id, organizationId: "org", participantId: participant.id, actions: ["view"], active: true, expiresAt: "2026-11-01T00:00:00Z" };
  assert.equal(assignmentScope(actor, { ...view, allowedActions: ["view"], accessGrants: [grant] }, staff).canAssign, false);
  assert.equal(assignmentScope(actor, { ...view, allowedActions: ["view"], accessGrants: [{ ...grant, actions: ["view", "edit"] }] }, staff).canAssign, false, "a projected grant must not override server-computed actions");
});

test("server actions deny editing even when a projected assignment points to the actor", () => {
  const pending = { ...view, allowedActions: ["view"], acceptedAssignment: null, assignment: { organizationId: "org", participantId: participant.id, mentorId: "mentor", coordinatorId: actor.id } };
  assert.equal(canEditParticipant(actor, pending), false);
  assert.equal(canEditParticipant({ ...actor, id: "mentor", role: "mentor" }, pending), false);
  assert.equal(assignmentScope(actor, pending, staff).canAssign, false);
});

test("legacy fallback uses only accepted assignments and explicit unassigned ownership", () => {
  const mentor = { ...actor, id: "mentor", role: "mentor" };
  const assignment = { organizationId: "org", participantId: participant.id, mentorId: mentor.id, coordinatorId: actor.id };
  const unowned = { ...view, participant: { ...participant, createdBy: "someone-else" }, assignment };
  assert.equal(canEditParticipant(mentor, unowned), false, "a projected assignment alone cannot authorize editing");
  assert.equal(canEditParticipant(actor, { ...unowned, assignment: null }), false, "unassigned visibility is not ownership");
  assert.equal(canEditParticipant(mentor, { ...unowned, acceptedAssignment: assignment }), true);
  assert.equal(canEditParticipant(actor, view), true, "explicit coordinator ownership authorizes an unassigned card");
});

test("pending staff can be chosen as queued dependencies without granting actor authority", () => {
  const pendingMentor = { id: "pending-mentor", organizationId: "org", role: "mentor", active: false, localPending: true, coordinatorId: actor.id };
  const scope = assignmentScope(actor, { ...view, allowedActions: ["view", "edit"] }, [...staff, pendingMentor]);
  assert.equal(scope.canAssign, true);
  assert.equal(scope.mentors.some((member) => member.id === pendingMentor.id), true);
  assert.equal(assignmentScope({ ...actor, localPending: true }, { ...view, allowedActions: ["edit"] }, staff).canAssign, false);
});

test("assignment protection, deleted cards, inactive actors, and cross-organization cards deny assignment", () => {
  assert.equal(assignmentScope(actor, { ...view, protections: [{ ...protection, fieldPaths: ["assignment"] }] }, staff).canAssign, false);
  assert.equal(assignmentScope(actor, { ...view, participant: { ...participant, deletedAt: "2026-10-26T12:00:00Z" } }, staff).canAssign, false);
  assert.equal(assignmentScope({ ...actor, active: false }, view, staff).canAssign, false);
  assert.equal(assignmentScope(actor, { ...view, participant: { ...participant, organizationId: "foreign" } }, staff).canAssign, false);
  assert.equal(assignmentScope(actor, { ...view, protections: [protection] }, staff).canAssign, true, "a protected phone does not block assignment");
});

test("assignment recovery replays the prepared operation and original base version after a lost response", async () => {
  const payload = { type: "assign_participant", participantId: participant.id, expectedVersion: 4, mentorId: "own-mentor", coordinatorId: actor.id };
  const operationId = "405b1dce-8f7f-443c-b3fd-2fab67be2aa3";
  const stored = { kind: "mentoring-form-draft-v1", value: { mentorId: payload.mentorId, coordinatorId: payload.coordinatorId, baseVersion: 4 }, intent: { operationId, signature: JSON.stringify(payload) } };
  const restored = await reconcileStoredDraft(stored, { baseVersion: 5 }, async (command) => {
    assert.deepEqual(command, { ...payload, operationId });
    return { ok: true, operationId, acceptance: "queued", replayed: true, participantId: participant.id };
  });
  assert.equal(restored.value.baseVersion, 4);
  assert.equal(restored.recovered.acceptance, "queued");
  assert.equal(restored.intent.operationId, operationId);
});

test("closing and reopening an incomplete assignment restores choices without submitting them", async () => {
  const incomplete = { mentorId: "", coordinatorId: actor.id, baseVersion: 4 };
  const restored = await reconcileStoredDraft(incomplete, { baseVersion: 5 }, async () => assert.fail("autosaved choices are not a submitted assignment"));
  assert.deepEqual(restored.value, incomplete);
  assert.equal(restored.recovered, null);
});
