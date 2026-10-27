import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && context.parentURL?.includes("/lib/mentoring/") && !/\.[a-z]+$/i.test(specifier)) {
    try { return nextResolve(`${specifier}.ts`, context); } catch { /* Installed modules retain normal resolution. */ }
  }
  return nextResolve(specifier, context);
} });
const { applyOptimisticCommand } = await import("../../../lib/mentoring/offline-projections.ts");

const now = "2026-10-26T10:00:00.000Z";
function fixture(role = "ceo") {
  const actor = { id: "actor", authUserId: "account", organizationId: "org", role, active: true, version: 1, displayName: "צוות", email: null, phone: null, coordinatorId: null, smsMuted: false };
  const participant = { id: "participant", organizationId: "org", displayName: "חניכה", phone: null, serviceType: "national", servicePlace: null, serviceRole: null, profileNotes: null, lifecycle: "active", version: 1, createdAt: now };
  const contact = { id: "contact", organizationId: "org", participantId: participant.id, actorId: actor.id, method: "phone", outcome: "completed", occurredAt: "2026-10-25T09:00:00.000Z", receivedAt: "2026-10-25T09:01:00.000Z", notes: "מקור", revision: 1, invalidatedAt: null };
  const review = { contactId: contact.id, revision: 1, decision: "approved", reviewedByStaffId: "reviewer", reviewedAt: "2026-10-25T09:02:00.000Z" };
  return { actor, staff: [actor, { ...actor, id: "target", authUserId: "target-account", role: "mentor" }], participants: [{ participant,
    assignment: { id: "assignment", organizationId: "org", participantId: participant.id, mentorId: actor.id, coordinatorId: null, assignedAt: "2026-10-01T09:00:00.000Z", version: 1 },
    nextAppointment: { id: "appointment", organizationId: "org", participantId: participant.id, mentorId: actor.id, scheduledAt: "2026-10-28T09:00:00.000Z", version: 1, sourceContactId: contact.id, requiresReview: false },
    contacts: [contact], reviews: [review], protections: [], manualColor: "green", manualColorAt: now,
    contactRevisions: [], manualColorHistory: [], appointmentHistory: [], contactWarnings: [], accessGrants: [], protectionStates: [], assignmentHistory: [], authorityHistory: [],
    deletedAt: null, deletedBy: null, deletionReason: null, deletedPreviousLifecycle: null,
  }], settings: { organizationId: "org", version: 1, offlineLeaseHours: 24, reminderAudience: "responsible_team", appointmentReminderMinutesBefore: 0, overdueRemindersEnabled: true, overdueRepeatHours: null, updatedAt: now, updatedBy: null },
    monthlyReviews: [], conflicts: [], serverTime: now, offlineValidUntil: "2026-10-27T10:00:00.000Z", capabilities: { smsConfigured: false, smsSendingEnabled: false } };
}
function operation(command, sequence = 1) { return { key: command.operationId, scopeKey: "scope", command, signature: "signature", queuedAt: now, sequence, status: "pending" }; }
function apply(snapshot, command, accepted = false) { return applyOptimisticCommand(snapshot, operation(command), accepted); }
function participantCommand(type, extra = {}) { return { type, operationId: crypto.randomUUID(), participantId: "participant", expectedVersion: 1, reason: "תיקון", ...extra }; }

test("offline staff creation is an inactive display identity and acceptance keeps auth identity empty", () => {
  const snapshot = fixture();
  const command = { type: "create_staff", operationId: "new-staff", fields: { displayName: "חדשה", email: "new@example.invalid", phone: null, role: "mentor", coordinatorId: null } };
  const pending = apply(snapshot, command);
  const staff = pending.staff.find((entry) => entry.id === "new-staff");
  assert.equal(staff.active, false);
  assert.equal(staff.authUserId, "");
  assert.equal(staff.localPending, true);
  assert.equal(pending.actor, snapshot.actor);
  assert.equal(apply(snapshot, command, true).staff.find((entry) => entry.id === "new-staff").active, true);
  assert.equal(snapshot.staff.length, 2);
});

test("pending role, team and activation commands advance staff tokens without changing authority", () => {
  const snapshot = fixture();
  const update = { type: "update_staff", operationId: "staff-edit", staffId: "target", expectedVersion: 1, fields: { displayName: "שם חדש", role: "coordinator", coordinatorId: null } };
  const pending = apply(snapshot, update);
  assert.equal(pending.staff[1].displayName, "שם חדש");
  assert.equal(pending.staff[1].role, "mentor");
  assert.equal(pending.staff[1].version, 2);
  const deactivate = { type: "set_staff_active", operationId: "staff-deactivate", staffId: "target", expectedVersion: 2, active: false };
  assert.equal(apply(pending, deactivate).staff[1].active, true);
  assert.equal(apply(pending, deactivate).staff[1].version, 3);
  assert.equal(apply(snapshot, update, true).staff[1].role, "coordinator");
});

test("pending grants support sequential concurrency tokens without creating readable authority", () => {
  const snapshot = fixture();
  const grant = participantCommand("set_access_grant", { staffId: "target", expectedGrantVersion: null, actions: ["view", "edit"], expiresAt: null });
  const pending = apply(snapshot, grant);
  assert.equal(pending.participants[0].participant.version, 2);
  assert.deepEqual(pending.participants[0].accessGrants[0].actions, []);
  assert.equal(pending.participants[0].accessGrants[0].active, false);
  assert.equal(pending.participants[0].accessGrants[0].version, 1);
  const later = apply(pending, { ...grant, operationId: "next-grant", expectedVersion: 2, expectedGrantVersion: 1, actions: ["view"] });
  assert.equal(later.participants[0].accessGrants[0].version, 2);
  assert.equal(later.participants[0].accessGrants[0].active, false);
  assert.deepEqual(apply(snapshot, grant, true).participants[0].accessGrants[0].actions, ["view", "edit"]);
});

