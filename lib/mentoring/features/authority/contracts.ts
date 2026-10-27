import type { AccessGrant, Assignment, CeoProtection } from "../../domain";

export type GrantAction = "view" | "edit" | "approve";
export type ParticipantLifecycle = "active" | "paused" | "closed";

interface Operation { readonly operationId: string }
interface ParticipantOperation { readonly participantId: string; readonly expectedVersion: number; readonly reason: string }

export type AuthorityCommand = Operation & (
  | (ParticipantOperation & { readonly type: "set_access_grant"; readonly staffId: string; readonly expectedGrantVersion: number | null; readonly actions: readonly GrantAction[]; readonly expiresAt: string | null })
  | (ParticipantOperation & { readonly type: "set_ceo_protection"; readonly resourceId: string; readonly expectedProtectionVersion: number | null; readonly active: boolean; readonly fieldPaths: readonly string[] | null })
  | (ParticipantOperation & { readonly type: "set_participant_lifecycle"; readonly lifecycle: ParticipantLifecycle })
  | (ParticipantOperation & { readonly type: "delete_participant" })
  | (ParticipantOperation & { readonly type: "restore_participant" })
  | { readonly type: "update_staff"; readonly staffId: string; readonly expectedVersion: number; readonly fields: { readonly displayName?: string; readonly phone?: string | null; readonly role?: "mentor" | "coordinator"; readonly coordinatorId?: string | null } }
);

export interface GrantView extends AccessGrant {
  readonly version: number;
  readonly grantedByStaffId: string | null;
  readonly revokedByStaffId: string | null;
  readonly revokedAt: string | null;
  readonly reason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Includes inactive rows so an explicit unlock still has a concurrency token. */
export interface ProtectionStateView extends CeoProtection {
  readonly version: number;
  readonly reason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly unlockedByStaffId: string | null;
  readonly unlockedAt: string | null;
}

export interface AssignmentHistoryView extends Assignment {
  readonly endedAt: string | null;
  readonly localPending?: boolean;
  readonly localTimestamp?: boolean;
}

export interface AuthorityHistoryView {
  readonly id: string;
  readonly action: string;
  readonly actorId: string;
  readonly operationId: string;
  readonly createdAt: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface ParticipantDeletionState {
  readonly deletedAt: string | null;
  readonly deletedBy: string | null;
  readonly deletionReason: string | null;
  readonly deletedPreviousLifecycle: ParticipantLifecycle | null;
}

export interface AuthorityExtras extends ParticipantDeletionState {
  readonly accessGrants: readonly GrantView[];
  readonly protectionStates: readonly ProtectionStateView[];
  readonly assignmentHistory: readonly AssignmentHistoryView[];
  readonly authorityHistory: readonly AuthorityHistoryView[];
}

export function isParticipantDeleted(participant: { readonly deletedAt?: string | null }): boolean {
  return participant.deletedAt != null;
}
