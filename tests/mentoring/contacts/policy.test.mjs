import assert from "node:assert/strict";
import test from "node:test";
import "../server/typescript-loader.mjs";
import { invalidationNeedsAppointmentReview, planContactRevision } from "../../../lib/mentoring/features/contacts/policy.ts";

const now = "2026-10-26T10:00:00Z";
const earlier = "2026-10-17T09:00:00Z";
const latest = "2026-10-24T09:00:00Z";
const next = "2026-10-29T09:00:00Z";
const entry = (id, occurredAt, overrides = {}) => ({
  id, organizationId: "organization", participantId: "participant", actorId: "mentor",
  method: "phone", outcome: "completed", occurredAt, receivedAt: occurredAt,
  notes: "תוכן מקורי", revision: 1, invalidatedAt: null, ...overrides,
});
const contacts = () => [entry("older", earlier), entry("latest", latest)];
const proposed = (overrides = {}) => ({ method: "phone", outcome: "completed", occurredAt: latest, ...overrides });

test("a narrative-only correction retains the current appointment without inventing a new date", () => {
  assert.deepEqual(planContactRevision(contacts(), "latest", proposed(), now), { ok: true, appointmentEffect: "retain" });
});

test("correcting a completed contact's method retains its actual time and appointment", () => {
  assert.deepEqual(planContactRevision(contacts(), "latest", proposed({ method: "in_person" }), now), { ok: true, appointmentEffect: "retain" });
});

test("changing the latest qualifying occurrence requires an explicit next appointment", () => {
  const result = planContactRevision(contacts(), "latest", proposed({ occurredAt: "2026-10-25T09:00:00Z" }), now);
  assert.equal(result.ok, false);
  assert.equal(result.field, "nextAppointmentAt");
  assert.equal(typeof result.message, "string");
  assert.deepEqual(planContactRevision(contacts(), "latest", proposed({ occurredAt: "2026-10-25T09:00:00Z", nextAppointmentAt: next }), now), { ok: true, appointmentEffect: "replace" });
});

test("an equivalent instant in another timezone does not require replacing the appointment", () => {
  assert.deepEqual(planContactRevision(contacts(), "latest", proposed({ occurredAt: "2026-10-24T12:00:00+03:00" }), now), { ok: true, appointmentEffect: "retain" });
});

test("historical correction never rewinds or replaces the newer contact's appointment", () => {
  assert.deepEqual(planContactRevision(contacts(), "older", proposed({ occurredAt: "2026-10-18T09:00:00Z" }), now), { ok: true, appointmentEffect: "retain" });
  const result = planContactRevision(contacts(), "older", proposed({ occurredAt: "2026-10-18T09:00:00Z", nextAppointmentAt: next }), now);
  assert.equal(result.ok, false);
  assert.equal(result.field, "nextAppointmentAt");
});

test("moving a historical contact after the newest contact preserves the accepted appointment and flags review", () => {
  assert.deepEqual(planContactRevision(contacts(), "older", proposed({ occurredAt: "2026-10-25T09:00:00Z" }), now), { ok: true, appointmentEffect: "retain_with_warning" });
});

test("reclassifying the latest completed contact as unanswered retains an appointment with a review warning", () => {
  assert.deepEqual(planContactRevision(contacts(), "latest", proposed({ outcome: "no_answer" }), now), { ok: true, appointmentEffect: "retain_with_warning" });
});

test("moving the latest contact behind a previous qualifying contact retains the appointment with a warning", () => {
  assert.deepEqual(planContactRevision(contacts(), "latest", proposed({ occurredAt: "2026-10-16T09:00:00Z" }), now), { ok: true, appointmentEffect: "retain_with_warning" });
});

test("invalidated contacts cannot become the current qualifying anchor", () => {
  const values = [...contacts(), entry("invalidated-newer", "2026-10-25T09:00:00Z", { invalidatedAt: now })];
  assert.equal(invalidationNeedsAppointmentReview(values, "latest"), true);
  assert.equal(invalidationNeedsAppointmentReview(values, "invalidated-newer"), false);
  const result = planContactRevision(values, "latest", proposed({ occurredAt: "2026-10-24T10:00:00Z" }), now);
  assert.equal(result.ok, false);
  assert.equal(result.field, "nextAppointmentAt");
});

