import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { z } from "zod";
import "../server/typescript-loader.mjs";
import { authorityCommandSchemas } from "../../../lib/mentoring/features/authority/schema.ts";
import { isParticipantDeleted } from "../../../lib/mentoring/features/authority/contracts.ts";

const schema = z.discriminatedUnion("type", authorityCommandSchemas);
const participant = () => ({ operationId: randomUUID(), participantId: randomUUID(), expectedVersion: 7, reason: "  שינוי מאושר  " });
const grant = (overrides = {}) => ({ ...participant(), type: "set_access_grant", staffId: randomUUID(), expectedGrantVersion: null, actions: ["view", "edit"], expiresAt: null, ...overrides });
const protection = (overrides = {}) => ({ ...participant(), type: "set_ceo_protection", resourceId: randomUUID(), expectedProtectionVersion: null, active: true, fieldPaths: null, ...overrides });

test("authority schemas require current versions and reject client identity assertions", () => {
  assert.equal(schema.parse(grant()).reason, "שינוי מאושר");
  for (const overrides of [{ expectedVersion: 0 }, { expectedVersion: "7" }, { expectedGrantVersion: 0 }, { organizationId: randomUUID() }, { actorId: randomUUID() }, { role: "ceo" }, { reason: " " }]) {
    assert.equal(schema.safeParse(grant(overrides)).success, false);
  }
  const { expectedGrantVersion: omitted, ...withoutGrantVersion } = grant();
  assert.equal(omitted, null);
  assert.equal(schema.safeParse(withoutGrantVersion).success, false);
});

test("grant actions cannot delegate deletion or omit the view prerequisite", () => {
  for (const actions of [["delete"], ["view", "delete"], ["edit"], ["approve"], ["view", "view"]]) {
    assert.equal(schema.safeParse(grant({ actions })).success, false);
  }
  assert.equal(schema.safeParse(grant({ actions: ["view", "approve"] })).success, true);
  assert.equal(schema.safeParse(grant({ actions: [] })).success, true, "An empty action set is an explicit versioned revocation.");
  for (const expiresAt of ["2026-10-26T10:00:00", "2026-02-30T10:00:00Z", "invalid"]) {
    assert.equal(schema.safeParse(grant({ expiresAt })).success, false);
  }
});

test("protection scopes are closed and whole-object protection is explicit null", () => {
  assert.equal(schema.safeParse(protection()).success, true);
  assert.equal(schema.safeParse(protection({ fieldPaths: ["manualColor", "lifecycle"] })).success, true);
  for (const overrides of [{ fieldPaths: [] }, { fieldPaths: ["role"] }, { fieldPaths: ["notes", "notes"] }, { active: false, fieldPaths: ["notes"] }, { expectedProtectionVersion: 0 }]) {
    assert.equal(schema.safeParse(protection(overrides)).success, false);
  }
  assert.equal(schema.safeParse(protection({ active: false, fieldPaths: null, expectedProtectionVersion: 3 })).success, true);
});

test("lifecycle, delete and restore keep reason and concurrency requirements", () => {
  for (const type of ["delete_participant", "restore_participant"]) {
    assert.equal(schema.safeParse({ ...participant(), type }).success, true);
    assert.equal(schema.safeParse({ ...participant(), type, hardDelete: true }).success, false);
    assert.equal(schema.safeParse({ ...participant(), type, reason: "" }).success, false);
  }
  for (const lifecycle of ["active", "paused", "closed"]) {
    assert.equal(schema.safeParse({ ...participant(), type: "set_participant_lifecycle", lifecycle }).success, true);
  }
  assert.equal(schema.safeParse({ ...participant(), type: "set_participant_lifecycle", lifecycle: "deleted" }).success, false);
});

test("staff updates cannot alter provider identity, email, activation or CEO role", () => {
  const command = { operationId: randomUUID(), type: "update_staff", staffId: randomUUID(), expectedVersion: 1, fields: { displayName: "  חונכת  ", phone: null } };
  assert.deepEqual(schema.parse(command).fields, { displayName: "חונכת", phone: null });
  for (const fields of [{}, { role: "ceo" }, { authUserId: "user_other" }, { email: "other@example.invalid" }, { active: false }, { smsMuted: true }, { displayName: " " }]) {
    assert.equal(schema.safeParse({ ...command, fields }).success, false);
  }
});

test("deletion helper recognizes only an actual tombstone timestamp", () => {
  assert.equal(isParticipantDeleted({}), false);
  assert.equal(isParticipantDeleted({ deletedAt: null }), false);
  assert.equal(isParticipantDeleted({ deletedAt: "2026-10-26T10:00:00Z" }), true);
});
