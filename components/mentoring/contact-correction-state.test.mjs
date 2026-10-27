import assert from "node:assert/strict";
import test from "node:test";
import "../../tests/mentoring/server/typescript-loader.mjs";
const {
  canCorrectContact,
  canInvalidateContact,
  canScheduleContact,
  contactCorrectionPlan,
  contactEditAccess,
  contactHasAcceptedBaseline,
  contactInvalidationState,
  contactResourceLocked,
} = await import("./contact-correction-state.ts");
const { applyOptimisticCommand } = await import("../../lib/mentoring/offline-projections.ts");

const now = "2026-10-26T10:00:00Z";
const actor = (role = "mentor", overrides = {}) => ({
  id: "mentor", organizationId: "org", role, active: true, version: 1, ...overrides,
});
const entry = (overrides = {}) => ({
  id: "contact", organizationId: "org", participantId: "participant", actorId: "mentor",
  method: "phone", outcome: "completed", occurredAt: "2026-10-24T09:00:00Z",
  receivedAt: "2026-10-24T09:00:00Z", revision: 1, invalidatedAt: null, ...overrides,
});
const assignment = { id: "assignment", organizationId: "org", participantId: "participant", mentorId: "mentor", coordinatorId: "coordinator", assignedAt: "2026-10-20T09:00:00Z", version: 1 };
const view = (overrides = {}) => ({
  participant: { id: "participant", organizationId: "org", displayName: "חניכה", phone: null, serviceType: null, lifecycle: "active", version: 1 },
  assignment,
  acceptedAssignment: assignment,
  protections: [], ...overrides,
});
const proposed = (overrides = {}) => ({ method: "phone", outcome: "completed", occurredAt: "2026-10-24T09:00:00Z", ...overrides });

test("edit access respects servercomputed action rights and accepted scope", () => {
  const unassigned = view({ assignment: null, acceptedAssignment: null });
  const grant = { id: "grant", organizationId: "org", participantId: "participant", staffId: "mentor", active: true, expiresAt: "2026-10-26T10:00:01Z" };
  assert.equal(contactEditAccess(actor(), view(), now), true);
  assert.equal(contactEditAccess(actor(), { ...unassigned, accessGrants: [{ ...grant, actions: ["view"] }] }, now), false);
  assert.equal(contactEditAccess(actor(), { ...unassigned, accessGrants: [{ ...grant, actions: ["edit"] }] }, now), false);
  assert.equal(contactEditAccess(actor(), { ...unassigned, allowedActions: ["edit"] }, now), true);
  assert.equal(contactEditAccess(actor(), { ...unassigned, allowedActions: ["view"] }, now), false);
  assert.equal(contactEditAccess(actor(), { ...unassigned, accessGrants: [{ ...grant, actions: ["edit"], expiresAt: now }] }, now), false);
  assert.equal(contactEditAccess(actor("coordinator", { id: "coordinator" }), view(), now), true);
  assert.equal(contactEditAccess(actor("mentor", { active: false }), view(), now), false);
});

test("pending assignment and grants never create new editing rights", () => {
  assert.equal(contactEditAccess(actor(), view({ acceptedAssignment: null }), now), false);
  const { acceptedAssignment: omitted, ...withoutBaseline } = view();
  assert.ok(omitted);
  assert.equal(contactEditAccess(actor(), withoutBaseline, now), false);
  assert.equal(contactEditAccess(actor(), view({ allowedActions: [] }), now), false);
  assert.equal(contactEditAccess(actor("ceo"), view({ allowedActions: [] }), now), false);
});

test("accepted assignment retains edit scope while a pending assignment moves away", () => {
  assert.equal(contactEditAccess(actor(), view({ assignment: { ...assignment, mentorId: "another" } }), now), true);
  assert.equal(contactEditAccess(actor(), view({ assignment: null }), now), true);
});

test("servercomputed edit rights still require same organization and an active actor", () => {
  const current = view({ allowedActions: ["edit"] });
  assert.equal(contactEditAccess(actor("mentor", { organizationId: "another" }), current, now), false);
  assert.equal(contactEditAccess(actor("mentor", { active: false }), current, now), false);
  assert.equal(contactEditAccess(actor("mentor", { id: "" }), current, now), false);
});

test("deleted participant disables correction affordances even for management", () => {
  const current = view();
  assert.equal(contactEditAccess(actor("ceo"), { ...current, participant: { ...current.participant, deletedAt: now } }, now), false);
});