test("an unsuccessful attempt is not a qualifying anchor and its invalidation needs no schedule review", () => {
  const values = [...contacts(), entry("attempt", "2026-10-25T09:00:00Z", { outcome: "no_answer" })];
  assert.equal(invalidationNeedsAppointmentReview(values, "attempt"), false);
  assert.equal(invalidationNeedsAppointmentReview(values, "older"), false);
  assert.equal(invalidationNeedsAppointmentReview(values, "latest"), true);
  assert.equal(invalidationNeedsAppointmentReview([], "latest"), false);
});

test("correcting a latest attempt into a completed contact requires an explicit next appointment", () => {
  const values = [...contacts(), entry("attempt", "2026-10-25T09:00:00Z", { outcome: "no_answer" })];
  const missingNext = planContactRevision(values, "attempt", proposed({ occurredAt: "2026-10-25T09:00:00Z" }), now);
  assert.equal(missingNext.ok, false);
  assert.equal(missingNext.field, "nextAppointmentAt");
  assert.deepEqual(planContactRevision(values, "attempt", proposed({ occurredAt: "2026-10-25T09:00:00Z", nextAppointmentAt: next }), now), { ok: true, appointmentEffect: "replace" });
});

test("correcting the first and only attempt into completed contact requires and sets the next appointment", () => {
  const values = [entry("first-attempt", latest, { outcome: "no_answer" })];
  const missingNext = planContactRevision(values, "first-attempt", proposed(), now);
  assert.equal(missingNext.ok, false);
  assert.equal(missingNext.field, "nextAppointmentAt");
  assert.deepEqual(planContactRevision(values, "first-attempt", proposed({ nextAppointmentAt: next }), now), { ok: true, appointmentEffect: "replace" });
});

test("an older attempt corrected into completed contact cannot replace a newer accepted schedule", () => {
  const values = [...contacts(), entry("older-attempt", "2026-10-20T09:00:00Z", { outcome: "no_answer" })];
  assert.deepEqual(planContactRevision(values, "older-attempt", proposed({ occurredAt: "2026-10-20T09:00:00Z" }), now), { ok: true, appointmentEffect: "retain" });
  const withNext = planContactRevision(values, "older-attempt", proposed({ occurredAt: "2026-10-20T09:00:00Z", nextAppointmentAt: next }), now);
  assert.equal(withNext.ok, false);
  assert.equal(withNext.field, "nextAppointmentAt");
});

test("changing an older attempt's time while correcting its outcome still cannot replace a newer schedule", () => {
  const values = [...contacts(), entry("older-attempt", "2026-10-20T09:00:00Z", { outcome: "no_answer" })];
  assert.deepEqual(planContactRevision(values, "older-attempt", proposed({ occurredAt: "2026-10-25T09:00:00Z" }), now), { ok: true, appointmentEffect: "retain_with_warning" });
  const withNext = planContactRevision(values, "older-attempt", proposed({ occurredAt: "2026-10-25T09:00:00Z", nextAppointmentAt: next }), now);
  assert.equal(withNext.ok, false);
  assert.equal(withNext.field, "nextAppointmentAt");
});

test("a correction cannot claim an actual occurrence in the future", () => {
  const result = planContactRevision(contacts(), "latest", proposed({ occurredAt: "2026-10-26T10:00:01Z", nextAppointmentAt: next }), now);
  assert.equal(result.ok, false);
  assert.equal(result.field, "occurredAt");
});

test("missing or invalidated reports cannot be revised into accepted active contact", () => {
  for (const values of [contacts(), [...contacts(), entry("removed", latest, { invalidatedAt: now })]]) {
    const result = planContactRevision(values, "removed", proposed(), now);
    assert.equal(result.ok, false);
    assert.equal(result.field, "contactId");
  }
});

