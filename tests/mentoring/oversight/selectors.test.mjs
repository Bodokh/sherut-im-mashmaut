import assert from "node:assert/strict";
import test from "node:test";
import "../server/typescript-loader.mjs";
const { deriveMonthlyOversight, israelMonth, israelMonthBounds, canReviewMonthlyScope } = await import("../../../lib/mentoring/features/oversight/selectors.ts");
const { applyOptimisticCommand } = await import("../../../lib/mentoring/offline-projections.ts");

const staff = (id, role = "mentor", coordinatorId = "coordinator-a") => ({ id, role, coordinatorId, organizationId: "org", active: true, version: 1, displayName: id, authUserId: id, email: null, phone: null, smsMuted: false });
const ceo = staff("ceo", "ceo", null), coordinator = staff("coordinator-a", "coordinator", null);
const contact = (id, overrides = {}) => ({ id, organizationId: "org", participantId: "participant", actorId: "mentor", method: "phone", outcome: "completed", occurredAt: "2026-10-15T09:00:00Z", receivedAt: "2026-10-15T09:10:00Z", revision: 1, invalidatedAt: null, notes: "Actual observation", ...overrides });
function view(overrides = {}) {
  return { participant: { id: "participant", organizationId: "org", displayName: "Participant", lifecycle: "active", createdAt: "2026-10-01T00:00:00Z", serviceType: null, phone: null, servicePlace: null, serviceRole: null, profileNotes: null, version: 1 },
    assignment: { id: "assignment", organizationId: "org", participantId: "participant", mentorId: "mentor", coordinatorId: "coordinator-a", assignedAt: "2026-10-01T00:00:00Z", version: 1 },
    nextAppointment: null, manualColor: "green", manualColorAt: null, contacts: [], reviews: [], protections: [], ...overrides };
}
const snapshot = (participants, actor = ceo) => ({ actor, staff: [ceo, coordinator, staff("coordinator-b", "coordinator", null), staff("mentor"), staff("other-mentor", "mentor", "coordinator-b")], participants, conflicts: [], serverTime: "2026-11-15T12:00:00Z", offlineValidUntil: "2026-11-16T12:00:00Z", capabilities: { smsConfigured: false, smsSendingEnabled: false } });

test("Israel calendar months include the DST transition and are half-open", () => {
  assert.deepEqual(israelMonthBounds("2026-10"), { startAt: "2026-09-30T21:00:00.000Z", endAt: "2026-10-31T22:00:00.000Z" });
  assert.deepEqual(israelMonthBounds("2026-03"), { startAt: "2026-02-28T22:00:00.000Z", endAt: "2026-03-31T21:00:00.000Z" });
  assert.equal(israelMonth("2026-09-30T21:00:00Z"), "2026-10");
  assert.equal(israelMonth("2026-10-31T21:59:59.999Z"), "2026-10");
  assert.equal(israelMonth("2026-10-31T22:00:00Z"), "2026-11");
  assert.deepEqual(israelMonthBounds("2027-02"), { startAt: "2027-01-31T22:00:00.000Z", endAt: "2027-02-28T22:00:00.000Z" });
  for (const invalid of ["2026-13", "2026-00", "0000-01", "2026-1", "2026-01-extra"]) assert.throws(() => israelMonthBounds(invalid));
});

test("actual occurrence, original receipt and later upload are separate facts", () => {
  const result = deriveMonthlyOversight(snapshot([view({ contacts: [
    contact("at-start", { occurredAt: "2026-09-30T21:00:00Z" }),
    contact("before-start", { occurredAt: "2026-09-30T20:59:59.999Z" }),
    contact("at-end", { occurredAt: "2026-10-31T22:00:00Z", receivedAt: "2026-11-01T08:00:00Z" }),
    contact("uploaded-later", { receivedAt: "2026-11-05T08:00:00Z" }),
    contact("attempt", { outcome: "no_answer" }),
  ] })]), "2026-10", null);
  assert.equal(result.totals.completed, 2);
  assert.equal(result.totals.attempted, 1);
  assert.equal(result.totals.reportsReceived, 3);
  assert.equal(result.totals.laterUploads, 1);
  assert.equal(result.contacts.find((item) => item.contact.id === "before-start").occurredInMonth, false);
  assert.equal(result.contacts.some((item) => item.contact.id === "at-end"), false);
  assert.equal(result.contacts.find((item) => item.contact.id === "uploaded-later").receivedInMonth, false);
});

