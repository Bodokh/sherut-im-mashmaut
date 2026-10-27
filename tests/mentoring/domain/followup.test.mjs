import assert from "node:assert/strict";
import test from "node:test";
import {
  addSevenLocalDays,
  applyRecordedContact,
  computeFollowup,
  isRevisionApproved,
  validateCompletedContact,
} from "../../../lib/mentoring/domain/index.ts";
import { appointment, contact, reference, snapshot } from "./fixtures.mjs";

test("first deadline is assignment plus seven local calendar days", () => {
  const result = computeFollowup(reference({ assignedAt: "2026-10-19T07:00:00.000Z", contacts: [] }), "2026-10-20T07:00:00Z");
  assert.equal(result.anchorSource, "assignment");
  assert.equal(result.dueAt, "2026-10-26T08:00:00.000Z");
  assert.equal(result.lastCompletedContactAt, null);
});

test("a participant without assignment or contact has no fabricated deadline", () => {
  const result = computeFollowup(reference({ assignedAt: null, contacts: [], nextAppointment: null }), "2026-10-26T10:00:00Z");
  assert.equal(result.status, "unassigned");
  assert.equal(result.dueAt, null);
});

test("reassignment preserves the existing obligation when no successful contact occurred", () => {
  const input = reference({ assignedAt: "2026-10-25T09:00:00Z", followupAnchorAt: "2026-10-19T07:00:00Z", contacts: [] });
  const result = computeFollowup(input, "2026-10-26T09:00:00Z");
  assert.equal(result.anchorAt, "2026-10-19T07:00:00.000Z");
  assert.equal(result.dueAt, "2026-10-26T08:00:00.000Z");
  assert.equal(result.status, "seven_day_overdue");
});

test("successful occurrence, rather than upload or approval time, anchors the clock", () => {
  const result = computeFollowup(reference({ contacts: [contact({ occurredAt: "2026-10-19T07:00:00Z", receivedAt: "2026-10-26T09:00:00Z" })] }), "2026-10-26T09:01:00Z");
  assert.equal(result.anchorSource, "completed_contact");
  assert.equal(result.dueAt, "2026-10-26T08:00:00.000Z");
  assert.equal(result.status, "seven_day_overdue");
});

test("unanswered, invalidated, and another participant's contacts cannot reset the clock", () => {
  const result = computeFollowup(reference({ contacts: [
    contact(),
    contact({ id: "attempt", outcome: "no_answer", occurredAt: "2026-10-26T08:00:00Z" }),
    contact({ id: "invalidated", invalidatedAt: "2026-10-26T08:00:00Z", occurredAt: "2026-10-25T08:00:00Z" }),
    contact({ id: "other", participantId: "participant-2", occurredAt: "2026-10-26T08:00:00Z" }),
  ] }), "2026-10-26T09:00:00Z");
  assert.equal(result.lastCompletedContactAt, "2026-10-18T07:00:00.000Z");
  assert.equal(result.status, "seven_day_overdue");
});

test("deadline boundaries are before, at, and after, with overdue starting at equality", () => {
  const input = reference({ contacts: [contact({ occurredAt: "2026-10-19T07:00:00Z" })], nextAppointment: null });
  assert.equal(computeFollowup(input, "2026-10-26T07:59:59.999Z").status, "within_interval");
  assert.equal(computeFollowup(input, "2026-10-26T08:00:00.000Z").status, "seven_day_overdue");
  assert.equal(computeFollowup(input, "2026-10-26T08:00:00.001Z").status, "seven_day_overdue");
  assert.equal(computeFollowup(input, "2026-10-26T07:00:00Z").nextAppointmentMissing, true);
});

test("an earlier missed appointment is separate from the seven-day deadline", () => {
  const input = reference({ contacts: [contact({ occurredAt: "2026-10-22T07:00:00Z" })], nextAppointment: { ...appointment, scheduledAt: "2026-10-25T08:00:00Z" } });
  assert.equal(computeFollowup(input, "2026-10-25T08:00:00Z").status, "within_interval");
  assert.equal(computeFollowup(input, "2026-10-25T08:00:01Z").status, "appointment_missed");
  assert.equal(computeFollowup(input, "2026-10-29T08:00:00Z").status, "seven_day_overdue");
});

test("Israeli calendar days preserve wall time across both clock changes", () => {
  assert.equal(addSevenLocalDays("2026-10-19T07:00:00Z"), "2026-10-26T08:00:00.000Z");
  assert.equal(addSevenLocalDays("2026-03-20T08:00:00Z"), "2026-03-27T07:00:00.000Z");
  assert.equal(addSevenLocalDays("2026-10-19T07:00:00.123Z"), "2026-10-26T08:00:00.123Z");
});

test("proposed DST disambiguation shifts nonexistent times forward and chooses earlier overlaps", () => {
  assert.equal(addSevenLocalDays("2026-03-20T00:30:00Z"), "2026-03-27T00:30:00.000Z");
  assert.equal(addSevenLocalDays("2026-10-17T22:30:00Z"), "2026-10-24T22:30:00.000Z");
});

test("manual green remains green while computed follow-up can be overdue", () => {
  const state = snapshot();
  assert.equal(computeFollowup(reference(), "2026-10-26T10:00:00Z").status, "seven_day_overdue");
  assert.equal(state.manualColor, "green");
});

