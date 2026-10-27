import type { MentoringCommand, ParticipantView, StaffProfile, WorkspaceSnapshot } from "./contracts";
import { applyRecordedContact, canPerformParticipantAction, type CeoProtection, type ContactEntry, type Review } from "./domain/index";
import type { OfflineOperation } from "./offline";
import type { AuthorityCommand, AuthorityExtras, GrantView, ProtectionStateView } from "./features/authority/contracts";
import type { AppointmentChange, ContactCommand, ContactHistory, ContactRevision } from "./features/contacts/contracts";
import { invalidationNeedsAppointmentReview, planContactRevision } from "./features/contacts/policy";
import type { MonthlyReview, MonthlyReviewHistory, OrganizationSettings, OversightCommand } from "./features/oversight/contracts";

type ProjectionCommand = MentoringCommand | ContactCommand | AuthorityCommand | OversightCommand;
type View = ParticipantView & Partial<ContactHistory & AuthorityExtras> & { readonly participant: ParticipantView["participant"] & { readonly localCreatedByStaffId?: string } };
type Snapshot = WorkspaceSnapshot & { readonly settings?: OrganizationSettings; readonly monthlyReviews?: readonly MonthlyReview[] };

function protectedResource(view: View, resourceId: string, actor: StaffProfile, fields?: readonly string[]): boolean {
  return actor.role !== "ceo" && view.protections.some((protection) => protection.active && protection.resourceId === resourceId
    && (!fields || !protection.fieldPaths?.length || protection.fieldPaths.some((path) => fields.some((field) => field === path || path.startsWith(`${field}.`) || field.startsWith(`${path}.`)))));
}

function automaticProtection(view: View, actor: StaffProfile, resourceId: string, revision: number, accepted: boolean, at: string, fields?: readonly string[]): View {
  if (actor.role !== "ceo" || (fields !== undefined && fields.length === 0)) return view;
  const previous = view.protections.find((entry) => entry.resourceId === resourceId);
  const protection: CeoProtection = { organizationId: actor.organizationId, resourceId, protectedByStaffId: actor.id, protectedRevision: revision, active: true,
    ...(fields ? { fieldPaths: previous?.active && !previous.fieldPaths?.length ? previous.fieldPaths : [...new Set([...(previous?.active ? previous.fieldPaths ?? [] : []), ...fields])] } : { fieldPaths: null }) };
  const previousState = view.protectionStates?.find((entry) => entry.resourceId === resourceId);
  const base: ProtectionStateView = previousState ?? { organizationId: actor.organizationId, resourceId, protectedByStaffId: previous?.protectedByStaffId ?? actor.id,
    protectedRevision: previous?.protectedRevision ?? revision, active: previous?.active ?? false, fieldPaths: previous?.fieldPaths ?? null,
    version: previous ? 1 : 0, reason: null, createdAt: at, updatedAt: at, unlockedByStaffId: null, unlockedAt: null };
  const state: ProtectionStateView = { ...base, version: base.version + 1, ...(accepted ? { ...protection, reason: null, updatedAt: at, unlockedByStaffId: null, unlockedAt: null } : {}) };
  return { ...view, protectionStates: [...(view.protectionStates ?? []).filter((entry) => entry.resourceId !== resourceId), state],
    ...(accepted ? { protections: [...view.protections.filter((entry) => entry.resourceId !== resourceId), protection] } : {}) };
}

function contactRevision(view: View, entry: ContactEntry, kind: ContactRevision["changeKind"], actor: StaffProfile, at: string, reason: string | null, operationId: string | null): ContactRevision {
  return { ...entry, revisedByStaffId: kind === "initial" ? entry.actorId : actor.id, revisedAt: kind === "initial" ? entry.receivedAt : at, reason, changeKind: kind, operationId,
    review: view.reviews.find((review) => review.contactId === entry.id && review.revision === entry.revision) ?? null };
}

function withRevision(view: View, entry: ContactRevision): View {
  const history = view.contactRevisions ?? [];
  return history.some((previous) => previous.id === entry.id && previous.revision === entry.revision) ? view : { ...view, contactRevisions: [entry, ...history] };
}

