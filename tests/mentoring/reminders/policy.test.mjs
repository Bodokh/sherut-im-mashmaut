import assert from "node:assert/strict";
import test from "node:test";
import "../server/typescript-loader.mjs";
import { defaultOrganizationSettings } from "../../../lib/mentoring/features/oversight/contracts.ts";
import { participant, assignment, appointment, contact, snapshot } from "../domain/fixtures.mjs";

const { reminderGeneration, planReminderOccurrences, selectReminderRecipients, normalizeStaffMobile, reminderMessage } = await import("../../../lib/mentoring/features/reminders/policy.ts");

const now = "2026-10-26T12:00:00Z";
const settings = (overrides = {}) => ({ ...defaultOrganizationSettings("org-1", now), appointmentReminderMinutesBefore: 0, ...overrides });
const upcomingAppointment = { ...appointment, scheduledAt: "2026-10-27T08:00:00.000Z" };
const view = (overrides = {}) => snapshot({ nextAppointment: upcomingAppointment, ...overrides });
const member = (id, role, overrides = {}) => ({ id, organizationId: "org-1", role, active: true, version: 1, authUserId: id,
  displayName: id, email: null, phone: "050-1234567", coordinatorId: null, smsMuted: false, ...overrides });
const staff = () => [member("mentor-1", "mentor"), member("coordinator-1", "coordinator"), member("ceo-1", "ceo"),
  member("unrelated", "mentor"), member("inactive", "mentor", { active: false }), member("cross-org", "ceo", { organizationId: "org-2" })];
const byKind = (occurrences, kind) => occurrences.find((item) => item.kind === kind);

test("confirmed default sends three days before and on the scheduled day", () => {
  const planned = planReminderOccurrences(view(), defaultOrganizationSettings("org-1", now), now);
  assert.equal(planned.filter((item) => item.kind === "appointment").length, 2);
  assert.equal(planned.find((item) => item.occurrenceKey.includes("advance")).scheduledAt, "2026-10-24T08:00:00.000Z");
});

test("zero-lead plan has one appointment and one seven-day breach with deterministic identities", () => {
  const planned = planReminderOccurrences(view(), settings(), now);
  assert.equal(planned.length, 2);
  assert.deepEqual(planned, planReminderOccurrences(view(), settings(), now));
  assert.equal(byKind(planned, "appointment").scheduledAt, upcomingAppointment.scheduledAt);
  assert.equal(byKind(planned, "seven_day_overdue").scheduledAt, "2026-10-25T08:00:00.000Z");
  assert.equal(new Set(planned.map((item) => item.occurrenceKey)).size, 2);
});

test("a three-day advance and the scheduled-day reminder have stable distinct delivery identities", () => {
  const ordinary = planReminderOccurrences(view(), settings({ overdueRemindersEnabled: false }), now)[0];
  const paired = planReminderOccurrences(view(), settings({ appointmentReminderMinutesBefore: 4320, overdueRemindersEnabled: false, version: 2 }), now);
  assert.equal(paired.length, 2);
  const sameDay = paired.find((item) => item.scheduledAt === ordinary.scheduledAt);
  const advance = paired.find((item) => item !== sameDay);
  assert.equal(advance.scheduledAt, "2026-10-24T08:00:00.000Z");
  assert.equal(sameDay.occurrenceKey, ordinary.occurrenceKey, "zero lead keeps the existing scheduled-day delivery identity");
  assert.notEqual(advance.occurrenceKey, sameDay.occurrenceKey);
  assert.equal(advance.referenceAt, sameDay.referenceAt);
  assert.notEqual(advance.generation, ordinary.generation);
  const changed = planReminderOccurrences(view(), settings({ appointmentReminderMinutesBefore: 90, overdueRemindersEnabled: false, version: 3 }), now);
  assert.deepEqual(changed.map((item) => item.occurrenceKey).sort(), paired.map((item) => item.occurrenceKey).sort(), "policy changes cannot resend an accepted occurrence");
  assert.equal(changed.find((item) => item.occurrenceKey === advance.occurrenceKey).scheduledAt, "2026-10-27T06:30:00.000Z");
});

test("scheduled-day reminders allow cron delay but expire at Israel midnight in winter and summer", () => {
  const policy = settings({ appointmentReminderMinutesBefore: 4320, overdueRemindersEnabled: false });
  for (const [scheduledAt, minutesLate, lastMoment, midnight] of [
    ["2026-11-09T21:55:00Z", "2026-11-09T21:59:00Z", "2026-11-09T21:59:59.999Z", "2026-11-09T22:00:00Z"],
    ["2026-06-01T20:55:00Z", "2026-06-01T20:59:00Z", "2026-06-01T20:59:59.999Z", "2026-06-01T21:00:00Z"],
  ]) {
    const current = view({ nextAppointment: { ...upcomingAppointment, scheduledAt } });
    const atTime = planReminderOccurrences(current, policy, scheduledAt);
    assert.equal(atTime.length, 2, "An advance reminder remains eligible through the scheduled instant");
    for (const timestamp of [minutesLate, lastMoment]) {
      const delayed = planReminderOccurrences(current, policy, timestamp);
      assert.equal(delayed.length, 1);
      assert.equal(delayed[0].occurrenceKey, atTime[0].occurrenceKey, "Only the scheduled-day notice remains after the appointment time");
    }
    assert.deepEqual(planReminderOccurrences(current, policy, midnight), []);
  }
});

