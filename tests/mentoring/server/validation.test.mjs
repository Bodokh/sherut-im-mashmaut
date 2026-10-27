import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { canonicalJson, commandHash, parseCommand } from "../../../lib/mentoring/server/validation.ts";

const contact = (overrides = {}) => ({
  type: "record_contact", operationId: randomUUID(), participantId: randomUUID(),
  expectedVersion: 1, expectedAppointmentVersion: null, method: "phone", outcome: "completed",
  occurredAt: "2026-10-01T10:00:00+03:00", notes: "תוכן הדיווח",
  nextAppointmentAt: "2026-10-08T10:00:00+03:00", ...overrides,
});

test("partial participant fields are valid and trimmed without inventing required data", () => {
  const parsed = parseCommand({ type: "create_participant", operationId: randomUUID(), fields: { displayName: "  שרה  ", phone: null } });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.command.fields, { displayName: "שרה", phone: null });
  assert.equal(parseCommand({ type: "create_participant", operationId: randomUUID(), fields: {} }).ok, true);
});

test("request data cannot supply identity, role, organization, or unrecognized participant fields", () => {
  for (const extra of [{ actorId: randomUUID() }, { organizationId: randomUUID() }, { role: "ceo" }]) {
    const parsed = parseCommand({ type: "create_participant", operationId: randomUUID(), fields: {}, ...extra });
    assert.equal(parsed.ok, false);
    assert.equal(parsed.error.code, "validation");
  }
  assert.equal(parseCommand({ type: "create_participant", operationId: randomUUID(), fields: { active: true } }).ok, false);
});

test("contact concurrency tokens are required even when no appointment exists", () => {
  const { expectedAppointmentVersion: omitted, ...withoutAppointmentVersion } = contact();
  assert.equal(omitted, null);
  const parsed = parseCommand(withoutAppointmentVersion);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error.field, "expectedAppointmentVersion");
  assert.equal(parseCommand(contact()).ok, true);
  for (const expectedVersion of [0, -1, 1.5, "1"]) assert.equal(parseCommand(contact({ expectedVersion })).ok, false);
  assert.equal(parseCommand(contact({ expectedAppointmentVersion: 0 })).ok, false);
});

test("timestamps require a real calendar date and an explicit timezone", () => {
  for (const occurredAt of ["2026-10-01T10:00:00", "2026-02-30T10:00:00Z", "not-a-date"]) {
    assert.equal(parseCommand(contact({ occurredAt })).ok, false);
  }
  assert.equal(parseCommand(contact({ occurredAt: "2026-10-01T07:00:00Z" })).ok, true);
});

test("completed contacts require a scheduled next meeting", () => {
  const { nextAppointmentAt: omitted, ...withoutNextAppointment } = contact();
  assert.equal(typeof omitted, "string");
  const parsed = parseCommand(withoutNextAppointment);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error.field, "nextAppointmentAt");
  assert.match(parsed.error.message, /תאריך ושעה/);
});

test("a no-answer attempt is a phone attempt and cannot replace an appointment", () => {
  const { nextAppointmentAt: omitted, ...attempt } = contact({ outcome: "no_answer" });
  assert.equal(typeof omitted, "string");
  assert.equal(parseCommand(attempt).ok, true);
  assert.equal(parseCommand({ ...attempt, method: "in_person" }).ok, false);
  assert.equal(parseCommand({ ...attempt, nextAppointmentAt: "2026-10-08T10:00:00+03:00" }).ok, false);
});

test("empty updates and oversized notes are rejected before database access", () => {
  assert.equal(parseCommand({ type: "update_participant", operationId: randomUUID(), participantId: randomUUID(), expectedVersion: 1, fields: {} }).ok, false);
  assert.equal(parseCommand(contact({ notes: "x".repeat(20_001) })).ok, false);
});

test("canonical payload hashes ignore object key order but preserve values and array order", () => {
  const original = { operationId: randomUUID(), type: "create_participant", fields: { displayName: "שרה", phone: null } };
  const reordered = { fields: { phone: null, displayName: "שרה" }, type: "create_participant", operationId: original.operationId };
  assert.equal(commandHash(original), commandHash(reordered));
  assert.notEqual(commandHash(original), commandHash({ ...original, fields: { displayName: "רחל", phone: null } }));
  assert.equal(canonicalJson({ b: { z: 1, a: 2 }, a: [2, 1] }), '{"a":[2,1],"b":{"a":2,"z":1}}');
  assert.notEqual(canonicalJson([2, 1]), canonicalJson([1, 2]));
});

test("staff preapproval permits only non-owner roles and never accepts provider or organization identity", () => {
  const command = { type: "create_staff", operationId: randomUUID(), fields: { displayName: "  חונכת  ", email: "STAFF@EXAMPLE.ORG", phone: null, role: "mentor", coordinatorId: null } };
  const parsed = parseCommand(command);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.command.fields.email, "staff@example.org");
  assert.equal(parsed.command.fields.displayName, "חונכת");
  for (const extra of [{ authUserId: "user_untrusted" }, { organizationId: randomUUID() }, { active: true }]) {
    assert.equal(parseCommand({ ...command, fields: { ...command.fields, ...extra } }).ok, false);
  }
  assert.equal(parseCommand({ ...command, fields: { ...command.fields, role: "ceo" } }).ok, false);
  assert.equal(parseCommand({ ...command, fields: { ...command.fields, email: "invalid-email" } }).ok, false);
});

test("staff activation changes require a current positive revision and a boolean state", () => {
  const command = { type: "set_staff_active", operationId: randomUUID(), staffId: randomUUID(), expectedVersion: 1, active: false };
  assert.equal(parseCommand(command).ok, true);
  for (const overrides of [{ expectedVersion: 0 }, { active: "false" }, { role: "ceo" }]) {
    assert.equal(parseCommand({ ...command, ...overrides }).ok, false);
  }
});
