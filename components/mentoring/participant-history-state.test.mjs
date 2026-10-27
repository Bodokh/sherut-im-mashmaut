import assert from "node:assert/strict";
import test from "node:test";
import { participantHistory } from "./participant-history-state.ts";

const base = { participant: { id: "p" }, contacts: [], reviews: [], protections: [], assignment: null, nextAppointment: null, manualColor: null, manualColorAt: null };
const staff = [{ id: "mentor", displayName: "החונכת" }, { id: "ceo", displayName: "המנכ״ל" }];

test("revision evidence keeps the original author and the correction author distinct", () => {
  const items = participantHistory({ ...base, contactRevisions: [{ id: "contact", revision: 2, method: "phone", outcome: "completed", occurredAt: "2026-10-01T09:00:00Z", revisedAt: "2026-10-02T09:00:00Z", revisedByStaffId: "ceo", actorId: "mentor", changeKind: "correction", reason: "תיקון תאריך", notes: "הסיכום המתוקן" }] }, staff);
  assert.equal(items[0].actor, "המנכ״ל");
  assert.ok(items[0].lines.includes("הדיווח המקורי נרשם על ידי החונכת"));
  assert.equal(items[0].relatedTimes[0].at, "2026-10-01T09:00:00Z");
});

test("review entries identify the exact revision even after a newer correction", () => {
  const items = participantHistory({ ...base, reviewEvents: [{ id: "review", revision: 1, decision: "approved", reviewedAt: "2026-10-02T09:00:00Z", reviewedByStaffId: "ceo" }], contactRevisions: [{ id: "contact", revision: 2, method: "phone", outcome: "completed", occurredAt: "2026-10-01T09:00:00Z", revisedAt: "2026-10-03T09:00:00Z", revisedByStaffId: "mentor", actorId: "mentor", changeKind: "correction", notes: "תיקון" }] }, staff);
  assert.equal(items[0].title, "תיקון דיווח קשר");
  assert.deepEqual(items[1].lines, ["ההחלטה מתייחסת לגרסה 1 של הדיווח."]);
});

test("assignment attribution uses matching accepted audit evidence and never invents an author", () => {
  const assignment = { id: "a", mentorId: "mentor", coordinatorId: null, assignedAt: "2026-10-02T09:00:00Z", version: 2, endedAt: null };
  const history = [{ id: "wrong", action: "assign_participant", actorId: "mentor", createdAt: assignment.assignedAt, details: { assignmentVersion: 1, mentorId: "mentor" } }, { id: "correct", action: "assign_participant", actorId: "ceo", createdAt: assignment.assignedAt, details: { assignmentVersion: 2, mentorId: "mentor" } }];
  assert.equal(participantHistory({ ...base, assignmentHistory: [assignment], authorityHistory: history }, staff).find((item) => item.key === "assignment:a").actor, "המנכ״ל");
  assert.match(participantHistory({ ...base, assignmentHistory: [assignment] }, staff)[0].actor, /אינה כלולה/);
});

test("audit entries allowlist human fields and do not expose arbitrary internal details", () => {
  const [item] = participantHistory({ ...base, authorityHistory: [{ id: "audit", action: "set_ceo_protection", actorId: "ceo", createdAt: "2026-10-02T09:00:00Z", details: { active: true, fieldPaths: ["phone", "unknown.secret"], reason: "שמירת פרטים", secret: "must-not-render" } }] }, staff);
  assert.ok(item.lines.includes("פרטים מוגנים: טלפון"));
  assert.ok(!JSON.stringify(item).includes("must-not-render"));
  assert.ok(!JSON.stringify(item).includes("unknown.secret"));
});

test("appointments preserve planned time separately from time of change and carry review warning", () => {
  const [item] = participantHistory({ ...base, appointmentHistory: [{ id: "appt", appointmentVersion: 4, mentorId: "mentor", changedAt: "2026-10-02T09:00:00Z", scheduledAt: "2026-10-10T09:00:00Z", changedByStaffId: "ceo", requiresReview: true, changeKind: "rescheduled", reason: "תיאום מחדש" }] }, staff);
  assert.equal(item.at, "2026-10-02T09:00:00Z");
  assert.equal(item.relatedTimes[0].at, "2026-10-10T09:00:00Z");
  assert.ok(item.lines.some((line) => line.includes("דורש בדיקה")));
});

test("contact field protections remain field-specific in attributed history", () => {
  const [item] = participantHistory({ ...base, authorityHistory: [{ id: "audit", action: "set_ceo_protection", actorId: "ceo", createdAt: "2026-10-02T09:00:00Z", details: { active: true, fieldPaths: ["notes"] } }] }, staff);
  assert.ok(item.lines.includes("פרטים מוגנים: סיכום הקשר"));
  assert.ok(!item.lines.includes("הגנה על הרשומה כולה"));
  const [unknown] = participantHistory({ ...base, authorityHistory: [{ id: "audit", action: "set_ceo_protection", actorId: "ceo", createdAt: "2026-10-02T09:00:00Z", details: { active: true, fieldPaths: ["futureField"] } }] }, staff);
  assert.ok(unknown.lines[0].includes("פרטים מסוימים"));
});

test("appointment protection history uses its Hebrew field label", () => {
  const [item] = participantHistory({ ...base, authorityHistory: [{ id: "audit", action: "set_ceo_protection", actorId: "ceo", createdAt: "2026-10-02T09:00:00Z", details: { active: true, fieldPaths: ["appointment"] } }] }, staff);
  assert.ok(item.lines.includes("פרטים מוגנים: הפגישה הבאה"));
  assert.ok(!item.lines.some((line) => line.includes("appointment")));
});

test("pending projection history always retains its unaccepted status", () => {
  const items = participantHistory({ ...base,
    contactRevisions: [{ id: "contact", revision: 2, method: "phone", outcome: "completed", occurredAt: "2026-10-01T09:00:00Z", revisedAt: "2026-10-02T09:00:00Z", revisedByStaffId: "mentor", actorId: "mentor", changeKind: "correction", localPending: true }],
    reviewEvents: [{ id: "review", revision: 1, decision: "approved", reviewedAt: "2026-10-02T09:00:00Z", reviewedByStaffId: "ceo", localPending: true }],
    manualColorHistory: [{ id: "color", color: "green", setAt: "2026-10-02T09:00:00Z", setByStaffId: "mentor", localPending: true }],
    appointmentHistory: [{ id: "appt", appointmentVersion: 4, mentorId: "mentor", changedAt: "2026-10-02T09:00:00Z", scheduledAt: "2026-10-10T09:00:00Z", changedByStaffId: "mentor", changeKind: "rescheduled", localPending: true }],
    assignmentHistory: [{ id: "assignment", mentorId: "mentor", assignedAt: "2026-10-02T09:00:00Z", version: 1, localPending: true }],
  }, staff);
  assert.equal(items.length, 5);
  assert.ok(items.every((item) => item.pending === true));
  assert.ok(items.every((item) => item.localTime === true));
});

test("accepted receipt projection does not claim its device timestamp is server evidence", () => {
  const [item] = participantHistory({ ...base, reviewEvents: [{ id: "review", revision: 1, decision: "approved", reviewedAt: "2026-10-02T09:00:00Z", reviewedByStaffId: "ceo", localPending: false, localTimestamp: true }] }, staff);
  assert.equal(item.pending, false);
  assert.equal(item.localTime, true);
});