function changeAppointment(view: View, actor: StaffProfile, operation: OfflineOperation, kind: AppointmentChange["changeKind"], reason: string | null,
  input: { scheduledAt?: string; sourceContactId?: string; requiresReview?: boolean }, accepted: boolean): View {
  const previous = view.nextAppointment;
  const next = previous ? { ...previous, ...input, version: previous.version + 1 } : input.scheduledAt && view.assignment ? {
    id: operation.command.operationId, organizationId: actor.organizationId, participantId: view.participant.id,
    mentorId: view.assignment.mentorId, scheduledAt: input.scheduledAt, sourceContactId: input.sourceContactId ?? null, requiresReview: false, version: 1,
  } : null;
  const history = [...(view.appointmentHistory ?? [])];
  const append = (appointment: NonNullable<View["nextAppointment"]>, changeKind: AppointmentChange["changeKind"], changeReason: string | null) => {
    if (history.some((entry) => entry.appointmentId === appointment.id && entry.appointmentVersion === appointment.version)) return;
    history.unshift({ id: `${operation.command.operationId}:appointment:${appointment.version}`, appointmentId: appointment.id, scheduledAt: appointment.scheduledAt,
      appointmentVersion: appointment.version, mentorId: appointment.mentorId, sourceContactId: appointment.sourceContactId ?? null, requiresReview: appointment.requiresReview === true,
      changedByStaffId: actor.id, changedAt: operation.queuedAt, reason: changeReason, changeKind, localPending: !accepted, localTimestamp: true });
  };
  if (previous) append(previous, "prior_state", null);
  if (next) append(next, kind, reason);
  return { ...view, acceptedNextAppointment: "acceptedNextAppointment" in view ? view.acceptedNextAppointment : previous,
    nextAppointment: next, appointmentHistory: history, contactWarnings: next?.requiresReview ? ["appointment_requires_review"] : [] };
}

function reviseContact(view: View, command: Extract<ContactCommand, { type: "revise_contact" | "invalidate_contact" }>, actor: StaffProfile, operation: OfflineOperation, accepted: boolean): View {
  const entry = view.contacts.find((item) => item.id === command.contactId);
  if (!entry || entry.revision !== command.expectedRevision || entry.invalidatedAt != null || command.expectedAppointmentVersion !== (view.nextAppointment?.version ?? null)) return view;
  if (actor.role === "mentor" && (command.type === "invalidate_contact" || entry.actorId !== actor.id)) return view;
  if (protectedResource(view, entry.id, actor)) return view;
  let effect: "replace" | "retain" | "retain_with_warning" = invalidationNeedsAppointmentReview(view.contacts, entry.id) ? "retain_with_warning" : "retain";
  if (command.type === "revise_contact") {
    const plan = planContactRevision(view.contacts, entry.id, command, operation.queuedAt, view.participant.lifecycle);
    if (!plan.ok || (plan.appointmentEffect === "replace" && !view.assignment)) return view;
    effect = plan.appointmentEffect;
  }
  if (effect !== "retain" && protectedResource(view, view.participant.id, actor, ["appointment"])) return view;
  const changed: ContactEntry = command.type === "revise_contact" ? { ...entry, method: command.method, outcome: command.outcome, occurredAt: command.occurredAt, notes: command.notes, revision: entry.revision + 1, localPending: !accepted, localTimestamp: true }
    : { ...entry, revision: entry.revision + 1, invalidatedAt: operation.queuedAt, localPending: !accepted, localTimestamp: true };
  let next = withRevision(view, contactRevision(view, entry, "initial", actor, operation.queuedAt, null, null));
  next = withRevision(next, contactRevision(view, changed, command.type === "revise_contact" ? "correction" : "invalidation", actor, operation.queuedAt, command.reason, command.operationId));
  next = { ...next, contacts: next.contacts.map((item) => item.id === entry.id ? changed : item), participant: { ...next.participant, version: next.participant.version + 1 } };
  if (effect !== "retain") {
    next = changeAppointment(next, actor, operation, command.type === "revise_contact" ? "contact_correction" : "contact_invalidation", command.reason,
      effect === "replace" && command.type === "revise_contact" ? { scheduledAt: command.nextAppointmentAt, sourceContactId: entry.id, requiresReview: false } : { requiresReview: true }, accepted);
    next = automaticProtection(next, actor, view.participant.id, next.participant.version, accepted, operation.queuedAt, ["appointment"]);
  }
  return automaticProtection(next, actor, entry.id, changed.revision, accepted, operation.queuedAt);
}

