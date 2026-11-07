import type { StaffProfile } from "./contracts";

export function canSendStaffInvite(actor: StaffProfile, member: StaffProfile | undefined): member is StaffProfile & { email: string } {
  return Boolean(actor.active && member?.active && member.email && member.organizationId === actor.organizationId
    && (actor.role === "ceo" || (actor.role === "coordinator" && member.role === "mentor" && member.coordinatorId === actor.id)));
}