test("finalization reports incomplete, future, and non-chronological inputs", () => {
  const now = "2026-10-26T10:00:00Z";
  assert.ok(validateCompletedContact({ method: "phone", occurredAt: "", nextAppointmentAt: null }, now).some(x => x.field === "occurredAt" && x.severity === "error"));
  assert.ok(validateCompletedContact({ method: "phone", occurredAt: "2026-10-26T11:00:00Z", nextAppointmentAt: "2026-10-27T11:00:00Z" }, now).some(x => x.code === "future_contact"));
  assert.ok(validateCompletedContact({ method: "phone", occurredAt: "2026-10-26T09:00:00Z", nextAppointmentAt: "2026-10-26T08:00:00Z" }, now).some(x => x.code === "next_not_after_contact"));
  assert.ok(validateCompletedContact({ method: "phone", occurredAt: "2026-10-26T09:00:00Z", nextAppointmentAt: null }, now).some(x => x.code === "next_appointment_required"));
});

test("late next appointment warns under the documented default rather than resetting contact", () => {
  const issues = validateCompletedContact({ method: "phone", occurredAt: "2026-10-26T09:00:00Z", nextAppointmentAt: "2026-11-04T09:00:00Z" }, "2026-10-26T10:00:00Z");
  assert.deepEqual(issues.map(x => [x.code, x.severity]), [["after_cadence_deadline", "warning"]]);
});

test("completed contact replaces one appointment and preserves prior history without mutation", () => {
  const original = snapshot();
  const before = JSON.stringify(original);
  const entry = contact({ id: "contact-2", occurredAt: "2026-10-26T09:00:00Z", receivedAt: "2026-10-26T09:01:00Z" });
  const next = { ...appointment, id: "appointment-2", scheduledAt: "2026-11-02T09:00:00Z", version: 2 };
  const result = applyRecordedContact(original, { entry, nextAppointment: next, expectedAppointmentVersion: appointment.version }, "2026-10-26T10:00:00Z");
  assert.equal(result.ok, true);
  assert.equal(result.state.contacts.length, 2);
  assert.equal(result.state.nextAppointment.id, next.id);
  assert.equal(result.state.manualColor, "green");
  assert.equal(JSON.stringify(original), before);
  const extra = applyRecordedContact(result.state, { entry: { ...entry, id: "contact-3", occurredAt: "2026-10-26T09:30:00Z" }, nextAppointment: { ...next, id: "appointment-3", scheduledAt: "2026-11-02T09:30:00Z", version: 3 }, manualColor: "orange", expectedAppointmentVersion: next.version }, "2026-10-26T10:00:00Z");
  assert.equal(extra.ok, true);
  assert.equal(extra.state.contacts.length, 3);
  assert.equal(extra.state.nextAppointment.id, "appointment-3");
  assert.equal(extra.state.manualColor, "orange");
});

test("attempt appends history but does not replace appointment or successful clock", () => {
  const original = snapshot();
  const result = applyRecordedContact(original, { entry: contact({ id: "attempt-1", outcome: "no_answer", occurredAt: "2026-10-26T09:00:00Z" }), nextAppointment: { ...appointment, scheduledAt: "2026-11-02T09:00:00Z" }, expectedAppointmentVersion: appointment.version }, "2026-10-26T10:00:00Z");
  assert.equal(result.ok, true);
  assert.deepEqual(result.state.nextAppointment, appointment);
  const followup = computeFollowup(reference({ contacts: result.state.contacts }), "2026-10-26T10:00:00Z");
  assert.equal(followup.lastCompletedContactAt, contact().occurredAt);
});

test("stale completed uploads return a reviewable conflict without changing the appointment", () => {
  const original = snapshot({ contacts: [contact({ occurredAt: "2026-10-25T09:00:00Z" })] });
  const entry = contact({ id: "historical", occurredAt: "2026-10-20T09:00:00Z" });
  const result = applyRecordedContact(original, { entry, nextAppointment: { ...appointment, scheduledAt: "2026-10-27T09:00:00Z" }, expectedAppointmentVersion: appointment.version }, "2026-10-26T10:00:00Z");
  assert.equal(result.ok, false);
  assert.equal(result.kind, "conflict");
  assert.equal(result.code, "stale_completed_contact");
  assert.equal(result.submission.entry.id, entry.id);
  assert.deepEqual(result.currentState.nextAppointment, original.nextAppointment);
});

test("approval is for one exact revision and does not apply to later edits", () => {
  const entry = contact();
  const review = { contactId: entry.id, revision: 1, decision: "approved", reviewedByStaffId: "coordinator-1", reviewedAt: "2026-10-18T09:00:00Z" };
  assert.equal(isRevisionApproved(entry, review), true);
  assert.equal(isRevisionApproved({ ...entry, revision: 2 }, review), false);
  assert.equal(isRevisionApproved(entry, { ...review, contactId: "other" }), false);
  assert.equal(isRevisionApproved(entry, { ...review, decision: "returned_for_correction" }), false);
});

test("completed uploads require the current appointment version and preserve omitted or stale submissions", () => {
  const original = snapshot({ nextAppointment: { ...appointment, version: 2 } });
  const before = JSON.stringify(original);
  const entry = contact({ id: "queued-equal-time", occurredAt: original.contacts[0].occurredAt });
  for (const expected of [undefined, 1, null]) {
    const submission = { entry, nextAppointment: { ...appointment, version: 1, scheduledAt: "2026-10-27T09:00:00Z" }, ...(expected === undefined ? {} : { expectedAppointmentVersion: expected }) };
    const result = applyRecordedContact(original, submission, "2026-10-26T10:00:00Z");
    assert.equal(result.ok, false);
    assert.equal(result.kind, "conflict");
    assert.equal(result.code, "appointment_version_conflict");
    assert.equal(result.submission, submission);
    assert.equal(JSON.stringify(result.currentState), before);
    assert.equal(JSON.stringify(original), before);
  }
});