function projectGrant(view: View, command: Extract<AuthorityCommand, { type: "set_access_grant" }>, actor: StaffProfile, at: string, accepted: boolean): View {
  const previous = view.accessGrants?.find((entry) => entry.staffId === command.staffId);
  if ((previous?.version ?? null) !== command.expectedGrantVersion) return view;
  const active = command.actions.length > 0;
  const base: GrantView = previous ?? { id: command.operationId, organizationId: actor.organizationId, staffId: command.staffId, participantId: view.participant.id,
    actions: [], active: false, expiresAt: null, version: 0, grantedByStaffId: null, revokedByStaffId: null, revokedAt: null, reason: null, createdAt: at, updatedAt: at };
  // A concurrency token is a pending intent; actions stay authoritative until acknowledgement.
  const grant: GrantView = { ...base, version: base.version + 1, ...(accepted ? { actions: [...command.actions], active, expiresAt: command.expiresAt,
    grantedByStaffId: active ? actor.id : base.grantedByStaffId, revokedByStaffId: active ? null : actor.id, revokedAt: active ? null : at, reason: command.reason, updatedAt: at } : {}) };
  return { ...view, participant: { ...view.participant, version: view.participant.version + 1 }, accessGrants: [...(view.accessGrants ?? []).filter((entry) => entry.staffId !== command.staffId), grant] };
}

function projectProtection(view: View, command: Extract<AuthorityCommand, { type: "set_ceo_protection" }>, actor: StaffProfile, at: string, accepted: boolean): View {
  const previous = view.protectionStates?.find((entry) => entry.resourceId === command.resourceId);
  if ((previous?.version ?? null) !== command.expectedProtectionVersion) return view;
  const resourceRevision = command.resourceId === view.participant.id ? view.participant.version + 1 : view.contacts.find((entry) => entry.id === command.resourceId)?.revision;
  if (resourceRevision === undefined) return view;
  const protection = view.protections.find((entry) => entry.resourceId === command.resourceId);
  const base: ProtectionStateView = previous ?? { organizationId: actor.organizationId, resourceId: command.resourceId, protectedByStaffId: protection?.protectedByStaffId ?? actor.id,
    protectedRevision: protection?.protectedRevision ?? resourceRevision, active: protection?.active ?? false, fieldPaths: protection?.fieldPaths ?? null, version: 0,
    reason: null, createdAt: at, updatedAt: at, unlockedByStaffId: null, unlockedAt: null };
  const state: ProtectionStateView = { ...base, version: base.version + 1, ...(accepted ? { protectedByStaffId: actor.id, protectedRevision: resourceRevision,
    active: command.active, fieldPaths: command.fieldPaths, reason: command.reason, updatedAt: at, unlockedByStaffId: command.active ? null : actor.id, unlockedAt: command.active ? null : at } : {}) };
  return { ...view, participant: { ...view.participant, version: view.participant.version + 1 },
    protectionStates: [...(view.protectionStates ?? []).filter((entry) => entry.resourceId !== command.resourceId), state],
    ...(accepted ? { protections: [...view.protections.filter((entry) => entry.resourceId !== command.resourceId), state] } : {}) };
}