test("pending protection unlocks keep the accepted protection enforced until central acceptance", () => {
  const snapshot = fixture();
  const protection = { organizationId: "org", resourceId: "participant", protectedByStaffId: "actor", protectedRevision: 1, active: true, fieldPaths: null };
  snapshot.participants[0].protections = [protection];
  snapshot.participants[0].protectionStates = [{ ...protection, version: 1, reason: null, createdAt: now, updatedAt: now, unlockedByStaffId: null, unlockedAt: null }];
  const command = participantCommand("set_ceo_protection", { resourceId: "participant", expectedProtectionVersion: 1, active: false, fieldPaths: null });
  const pending = apply(snapshot, command);
  assert.equal(pending.participants[0].protections[0].active, true);
  assert.equal(pending.participants[0].protectionStates[0].version, 2);
  assert.equal(pending.participants[0].protectionStates[0].active, true);
  assert.equal(apply(snapshot, command, true).participants[0].protections[0].active, false);
  const accidentallyUsedAsReducer = applyOptimisticCommand(snapshot, operation(command), 1);
  assert.equal(accidentallyUsedAsReducer.participants[0].protections[0].active, true);
});

test("contact corrections retain immutable authorship and historical review evidence", () => {
  const snapshot = fixture("mentor");
  const command = participantCommand("revise_contact", { contactId: "contact", expectedRevision: 1, expectedAppointmentVersion: 1, method: "phone", outcome: "completed", occurredAt: "2026-10-25T09:00:00.000Z", notes: "תיקון תוכן" });
  const corrected = apply(snapshot, command).participants[0];
  assert.equal(corrected.participant.version, 2);
  assert.equal(corrected.contacts[0].revision, 2);
  assert.equal(corrected.contacts[0].localPending, true);
  assert.equal(corrected.contacts[0].actorId, snapshot.actor.id);
  assert.equal(corrected.contacts[0].receivedAt, snapshot.participants[0].contacts[0].receivedAt);
  assert.equal(corrected.contactRevisions.find((entry) => entry.revision === 1).review.decision, "approved");
  assert.equal(corrected.contactRevisions.find((entry) => entry.revision === 2).review, null);
  assert.equal(apply(snapshot, command, true).participants[0].contacts[0].localPending, false);
  assert.equal(apply(snapshot, command, true).participants[0].contacts[0].localTimestamp, true);
  assert.equal(corrected.nextAppointment.version, 1);
  assert.equal(snapshot.participants[0].contacts[0].notes, "מקור");
});

test("correcting the current completed contact replaces one appointment and records provenance", () => {
  const snapshot = fixture("mentor");
  const command = participantCommand("revise_contact", { contactId: "contact", expectedRevision: 1, expectedAppointmentVersion: 1, method: "phone", outcome: "completed", occurredAt: "2026-10-25T08:00:00.000Z", notes: "תיקון שעה", nextAppointmentAt: "2026-10-29T09:00:00.000Z" });
  const corrected = apply(snapshot, command).participants[0];
  assert.equal(corrected.nextAppointment.scheduledAt, command.nextAppointmentAt);
  assert.equal(corrected.nextAppointment.version, 2);
  assert.equal(corrected.nextAppointment.sourceContactId, "contact");
  assert.equal(corrected.nextAppointment.requiresReview, false);
  assert.deepEqual(corrected.appointmentHistory.map((entry) => entry.appointmentVersion), [2, 1]);
});

test("invalidation retains the appointment with a persistent review warning and revised contact", () => {
  const snapshot = fixture("coordinator");
  const command = participantCommand("invalidate_contact", { contactId: "contact", expectedRevision: 1, expectedAppointmentVersion: 1 });
  const invalidated = apply(snapshot, command).participants[0];
  assert.equal(invalidated.contacts[0].invalidatedAt, now);
  assert.equal(invalidated.contacts[0].revision, 2);
  assert.equal(invalidated.nextAppointment.scheduledAt, snapshot.participants[0].nextAppointment.scheduledAt);
  assert.equal(invalidated.nextAppointment.version, 2);
  assert.equal(invalidated.nextAppointment.requiresReview, true);
  assert.deepEqual(invalidated.contactWarnings, ["appointment_requires_review"]);
  const mentor = fixture("mentor");
  assert.equal(apply(mentor, command).participants[0], mentor.participants[0]);
});

test("an unrelated mentor cannot project a correction to another author's contact", () => {
  const snapshot = fixture("mentor");
  snapshot.participants[0].contacts[0].actorId = "another-author";
  const command = participantCommand("revise_contact", { contactId: "contact", expectedRevision: 1, expectedAppointmentVersion: 1, method: "phone", outcome: "completed", occurredAt: "2026-10-25T09:00:00.000Z", notes: "לא מותר" });
  assert.equal(apply(snapshot, command).participants[0], snapshot.participants[0]);
});

