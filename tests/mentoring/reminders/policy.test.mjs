import assert from "node:assert/strict";
import test from "node:test";
import "../server/typescript-loader.mjs";
import { defaultOrganizationSettings } from "../../../lib/mentoring/features/oversight/contracts.ts";
import { participant, assignment, appointment, contact, snapshot } from "../domain/fixtures.mjs";

const { reminderGeneration, planReminderOccurrences, selectReminderRecipients, normalizeStaffMobile, reminderMessage } = await import("../../../lib/mentoring/features/reminders/policy.ts");

const now = "2026-10-26T12:00:00Z";
const settings = (overrides = {}) => ({ ...defaultOrganizationSettings("org-1", now), ...overrides });
const view = (overrides = {}) => snapshot({ ...overrides });
const member = (id, role, overrides = {}) => ({ id, organizationId: "org-1", role, active: true, version: 1, authUserId: id,
  displayName: id, email: null, phone: "050-1234567", coordinatorId: null, smsMuted: false, ...overrides });
const staff = () => [member("mentor-1", "mentor"), member("coordinator-1", "coordinator"), member("ceo-1", "ceo"),
  member("unrelated", "mentor"), member("inactive", "mentor", { active: false }), member("cross-org", "ceo", { organizationId: "org-2" })];
const byKind = (occurrences, kind) => occurrences.find((item) => item.kind === kind);

test("default plan has one appointment and one seven-day breach with deterministic identities", () => {
  const planned = planReminderOccurrences(view(), settings(), now);
  assert.equal(planned.length, 2);
  assert.deepEqual(planned, planReminderOccurrences(view(), settings(), now));
  assert.equal(byKind(planned, "appointment").scheduledAt, appointment.scheduledAt);
  assert.equal(byKind(planned, "seven_day_overdue").scheduledAt, "2026-10-25T08:00:00.000Z");
  assert.equal(new Set(planned.map((item) => item.occurrenceKey)).size, 2);
});

test("appointment offset changes scheduling and validation generation without changing delivered occurrence identity", () => {
  const ordinary = planReminderOccurrences(view(), settings(), now)[0];
  const earlier = planReminderOccurrences(view(), settings({ appointmentReminderMinutesBefore: 90, version: 2 }), now)[0];
  assert.equal(earlier.scheduledAt, "2026-10-25T06:30:00.000Z");
  assert.equal(earlier.occurrenceKey, ordinary.occurrenceKey);
  assert.notEqual(earlier.generation, ordinary.generation);
});

test("a no-answer changes validation generation while preserving occurrence delivery keys and cadence", () => {
  const before = planReminderOccurrences(view(), settings(), now);
  const after = planReminderOccurrences(view({ participant: { ...participant, version: 2 },
    contacts: [contact(), contact({ id: "attempt", outcome: "no_answer", occurredAt: "2026-10-26T11:00:00Z" })] }), settings(), now);
  assert.deepEqual(after.map((item) => [item.occurrenceKey, item.scheduledAt]), before.map((item) => [item.occurrenceKey, item.scheduledAt]));
  assert.notEqual(after[0].generation, before[0].generation);
});

test("successful contact, correction, invalidation, appointment and settings versions invalidate stale claims", () => {
  const original = reminderGeneration(view(), settings(), now);
  for (const changed of [
    view({ contacts: [contact({ id: "new", occurredAt: "2026-10-25T10:00:00Z" })] }),
    view({ contacts: [contact({ revision: 2 })] }),
    view({ contacts: [contact({ invalidatedAt: now })] }),
    view({ nextAppointment: { ...appointment, version: 2 } }),
    view({ assignment: { ...assignment, version: 2 } }),
  ]) assert.notEqual(reminderGeneration(changed, settings(), now), original);
  assert.notEqual(reminderGeneration(view(), settings({ version: 2 }), now), original);
});

test("cadence uses latest valid successful occurrence and preserves Israel wall time across DST", () => {
  const planned = planReminderOccurrences(view({ contacts: [contact({ occurredAt: "2026-10-19T07:00:00Z" }),
    contact({ id: "future", occurredAt: "2026-11-01T10:00:00Z" }),
    contact({ id: "other", participantId: "other", occurredAt: "2026-10-25T10:00:00Z" })] }), settings(), now);
  assert.equal(byKind(planned, "seven_day_overdue").scheduledAt, "2026-10-26T08:00:00.000Z");
  const spring = planReminderOccurrences(view({ contacts: [contact({ occurredAt: "2026-03-20T08:00:00Z" })] }), settings(), "2026-03-27T07:00:00Z");
  assert.equal(byKind(spring, "seven_day_overdue").scheduledAt, "2026-03-27T07:00:00.000Z");
});