function projectParticipant(view: View, command: ProjectionCommand, actor: StaffProfile, operation: OfflineOperation, accepted: boolean): View {
  if (!("participantId" in command) || view.participant.id !== command.participantId || view.participant.organizationId !== actor.organizationId) return view;
  const at = operation.queuedAt;
  if (command.type === "review_contact") {
    if (view.deletedAt || view.participant.deletedAt || actor.role === "mentor" || protectedResource(view, command.contactId, actor) || !view.contacts.some((entry) => entry.id === command.contactId && entry.revision === command.revision && entry.invalidatedAt == null)) return view;
    const review: Review = { contactId: command.contactId, revision: command.revision, decision: command.decision, reviewedByStaffId: actor.id, reviewedAt: at, localPending: !accepted, localTimestamp: true };
    const next = { ...view, reviews: [review, ...view.reviews.filter((item) => item.contactId !== command.contactId || item.revision !== command.revision || (!item.localPending && !item.localTimestamp))],
      reviewEvents: [{ ...review, id: command.operationId, participantId: command.participantId, operationId: command.operationId }, ...(view.reviewEvents ?? [])] };
    return automaticProtection(next, actor, command.contactId, command.revision, accepted, at);
  }
  if (!("expectedVersion" in command) || view.participant.version !== command.expectedVersion) return view;
  if (command.type === "restore_participant") {
    if (actor.role !== "ceo" || !(view.deletedAt ?? view.participant.deletedAt)) return view;
    const next = { ...view, participant: { ...view.participant, lifecycle: view.deletedPreviousLifecycle ?? view.participant.lifecycle, deletedAt: null, version: view.participant.version + 1 },
      deletedAt: null, deletedBy: null, deletionReason: null, deletedPreviousLifecycle: null };
    return next;
  }
  if (view.deletedAt || view.participant.deletedAt) return view;
  if (["record_contact", "assign_participant", "reschedule_appointment"].includes(command.type) && view.participant.lifecycle !== "active") return view;
  if (command.type === "update_participant") {
    if (protectedResource(view, view.participant.id, actor, Object.keys(command.fields))) return view;
    const next = { ...view, participant: { ...view.participant, ...command.fields, version: view.participant.version + 1 } };
    return automaticProtection(next, actor, view.participant.id, next.participant.version, accepted, at, Object.keys(command.fields));
  }
  if (command.type === "assign_participant") {
    if (actor.role === "mentor" || (view.assignment && actor.role !== "ceo") || protectedResource(view, view.participant.id, actor, ["assignment"])) return view;
    const acceptedAssignment = "acceptedAssignment" in view ? view.acceptedAssignment ?? null : view.assignment;
    const hasAcceptedEdit = view.allowedActions !== undefined ? view.allowedActions.includes("edit") : canPerformParticipantAction(actor, view.participant, acceptedAssignment, "edit", view.accessGrants ?? [], at);
    const ownsCreatedParticipant = view.allowedActions === undefined && actor.role === "coordinator" && !acceptedAssignment && (view.participant.createdBy === actor.id || view.participant.localCreatedByStaffId === actor.id);
    if (!accepted && !hasAcceptedEdit && !ownsCreatedParticipant) return view;
    const assignment = { id: command.operationId, organizationId: actor.organizationId, participantId: command.participantId, mentorId: command.mentorId,
      coordinatorId: command.coordinatorId, assignedAt: at, followupAnchorAt: view.assignment?.followupAnchorAt ?? view.assignment?.assignedAt ?? at, version: (view.assignment?.version ?? 0) + 1 };
    const next = { ...view, participant: { ...view.participant, version: view.participant.version + 1 }, assignment,
      acceptedAssignment: accepted ? assignment : acceptedAssignment,
      acceptedNextAppointment: "acceptedNextAppointment" in view ? view.acceptedNextAppointment : view.nextAppointment,
      nextAppointment: view.nextAppointment ? { ...view.nextAppointment, mentorId: command.mentorId, version: view.nextAppointment.version + 1 } : null,
      ...(view.assignmentHistory ? { assignmentHistory: [{ ...assignment, endedAt: null, localPending: !accepted, localTimestamp: true },
        ...view.assignmentHistory.map((entry) => entry.endedAt == null ? { ...entry, endedAt: at, localPending: !accepted, localTimestamp: true } : entry)] } : {}) };
    return automaticProtection(next, actor, view.participant.id, next.participant.version, accepted, at, ["assignment"]);
  }
  if (command.type === "record_contact") {
    if (command.expectedAppointmentVersion !== (view.nextAppointment?.version ?? null)) return view;
    if (command.manualColor !== undefined && command.manualColor !== view.manualColor && protectedResource(view, view.participant.id, actor, ["manualColor"])) return view;
    if (command.outcome === "completed" && protectedResource(view, view.participant.id, actor, ["appointment"])) return view;
    const entry: ContactEntry = { id: command.operationId, organizationId: actor.organizationId, participantId: command.participantId, actorId: actor.id,
      method: command.method, outcome: command.outcome, occurredAt: command.occurredAt, receivedAt: at, notes: command.notes, revision: 1, invalidatedAt: null, localPending: !accepted, localTimestamp: true };
    const transition = applyRecordedContact({ participant: view.participant, assignment: view.assignment, contacts: view.contacts, nextAppointment: view.nextAppointment, manualColor: view.manualColor }, { entry, nextAppointment: command.outcome === "completed" && command.nextAppointmentAt && view.assignment ? {
      id: view.nextAppointment?.id ?? command.operationId, organizationId: actor.organizationId, participantId: command.participantId, mentorId: view.assignment.mentorId,
      scheduledAt: command.nextAppointmentAt, version: (view.nextAppointment?.version ?? 0) + 1, sourceContactId: command.operationId, requiresReview: false,
    } : view.nextAppointment, expectedAppointmentVersion: command.expectedAppointmentVersion, manualColor: command.manualColor }, at);
    if (!transition.ok) return view;
    const appointmentView = command.outcome === "completed" && command.nextAppointmentAt ? changeAppointment(view, actor, operation, "contact_recorded", null,
      { scheduledAt: command.nextAppointmentAt, sourceContactId: command.operationId, requiresReview: false }, accepted) : view;
    let next = withRevision({ ...appointmentView, contacts: transition.state.contacts, nextAppointment: transition.state.nextAppointment, manualColor: transition.state.manualColor,
      participant: { ...view.participant, version: view.participant.version + 1 }, manualColorAt: command.manualColor && command.manualColor !== view.manualColor ? at : view.manualColorAt }, contactRevision(view, entry, "initial", actor, at, null, command.operationId));
    next = automaticProtection(next, actor, entry.id, 1, accepted, at);
    if (command.manualColor && command.manualColor !== view.manualColor) {
      next = { ...next, manualColorHistory: [{ id: command.operationId, color: command.manualColor, setByStaffId: actor.id, setAt: at, reason: null, participantVersion: next.participant.version, localPending: !accepted, localTimestamp: true }, ...(view.manualColorHistory ?? [])] };
      next = automaticProtection(next, actor, view.participant.id, next.participant.version, accepted, at, ["manualColor"]);
    }
    return next;
  }
  if (command.type === "revise_contact" || command.type === "invalidate_contact") return reviseContact(view, command, actor, operation, accepted);
  if (command.type === "reschedule_appointment") {
    if (!view.nextAppointment || command.expectedAppointmentVersion !== view.nextAppointment.version || protectedResource(view, view.participant.id, actor, ["appointment"]) || !Number.isFinite(Date.parse(command.scheduledAt)) || Date.parse(command.scheduledAt) <= Date.parse(at)) return view;
    const next = changeAppointment({ ...view, participant: { ...view.participant, version: view.participant.version + 1 } }, actor, operation, "rescheduled", command.reason, { scheduledAt: command.scheduledAt, requiresReview: false }, accepted);
    return automaticProtection(next, actor, view.participant.id, next.participant.version, accepted, at, ["appointment"]);
  }
  if (command.type === "set_manual_color") {
    if (command.color === view.manualColor || protectedResource(view, view.participant.id, actor, ["manualColor"])) return view;
    const next = { ...view, participant: { ...view.participant, version: view.participant.version + 1 }, manualColor: command.color, manualColorAt: at,
      manualColorHistory: [{ id: command.operationId, color: command.color, setByStaffId: actor.id, setAt: at, reason: command.reason ?? null, participantVersion: view.participant.version + 1, localPending: !accepted, localTimestamp: true }, ...(view.manualColorHistory ?? [])] };
    return automaticProtection(next, actor, view.participant.id, next.participant.version, accepted, at, ["manualColor"]);
  }
  if (actor.role !== "ceo") return view;
  if (command.type === "set_access_grant") return projectGrant(view, command, actor, at, accepted);
  if (command.type === "set_ceo_protection") return projectProtection(view, command, actor, at, accepted);
  if (command.type === "set_participant_lifecycle" || command.type === "delete_participant") {
    const next = { ...view, participant: { ...view.participant, version: view.participant.version + 1,
      ...(command.type === "set_participant_lifecycle" ? { lifecycle: command.lifecycle } : { deletedAt: at }) },
      ...(command.type === "delete_participant" ? { deletedAt: at, deletedBy: actor.id, deletionReason: command.reason, deletedPreviousLifecycle: view.participant.lifecycle } : {}) };
    return command.type === "set_participant_lifecycle" ? automaticProtection(next, actor, view.participant.id, next.participant.version, accepted, at, ["lifecycle"]) : next;
  }
  return view;
}