test("current revisions and invalidations do not fabricate contacts or reuse old approval", () => {
  const corrected = contact("corrected", { revision: 2 });
  const invalid = contact("invalid", { invalidatedAt: "2026-11-02T08:00:00Z" });
  const historical = contact("outside", { occurredAt: "2026-09-20T09:00:00Z", receivedAt: "2026-09-20T09:10:00Z", revision: 2 });
  const revisions = [
    { ...corrected, revisedAt: "2026-10-20T08:00:00Z", revisedByStaffId: "coordinator-a", changeKind: "correction", reason: "Corrected actual date", operationId: null, review: null },
    { ...historical, revisedAt: "2026-10-25T08:00:00Z", revisedByStaffId: "coordinator-a", changeKind: "correction", reason: "Corrected note", operationId: null, review: null },
    { ...invalid, revisedAt: "2026-11-02T08:00:00Z", revisedByStaffId: "ceo", changeKind: "invalidation", reason: "Duplicate", operationId: null, review: null },
  ];
  const result = deriveMonthlyOversight(snapshot([view({ contacts: [corrected, invalid, historical], contactRevisions: revisions,
    reviews: [{ contactId: "corrected", revision: 1, decision: "approved", reviewedByStaffId: "ceo", reviewedAt: "2026-10-16T08:00:00Z" }] })]), "2026-10", null);
  assert.equal(result.totals.completed, 1);
  assert.equal(result.totals.invalidated, 1);
  assert.equal(result.totals.awaitingReview, 1);
  assert.equal(result.totals.correctionsReceived, 2);
  assert.equal(result.totals.invalidationsReceived, 0);
  assert.equal(result.contacts.find((item) => item.contact.id === "corrected").reviewDecision, null);
  assert.ok(result.contacts.find((item) => item.contact.id === "outside"), "A correction received this month is inspectable without counting another contact.");
});

test("management scope remains fail-closed even if a snapshot contains broad grants", () => {
  const own = view({ contacts: [contact("own")] });
  const other = view({ participant: { ...own.participant, id: "other" }, assignment: { ...own.assignment, coordinatorId: "coordinator-b" }, contacts: [contact("other-contact", { participantId: "other" })] });
  const broad = snapshot([own, other], coordinator);
  assert.equal(deriveMonthlyOversight(broad, "2026-10", "coordinator-a").totals.completed, 1);
  assert.equal(deriveMonthlyOversight(broad, "2026-10", "coordinator-b").totals.participants, 0);
  assert.equal(deriveMonthlyOversight(broad, "2026-10", null).totals.participants, 0);
  assert.equal(deriveMonthlyOversight(snapshot([own], staff("mentor")), "2026-10", null).contacts.length, 0);
  assert.equal(canReviewMonthlyScope({ ...ceo, active: false }, null), false);
  assert.equal(deriveMonthlyOversight(snapshot([own, other]), "2026-10", null).totals.completed, 2);
});

test("staff coverage uses the current roster and current overdue is independent of the selected month", () => {
  const result = deriveMonthlyOversight(snapshot([view({ contacts: [contact("actual")] })]), "2026-10", null);
  assert.equal(result.totals.currentlyOverdue, 1);
  assert.equal(result.coverage.find((item) => item.staffId === "mentor").assignedParticipants, 1);
  assert.equal(result.coverage.find((item) => item.staffId === "mentor").participantsWithCompletedContact, 1);
  assert.equal(result.coverage.find((item) => item.staffId === "other-mentor").assignedParticipants, 0);
  const paused = deriveMonthlyOversight(snapshot([view({ participant: { ...view().participant, lifecycle: "paused" } })]), "2026-10", null);
  assert.equal(paused.totals.currentlyOverdue, 0);
});

