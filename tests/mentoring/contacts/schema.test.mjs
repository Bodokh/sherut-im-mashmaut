import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { z } from "zod";
import "../server/typescript-loader.mjs";
import { contactCommandSchemas } from "../../../lib/mentoring/features/contacts/schema.ts";

const schema = z.discriminatedUnion("type", contactCommandSchemas);
const revise = (overrides = {}) => ({
  type: "revise_contact", operationId: randomUUID(), participantId: randomUUID(),
  expectedVersion: 2, contactId: randomUUID(), expectedRevision: 1, expectedAppointmentVersion: null,
  method: "phone", outcome: "completed", occurredAt: "2026-10-24T09:00:00Z", notes: "תיקון תיעוד",
  reason: "תיקון שגיאת תיעוד", ...overrides,
});
const invalidate = (overrides = {}) => ({
  type: "invalidate_contact", operationId: randomUUID(), participantId: randomUUID(),
  expectedVersion: 2, contactId: randomUUID(), expectedRevision: 1,
  expectedAppointmentVersion: 2, reason: "התיעוד שויך לחניכה הלא נכונה", ...overrides,
});
const reschedule = (overrides = {}) => ({
  type: "reschedule_appointment", operationId: randomUUID(), participantId: randomUUID(),
  expectedVersion: 2, expectedAppointmentVersion: 1, scheduledAt: "2026-10-29T09:00:00Z",
  reason: "תיאום מחדש", ...overrides,
});
const color = (overrides = {}) => ({
  type: "set_manual_color", operationId: randomUUID(), participantId: randomUUID(),
  expectedVersion: 2, color: "orange", ...overrides,
});

test("all four contact lifecycle commands accept their complete typed payloads", () => {
  for (const command of [revise(), invalidate(), reschedule(), color()]) assert.equal(schema.safeParse(command).success, true, command.type);
  assert.equal(schema.safeParse(revise({ nextAppointmentAt: "2026-10-29T09:00:00Z" })).success, true);
  assert.equal(schema.safeParse(color({ reason: "עדכון מעקב" })).success, true);
});

test("a narrative correction may omit a new appointment while retaining its required concurrency token", () => {
  assert.equal(schema.safeParse(revise()).success, true);
  for (const command of [revise(), invalidate()]) {
    const { expectedAppointmentVersion, ...omitted } = command;
    assert.ok(expectedAppointmentVersion === null || typeof expectedAppointmentVersion === "number");
    assert.equal(schema.safeParse(omitted).success, false);
  }
});

test("contact revision, participant, and appointment tokens must be bounded positive integers", () => {
  for (const value of [0, -1, 1.5, "1", 2_147_483_648]) {
    for (const field of ["expectedVersion", "expectedRevision", "expectedAppointmentVersion"]) {
      assert.equal(schema.safeParse(revise({ [field]: value })).success, false, `${field}=${value}`);
    }
  }
  assert.equal(schema.safeParse(reschedule({ expectedAppointmentVersion: null })).success, false);
});

test("identity and permission assertions cannot be added to any contact lifecycle command", () => {
  for (const command of [revise(), invalidate(), reschedule(), color()]) {
    for (const extra of [{ actorId: randomUUID() }, { organizationId: randomUUID() }, { role: "ceo" }, { authorized: true }]) {
      assert.equal(schema.safeParse({ ...command, ...extra }).success, false, command.type);
    }
    assert.equal(schema.safeParse({ ...command, operationId: "not-a-uuid" }).success, false);
  }
});

test("administrative scheduling and correction reasons are required, trimmed, and bounded", () => {
  for (const command of [revise(), invalidate(), reschedule()]) {
    for (const reason of ["", "   ", "x".repeat(2_001), null]) assert.equal(schema.safeParse({ ...command, reason }).success, false);
    const { reason, ...omitted } = command;
    assert.equal(typeof reason, "string");
    assert.equal(schema.safeParse(omitted).success, false);
    const parsed = schema.safeParse({ ...command, reason: "  תיקון מאומת  " });
    assert.equal(parsed.success, true);
    assert.equal(parsed.data.reason, "תיקון מאומת");
  }
});

test("manual color is a deliberate enum choice and has an optional bounded explanation", () => {
  for (const value of ["green", "orange", "red"]) assert.equal(schema.safeParse(color({ color: value })).success, true);
  for (const value of ["blue", "", null, 1]) assert.equal(schema.safeParse(color({ color: value })).success, false);
  assert.equal(schema.safeParse(color({ reason: "x".repeat(2_001) })).success, false);
});

test("revision timestamps and rescheduled dates require real calendar instants with a timezone", () => {
  for (const invalid of ["2026-10-24T09:00:00", "2026-02-30T09:00:00Z", "yesterday", ""]) {
    assert.equal(schema.safeParse(revise({ occurredAt: invalid })).success, false);
    assert.equal(schema.safeParse(revise({ nextAppointmentAt: invalid })).success, false);
    assert.equal(schema.safeParse(reschedule({ scheduledAt: invalid })).success, false);
  }
  assert.equal(schema.safeParse(reschedule({ scheduledAt: "2026-10-29T12:00:00+03:00" })).success, true);
});

test("no-answer corrections remain phone attempts and cannot carry a replacement schedule", () => {
  assert.equal(schema.safeParse(revise({ outcome: "no_answer" })).success, true);
  assert.equal(schema.safeParse(revise({ outcome: "no_answer", method: "in_person" })).success, false);
  assert.equal(schema.safeParse(revise({ outcome: "no_answer", nextAppointmentAt: "2026-10-29T09:00:00Z" })).success, false);
});

test("oversized notes and unrecognized contact methods or outcomes are rejected before database access", () => {
  for (const overrides of [{ notes: "x".repeat(20_001) }, { method: "message" }, { outcome: "sent" }]) {
    assert.equal(schema.safeParse(revise(overrides)).success, false);
  }
});