test("mentors correct only their own active report while invalidation is management-only", () => {
  assert.equal(canCorrectContact(actor(), entry()), true);
  assert.equal(canCorrectContact(actor(), entry({ actorId: "another" })), false);
  assert.equal(canCorrectContact(actor("coordinator"), entry({ actorId: "another" })), true);
  assert.equal(canInvalidateContact(actor(), entry()), false);
  assert.equal(canInvalidateContact(actor("coordinator"), entry()), true);
  assert.equal(canInvalidateContact(actor("ceo"), entry()), true);
  for (const staff of [actor(), actor("coordinator"), actor("ceo")]) {
    assert.equal(canCorrectContact(staff, entry({ invalidatedAt: now })), false);
    assert.equal(canInvalidateContact(staff, entry({ organizationId: "another-org" })), false);
  }
});

test("field protection locks only matching actions, whole protection locks all, CEO can act", () => {
  const protection = { organizationId: "org", resourceId: "participant", protectedByStaffId: "ceo", protectedRevision: 2, active: true, fieldPaths: ["manualColor"] };
  const current = view({ protections: [protection] });
  assert.equal(contactResourceLocked(actor(), current, "participant", ["manualColor"]), true);
  assert.equal(contactResourceLocked(actor(), current, "participant", ["appointment"]), false);
  assert.equal(contactResourceLocked(actor(), current, "contact"), false);
  assert.equal(contactResourceLocked(actor("ceo"), current, "participant", ["manualColor"]), false);
  assert.equal(contactResourceLocked(actor(), view({ protections: [{ ...protection, fieldPaths: null }] }), "participant", ["appointment"]), true);
  assert.equal(contactResourceLocked(actor(), view({ protections: [{ ...protection, fieldPaths: [] }] }), "participant", ["appointment"]), true);
});

test("narrative and historical corrections discard hidden schedule input", () => {
  const result = contactCorrectionPlan([entry()], "contact", proposed({ nextAppointmentAt: "stale hidden value" }), now);
  assert.equal(result.needsNextAppointment, false);
  assert.deepEqual(result.plan, { ok: true, appointmentEffect: "retain" });
});

test("qualifying correction requires explicit next time and validates it", () => {
  const corrected = proposed({ occurredAt: "2026-10-25T09:00:00Z" });
  const missing = contactCorrectionPlan([entry()], "contact", corrected, now);
  assert.equal(missing.needsNextAppointment, true);
  assert.equal(missing.plan.ok, false);
  assert.equal(missing.plan.field, "nextAppointmentAt");
  const supplied = contactCorrectionPlan([entry()], "contact", { ...corrected, nextAppointmentAt: "2026-10-30T09:00:00Z" }, now);
  assert.equal(supplied.needsNextAppointment, true);
  assert.deepEqual(supplied.plan, { ok: true, appointmentEffect: "replace" });
  const tooEarly = contactCorrectionPlan([entry()], "contact", { ...corrected, nextAppointmentAt: corrected.occurredAt }, now);
  assert.equal(tooEarly.plan.ok, false);
});

test("no-answer correction preserves appointment and warns when the anchor changed", () => {
  const result = contactCorrectionPlan([entry()], "contact", proposed({ outcome: "no_answer", nextAppointmentAt: "2026-10-30T09:00:00Z" }), now);
  assert.equal(result.needsNextAppointment, false);
  assert.deepEqual(result.plan, { ok: true, appointmentEffect: "retain_with_warning" });
});

for (const lifecycle of ["paused", "closed"]) {
  test(`${lifecycle} historical time and outcome corrections never request a replacement appointment`, () => {
    const nextAppointmentAt = "2026-10-30T09:00:00Z";
    const changedTime = contactCorrectionPlan([entry()], "contact", proposed({ occurredAt: "2026-10-25T09:00:00Z", nextAppointmentAt }), now, lifecycle);
    assert.equal(changedTime.needsNextAppointment, false);
    assert.deepEqual(changedTime.plan, { ok: true, appointmentEffect: "retain_with_warning" });
    const changedOutcome = contactCorrectionPlan([entry({ outcome: "no_answer" })], "contact", proposed({ nextAppointmentAt }), now, lifecycle);
    assert.equal(changedOutcome.needsNextAppointment, false);
    assert.deepEqual(changedOutcome.plan, { ok: true, appointmentEffect: "retain_with_warning" });
  });

  test(`${lifecycle} narrative and no-answer corrections remain historically allowed`, () => {
    const narrative = contactCorrectionPlan([entry()], "contact", proposed({ nextAppointmentAt: "hidden stale input" }), now, lifecycle);
    assert.equal(narrative.needsNextAppointment, false);
    assert.deepEqual(narrative.plan, { ok: true, appointmentEffect: "retain" });
    const noAnswer = contactCorrectionPlan([entry()], "contact", proposed({ outcome: "no_answer", nextAppointmentAt: "hidden stale input" }), now, lifecycle);
    assert.equal(noAnswer.needsNextAppointment, false);
    assert.deepEqual(noAnswer.plan, { ok: true, appointmentEffect: "retain_with_warning" });
    const existingAttempt = contactCorrectionPlan([entry({ outcome: "no_answer" })], "contact", proposed({ outcome: "no_answer", occurredAt: "2026-10-25T09:00:00Z" }), now, lifecycle);
    assert.equal(existingAttempt.needsNextAppointment, false);
    assert.deepEqual(existingAttempt.plan, { ok: true, appointmentEffect: "retain" });
  });
}