test("appointment and manual color commands project the correct participant versions in queue order", () => {
  const snapshot = fixture("mentor");
  snapshot.participants[0].nextAppointment.requiresReview = true;
  const reschedule = participantCommand("reschedule_appointment", { expectedAppointmentVersion: 1, scheduledAt: "2026-10-30T09:00:00.000Z" });
  const color = participantCommand("set_manual_color", { expectedVersion: 2, color: "red" });
  const projected = [reschedule, color].reduce((state, command) => apply(state, command), snapshot).participants[0];
  assert.equal(projected.participant.version, 3);
  assert.equal(projected.nextAppointment.version, 2);
  assert.equal(projected.nextAppointment.requiresReview, false);
  assert.equal(projected.manualColor, "red");
  assert.equal(projected.manualColorHistory[0].participantVersion, 3);
  assert.deepEqual(projected.contactWarnings, []);
  assert.equal(apply(snapshot, { ...color, expectedVersion: 1, color: "green" }).participants[0].participant.version, 1, "unchanged color is a central no-op");
});

test("protected participant fields retain authoritative data while unrelated fields remain editable", () => {
  const snapshot = fixture("mentor");
  snapshot.participants[0].protections = [{ organizationId: "org", resourceId: "participant", protectedByStaffId: "ceo", protectedRevision: 1, active: true, fieldPaths: ["manualColor"] }];
  assert.equal(apply(snapshot, participantCommand("set_manual_color", { color: "red" })).participants[0].manualColor, "green");
  assert.equal(apply(snapshot, participantCommand("update_participant", { fields: { profileNotes: "מותר" } })).participants[0].participant.profileNotes, "מותר");
});

test("lifecycle deletion and restore preserve the prior lifecycle and deterministic version sequence", () => {
  const snapshot = fixture();
  const pause = participantCommand("set_participant_lifecycle", { lifecycle: "paused" });
  const remove = participantCommand("delete_participant", { expectedVersion: 2 });
  const restore = participantCommand("restore_participant", { expectedVersion: 3 });
  const paused = apply(snapshot, pause);
  const removed = apply(paused, remove);
  assert.equal(removed.participants[0].deletedPreviousLifecycle, "paused");
  assert.equal(removed.participants[0].participant.deletedAt, now);
  assert.equal(apply(removed, participantCommand("set_manual_color", { expectedVersion: 3, color: "red" })).participants[0].manualColor, "green");
  const restored = apply(removed, restore).participants[0];
  assert.equal(restored.participant.version, 4);
  assert.equal(restored.participant.lifecycle, "paused");
  assert.equal(restored.deletedAt, null);
  assert.equal(restored.participant.deletedAt, null);
  assert.deepEqual(restored.protections, [], "pending CEO edits do not invent protection authority");
});

test("organization policy projection advances settings tokens without extending the signed offline lease", () => {
  const snapshot = fixture();
  const command = { type: "update_organization_settings", operationId: "settings", expectedVersion: 1, reason: "עדכון", settings: { offlineLeaseHours: 48, reminderAudience: "all_staff", appointmentReminderMinutesBefore: 60, overdueRemindersEnabled: false, overdueRepeatHours: null } };
  const projected = apply(snapshot, command);
  assert.equal(projected.settings.version, 2);
  assert.equal(projected.settings.offlineLeaseHours, 48);
  assert.equal(projected.offlineValidUntil, snapshot.offlineValidUntil);
  assert.equal(apply(projected, { ...command, operationId: "settings-2", expectedVersion: 2 }).settings.version, 3);
  const mentor = fixture("mentor");
  assert.equal(apply(mentor, command), mentor);
});

test("monthly review projections preserve scope, independent history and CEO protection", () => {
  const snapshot = fixture("coordinator");
  const command = { type: "save_monthly_review", operationId: "monthly", month: "2026-10", scopeStaffId: snapshot.actor.id, expectedVersion: null, summary: "סקירת צוות", reviewed: true };
  const first = apply(snapshot, command);
  const second = apply(first, { ...command, operationId: "monthly-2", expectedVersion: 1, summary: "המשך סקירה" });
  assert.equal(second.monthlyReviews[0].version, 2);
  assert.equal(second.monthlyReviews[0].history.length, 2);
  assert.equal(second.monthlyReviews[0].history[1].summary, "סקירת צוות");
  assert.equal(apply(snapshot, { ...command, scopeStaffId: "another-team" }), snapshot);
  second.monthlyReviews[0].ceoProtected = true;
  assert.equal(apply(second, { ...command, expectedVersion: 2 }), second);
});

test("coordinators can create an inactive pending mentor in their own team for later assignment", () => {
  const snapshot = fixture("coordinator");
  const command = { type: "create_staff", operationId: "new-mentor", fields: { displayName: "חונכת חדשה", email: "mentor@example.invalid", phone: null, role: "mentor", coordinatorId: snapshot.actor.id } };
  const pending = apply(snapshot, command);
  assert.equal(pending.staff.find((entry) => entry.id === command.operationId).active, false);
  assert.equal(pending.staff.find((entry) => entry.id === command.operationId).localPending, true);
  assert.equal(apply(snapshot, { ...command, fields: { ...command.fields, coordinatorId: "other-team" } }), snapshot);
});

