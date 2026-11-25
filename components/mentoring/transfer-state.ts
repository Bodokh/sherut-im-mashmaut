import type { StaffProfile } from "../../lib/mentoring/contracts";
import {
  canCoordinatorManageTransfers,
  canViewTransfers,
  type RequestParticipantTransferCommand,
  type RespondParticipantTransferCommand,
  type TransferRequestDecision,
  type TransferRequestStatus,
  type TransferRequestView,
  type TransferableParticipantSummary,
} from "../../lib/mentoring/features/transfers/contracts";

export { canCoordinatorManageTransfers, canViewTransfers };

export const transferStatusLabels: Record<TransferRequestStatus, string> = {
  pending: "ממתינה לאישור",
  approved: "אושרה והועברה",
  rejected: "נדחתה",
};

export interface TransferRequestFormValues {
  participantId: string;
  targetMentorId: string;
  note: string;
}

export interface TransferableTargetItem extends TransferableParticipantSummary {
  readonly hasPendingOutgoing: boolean;
}

function compareRequests(a: TransferRequestView, b: TransferRequestView): number {
  if ((a.status === "pending") !== (b.status === "pending")) {
    return a.status === "pending" ? -1 : 1;
  }
  return b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
}

export function incomingTransferRequests(
  actor: Pick<StaffProfile, "id" | "role">,
  requests: readonly TransferRequestView[] = [],
): readonly TransferRequestView[] {
  if (actor.role === "coordinator") {
    return requests.filter((item) => item.currentCoordinatorId === actor.id).sort(compareRequests);
  }
  if (actor.role === "ceo") {
    return [...requests].sort(compareRequests);
  }
  return [];
}

export function outgoingTransferRequests(
  actor: Pick<StaffProfile, "id" | "role">,
  requests: readonly TransferRequestView[] = [],
): readonly TransferRequestView[] {
  if (actor.role !== "coordinator") return [];
  return requests.filter((item) => item.requesterCoordinatorId === actor.id).sort(compareRequests);
}

export function pendingIncomingTransferCount(
  actor: Pick<StaffProfile, "id" | "role"> | null | undefined,
  requests: readonly TransferRequestView[] = [],
): number {
  if (!actor) return 0;
  if (actor.role === "coordinator") {
    return requests.filter((item) => item.status === "pending" && item.currentCoordinatorId === actor.id).length;
  }
  if (actor.role === "ceo") {
    return requests.filter((item) => item.status === "pending").length;
  }
  return 0;
}

export function ownActiveMentors(
  actor: Pick<StaffProfile, "id" | "role" | "organizationId">,
  staff: readonly StaffProfile[],
): readonly StaffProfile[] {
  if (actor.role !== "coordinator") return [];
  return staff.filter(
    (member) =>
      member.active
      && !member.localPending
      && member.role === "mentor"
      && member.organizationId === actor.organizationId
      && member.coordinatorId === actor.id,
  );
}

export function availableTransferTargets(
  actor: Pick<StaffProfile, "id" | "role">,
  transferableParticipants: readonly TransferableParticipantSummary[] = [],
  requests: readonly TransferRequestView[] = [],
): readonly TransferableTargetItem[] {
  if (actor.role !== "coordinator") return [];
  const pendingIds = new Set(
    requests
      .filter((item) => item.status === "pending" && item.requesterCoordinatorId === actor.id)
      .map((item) => item.participantId),
  );
  return transferableParticipants
    .filter((item) => item.currentCoordinatorId !== actor.id)
    .map((item) => ({
      ...item,
      hasPendingOutgoing: pendingIds.has(item.participantId),
    }));
}

export function buildTransferRequestCommand(
  values: TransferRequestFormValues,
  targets: readonly TransferableTargetItem[],
  mentors: readonly Pick<StaffProfile, "id">[],
):
  | { readonly ok: true; readonly payload: Omit<RequestParticipantTransferCommand, "operationId"> }
  | { readonly ok: false; readonly issue: { readonly field: "participantId" | "targetMentorId" | "note"; readonly message: string } } {
  const participantId = values.participantId.trim();
  if (!participantId) {
    return { ok: false, issue: { field: "participantId", message: "יש לבחור חניכה להעברת שיוך." } };
  }
  const target = targets.find((item) => item.participantId === participantId);
  if (!target) {
    return { ok: false, issue: { field: "participantId", message: "יש לבחור חניכה פעילה המשויכת לרכזת אחרת." } };
  }
  if (target.assignmentProtected) {
    return { ok: false, issue: { field: "participantId", message: "שיוך החניכה נעול בהגנת מנכ״ל ואינו ניתן להעברה ללא אישור מנכ״ל." } };
  }
  if (target.hasPendingOutgoing) {
    return { ok: false, issue: { field: "participantId", message: "כבר קיימת בקשת העברה ממתינה שלך עבור חניכה זו." } };
  }
  const targetMentorId = values.targetMentorId.trim();
  if (!targetMentorId || !mentors.some((mentor) => mentor.id === targetMentorId)) {
    return { ok: false, issue: { field: "targetMentorId", message: "יש לבחור חונכת פעילה מתוך הצוות שלך." } };
  }
  const note = values.note.trim();
  if (note.length > 2_000) {
    return { ok: false, issue: { field: "note", message: "אורך ההערה יכול להכיל עד 2,000 תווים." } };
  }
  return {
    ok: true,
    payload: {
      type: "request_participant_transfer",
      participantId,
      targetMentorId,
      ...(note ? { note } : {}),
    },
  };
}

export function buildTransferResponseCommand(
  transferRequestId: string,
  decision: TransferRequestDecision,
  rawNote: string,
):
  | { readonly ok: true; readonly payload: Omit<RespondParticipantTransferCommand, "operationId"> }
  | { readonly ok: false; readonly issue: { readonly field: "note"; readonly message: string } } {
  const note = rawNote.trim();
  if (note.length > 2_000) {
    return { ok: false, issue: { field: "note", message: "אורך ההערה יכול להכיל עד 2,000 תווים." } };
  }
  return {
    ok: true,
    payload: {
      type: "respond_participant_transfer",
      transferRequestId,
      decision,
      ...(note ? { note } : {}),
    },
  };
}