test("new scheduling is available only on active, nondeleted cards", () => {
  assert.equal(canScheduleContact(view()), true);
  for (const lifecycle of ["paused", "closed"]) {
    const current = view();
    assert.equal(canScheduleContact({ participant: { ...current.participant, lifecycle } }), false);
  }
  const current = view();
  assert.equal(canScheduleContact({ participant: { ...current.participant, deletedAt: now } }), false);
});

test("completed-contact appointment writes respect appointment field and whole-record protection", () => {
  const protection = { organizationId: "org", resourceId: "participant", protectedByStaffId: "ceo", protectedRevision: 2, active: true };
  for (const fieldPaths of [["appointment"], null, []]) {
    assert.equal(contactResourceLocked(actor(), view({ protections: [{ ...protection, fieldPaths }] }), "participant", ["appointment"]), true);
  }
  assert.equal(contactResourceLocked(actor(), view({ protections: [{ ...protection, fieldPaths: ["manualColor"] }] }), "participant", ["appointment"]), false);
});

test("scoped profile, assignment and lifecycle locks leave an unrelated contact append and appointment cycle available", () => {
  const protection = { organizationId: "org", resourceId: "participant", protectedByStaffId: "ceo", protectedRevision: 2, active: true };
  for (const fieldPaths of [["displayName", "phone", "profileNotes"], ["assignment"], ["lifecycle"]]) {
    const current = view({ protections: [{ ...protection, fieldPaths }] });
    assert.equal(contactEditAccess(actor(), current, now), true);
    assert.equal(contactResourceLocked(actor(), current, "participant", ["appointment"]), false);
    assert.equal(contactResourceLocked(actor(), current, "participant", ["manualColor"]), false);
  }
});

function contactSnapshot(role = "mentor") {
  const staff = {
    ...actor(role), authUserId: "account", displayName: "חונכת", email: null,
    phone: null, coordinatorId: null, smsMuted: false,
  };
  const participantView = view({
    participant: {
      ...view().participant, servicePlace: null, serviceRole: null,
      profileNotes: null, createdAt: "2026-10-20T09:00:00Z",
    },
    allowedActions: ["view", "edit", "approve"],
    nextAppointment: {
      id: "appointment", organizationId: "org", participantId: "participant",
      mentorId: "mentor", scheduledAt: "2026-10-28T09:00:00Z", version: 1,
      sourceContactId: "contact", requiresReview: false,
    },
    contacts: [entry({ notes: "מקור שהתקבל במערכת" })], reviews: [],
    manualColor: null, manualColorAt: null, contactRevisions: [],
    appointmentHistory: [], manualColorHistory: [], contactWarnings: [],
  });
  return {
    actor: staff, staff: [staff], participants: [participantView], conflicts: [],
    serverTime: now, offlineValidUntil: "2026-10-27T10:00:00Z",
    capabilities: { smsConfigured: false, smsSendingEnabled: false },
  };
}

function immutable(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}

function projectedOperation(command, sequence = 1) {
  return immutable({
    key: command.operationId, scopeKey: "scope", command,
    signature: JSON.stringify(command), queuedAt: now, sequence, status: "pending",
  });
}

function reliableRevision(current, revision) {
  return current.contactRevisions.find((item) => item.id === "contact" &&
    item.revision === revision && !item.localPending && !item.localTimestamp);
}