test("automatic CEO protection advances pending tokens without changing the accepted active state", () => {
  const snapshot = fixture();
  const color = participantCommand("set_manual_color", { color: "red" });
  const pending = apply(snapshot, color);
  assert.deepEqual(pending.participants[0].protections, []);
  assert.equal(pending.participants[0].protectionStates[0].version, 1);
  assert.equal(pending.participants[0].protectionStates[0].active, false);
  const unlock = participantCommand("set_ceo_protection", { expectedVersion: 2, resourceId: "participant", expectedProtectionVersion: 1, active: false, fieldPaths: null });
  assert.equal(apply(pending, unlock).participants[0].protectionStates[0].version, 2);
  const accepted = apply(snapshot, color, true);
  assert.equal(accepted.participants[0].protections[0].active, true);
  assert.equal(accepted.participants[0].protectionStates[0].version, 1);
  const second = apply(accepted, participantCommand("reschedule_appointment", { expectedVersion: 2, expectedAppointmentVersion: 1, scheduledAt: "2026-10-29T09:00:00.000Z" }));
  assert.equal(second.participants[0].protectionStates[0].version, 2);
  assert.deepEqual(second.participants[0].protections[0].fieldPaths, ["manualColor"]);
});

test("deleted or CEO-protected contacts cannot acquire projected coordinator approval", () => {
  const command = { type: "review_contact", operationId: "review", participantId: "participant", contactId: "contact", revision: 1, decision: "returned_for_correction" };
  const snapshot = fixture("coordinator");
  snapshot.participants[0].protections = [{ organizationId: "org", resourceId: "contact", protectedByStaffId: "ceo", protectedRevision: 1, active: true }];
  assert.equal(apply(snapshot, command).participants[0], snapshot.participants[0]);
  snapshot.participants[0].protections = [];
  snapshot.participants[0].participant.deletedAt = now;
  assert.equal(apply(snapshot, command).participants[0], snapshot.participants[0]);
});

test("acknowledged changes retain provisional receipt timestamps and accepted baselines until refresh", () => {
  const snapshot = fixture("coordinator");
  const queued = { type: "review_contact", operationId: "review", participantId: "participant", contactId: "contact", revision: 1, decision: "returned_for_correction" };
  const unconfirmed = apply(snapshot, queued, true).participants[0];
  assert.equal(unconfirmed.reviews[0].localPending, false);
  assert.equal(unconfirmed.reviews[0].localTimestamp, true);
  assert.equal(unconfirmed.reviewEvents[0].localTimestamp, true);
  assert.equal(unconfirmed.reviews.find((entry) => !entry.localTimestamp).decision, "approved");
  const contactCommand = participantCommand("record_contact", { expectedAppointmentVersion: 1, method: "phone", outcome: "completed", occurredAt: "2026-10-25T10:00:00.000Z", nextAppointmentAt: "2026-11-02T10:00:00.000Z", notes: "קשר" });
  const projected = apply(snapshot, contactCommand, true).participants[0];
  const contact = projected.contacts.find((entry) => entry.id === contactCommand.operationId);
  assert.equal(contact.receivedAt, now);
  assert.equal(contact.localPending, false);
  assert.equal(contact.localTimestamp, true);
  assert.equal(projected.acceptedNextAppointment.scheduledAt, snapshot.participants[0].nextAppointment.scheduledAt);
  assert.equal(projected.nextAppointment.scheduledAt, contactCommand.nextAppointmentAt);
});

test("pending assignment cannot turn view-only coordinator access into local edit authority", () => {
  const snapshot = fixture("coordinator");
  snapshot.participants[0].assignment = null;
  snapshot.participants[0].accessGrants = [{ id: "read-grant", organizationId: "org", participantId: "participant", staffId: snapshot.actor.id, actions: ["view"], active: true, expiresAt: null, version: 1 }];
  const assign = participantCommand("assign_participant", { mentorId: "target", coordinatorId: snapshot.actor.id });
  assert.equal(apply(snapshot, assign).participants[0].assignment, null);
  assert.equal(apply(snapshot, assign, true).participants[0].assignment.coordinatorId, snapshot.actor.id);
  snapshot.participants[0].participant.localCreatedByStaffId = snapshot.actor.id;
  assert.equal(apply(snapshot, assign).participants[0].assignment.mentorId, "target", "a locally created case already belongs to its creator's editing flow");
  snapshot.participants[0].allowedActions = ["view"];
  assert.equal(apply(snapshot, assign).participants[0].assignment, null, "an explicit authoritative action set overrides inferred creator ownership");
});

test("coordinator create acknowledgement retains creator ownership for its queued assignment", () => {
  const snapshot = fixture("coordinator");
  const create = { type: "create_participant", operationId: "new-participant", fields: { displayName: "חדשה" } };
  const accepted = apply(snapshot, create, true);
  const created = accepted.participants.find((view) => view.participant.id === create.operationId);
  assert.equal(created.participant.localPending, false);
  assert.equal(created.participant.createdBy, snapshot.actor.id);
  assert.equal(created.participant.localCreatedByStaffId, snapshot.actor.id);
  assert.deepEqual(created.allowedActions, ["view", "edit", "approve"]);
  const assigned = apply(accepted, participantCommand("assign_participant", { participantId: create.operationId, mentorId: "target", coordinatorId: snapshot.actor.id }));
  assert.equal(assigned.participants.find((view) => view.participant.id === create.operationId).assignment.mentorId, "target");
  assert.equal(assigned.participants.find((view) => view.participant.id === create.operationId).acceptedAssignment, null);
});

test("an unanswered attempt with a stale appointment token never changes its pending projection", () => {
  const snapshot = fixture("mentor");
  const command = participantCommand("record_contact", { expectedAppointmentVersion: 2, method: "phone", outcome: "no_answer", occurredAt: "2026-10-25T10:00:00.000Z", notes: "ניסיון" });
  const projected = apply(snapshot, command).participants[0];
  assert.equal(projected, snapshot.participants[0]);
  assert.equal(projected.contacts.length, 1);
  assert.equal(projected.participant.version, 1);
});