test("invalid actual instants are rejected while exact current-time occurrence is allowed", () => {
  const invalid = planContactRevision(contacts(), "latest", proposed({ occurredAt: "invalid" }), now);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.field, "occurredAt");
  assert.deepEqual(planContactRevision(contacts(), "latest", proposed({ occurredAt: now, nextAppointmentAt: next }), now), { ok: true, appointmentEffect: "replace" });
});

test("no-answer revisions must be phone attempts and cannot replace the next appointment", () => {
  const nonPhone = planContactRevision(contacts(), "latest", proposed({ outcome: "no_answer", method: "in_person" }), now);
  assert.equal(nonPhone.ok, false);
  assert.equal(nonPhone.field, "method");
  const rescheduled = planContactRevision(contacts(), "latest", proposed({ outcome: "no_answer", nextAppointmentAt: next }), now);
  assert.equal(rescheduled.ok, false);
  assert.equal(rescheduled.field, "nextAppointmentAt");
});

test("a required replacement must occur strictly after the corrected actual occurrence", () => {
  for (const nextAppointmentAt of ["2026-10-25T08:59:59Z", "2026-10-25T09:00:00Z"]) {
    const result = planContactRevision(contacts(), "latest", proposed({ occurredAt: "2026-10-25T09:00:00Z", nextAppointmentAt }), now);
    assert.equal(result.ok, false);
    assert.equal(result.field, "nextAppointmentAt");
  }
});

for (const lifecycle of ["paused", "closed"]) {
  test(`${lifecycle} participants accept a latest-contact time correction without a replacement appointment`, () => {
    assert.deepEqual(
      planContactRevision(contacts(), "latest", proposed({ occurredAt: "2026-10-25T09:00:00Z" }), now, lifecycle),
      { ok: true, appointmentEffect: "retain_with_warning" },
    );
  });

  test(`${lifecycle} participants accept correcting their first attempt to completed without creating an appointment`, () => {
    const values = [entry("first-attempt", latest, { outcome: "no_answer" })];
    assert.deepEqual(
      planContactRevision(values, "first-attempt", proposed(), now, lifecycle),
      { ok: true, appointmentEffect: "retain_with_warning" },
    );
  });

  test(`${lifecycle} participants reject any supplied next appointment during a contact correction`, () => {
    for (const [values, targetId, correction] of [
      [contacts(), "latest", proposed({ occurredAt: "2026-10-25T09:00:00Z", nextAppointmentAt: next })],
      [[entry("first-attempt", latest, { outcome: "no_answer" })], "first-attempt", proposed({ nextAppointmentAt: next })],
      [contacts(), "older", proposed({ occurredAt: "2026-10-18T09:00:00Z", nextAppointmentAt: next })],
      [contacts(), "latest", proposed({ nextAppointmentAt: next })],
    ]) {
      const result = planContactRevision(values, targetId, correction, now, lifecycle);
      assert.equal(result.ok, false);
      assert.equal(result.field, "nextAppointmentAt");
    }
  });

  test(`${lifecycle} participants retain the appointment for historical time and narrative corrections`, () => {
    assert.deepEqual(
      planContactRevision(contacts(), "older", proposed({ occurredAt: "2026-10-18T09:00:00Z" }), now, lifecycle),
      { ok: true, appointmentEffect: "retain" },
    );
    assert.deepEqual(planContactRevision(contacts(), "latest", proposed(), now, lifecycle), { ok: true, appointmentEffect: "retain" });
    assert.deepEqual(planContactRevision(contacts(), "latest", proposed({ method: "in_person" }), now, lifecycle), { ok: true, appointmentEffect: "retain" });
  });

  test(`${lifecycle} participants flag contact anchor changes while retaining the appointment`, () => {
    assert.deepEqual(
      planContactRevision(contacts(), "latest", proposed({ outcome: "no_answer" }), now, lifecycle),
      { ok: true, appointmentEffect: "retain_with_warning" },
    );
    assert.deepEqual(
      planContactRevision(contacts(), "older", proposed({ occurredAt: "2026-10-25T09:00:00Z" }), now, lifecycle),
      { ok: true, appointmentEffect: "retain_with_warning" },
    );
  });
}