test("accepted baseline requires reliable contact evidence rather than a local acknowledgement", () => {
  assert.equal(contactHasAcceptedBaseline({ contactRevisions: [] }, entry()), true);
  assert.equal(contactHasAcceptedBaseline({ contactRevisions: [] }, entry({ localPending: true })), false);
  assert.equal(contactHasAcceptedBaseline({ contactRevisions: [] }, entry({ localPending: false, localTimestamp: true })), false);
  assert.equal(contactHasAcceptedBaseline({ contactRevisions: [entry()] }, entry({ revision: 2, localPending: true, localTimestamp: true })), true);
  assert.equal(contactHasAcceptedBaseline({ contactRevisions: [entry({ id: "another" })] }, entry({ localPending: true })), false);
  assert.equal(contactHasAcceptedBaseline({ contactRevisions: [entry({ localTimestamp: true })] }, entry({ localPending: true })), false);
});

test("actual pending and acknowledged new-contact projections have no accepted baseline", () => {
  const initial = immutable(contactSnapshot());
  const command = immutable({
    type: "record_contact", operationId: "new-local-contact", participantId: "participant",
    expectedVersion: 1, expectedAppointmentVersion: 1, method: "phone", outcome: "completed",
    occurredAt: "2026-10-25T09:00:00Z", notes: "דיווח חדש במכשיר",
    nextAppointmentAt: "2026-10-30T09:00:00Z",
  });
  for (const accepted of [false, true]) {
    const result = applyOptimisticCommand(initial, projectedOperation(command), accepted);
    const current = result.participants[0];
    const localEntry = current.contacts.find((item) => item.id === command.operationId);
    assert.ok(localEntry, "the real projector must append the report");
    assert.equal(localEntry.localPending, !accepted);
    assert.equal(localEntry.localTimestamp, true);
    assert.equal(contactHasAcceptedBaseline(current, localEntry), false);
    assert.equal(contactHasAcceptedBaseline(current, current.contacts.find((item) => item.id === "contact")), true);
  }
  assert.equal(initial.participants[0].contacts.length, 1);
});

test("separate immutable corrections and invalidation preserve accepted evidence while using projected tokens", () => {
  const initial = immutable(contactSnapshot("coordinator"));
  const first = immutable({
    type: "revise_contact", operationId: "first-correction", participantId: "participant",
    expectedVersion: 1, contactId: "contact", expectedRevision: 1, expectedAppointmentVersion: 1,
    method: "phone", outcome: "completed", occurredAt: "2026-10-24T10:00:00Z",
    notes: "תיקון ראשון", reason: "תיקון שעת הקשר", nextAppointmentAt: "2026-10-29T09:00:00Z",
  });
  const pendingFirst = immutable(applyOptimisticCommand(initial, projectedOperation(first)));
  const firstView = pendingFirst.participants[0];
  assert.equal(firstView.participant.version, 2);
  assert.equal(firstView.contacts[0].revision, 2);
  assert.equal(firstView.nextAppointment.version, 2);
  assert.ok(reliableRevision(firstView, 1));
  assert.equal(reliableRevision(firstView, 1).notes, "מקור שהתקבל במערכת");
  assert.equal(contactHasAcceptedBaseline(firstView, firstView.contacts[0]), true);

  const second = immutable({
    type: "revise_contact", operationId: "second-correction", participantId: "participant",
    expectedVersion: firstView.participant.version, contactId: "contact",
    expectedRevision: firstView.contacts[0].revision,
    expectedAppointmentVersion: firstView.nextAppointment.version,
    method: "phone", outcome: "completed", occurredAt: "2026-10-24T11:00:00Z",
    notes: "תיקון שני", reason: "בדיקה נוספת של השעה", nextAppointmentAt: "2026-10-30T09:00:00Z",
  });
  const pendingSecond = immutable(applyOptimisticCommand(pendingFirst, projectedOperation(second, 2)));
  const secondView = pendingSecond.participants[0];
  assert.notEqual(second.operationId, first.operationId);
  assert.equal(secondView.participant.version, 3);
  assert.equal(secondView.contacts[0].revision, 3);
  assert.equal(secondView.nextAppointment.version, 3);
  assert.ok(reliableRevision(secondView, 1));
  assert.equal(reliableRevision(secondView, 2), undefined);
  assert.equal(contactHasAcceptedBaseline(secondView, secondView.contacts[0]), true);

  const invalidation = immutable({
    type: "invalidate_contact", operationId: "separate-invalidation", participantId: "participant",
    expectedVersion: secondView.participant.version, contactId: "contact",
    expectedRevision: secondView.contacts[0].revision,
    expectedAppointmentVersion: secondView.nextAppointment.version, reason: "הדיווח אינו מתאר קשר שהתקיים",
  });
  const finalView = applyOptimisticCommand(pendingSecond, projectedOperation(invalidation, 3)).participants[0];
  assert.equal(finalView.participant.version, 4);
  assert.equal(finalView.contacts[0].revision, 4);
  assert.equal(finalView.contacts[0].invalidatedAt, now);
  assert.equal(finalView.nextAppointment.version, 4);
  assert.equal(finalView.nextAppointment.scheduledAt, second.nextAppointmentAt);
  assert.equal(finalView.nextAppointment.requiresReview, true);
  assert.ok(reliableRevision(finalView, 1));
  assert.equal(finalView.contactRevisions.filter((item) => item.id === "contact").length, 4);
  assert.equal(first.expectedVersion, 1);
  assert.equal(first.expectedRevision, 1);
  assert.equal(first.expectedAppointmentVersion, 1);
  assert.equal(initial.participants[0].contacts[0].revision, 1);
});