test("pending lifecycle and profile projections carry a durable generic pending badge", () => {
  const snapshot = fixture();
  const paused = apply(snapshot, participantCommand("set_participant_lifecycle", { lifecycle: "paused" }));
  assert.equal(paused.participants[0].participant.localPending, true);
  const deleted = apply(snapshot, participantCommand("delete_participant"));
  assert.equal(deleted.participants[0].participant.localPending, true);
  assert.equal(apply(snapshot, participantCommand("delete_participant"), true).participants[0].participant.localPending, false);
  const updated = apply(snapshot, participantCommand("update_participant", { fields: { profileNotes: "טיוטת שינוי" } }));
  assert.equal(updated.participants[0].participant.localPending, true);
  assert.equal(updated.participants[0].participant.localCreatedByStaffId, undefined, "an ordinary pending edit is not creator authority");
});

test("SMS preference projections advance actor and roster versions before a queued self profile edit", () => {
  const snapshot = fixture();
  const mute = { type: "set_sms_muted", operationId: "mute", muted: true };
  const muted = apply(snapshot, mute);
  assert.equal(muted.actor.version, 2);
  assert.equal(muted.actor.smsMuted, true);
  assert.equal(muted.staff[0].version, 2);
  assert.equal(muted.staff[0].smsMuted, true);
  assert.equal(muted.staff[0].localPending, true);
  assert.equal(muted.actor.role, snapshot.actor.role);
  assert.equal(muted.actor.active, snapshot.actor.active);
  assert.equal(muted.actor.localPending, snapshot.actor.localPending);
  const selfEdit = { type: "update_staff", operationId: "self-edit", staffId: snapshot.actor.id, expectedVersion: 2, fields: { displayName: "שם מעודכן" } };
  const edited = apply(muted, selfEdit);
  assert.equal(edited.staff[0].displayName, "שם מעודכן");
  assert.equal(edited.staff[0].version, 3);
  assert.equal(edited.actor.version, 2, "a staff edit leaves the actor's authority profile intact");
  const unmuted = apply(edited, { ...mute, operationId: "unmute", muted: false });
  assert.equal(unmuted.actor.version, 4, "the latest projected roster version supplies the next membership token");
  assert.equal(unmuted.staff[0].version, 4);
  assert.equal(unmuted.actor.smsMuted, false);
  const accepted = apply(snapshot, mute, true);
  assert.equal(accepted.actor.version, 2);
  assert.equal(accepted.staff[0].version, 2);
  assert.equal(accepted.staff[0].localPending, false);
  assert.equal(snapshot.actor.version, 1);
  assert.equal(snapshot.actor.smsMuted, false);
});

test("paused and closed historical corrections survive acknowledgement without scheduling a new appointment", () => {
  for (const lifecycle of ["paused", "closed"]) {
    for (const hasAppointment of [true, false]) {
      for (const accepted of [false, true]) {
        const snapshot = fixture();
        snapshot.participants[0].participant.lifecycle = lifecycle;
        if (!hasAppointment) snapshot.participants[0].nextAppointment = null;
        const original = structuredClone(snapshot);
        const command = participantCommand("revise_contact", {
          contactId: "contact", expectedRevision: 1, expectedAppointmentVersion: hasAppointment ? 1 : null,
          method: "phone", outcome: "completed", occurredAt: "2026-10-24T08:00:00.000Z", notes: "תיקון היסטורי בכרטיס לא פעיל",
        });
        const corrected = apply(snapshot, command, accepted).participants[0];
        const context = `${lifecycle}, appointment=${hasAppointment}, accepted=${accepted}`;
        assert.equal(corrected.participant.version, 2, context);
        assert.equal(corrected.participant.lifecycle, lifecycle, context);
        assert.equal(corrected.contacts[0].revision, 2, context);
        assert.equal(corrected.contacts[0].notes, command.notes, context);
        assert.equal(corrected.contacts[0].occurredAt, command.occurredAt, context);
        assert.equal(corrected.contacts[0].receivedAt, original.participants[0].contacts[0].receivedAt, context);
        assert.equal(corrected.contacts[0].localPending, !accepted, context);
        assert.equal(corrected.contacts[0].localTimestamp, true, "acknowledgement without a fresh GET does not invent a receipt timestamp");
        if (hasAppointment) {
          assert.equal(corrected.nextAppointment.scheduledAt, original.participants[0].nextAppointment.scheduledAt, context);
          assert.equal(corrected.nextAppointment.version, 2, context);
          assert.equal(corrected.nextAppointment.requiresReview, true, context);
          assert.deepEqual(corrected.contactWarnings, ["appointment_requires_review"], context);
        } else {
          assert.equal(corrected.nextAppointment, null, context);
          assert.deepEqual(corrected.contactWarnings, [], context);
        }
        assert.deepEqual(snapshot, original, "projection leaves the accepted source unchanged");
      }
    }
  }
});