test("no qualifying contact uses the assignment continuity anchor", () => {
  const planned = planReminderOccurrences(view({ contacts: [], assignment: { ...assignment,
    assignedAt: "2026-10-25T09:00:00Z", followupAnchorAt: "2026-10-19T07:00:00Z" } }), settings(), now);
  assert.equal(byKind(planned, "seven_day_overdue").scheduledAt, "2026-10-26T08:00:00.000Z");
});

test("paused, closed, deleted, unassigned and wrong-organization participants have no jobs or recipients", () => {
  for (const altered of [
    view({ participant: { ...participant, lifecycle: "paused" } }), view({ participant: { ...participant, lifecycle: "closed" } }),
    view({ participant: { ...participant, deletedAt: now } }), view({ deletedAt: now }), view({ assignment: null }),
    view({ assignment: { ...assignment, participantId: "other" } }),
    view({ participant: { ...participant, organizationId: "other" } }),
  ]) {
    assert.deepEqual(planReminderOccurrences(altered, settings(), now), []);
    assert.deepEqual(selectReminderRecipients(altered, staff(), settings()), []);
  }
});

test("responsible team recipients are primary mentor, assigned coordinator and unmuted CEO only", () => {
  assert.deepEqual(selectReminderRecipients(view(), staff(), settings()).map((row) => row.id), ["ceo-1", "coordinator-1", "mentor-1"]);
  const muted = staff().map((row) => ({ ...row, smsMuted: true }));
  assert.deepEqual(selectReminderRecipients(view(), muted, settings()).map((row) => row.id), ["coordinator-1", "mentor-1"]);
});

test("all-staff routing must be explicit and still excludes inactive and cross-org accounts", () => {
  assert.deepEqual(selectReminderRecipients(view(), staff(), settings({ reminderAudience: "all_staff" })).map((row) => row.id), ["ceo-1", "coordinator-1", "mentor-1", "unrelated"]);
  const duplicates = [...staff(), staff()[0], member("participant", "developer")];
  assert.equal(selectReminderRecipients(view(), duplicates, settings({ reminderAudience: "all_staff" })).length, 4);
});

test("missing or invalid staff mobile remains an explicit transport problem, never a substituted participant number", () => {
  for (const value of [null, "", "+97221234567", "050123456", "05012345678", "050-1234567 ext 2", "+1 5551234567", "++972501234567"]) assert.equal(normalizeStaffMobile(value), null);
  for (const value of ["0501234567", "050-123 4567", "+972501234567", "972501234567"]) assert.equal(normalizeStaffMobile(value), "+972501234567");
  const recipients = selectReminderRecipients(view({ participant: { ...participant, phone: "0509876543" } }), [member("mentor-1", "mentor", { phone: null })], settings());
  assert.equal(recipients.length, 1);
  assert.equal(recipients[0].phone, null);
});

test("repeats are disabled by default and explicit repetition schedules only base plus latest occurrence", () => {
  assert.equal(planReminderOccurrences(view(), settings(), "2027-01-01T12:00:00Z").length, 2);
  const planned = planReminderOccurrences(view(), settings({ overdueRepeatHours: 12 }), "2026-10-28T09:00:00Z");
  assert.equal(planned.length, 3);
  assert.equal(planned[2].scheduledAt, "2026-10-28T08:00:00.000Z");
  assert.equal(planned[2].referenceAt, "2026-10-25T08:00:00.000Z");
  assert.notEqual(planned[1].occurrenceKey, planned[2].occurrenceKey);
  assert.equal(planReminderOccurrences(view(), settings({ overdueRepeatHours: 12 }), "2026-10-25T19:59:59Z").length, 2);
  assert.equal(planReminderOccurrences(view(), settings({ overdueRemindersEnabled: false, overdueRepeatHours: 12 }), now).length, 1);
});

test("message contains only the provided name, relevant date/time and need, with no narrative or phones", () => {
  const occurrence = planReminderOccurrences(view({ contacts: [contact({ notes: "SECRET-NARRATIVE" })] }), settings(), now)[0];
  const text = reminderMessage("שם\nחניכה", occurrence);
  assert.match(text, /שם חניכה/);
  assert.match(text, /תזכורת לקשר/);
  assert.doesNotMatch(text, /SECRET|050|\n/);
  assert.ok(text.length < 300);
  assert.match(reminderMessage("שם", { kind: "seven_day_overdue", referenceAt: now }), /נדרש קשר/);
});