test("accepted correction evidence does not bypass author, current edit, or report protection guards", () => {
  const initial = contactSnapshot();
  const pendingEntry = entry({ revision: 2, localPending: true, localTimestamp: true });
  const current = { ...initial.participants[0], contacts: [pendingEntry], contactRevisions: [entry()] };
  const allowed = (staff, candidate) => contactHasAcceptedBaseline(candidate, pendingEntry) &&
    canCorrectContact(staff, pendingEntry) && contactEditAccess(staff, candidate, now) &&
    !contactResourceLocked(staff, candidate, pendingEntry.id);
  assert.equal(allowed(initial.actor, current), true);
  assert.equal(allowed({ ...initial.actor, id: "another-author" }, current), false);
  assert.equal(allowed(initial.actor, { ...current, allowedActions: [] }), false);
  const protection = { organizationId: "org", resourceId: "contact", protectedByStaffId: "ceo", protectedRevision: 1, active: true, fieldPaths: null };
  assert.equal(allowed(initial.actor, { ...current, protections: [protection] }), false);
});

for (const role of ["ceo", "coordinator"]) {
  test(`${role} pending invalidation keeps its presentation state without allowing another mutation`, () => {
    const initial = immutable(contactSnapshot(role));
    const command = immutable({
      type: "invalidate_contact", operationId: `pending-invalidation-${role}`, participantId: "participant",
      expectedVersion: 1, contactId: "contact", expectedRevision: 1,
      expectedAppointmentVersion: 1, reason: "הדיווח דורש פסילה",
    });
    assert.equal(contactInvalidationState(initial.actor, initial.participants[0], initial.participants[0].contacts[0]), "available");
    for (const accepted of [false, true]) {
      const current = applyOptimisticCommand(initial, projectedOperation(command), accepted).participants[0];
      const invalidated = current.contacts[0];
      assert.equal(invalidated.invalidatedAt, now);
      assert.equal(invalidated.localPending, !accepted);
      assert.equal(invalidated.localTimestamp, true);
      assert.equal(contactHasAcceptedBaseline(current, invalidated), true);
      assert.equal(contactInvalidationState(initial.actor, current, invalidated), "pending");
      assert.equal(canInvalidateContact(initial.actor, invalidated), false);
    }
  });
}

test("pending invalidation presentation requires management and reliable accepted evidence", () => {
  const pending = entry({ invalidatedAt: now, revision: 2, localPending: true, localTimestamp: true });
  const withBaseline = { contactRevisions: [entry()] };
  assert.equal(contactInvalidationState(actor(), withBaseline, pending), "unavailable");
  assert.equal(canInvalidateContact(actor(), pending), false);
  for (const staff of [actor("coordinator"), actor("ceo")]) {
    assert.equal(contactInvalidationState(staff, { contactRevisions: [] }, pending), "unavailable");
    assert.equal(contactInvalidationState(staff, { contactRevisions: [entry({ localTimestamp: true })] }, pending), "unavailable");
    assert.equal(contactInvalidationState(staff, withBaseline, entry({ invalidatedAt: now })), "unavailable");
    assert.equal(canInvalidateContact(staff, entry({ invalidatedAt: now })), false);
    assert.equal(contactInvalidationState(staff, withBaseline, { ...pending, localPending: false }), "pending");
    assert.equal(canInvalidateContact(staff, { ...pending, localPending: false }), false);
  }
});