test("appointment and whole locks block new completed contacts while permitting unchanged-color unanswered attempts", () => {
  for (const fieldPaths of [["appointment"], null]) {
    const snapshot = fixture("mentor");
    snapshot.participants[0].protections = [{ organizationId: "org", resourceId: "participant", protectedByStaffId: "ceo", protectedRevision: 1, active: true, fieldPaths }];
    const original = structuredClone(snapshot);
    const common = { expectedAppointmentVersion: 1, method: "phone", occurredAt: "2026-10-25T10:00:00.000Z", notes: "תיעוד חדש", manualColor: "green" };
    const completed = participantCommand("record_contact", { ...common, outcome: "completed", nextAppointmentAt: "2026-10-29T09:00:00.000Z" });
    const blocked = apply(snapshot, completed);
    assert.deepEqual(blocked, original);
    assert.equal(blocked.participants[0], snapshot.participants[0]);
    const attempt = participantCommand("record_contact", { ...common, outcome: "no_answer" });
    const allowed = apply(snapshot, attempt).participants[0];
    assert.equal(allowed.participant.version, 2);
    assert.equal(allowed.contacts.length, 2);
    assert.equal(allowed.contacts.find((entry) => entry.id === attempt.operationId).outcome, "no_answer");
    assert.deepEqual(allowed.nextAppointment, original.participants[0].nextAppointment);
    assert.deepEqual(allowed.protections, original.participants[0].protections);
    assert.equal(allowed.manualColor, "green");
    assert.deepEqual(snapshot, original);
  }
});

test("CEO completed contacts protect their own content and a changed color without locking future appointment cycles", () => {
  const cases = [
    { name: "new protection", existing: false, active: false, fieldPaths: null, version: 0, expectedFields: ["manualColor"] },
    { name: "active selected fields", existing: true, active: true, fieldPaths: ["phone"], version: 5, expectedFields: ["manualColor", "phone"] },
    { name: "active whole lock", existing: true, active: true, fieldPaths: null, version: 5, expectedFields: null },
    { name: "inactive selected fields", existing: true, active: false, fieldPaths: ["phone"], version: 5, expectedFields: ["manualColor"] },
  ];
  for (const state of cases) {
    for (const accepted of [false, true]) {
      const snapshot = fixture();
      if (state.existing) {
        const protection = { organizationId: "org", resourceId: "participant", protectedByStaffId: "prior-ceo", protectedRevision: 1, active: state.active, fieldPaths: state.fieldPaths };
        snapshot.participants[0].protections = state.active ? [protection] : [];
        snapshot.participants[0].protectionStates = [{ ...protection, version: state.version, reason: "החלטה קודמת", createdAt: now, updatedAt: now,
          unlockedByStaffId: state.active ? null : "prior-ceo", unlockedAt: state.active ? null : "2026-10-25T10:00:00.000Z" }];
      }
      const original = structuredClone(snapshot);
      const command = participantCommand("record_contact", { expectedAppointmentVersion: 1, method: "phone", outcome: "completed", occurredAt: "2026-10-25T10:00:00.000Z", nextAppointmentAt: "2026-10-29T09:00:00.000Z", notes: "קשר ועדכון צבע", manualColor: "red" });
      const projected = apply(snapshot, command, accepted).participants[0];
      const participantState = projected.protectionStates.find((entry) => entry.resourceId === "participant");
      const contactState = projected.protectionStates.find((entry) => entry.resourceId === command.operationId);
      const context = `${state.name}, accepted=${accepted}`;
      assert.equal(projected.participant.version, 2, context);
      assert.equal(projected.nextAppointment.version, 2, context);
      assert.equal(projected.manualColor, "red", context);
      assert.equal(participantState.version, state.version + 1, "only the changed color increments the participant protection token");
      assert.equal(contactState.version, 1, "contact protection has its own independent resource token");
      if (accepted) {
        const participantProtection = projected.protections.find((entry) => entry.resourceId === "participant");
        assert.deepEqual(participantProtection.fieldPaths?.toSorted() ?? null, state.expectedFields, context);
        assert.deepEqual(participantState.fieldPaths?.toSorted() ?? null, state.expectedFields, context);
        assert.equal(participantProtection.active, true, context);
        assert.equal(participantState.reason, null, "automatic record-contact protection clears an obsolete explicit reason");
        assert.equal(participantState.unlockedByStaffId, null, context);
        assert.equal(participantState.unlockedAt, null, context);
        assert.equal(projected.protections.find((entry) => entry.resourceId === command.operationId).active, true, context);
      } else {
        assert.deepEqual(projected.protections, original.participants[0].protections, "pending writes never change the accepted lock scope");
        assert.equal(participantState.active, state.active, context);
        if (state.existing) {
          assert.deepEqual(participantState.fieldPaths, state.fieldPaths, context);
          assert.equal(participantState.reason, "החלטה קודמת", context);
          assert.equal(participantState.unlockedByStaffId, state.active ? null : "prior-ceo", context);
        }
      }
      assert.deepEqual(snapshot, original, context);
    }
  }
});

test("automatic feature protections clear an obsolete active reason only after central acceptance", () => {
  const commands = [
    participantCommand("set_manual_color", { color: "red" }),
    participantCommand("reschedule_appointment", { expectedAppointmentVersion: 1, scheduledAt: "2026-10-29T09:00:00.000Z" }),
    participantCommand("revise_contact", { contactId: "contact", expectedRevision: 1, expectedAppointmentVersion: 1, method: "phone", outcome: "completed", occurredAt: "2026-10-24T08:00:00.000Z", nextAppointmentAt: "2026-10-29T09:00:00.000Z", notes: "תיקון מועד" }),
  ];
  for (const command of commands) {
    for (const accepted of [false, true]) {
      const snapshot = fixture();
      const protection = { organizationId: "org", resourceId: "participant", protectedByStaffId: "prior-ceo", protectedRevision: 1, active: true, fieldPaths: ["phone"] };
      snapshot.participants[0].protections = [protection];
      snapshot.participants[0].protectionStates = [{ ...protection, version: 5, reason: "החלטה מפורשת ישנה", createdAt: now, updatedAt: now, unlockedByStaffId: null, unlockedAt: null }];
      const projected = apply(snapshot, command, accepted).participants[0];
      const state = projected.protectionStates.find((entry) => entry.resourceId === "participant");
      const context = `${command.type}, accepted=${accepted}`;
      assert.equal(state.version, 6, context);
      assert.equal(state.reason, accepted ? null : "החלטה מפורשת ישנה", context);
      assert.equal(state.active, true, context);
      assert.equal(state.unlockedByStaffId, null, context);
      assert.equal(state.unlockedAt, null, context);
      if (!accepted) assert.deepEqual(projected.protections, snapshot.participants[0].protections, context);
    }
  }
});

