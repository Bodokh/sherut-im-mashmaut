import type { ServiceType, StaffMember } from "../../domain";

export type TransferRequestStatus = "pending" | "approved" | "rejected";
export type TransferRequestDecision = "approved" | "rejected";
export type TransferEmailStatus = "queued" | "accepted" | "failed" | "cancelled";

export interface TransferRequestView {
  readonly id: string;
  readonly organizationId: string;
  readonly participantId: string;
  readonly participantName: string;
  readonly sourceAssignmentId: string;
  readonly requesterCoordinatorId: string;
  readonly currentCoordinatorId: string;
  readonly targetMentorId: string;
  readonly status: TransferRequestStatus;
  readonly requestNote: string | null;
  readonly responseNote: string | null;
  readonly respondedByStaffId: string | null;
  readonly resultingAssignmentId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly respondedAt: string | null;
  readonly emailStatus?: TransferEmailStatus | null;
}

/**
 * Minimal, redacted directory entry enabling a coordinator to request transfer of
 * an already-assigned mentee held by another coordinator without exposing phone,
 * profile notes, contact logs, or tracking cards.
 */
export interface TransferableParticipantSummary {
  readonly participantId: string;
  readonly displayName: string;
  readonly serviceType: ServiceType | null;
  readonly currentCoordinatorId: string;
  readonly currentAssignmentId: string;
  readonly assignmentProtected: boolean;
}

export interface RequestParticipantTransferCommand {
  readonly type: "request_participant_transfer";
  readonly operationId: string;
  readonly participantId: string;
  readonly targetMentorId: string;
  readonly note?: string | null;
}

export interface RespondParticipantTransferCommand {
  readonly type: "respond_participant_transfer";
  readonly operationId: string;
  readonly transferRequestId: string;
  readonly decision: TransferRequestDecision;
  readonly note?: string | null;
}

export type TransferCommand = RequestParticipantTransferCommand | RespondParticipantTransferCommand;

export interface WorkspaceTransferSlice {
  readonly transferRequests?: readonly TransferRequestView[];
  readonly transferableParticipants?: readonly TransferableParticipantSummary[];
}

export function canViewTransfers(actor: Pick<StaffMember, "active" | "role"> | null | undefined): boolean {
  return Boolean(actor?.active && (actor.role === "coordinator" || actor.role === "ceo"));
}

export function canCoordinatorManageTransfers(actor: Pick<StaffMember, "active" | "role"> | null | undefined): boolean {
  return Boolean(actor?.active && actor.role === "coordinator");
}
