import {
  canPerformParticipantAction,
  checkWritePreconditions,
  type AccessGrant,
  type Assignment,
  type CeoProtection,
  type ContactEntry,
  type ContactMethod,
  type ContactOutcome,
  type Participant,
  type ParticipantAction,
  type StaffMember,
} from "../../lib/mentoring/domain";
import { planContactRevision } from "../../lib/mentoring/features/contacts/policy";

interface ContactPermissionView {
  readonly participant: Participant;
  readonly assignment: Assignment | null;
  readonly acceptedAssignment?: Assignment | null;
  readonly allowedActions?: readonly ParticipantAction[];
  readonly accessGrants?: readonly AccessGrant[];
  readonly protections: readonly CeoProtection[];
}

type ContactBaselineEntry = Pick<ContactEntry, "id" | "localPending" | "localTimestamp">;

/** Only authoritative contact evidence can anchor a dependent local revision.
 * A newly acknowledged local append still waits for the authoritative GET. */
export function contactHasAcceptedBaseline(
  view: { readonly contactRevisions?: readonly ContactBaselineEntry[] },
  entry: ContactBaselineEntry,
): boolean {
  return (!entry.localPending && !entry.localTimestamp) ||
    Boolean(view.contactRevisions?.some((revision) => revision.id === entry.id &&
      !revision.localPending && !revision.localTimestamp));
}

/** UI affordance only: the server checks the current scope again on acceptance. */
export function contactEditAccess(
  actor: StaffMember,
  view: ContactPermissionView,
  now: string | Date,
): boolean {
  if (actor.active !== true || !actor.id || !actor.organizationId ||
    actor.organizationId !== view.participant.organizationId ||
    !view.participant.id || view.participant.deletedAt != null ||
    !["mentor", "coordinator", "ceo"].includes(actor.role)) return false;
  // Projected assignments/grants are pending writes, never permission evidence.
  if (view.allowedActions !== undefined) return view.allowedActions.includes("edit");
  return canPerformParticipantAction(
    actor,
    view.participant,
    view.acceptedAssignment ?? null,
    "edit",
    [],
    now,
  );
}

/** A field lock does not disable unrelated participant actions. */
export function contactResourceLocked(
  actor: StaffMember,
  view: ContactPermissionView,
  resourceId: string,
  fields?: readonly string[],
): boolean {
  const protection = view.protections.find(
    (item) => item.active && item.resourceId === resourceId,
  );
  if (!protection) return false;
  return !checkWritePreconditions({
    actor,
    resource: {
      id: resourceId,
      organizationId: view.participant.organizationId,
      version: 1,
    },
    expectedVersion: 1,
    hasScope: true,
    protection,
    changedFields: fields,
  }).ok;
}

/** Mentors may correct their own active reports; management can correct any. */
export function canCorrectContact(actor: StaffMember, entry: ContactEntry): boolean {
  return actor.active && actor.organizationId === entry.organizationId &&
    entry.invalidatedAt == null &&
    (actor.role === "ceo" || actor.role === "coordinator" ||
      (actor.role === "mentor" && entry.actorId === actor.id));
}

export function canInvalidateContact(actor: StaffMember, entry: ContactEntry): boolean {
  return actor.active && actor.organizationId === entry.organizationId &&
    entry.invalidatedAt == null &&
    (actor.role === "coordinator" || actor.role === "ceo");
}

/** Keep a queued invalidation's acknowledgement mounted without allowing a new
 * invalidation. Once an authoritative invalidation arrives, no action remains. */
export function contactInvalidationState(
  actor: StaffMember,
  view: { readonly contactRevisions?: readonly ContactBaselineEntry[] },
  entry: ContactEntry,
): "available" | "pending" | "unavailable" {
  if (!contactHasAcceptedBaseline(view, entry)) return "unavailable";
  if (canInvalidateContact(actor, entry)) return "available";
  return entry.invalidatedAt != null && (entry.localPending || entry.localTimestamp) &&
    canInvalidateContact(actor, { ...entry, invalidatedAt: null })
    ? "pending"
    : "unavailable";
}

export function canScheduleContact(view: Pick<ContactPermissionView, "participant">): boolean {
  return view.participant.lifecycle === "active" && view.participant.deletedAt == null;
}

interface ContactCorrectionInput {
  readonly method: ContactMethod;
  readonly outcome: ContactOutcome;
  readonly occurredAt: string;
  readonly nextAppointmentAt?: string;
}

/** Keep schedule changes explicit and exclude hidden stale schedule input. */
export function contactCorrectionPlan(
  contacts: readonly ContactEntry[],
  targetId: string,
  proposed: ContactCorrectionInput,
  now: string,
  lifecycle: Participant["lifecycle"] = "active",
): {
  needsNextAppointment: boolean;
  plan: ReturnType<typeof planContactRevision>;
} {
  const withoutAppointment = {
    method: proposed.method,
    outcome: proposed.outcome,
    occurredAt: proposed.occurredAt,
  };
  const initial = planContactRevision(contacts, targetId, withoutAppointment, now, lifecycle);
  const needsNextAppointment = !initial.ok && initial.field === "nextAppointmentAt";
  return {
    needsNextAppointment,
    plan: needsNextAppointment
      ? planContactRevision(contacts, targetId, proposed, now, lifecycle)
      : initial,
  };
}