test("routine mentor reporting remains possible after CEO profile, assignment, lifecycle and creation work", () => {
  const cases = [
    { name: "profile edit", prepare(snapshot) {
      snapshot.participants[0].assignment.mentorId = "target";
      snapshot.participants[0].nextAppointment.mentorId = "target";
      return apply(snapshot, participantCommand("update_participant", { fields: { profileNotes: "הנחיית מנכ״ל" } }), true);
    }, participantId: "participant", expectedFields: ["profileNotes"] },
    { name: "initial assignment", prepare(snapshot) {
      snapshot.participants[0].assignment = null;
      snapshot.participants[0].nextAppointment = null;
      return apply(snapshot, participantCommand("assign_participant", { mentorId: "target", coordinatorId: null }), true);
    }, participantId: "participant", expectedFields: ["assignment"] },
    { name: "lifecycle resume", prepare(snapshot) {
      snapshot.participants[0].assignment.mentorId = "target";
      snapshot.participants[0].nextAppointment.mentorId = "target";
      const paused = apply(snapshot, participantCommand("set_participant_lifecycle", { lifecycle: "paused" }), true);
      return apply(paused, participantCommand("set_participant_lifecycle", { expectedVersion: 2, lifecycle: "active" }), true);
    }, participantId: "participant", expectedFields: ["lifecycle"] },
    { name: "participant creation", prepare(snapshot) {
      const created = apply(snapshot, { type: "create_participant", operationId: "created-case", fields: { displayName: "חדשה", phone: "0500000000" } }, true);
      return apply(created, participantCommand("assign_participant", { participantId: "created-case", mentorId: "target", coordinatorId: null }), true);
    }, participantId: "created-case", expectedFields: ["assignment", "displayName", "phone"] },
  ];
  for (const scenario of cases) {
    const prepared = scenario.prepare(fixture());
    const prior = prepared.participants.find((view) => view.participant.id === scenario.participantId);
    const protection = prior.protections.find((entry) => entry.resourceId === scenario.participantId);
    assert.deepEqual(protection.fieldPaths?.toSorted(), scenario.expectedFields, scenario.name);
    const mentorWorkspace = { ...prepared, actor: prepared.staff.find((member) => member.id === "target") };
    for (const accepted of [false, true]) {
      const command = participantCommand("record_contact", { participantId: scenario.participantId, expectedVersion: prior.participant.version,
        expectedAppointmentVersion: prior.nextAppointment?.version ?? null, method: "phone", outcome: "completed", occurredAt: "2026-10-25T10:00:00.000Z", nextAppointmentAt: "2026-10-29T09:00:00.000Z", notes: "ליווי שוטף לאחר עבודת הנהלה" });
      const continued = apply(mentorWorkspace, command, accepted).participants.find((view) => view.participant.id === scenario.participantId);
      assert.equal(continued.participant.version, prior.participant.version + 1, scenario.name);
      assert.equal(continued.contacts.find((entry) => entry.id === command.operationId).notes, command.notes, scenario.name);
      assert.equal(continued.nextAppointment.scheduledAt, command.nextAppointmentAt, scenario.name);
      assert.deepEqual(continued.protections, prior.protections, "routine reporting retains the CEO's protected fields");
    }
  }
});

test("a CEO completed contact protects that report while the mentor can advance the next contact cycle", () => {
  const snapshot = fixture();
  snapshot.participants[0].assignment.mentorId = "target";
  snapshot.participants[0].nextAppointment.mentorId = "target";
  const first = participantCommand("record_contact", { expectedAppointmentVersion: 1, method: "phone", outcome: "completed", occurredAt: "2026-10-25T10:00:00.000Z", nextAppointmentAt: "2026-10-29T09:00:00.000Z", notes: "דיווח מנכ״ל" });
  const ceoWorkspace = apply(snapshot, first, true);
  const accepted = ceoWorkspace.participants[0];
  const ceoReport = accepted.contacts.find((entry) => entry.id === first.operationId);
  assert.equal(accepted.protectionStates.find((entry) => entry.resourceId === first.operationId).version, 1);
  assert.equal(accepted.protections.find((entry) => entry.resourceId === first.operationId).fieldPaths, null);
  assert.equal(accepted.protectionStates.find((entry) => entry.resourceId === "participant"), undefined);
  assert.equal(accepted.protections.find((entry) => entry.resourceId === "participant"), undefined);
  assert.equal(accepted.appointmentHistory.find((entry) => entry.appointmentVersion === 2).sourceContactId, first.operationId);
  const mentorWorkspace = { ...ceoWorkspace, actor: ceoWorkspace.staff.find((member) => member.id === "target") };
  const followup = participantCommand("record_contact", { expectedVersion: 2, expectedAppointmentVersion: 2, method: "phone", outcome: "completed", occurredAt: "2026-10-26T09:00:00.000Z", nextAppointmentAt: "2026-10-30T09:00:00.000Z", notes: "המשך ליווי חונכת" });
  const continued = apply(mentorWorkspace, followup).participants[0];
  assert.equal(continued.participant.version, 3);
  assert.equal(continued.nextAppointment.version, 3);
  assert.equal(continued.nextAppointment.sourceContactId, followup.operationId);
  assert.deepEqual(continued.contacts.find((entry) => entry.id === first.operationId), ceoReport);
  assert.equal(continued.appointmentHistory.find((entry) => entry.appointmentVersion === 2).sourceContactId, first.operationId);
  assert.equal(continued.appointmentHistory.find((entry) => entry.appointmentVersion === 3).sourceContactId, followup.operationId);
  assert.deepEqual(continued.protections, accepted.protections);
});