test("offline reports across a month boundary have no invented central receipt", () => {
  const pending = contact("local-report", { occurredAt: "2026-10-31T20:00:00Z", receivedAt: "2026-11-01T08:00:00Z", localPending: true });
  const pendingRevision = { ...pending, revisedAt: pending.receivedAt, revisedByStaffId: "mentor", changeKind: "initial", reason: null, operationId: pending.id, review: null };
  const queued = deriveMonthlyOversight(snapshot([view({ contacts: [pending], contactRevisions: [pendingRevision] })]), "2026-10", null);
  assert.equal(queued.totals.completed, 0);
  assert.equal(queued.totals.reportsReceived, 0);
  assert.equal(queued.totals.laterUploads, 0);
  assert.equal(queued.totals.queuedContacts, 1);
  assert.equal(queued.contacts[0].localPending, true);
  const accepted = deriveMonthlyOversight(snapshot([view({ contacts: [{ ...pending, localPending: undefined, receivedAt: "2026-11-02T09:00:00Z" }] })]), "2026-10", null);
  assert.equal(accepted.totals.completed, 1);
  assert.equal(accepted.totals.laterUploads, 1);
  assert.equal(accepted.totals.queuedContacts, 0);
});

test("a pending correction preserves accepted receipt and occurrence metrics until acceptance", () => {
  const original = contact("corrected-locally");
  const originalRevision = { ...original, revisedAt: original.receivedAt, revisedByStaffId: "mentor", changeKind: "initial", reason: null, operationId: null, review: null };
  const pending = { ...original, occurredAt: "2026-11-01T09:00:00Z", revision: 2, localPending: true };
  const pendingRevision = { ...pending, revisedAt: "2026-10-26T09:00:00Z", revisedByStaffId: "coordinator-a", changeKind: "correction", reason: "Local correction", operationId: "correction", review: null };
  const result = deriveMonthlyOversight(snapshot([view({ contacts: [pending], contactRevisions: [originalRevision, pendingRevision] })]), "2026-10", null);
  assert.equal(result.totals.completed, 1);
  assert.equal(result.totals.reportsReceived, 1);
  assert.equal(result.totals.correctionsReceived, 0);
  assert.equal(result.totals.queuedContacts, 1);
  assert.equal(result.contacts[0].acceptedContact.revision, 1);
});

test("queued review decisions never stand in for the accepted approval", () => {
  const approved = { contactId: "contact", revision: 1, decision: "approved", reviewedByStaffId: "ceo", reviewedAt: "2026-10-16T09:00:00Z" };
  const pendingApproval = { ...approved, localPending: true };
  const pendingReturn = { ...approved, decision: "returned_for_correction", localPending: true };
  const unapproved = deriveMonthlyOversight(snapshot([view({ contacts: [contact("contact")], reviews: [pendingApproval] })]), "2026-10", null);
  assert.equal(unapproved.totals.awaitingReview, 1);
  assert.equal(unapproved.contacts[0].reviewDecision, null);
  const accepted = deriveMonthlyOversight(snapshot([view({ contacts: [contact("contact")], reviews: [pendingReturn, approved] })]), "2026-10", null);
  assert.equal(accepted.totals.awaitingReview, 0);
  assert.equal(accepted.contacts[0].reviewDecision, "approved");
});

test("a local reschedule cannot erase the accepted current missed appointment", () => {
  const acceptedNextAppointment = { id: "appointment", organizationId: "org", participantId: "participant", mentorId: "mentor", scheduledAt: "2026-11-14T09:00:00Z", version: 1 };
  const local = view({ contacts: [contact("recent", { occurredAt: "2026-11-13T09:00:00Z", receivedAt: "2026-11-13T09:10:00Z" })], acceptedNextAppointment,
    nextAppointment: { ...acceptedNextAppointment, scheduledAt: "2026-11-17T09:00:00Z", version: 2 } });
  const result = deriveMonthlyOversight(snapshot([local]), "2026-11", null);
  assert.equal(result.totals.currentlyOverdue, 1);
  assert.equal(result.participants[0].currentFollowup.status, "appointment_missed");
});

test("real offline projection preserves unknown server receipt after queued and acknowledged saves", () => {
  const base = snapshot([view()]);
  const operation = { command: { type: "record_contact", operationId: "local-report", participantId: "participant", expectedVersion: 1, expectedAppointmentVersion: null, method: "phone", outcome: "no_answer", occurredAt: "2026-10-31T20:00:00Z", notes: "Actual unanswered attempt" }, queuedAt: "2026-11-01T09:00:00Z", status: "pending" };
  for (const accepted of [false, true]) {
    const projected = applyOptimisticCommand(base, operation, accepted);
    assert.equal(projected.participants[0].contacts.length, 1);
    const result = deriveMonthlyOversight(projected, "2026-10", null);
    assert.equal(result.totals.attempted, 0);
    assert.equal(result.totals.reportsReceived, 0);
    assert.equal(result.totals.laterUploads, 0);
    assert.equal(result.totals.queuedContacts, 1, "A confirmed receipt does not supply the actual server timestamp before refresh.");
  }
});

