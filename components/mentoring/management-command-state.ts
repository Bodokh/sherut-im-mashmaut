import {
  canPerformParticipantAction,
  type AccessGrant,
  type Assignment,
  type Participant,
  type ParticipantAction,
  type StaffMember,
  type ContactEntry,
  type Review,
} from "../../lib/mentoring/domain";

interface ReviewPermissionView {
  readonly participant: Participant;
  readonly assignment: Assignment | null;
  readonly acceptedAssignment?: Assignment | null;
  readonly allowedActions?: readonly ParticipantAction[];
  readonly accessGrants?: readonly AccessGrant[];
}

/** Pending assignment projections never create permission to review a report. */
export function canReviewParticipant(actor: StaffMember, view: ReviewPermissionView, now: string | Date): boolean {
  if (!actor.active || actor.organizationId !== view.participant.organizationId || view.participant.deletedAt != null) return false;
  if (view.allowedActions !== undefined) return view.allowedActions.includes("approve");
  const assignment = view.acceptedAssignment ?? null;
  return canPerformParticipantAction(actor, view.participant, assignment, "approve", view.accessGrants ?? [], now);
}

/** A known contact's projected correction may be reviewed in the same causal queue. */
export function contactReviewState(contact: Pick<ContactEntry, "localPending" | "localTimestamp" | "invalidatedAt">, review: Review | undefined, acceptedBaseline = false) {
  const pendingContact = contact.localPending === true || contact.localTimestamp === true;
  const pendingCorrection = pendingContact && acceptedBaseline;
  const pendingReview = review?.localPending === true;
  const reviewAwaitingSnapshot = review?.localTimestamp === true;
  const approvalRecorded = review?.decision === "approved";
  const invalidated = Boolean(contact.invalidatedAt);
  const approved = !pendingContact && !pendingReview && !reviewAwaitingSnapshot && !invalidated && approvalRecorded;
  return { approved, approvalRecorded, invalidated, pendingContact, pendingCorrection, pendingReview, reviewAwaitingSnapshot, canSubmit: (!pendingContact || acceptedBaseline) && !pendingReview && !invalidated && !approvalRecorded };
}
