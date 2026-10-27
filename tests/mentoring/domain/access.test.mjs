import assert from "node:assert/strict";
import test from "node:test";
import { canAccessParticipant, canPerformParticipantAction, checkWritePreconditions, preserveCeoConflict } from "../../../lib/mentoring/domain/index.ts";
import { assignment, ceo, coordinator, mentor, participant } from "./fixtures.mjs";

const now = "2026-10-26T10:00:00Z";
const grant = { id: "grant-1", organizationId: "org-1", staffId: mentor.id, participantId: participant.id, actions: ["view", "edit"], active: true, expiresAt: "2026-10-27T10:00:00Z" };
const protection = { organizationId: "org-1", resourceId: participant.id, protectedByStaffId: ceo.id, protectedRevision: 1, active: true, fieldPaths: null };
const write = (overrides = {}) => ({ actor: mentor, resource: { id: participant.id, organizationId: "org-1", version: 3 }, expectedVersion: 3, hasScope: true, protection: null, changedFields: ["notes"], ...overrides });

test("mentors see their own assigned participants; explicit current grants can extend scope", () => {
  assert.equal(canAccessParticipant(mentor, participant, assignment, [], now), true);
  const otherAssignment = { ...assignment, mentorId: "mentor-2" };
  assert.equal(canAccessParticipant(mentor, participant, otherAssignment, [], now), false);
  assert.equal(canAccessParticipant(mentor, participant, otherAssignment, [grant], now), true);
  assert.equal(canAccessParticipant(mentor, participant, otherAssignment, [{ ...grant, active: false }], now), false);
  assert.equal(canAccessParticipant(mentor, participant, otherAssignment, [{ ...grant, expiresAt: now }], now), false);
});

test("coordinator own-team default is fail-closed outside team; CEO sees their organization", () => {
  assert.equal(canAccessParticipant(coordinator, participant, assignment, [], now), true);
  assert.equal(canAccessParticipant(coordinator, participant, { ...assignment, coordinatorId: "coordinator-2" }, [], now), false);
  assert.equal(canAccessParticipant(coordinator, participant, { ...assignment, coordinatorId: null }, [], now), false);
  assert.equal(canAccessParticipant(ceo, participant, null, [], now), true);
  assert.equal(canAccessParticipant({ ...ceo, organizationId: "other-org" }, participant, assignment, [], now), false);
});

test("revoked accounts cannot use assignments, CEO role, or explicit grants", () => {
  assert.equal(canAccessParticipant({ ...mentor, active: false }, participant, assignment, [grant], now), false);
  assert.equal(canAccessParticipant({ ...ceo, active: false }, participant, null, [], now), false);
});

test("unexpected runtime actions and non-boolean account flags fail closed", () => {
  assert.equal(canPerformParticipantAction(ceo, participant, assignment, "manage_staff", [], now), false);
  assert.equal(canAccessParticipant({ ...mentor, active: "false" }, participant, assignment, [], now), false);
  assert.equal(checkWritePreconditions(write({ hasScope: "true" })).code, "forbidden_scope");
});

test("approval is management-only and deletion remains CEO-only", () => {
  assert.equal(canPerformParticipantAction(mentor, participant, assignment, "approve", [], now), false);
  assert.equal(canPerformParticipantAction(coordinator, participant, assignment, "approve", [], now), true);
  assert.equal(canPerformParticipantAction(coordinator, participant, assignment, "delete", [], now), false);
  assert.equal(canPerformParticipantAction(ceo, participant, null, "delete", [], now), true);
});

test("write preconditions honor current active/scope and expected revision", () => {
  assert.deepEqual(checkWritePreconditions(write()), { ok: true });
  assert.equal(checkWritePreconditions(write({ actor: { ...mentor, active: false } })).code, "inactive_actor");
  assert.equal(checkWritePreconditions(write({ hasScope: false })).code, "forbidden_scope");
  assert.equal(checkWritePreconditions(write({ actor: { ...mentor, organizationId: "other-org" } })).code, "wrong_organization");
  assert.equal(checkWritePreconditions(write({ expectedVersion: 2 })).code, "version_conflict");
});

test("CEO protection survives unrelated later editors/revisions and preserves CEO authority", () => {
  assert.equal(checkWritePreconditions(write({ protection, expectedVersion: 1 })).code, "ceo_protected");
  assert.equal(checkWritePreconditions(write({ protection, actor: coordinator })).code, "ceo_protected");
  assert.deepEqual(checkWritePreconditions(write({ protection, actor: ceo })), { ok: true });
  const fieldProtection = { ...protection, fieldPaths: ["notes.summary"] };
  assert.deepEqual(checkWritePreconditions(write({ protection: fieldProtection, changedFields: ["phone"] })), { ok: true });
  assert.equal(checkWritePreconditions(write({ protection: fieldProtection, changedFields: ["notes"] })).code, "ceo_protected");
  assert.equal(checkWritePreconditions(write({ protection: fieldProtection, changedFields: undefined })).code, "ceo_protected");
});

test("protected conflict keeps both versions and a stable operation-derived conflict identity", () => {
  const authoritative = { notes: "CEO correction", revision: 3 };
  const submitted = { notes: "Mentor offline work", revision: 1 };
  const input = { operationId: "operation-1", resourceId: participant.id, organizationId: "org-1", submittedByStaffId: mentor.id, authoritative, submitted, preservedAt: now };
  const result = preserveCeoConflict(input);
  assert.deepEqual(result.authoritative, authoritative);
  assert.deepEqual(result.submitted, submitted);
  assert.notEqual(result.authoritative, authoritative);
  assert.notEqual(result.submitted, submitted);
  assert.equal(result.id, preserveCeoConflict({ ...input, preservedAt: "2026-10-26T10:01:00Z" }).id);
  assert.equal(result.kind, "ceo_protected");
});