test("automatic participant protections preserve an existing active whole lock", () => {
  const snapshot = fixture();
  const protection = { organizationId: "org", resourceId: "participant", protectedByStaffId: "prior-ceo", protectedRevision: 1, active: true, fieldPaths: null };
  snapshot.participants[0].protections = [protection];
  snapshot.participants[0].protectionStates = [{ ...protection, version: 5, reason: "נעילה מלאה", createdAt: now, updatedAt: now, unlockedByStaffId: null, unlockedAt: null }];
  const commands = [
    participantCommand("update_participant", { fields: { profileNotes: "עדכון מנכ״ל" } }),
    participantCommand("assign_participant", { expectedVersion: 2, mentorId: "target", coordinatorId: null }),
    participantCommand("set_participant_lifecycle", { expectedVersion: 3, lifecycle: "paused" }),
  ];
  let projected = snapshot;
  for (const [index, command] of commands.entries()) {
    projected = apply(projected, command, true);
    const view = projected.participants[0];
    assert.equal(view.protections.find((entry) => entry.resourceId === "participant").fieldPaths, null, command.type);
    assert.equal(view.protectionStates.find((entry) => entry.resourceId === "participant").fieldPaths, null, command.type);
    assert.equal(view.protectionStates.find((entry) => entry.resourceId === "participant").version, 6 + index, command.type);
  }
});

test("deletion and restoration preserve protection rows and tokens exactly", () => {
  for (const fieldPaths of [null, ["phone"]]) {
    const snapshot = fixture();
    const protection = { organizationId: "org", resourceId: "participant", protectedByStaffId: "prior-ceo", protectedRevision: 1, active: true, fieldPaths };
    snapshot.participants[0].protections = [protection];
    snapshot.participants[0].protectionStates = [{ ...protection, version: 5, reason: "החלטה מפורשת שמורה", createdAt: now, updatedAt: now, unlockedByStaffId: null, unlockedAt: null }];
    const originalStates = structuredClone(snapshot.participants[0].protectionStates);
    const originalProtections = structuredClone(snapshot.participants[0].protections);
    const deleted = apply(snapshot, participantCommand("delete_participant"), true);
    assert.deepEqual(deleted.participants[0].protectionStates, originalStates);
    assert.deepEqual(deleted.participants[0].protections, originalProtections);
    const restored = apply(deleted, participantCommand("restore_participant", { expectedVersion: 2 }), true).participants[0];
    assert.equal(restored.participant.version, 3);
    assert.equal(restored.participant.deletedAt, null);
    assert.deepEqual(restored.protectionStates, originalStates);
    assert.deepEqual(restored.protections, originalProtections);
  }
});

test("an empty create field set never becomes an implicit whole-record lock", () => {
  for (const accepted of [false, true]) {
    const projected = apply(fixture(), { type: "create_participant", operationId: "empty-fields", fields: {} }, accepted);
    const created = projected.participants.find((view) => view.participant.id === "empty-fields");
    assert.deepEqual(created.protections, []);
    assert.deepEqual(created.protectionStates ?? [], []);
  }
});

test("a new completed contact clears the prior appointment warning and retains both history versions", () => {
  for (const accepted of [false, true]) {
    const snapshot = fixture("mentor");
    snapshot.participants[0].nextAppointment.requiresReview = true;
    snapshot.participants[0].contactWarnings = ["appointment_requires_review"];
    const original = structuredClone(snapshot);
    const command = participantCommand("record_contact", { expectedAppointmentVersion: 1, method: "phone", outcome: "completed", occurredAt: "2026-10-25T10:00:00.000Z", nextAppointmentAt: "2026-10-29T09:00:00.000Z", notes: "מחזור ליווי חדש" });
    const projected = apply(snapshot, command, accepted).participants[0];
    assert.equal(projected.nextAppointment.requiresReview, false);
    assert.deepEqual(projected.contactWarnings, []);
    assert.equal(projected.acceptedNextAppointment.requiresReview, true);
    assert.deepEqual(projected.appointmentHistory.map((entry) => entry.appointmentVersion), [2, 1]);
    assert.equal(projected.appointmentHistory.find((entry) => entry.appointmentVersion === 1).requiresReview, true);
    assert.equal(projected.appointmentHistory.find((entry) => entry.appointmentVersion === 2).requiresReview, false);
    assert.equal(projected.appointmentHistory.find((entry) => entry.appointmentVersion === 2).sourceContactId, command.operationId);
    assert.deepEqual(snapshot, original);
  }
});
