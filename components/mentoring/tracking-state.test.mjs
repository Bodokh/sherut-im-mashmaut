import assert from "node:assert/strict";
import test from "node:test";
import { canUseTrackingCards, trackedMentors, trackingCardCommand, trackingCardFor, trackingCardFormValues, trackingReportCommand, trackingSubject } from "./tracking-state.ts";
import { parseCommand } from "../../lib/mentoring/validation.ts";

const actor = (role, overrides = {}) => ({ id: role, organizationId: "org", role, active: true, displayName: role, ...overrides });
const operationId = "5b0d8d6e-9c5f-4a3e-8f1a-2d2a6f0c7b11";
const mentee = trackingSubject("mentee", "7f1c2b9e-1c1d-4e0e-8f31-6f0e2b7b9c11");
const mentor = trackingSubject("mentor", "9a3d4c1e-2f2e-4f1f-9a42-7a1f3c8c0d22");
const empty = trackingCardFor({ trackingCards: [] }, "mentee", mentee.participantId);

test("only the CEO and active coordinators can use tracking cards", () => {
  assert.equal(canUseTrackingCards(actor("ceo")), true);
  assert.equal(canUseTrackingCards(actor("coordinator")), true);
  assert.equal(canUseTrackingCards(actor("mentor")), false);
  assert.equal(canUseTrackingCards(actor("coordinator", { active: false })), false);
  assert.equal(canUseTrackingCards(actor("coordinator", { localPending: true })), false);
});

test("a card that was never saved has an empty stable representation", () => {
  assert.deepEqual(empty, { kind: "mentee", subjectId: mentee.participantId, version: null, status: null, statusAt: null, notes: "", nextFollowupAt: null, updatedAt: null, updatedBy: null, updatedByName: null, reports: [] });
  assert.deepEqual(trackingCardFormValues(empty), { status: "none", notes: "", nextFollowupAt: "" });
});

test("saving a card builds a command the server schema accepts, including the expected version", () => {
  const built = trackingCardCommand(mentee, empty, { status: "orange", notes: "שוחחנו, צריך מעקב", nextFollowupAt: "" });
  assert.equal(built.ok, true);
  assert.equal(built.payload.expectedCardVersion, null);
  assert.equal(parseCommand({ ...built.payload, operationId }).ok, true);
  const cleared = trackingCardCommand(mentor, { ...empty, kind: "mentor", subjectId: mentor.staffId, version: 3 }, { status: "none", notes: "", nextFollowupAt: "" });
  assert.equal(cleared.payload.fields.status, null);
  assert.equal(cleared.payload.expectedCardVersion, 3);
  assert.equal(trackingCardCommand(mentee, empty, { status: "purple", notes: "", nextFollowupAt: "" }).ok, false);
  assert.equal(trackingCardCommand(mentee, empty, { status: "green", notes: "x", nextFollowupAt: "not a date" }).ok, false);
});

test("a tracking report needs a past time and notes", () => {
  const now = new Date("2026-11-15T12:00:00Z");
  const base = { method: "phone", outcome: "completed", occurredAt: "2026-11-15T10:00", notes: "דיברנו על הלימודים" };
  const built = trackingReportCommand(mentor, base, now);
  assert.equal(built.ok, true);
  assert.equal(parseCommand({ ...built.payload, operationId }).ok, true);
  assert.equal(trackingReportCommand(mentor, { ...base, notes: "   " }, now).issue.field, "notes");
  assert.equal(trackingReportCommand(mentor, { ...base, occurredAt: "" }, now).issue.field, "occurredAt");
  assert.equal(trackingReportCommand(mentor, { ...base, occurredAt: "2027-01-01T10:00" }, now).issue.field, "occurredAt");
  assert.equal(trackingReportCommand(mentor, { ...base, method: "pigeon" }, now).ok, false);
});

test("unknown commands and mentor-shaped subjects are rejected by the shared schema", () => {
  assert.equal(parseCommand({ type: "save_tracking_card", operationId, subject: { kind: "mentee", participantId: "nope" }, expectedCardVersion: null, fields: { status: null, notes: "", nextFollowupAt: null } }).ok, false);
  assert.equal(parseCommand({ type: "save_tracking_card", operationId, subject: { kind: "mentee", participantId: mentee.participantId, staffId: mentor.staffId }, expectedCardVersion: null, fields: { status: null, notes: "", nextFollowupAt: null } }).ok, false);
});

test("the CEO opens every mentor card, a coordinator only her team, a mentor none", () => {
  const staff = [
    actor("ceo"), actor("coordinator"),
    { id: "m1", organizationId: "org", role: "mentor", active: true, displayName: "ב", coordinatorId: "coordinator" },
    { id: "m2", organizationId: "org", role: "mentor", active: true, displayName: "א", coordinatorId: "other" },
    { id: "m3", organizationId: "org", role: "mentor", active: true, displayName: "ג", coordinatorId: null },
    { id: "m4", organizationId: "other", role: "mentor", active: true, displayName: "ד", coordinatorId: "coordinator" },
  ];
  assert.deepEqual(trackedMentors(actor("ceo"), staff).map((member) => member.id), ["m2", "m1", "m3"]);
  assert.deepEqual(trackedMentors(actor("coordinator"), staff).map((member) => member.id), ["m1"]);
  assert.deepEqual(trackedMentors(actor("mentor"), staff), []);
});