test("real queued review projection retains the accepted decision baseline", () => {
  const original = contact("contact");
  const approved = { contactId: "contact", revision: 1, decision: "approved", reviewedByStaffId: "ceo", reviewedAt: "2026-10-16T09:00:00Z" };
  const base = snapshot([view({ contacts: [original], reviews: [approved] })]);
  const operation = { command: { type: "review_contact", operationId: "local-review", participantId: "participant", contactId: "contact", revision: 1, decision: "returned_for_correction" }, queuedAt: "2026-10-26T09:00:00Z", status: "pending" };
  const result = deriveMonthlyOversight(applyOptimisticCommand(base, operation), "2026-10", null);
  assert.equal(result.totals.awaitingReview, 0);
  assert.equal(result.contacts[0].reviewDecision, "approved");
});

test("real queued reschedule projection retains the accepted missed appointment", () => {
  const appointment = { id: "appointment", organizationId: "org", participantId: "participant", mentorId: "mentor", scheduledAt: "2026-11-14T09:00:00Z", version: 1 };
  const base = snapshot([view({ contacts: [contact("recent", { occurredAt: "2026-11-13T09:00:00Z", receivedAt: "2026-11-13T09:10:00Z" })], nextAppointment: appointment })]);
  const operation = { command: { type: "reschedule_appointment", operationId: "local-reschedule", participantId: "participant", expectedVersion: 1, expectedAppointmentVersion: 1, scheduledAt: "2026-11-17T09:00:00Z", reason: "Local scheduling change" }, queuedAt: "2026-11-15T11:00:00Z", status: "pending" };
  const projected = applyOptimisticCommand(base, operation);
  assert.equal(projected.participants[0].nextAppointment.scheduledAt, "2026-11-17T09:00:00Z");
  const result = deriveMonthlyOversight(projected, "2026-11", null);
  assert.equal(result.totals.currentlyOverdue, 1);
  assert.equal(result.participants[0].currentFollowup.status, "appointment_missed");
});

test("deleted active cards retain historical activity without current roster or overdue duties", () => {
  for (const deletionOnProfile of [false, true]) {
    const live = view({ contacts: [contact("live-contact")] });
    const deletedAt = "2026-11-01T09:00:00Z";
    const deleted = view({
      participant: { ...live.participant, id: "deleted-participant", ...(deletionOnProfile ? { deletedAt } : {}) },
      assignment: { ...live.assignment, id: "deleted-assignment", participantId: "deleted-participant" },
      contacts: [contact("deleted-contact", { participantId: "deleted-participant" })],
      ...(deletionOnProfile ? {} : { deletedAt }),
    });
    const result = deriveMonthlyOversight(snapshot([live, deleted]), "2026-10", null);
    assert.equal(result.totals.participants, 1, "Only the live card is on the current roster.");
    assert.equal(result.totals.deletedParticipants, 1);
    assert.equal(result.totals.currentlyOverdue, 1, "The deleted card creates no current duty even if its preserved lifecycle is active.");
    assert.equal(result.totals.completed, 2, "Deleting a card does not erase the contact activity already recorded for the month.");
    assert.equal(result.totals.reportsReceived, 2);
    assert.equal(result.participants.find((item) => item.view.participant.id === "deleted-participant").deletedAt, deletedAt);
    assert.equal(result.participants.find((item) => item.deletedAt).currentlyOverdue, false);
    assert.equal(result.contacts.some((item) => item.contact.id === "deleted-contact"), true);
    const coverage = result.coverage.find((item) => item.staffId === "mentor");
    assert.equal(coverage.assignedParticipants, 1);
    assert.equal(coverage.participantsWithCompletedContact, 1);
    assert.equal(coverage.completed, 2, "Historical authored activity remains distinct from current assigned coverage.");
  }
});
