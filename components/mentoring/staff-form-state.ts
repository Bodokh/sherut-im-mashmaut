import type { StaffProfile } from "@/lib/mentoring/contracts";
import type { AuthorityCommand } from "@/lib/mentoring/features/authority/contracts";

export interface StaffEditValues {
  displayName: string;
  phone: string;
  role: StaffProfile["role"];
  coordinatorId: string;
  baseVersion: number;
}

export function isPendingStaffPreapproval(member: StaffProfile): boolean {
  return member.localPending === true && !member.active && member.version === 1;
}

export function staffEditValues(member: StaffProfile): StaffEditValues {
  return {
    displayName: member.displayName,
    phone: member.phone ?? "",
    role: member.role,
    coordinatorId: member.coordinatorId ?? "none",
    baseVersion: member.version,
  };
}

/** Keep unchanged authority fields out of ordinary profile updates. */
export function changedStaffFields(
  member: StaffProfile,
  values: StaffEditValues,
): Extract<AuthorityCommand, { type: "update_staff" }>["fields"] {
  const fields: {
    displayName?: string;
    phone?: string | null;
    role?: "mentor" | "coordinator";
    coordinatorId?: string | null;
  } = {};
  const displayName = values.displayName.trim();
  const phone = values.phone.trim() || null;
  if (displayName !== member.displayName) fields.displayName = displayName;
  if (phone !== member.phone) fields.phone = phone;
  if (member.role !== "ceo") {
    if (values.role !== "ceo" && values.role !== member.role)
      fields.role = values.role;
    const coordinatorId = values.role === "mentor" && values.coordinatorId !== "none"
      ? values.coordinatorId
      : null;
    if (coordinatorId !== member.coordinatorId) fields.coordinatorId = coordinatorId;
  }
  return fields;
}