test("past-day appointments leave missed contact to the existing overdue reminder", () => {
  const planned = planReminderOccurrences(view({ nextAppointment: appointment }), settings({ appointmentReminderMinutesBefore: 4320 }), now);
  assert.deepEqual(planned.map((item) => item.kind), ["seven_day_overdue"]);
});

test("a no-answer changes validation generation while preserving occurrence delivery keys and cadence", () => {
  const before = planReminderOccurrences(view(), settings(), now);
  const after = planReminderOccurrences(view({ participant: { ...participant, version: 2 },
    contacts: [contact(), contact({ id: "attempt", outcome: "no_answer", occurredAt: "2026-10-26T11:00:00Z" })] }), settings(), now);
  assert.deepEqual(after.map((item) => [item.occurrenceKey, item.scheduledAt]), before.map((item) => [item.occurrenceKey, item.scheduledAt]));
  assert.notEqual(after[0].generation, before[0].generation);
});

test("a completed follow-up report and its next appointment start a fresh reminder pair", () => {
  const policy = settings({ appointmentReminderMinutesBefore: 4320, overdueRemindersEnabled: false });
  const before = planReminderOccurrences(view(), policy, now);
  const next = { ...upcomingAppointment, id: "appointment-after-report", scheduledAt: "2026-11-02T12:00:00.000Z", sourceContactId: "completed-report" };
  const after = planReminderOccurrences(view({ contacts: [contact({ id: "completed-report", occurredAt: now })], nextAppointment: next }), policy, now);
  assert.equal(after.length, 2);
  assert.deepEqual(after.map((item) => item.scheduledAt).sort(), ["2026-10-30T12:00:00.000Z", "2026-11-02T12:00:00.000Z"]);
  assert.equal(after.some((item) => before.some((previous) => previous.occurrenceKey === item.occurrenceKey)), false);
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

test("only the assigned mentor and coordinator receive reminders, regardless of CEO mute", () => {
  assert.deepEqual(selectReminderRecipients(view(), staff(), settings()).map((row) => row.id), ["coordinator-1", "mentor-1"]);
  const muted = staff().map((row) => ({ ...row, smsMuted: true }));
  assert.deepEqual(selectReminderRecipients(view(), muted, settings()).map((row) => row.id), ["coordinator-1", "mentor-1"]);
});

test("legacy all-staff settings cannot include CEOs, unrelated, inactive or cross-org accounts", () => {
  assert.deepEqual(selectReminderRecipients(view(), staff(), settings({ reminderAudience: "all_staff" })).map((row) => row.id), ["coordinator-1", "mentor-1"]);
  const duplicates = [...staff(), staff()[0], member("participant", "developer")];
  assert.equal(selectReminderRecipients(view(), duplicates, settings({ reminderAudience: "all_staff" })).length, 2);
});

test("missing or invalid staff mobile remains an explicit transport problem, never a substituted participant number", () => {
  for (const value of [null, "", "+97221234567", "050123456", "05012345678", "050-1234567 ext 2", "+1 5551234567", "++972501234567"]) assert.equal(normalizeStaffMobile(value), null);
  for (const value of ["0501234567", "050-123 4567", "+972501234567", "972501234567"]) assert.equal(normalizeStaffMobile(value), "+972501234567");
  const recipients = selectReminderRecipients(view({ participant: { ...participant, phone: "0509876543" } }), [member("mentor-1", "mentor", { phone: null })], settings());
  assert.equal(recipients.length, 1);
  assert.equal(recipients[0].phone, null);
});

test("weekly repeats plan only the latest missed week regardless of legacy interval settings", () => {
  assert.equal(defaultOrganizationSettings("org-1", now).overdueRepeatHours, 168);
  const current = view({ contacts: [contact({ occurredAt: "2026-11-01T08:00:00Z" })], nextAppointment: null });
  for (const overdueRepeatHours of [null, 12, 168]) {
    const planned = planReminderOccurrences(current, settings({ overdueRepeatHours }), "2026-11-30T09:00:00Z");
    assert.equal(planned.length, 1, "Four missed runs produce one current weekly occurrence, never a burst");
    assert.equal(planned[0].scheduledAt, "2026-11-29T08:00:00.000Z");
    assert.equal(planned[0].referenceAt, "2026-11-08T08:00:00.000Z");
    assert.equal(planReminderOccurrences(current, settings({ overdueRepeatHours }), "2026-12-01T10:00:00Z")[0].occurrenceKey, planned[0].occurrenceKey);
    assert.notEqual(planReminderOccurrences(current, settings({ overdueRepeatHours }), "2026-12-06T08:00:00Z")[0].occurrenceKey, planned[0].occurrenceKey);
  }
  assert.equal(planReminderOccurrences(current, settings({ overdueRemindersEnabled: false }), "2026-11-30T09:00:00Z").length, 0, "The internal operational safeguard remains available");
});

test("weekly recurrence preserves Jerusalem wall time and changes identity exactly at both DST boundaries", () => {
  for (const [anchor, previous, due] of [
    ["2026-10-12T07:00:00Z", "2026-10-19T07:00:00.000Z", "2026-10-26T08:00:00.000Z"],
    ["2026-03-13T08:00:00Z", "2026-03-20T08:00:00.000Z", "2026-03-27T07:00:00.000Z"],
  ]) {
    const current = view({ contacts: [contact({ occurredAt: anchor })], nextAppointment: null });
    const before = planReminderOccurrences(current, settings(), new Date(Date.parse(due) - 1).toISOString())[0];
    const at = planReminderOccurrences(current, settings(), due)[0];
    const after = planReminderOccurrences(current, settings(), new Date(Date.parse(due) + 1).toISOString())[0];
    assert.equal(before.scheduledAt, previous);
    assert.equal(at.scheduledAt, due);
    assert.notEqual(before.occurrenceKey, at.occurrenceKey);
    assert.equal(at.occurrenceKey, after.occurrenceKey);
  }
});

test("a missing DST wall time does not permanently shift subsequent weekly reminders", () => {
  const current = view({ contacts: [contact({ occurredAt: "2026-03-20T00:30:00Z" })], nextAppointment: null });
  assert.equal(planReminderOccurrences(current, settings(), "2026-03-27T00:30:00Z")[0].scheduledAt, "2026-03-27T00:30:00.000Z");
  assert.equal(planReminderOccurrences(current, settings(), "2026-04-02T23:30:00Z")[0].scheduledAt, "2026-04-02T23:30:00.000Z");
});

test("only a completed report starts a fresh weekly cycle; no-answer leaves the current week unchanged", () => {
  const completed = contact({ id: "last-completed", occurredAt: "2026-11-01T08:00:00Z" });
  const current = view({ contacts: [completed], nextAppointment: null });
  const at = "2026-11-30T09:00:00Z";
  const previous = planReminderOccurrences(current, settings(), at)[0];
  const noAnswer = view({ ...current, contacts: [completed, contact({ id: "no-answer", outcome: "no_answer", occurredAt: "2026-11-29T10:00:00Z" })] });
  assert.equal(planReminderOccurrences(noAnswer, settings(), at)[0].occurrenceKey, previous.occurrenceKey);
  const fresh = view({ ...current, contacts: [completed, contact({ id: "fresh-report", occurredAt: "2026-11-30T08:00:00Z" })] });
  const next = planReminderOccurrences(fresh, settings(), at);
  assert.equal(next.length, 1);
  assert.equal(next[0].scheduledAt, "2026-12-07T08:00:00.000Z");
  assert.notEqual(next[0].occurrenceKey, previous.occurrenceKey);
});

test("messages request a call and follow-up recording without including private narrative", () => {
  const occurrence = planReminderOccurrences(view({ contacts: [contact({ notes: "SECRET-NARRATIVE" })] }), settings(), now)[0];
  const text = reminderMessage("שם\nחניכה", occurrence);
  assert.match(text, /שם חניכה/);
  assert.match(text, /תזכורת לקשר/);
  assert.match(text, /ליצור קשר עם החניכה/);
  assert.match(text, /בשלומה/);
  assert.match(text, /להזין באתר דוח מעקב חניכה/);
  assert.doesNotMatch(text, /SECRET|050|\n/);
  assert.ok(text.length < 500);
  const overdue = reminderMessage("שם", { kind: "seven_day_overdue", referenceAt: now });
  assert.match(overdue, /טרם תועד קשר/);
  assert.match(overdue, /ליצור קשר עם החניכה/);
  assert.match(overdue, /לאחר השיחה יש להזין באתר דוח מעקב חניכה/);
});

test("reminders include only a normalized supplied mentee phone for either kind", () => {
  for (const kind of ["appointment", "seven_day_overdue"]) {
    const occurrence = { kind, referenceAt: now };
    for (const [input, normalized] of [["050-123 4567", "+972501234567"], ["02-5313333", "+97225313333"], ["+1 202-555-0123", "+12025550123"]]) {
      const text = reminderMessage("שם", occurrence, input);
      assert.ok(text.includes(`שם (טלפון: ${normalized})`));
      assert.doesNotMatch(text, /[\r\n\t\u0000]/);
    }
    const withoutPhone = reminderMessage("שם", occurrence);
    for (const input of [null, "", "invalid", "0501234567 ext 2", "0501234567\nInjected content", "\u00000501234567"]) {
      assert.equal(reminderMessage("שם", occurrence, input), withoutPhone);
    }
  }
});