/** Pending projections keep the accepted identity, role and access controls intact. */
export function applyOptimisticCommand(snapshot: WorkspaceSnapshot, operation: OfflineOperation, accepted = false): WorkspaceSnapshot {
  accepted = accepted === true;
  if (operation.status !== "pending") return snapshot;
  const current = snapshot as Snapshot;
  const command = operation.command as ProjectionCommand;
  const actor = current.actor;
  const at = operation.queuedAt;
  if (!actor.active) return snapshot;
  if (command.type === "create_staff") {
    if (actor.role === "mentor" || (actor.role === "coordinator" && (command.fields.role !== "mentor" || command.fields.coordinatorId !== actor.id)) || current.staff.some((entry) => entry.id === command.operationId)) return snapshot;
    const staff: StaffProfile = { ...command.fields, id: command.operationId, organizationId: actor.organizationId, authUserId: "", active: accepted, version: 1, smsMuted: false, localPending: !accepted };
    return { ...current, staff: [...current.staff, staff] };
  }
  if (command.type === "set_staff_active" || command.type === "update_staff") {
    if (actor.role !== "ceo") return snapshot;
    const staff = current.staff.map((entry) => entry.id !== command.staffId || entry.version !== command.expectedVersion ? entry : {
      ...entry, version: entry.version + 1, localPending: !accepted,
      ...(command.type === "set_staff_active" ? accepted ? { active: command.active } : {} : {
        ...(command.fields.displayName !== undefined ? { displayName: command.fields.displayName } : {}),
        ...(command.fields.phone !== undefined ? { phone: command.fields.phone } : {}),
        ...(accepted ? command.fields : {}),
      }),
    });
    // The actor is refreshed from the central identity endpoint, never invented from a staff edit.
    return { ...current, staff };
  }
  if (command.type === "create_participant") {
    if (actor.role === "mentor" || current.participants.some((view) => view.participant.id === command.operationId)) return snapshot;
    const fields = command.fields;
    let view: View = { participant: { id: command.operationId, organizationId: actor.organizationId, displayName: fields.displayName ?? "", phone: fields.phone ?? null,
      serviceType: fields.serviceType ?? null, servicePlace: fields.servicePlace ?? null, serviceRole: fields.serviceRole ?? null, profileNotes: fields.profileNotes ?? null,
      lifecycle: "active", version: 1, createdAt: at, createdBy: actor.id, localPending: !accepted, localCreatedByStaffId: actor.id },
      allowedActions: actor.role === "ceo" ? ["view", "edit", "approve", "delete"] : ["view", "edit", "approve"],
      assignment: null, acceptedAssignment: null, nextAppointment: null, contacts: [], reviews: [], manualColor: null, manualColorAt: null, protections: [] };
    view = automaticProtection(view, actor, command.operationId, 1, accepted, at, Object.keys(fields));
    return { ...current, participants: [...current.participants, view] };
  }
  if (command.type === "set_sms_muted") {
    if (actor.role !== "ceo") return snapshot;
    const actorProfile = current.staff.find((entry) => entry.id === actor.id && entry.organizationId === actor.organizationId);
    const version = Math.max(actor.version, actorProfile?.version ?? 0) + 1;
    return { ...current, actor: { ...actor, smsMuted: command.muted, version },
      staff: current.staff.map((entry) => entry.id === actor.id && entry.organizationId === actor.organizationId
        ? { ...entry, smsMuted: command.muted, version, localPending: !accepted } : entry) };
  }
  if (command.type === "resolve_conflict") return accepted && actor.role === "ceo" ? { ...current, conflicts: current.conflicts.map((entry) => entry.id === command.conflictId ? { ...entry, resolvedAt: at } : entry) } : snapshot;
  if (command.type === "update_organization_settings") {
    if (actor.role !== "ceo" || current.settings?.version !== command.expectedVersion) return snapshot;
    // This changes displayed policy only; the signed lease is never extended locally.
    return { ...current, settings: { ...current.settings, ...command.settings, version: current.settings.version + 1, updatedAt: at, updatedBy: actor.id } };
  }
  if (command.type === "save_monthly_review") {
    if (actor.role === "mentor" || (actor.role === "coordinator" && command.scopeStaffId !== actor.id)) return snapshot;
    const previous = current.monthlyReviews?.find((entry) => entry.month === command.month && entry.scopeStaffId === command.scopeStaffId);
    if ((previous?.version ?? null) !== command.expectedVersion || (previous?.ceoProtected && actor.role !== "ceo")) return snapshot;
    const revision: MonthlyReviewHistory = { version: (previous?.version ?? 0) + 1, summary: command.summary, reviewed: command.reviewed,
      updatedAt: at, updatedBy: actor.id, updatedByName: actor.displayName, ceoProtected: previous?.ceoProtected === true || (accepted && actor.role === "ceo") };
    const review: MonthlyReview = { ...revision, id: previous?.id ?? command.operationId, organizationId: actor.organizationId, month: command.month,
      scopeStaffId: command.scopeStaffId, history: [revision, ...(previous?.history ?? [])] };
    return { ...current, monthlyReviews: [...(current.monthlyReviews ?? []).filter((entry) => entry.id !== review.id), review] };
  }
  return { ...current, participants: current.participants.map((view) => {
    const projected = projectParticipant(view, command, actor, operation, accepted);
    return projected === view ? view : { ...projected, participant: { ...projected.participant, localPending: !accepted } };
  }) };
}
