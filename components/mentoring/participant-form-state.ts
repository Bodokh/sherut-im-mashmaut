import type { ParticipantFields, ParticipantProfile, ParticipantView, StaffProfile } from "../../lib/mentoring/contracts";
import type { CeoProtection } from "../../lib/mentoring/domain";
import { normalizePhoneNumber } from "../../lib/phone";

export const participantFieldNames = ["displayName", "phone", "serviceType", "servicePlace", "serviceRole", "profileNotes"] as const;
export type ParticipantFieldName = (typeof participantFieldNames)[number];

export interface ParticipantFormValues {
  displayName: string;
  phone: string;
  serviceType: string;
  servicePlace: string;
  serviceRole: string;
  profileNotes: string;
  baseVersion: number | null;
}

export function participantInputError(values: ParticipantFormValues, locked: (field: ParticipantFieldName) => boolean = () => false): { field: ParticipantFieldName; message: string } | null {
  const limits: readonly [ParticipantFieldName, number, string][] = [["displayName", 160, "שם החניכה"], ["servicePlace", 240, "מקום השירות"], ["serviceRole", 240, "התפקיד בשירות"], ["profileNotes", 8000, "מידע נוסף לליווי"]];
  for (const [field, limit, label] of limits) if (!locked(field) && values[field].trim().length > limit) return { field, message: `${label} יכול להכיל עד ${limit.toLocaleString("en-US")} תווים. יש לקצר את הטקסט.` };
  if (!locked("serviceType") && !["unknown", "national", "military"].includes(values.serviceType)) return { field: "serviceType", message: "יש לבחור סוג שירות מהרשימה." };
  if (!locked("phone") && values.phone.trim() && !normalizePhoneNumber(values.phone)) return { field: "phone", message: "יש להזין מספר טלפון תקין עם קידומת מדינה, או למחוק את המספר." };
  return null;
}

export function participantFormFields(values: ParticipantFormValues): ParticipantFields {
  return {
    displayName: values.displayName.trim(),
    phone: normalizePhoneNumber(values.phone) ?? (values.phone.trim() || null),
    serviceType: values.serviceType === "national" || values.serviceType === "military" ? values.serviceType : null,
    servicePlace: values.servicePlace.trim() || null,
    serviceRole: values.serviceRole.trim() || null,
    profileNotes: values.profileNotes.trim() || null,
  };
}

/** An empty create input is unknown, not a CEO-authored value to protect. */
export function createdParticipantFields(values: ParticipantFormValues): ParticipantFields {
  return Object.fromEntries(Object.entries(participantFormFields(values)).filter(([, value]) => value !== null && value !== ""));
}

export function fieldIsProtected(actor: Pick<StaffProfile, "role" | "organizationId">, participantId: string, protections: readonly CeoProtection[], field: string): boolean {
  if (actor.role === "ceo") return false;
  return protections.some((protection) => {
    if (!protection.active || protection.resourceId !== participantId || protection.organizationId !== actor.organizationId) return false;
    return !protection.fieldPaths?.length || protection.fieldPaths.some((path) => path === field || path.startsWith(`${field}.`) || field.startsWith(`${path}.`));
  });
}

/** Only changed, currently editable keys enter the command's protection check. */
export function changedParticipantFields(values: ParticipantFormValues, current: ParticipantProfile, actor: Pick<StaffProfile, "role" | "organizationId">, protections: readonly CeoProtection[]): ParticipantFields {
  const fields = participantFormFields(values);
  return Object.fromEntries(participantFieldNames.filter((field) => fields[field] !== (field === "phone" ? normalizePhoneNumber(current.phone) ?? current.phone : current[field]) && !fieldIsProtected(actor, current.id, protections, field)).map((field) => [field, fields[field]]));
}

type AuthorityView = ParticipantView & {
  readonly allowedActions?: readonly string[];
  readonly acceptedAssignment?: ParticipantView["assignment"];
  readonly participant: ParticipantProfile & { readonly createdBy?: string | null };
};

/** Projected assignments and grant intents can display progress, never authority. */
export function canEditParticipant(actor: StaffProfile, view: AuthorityView): boolean {
  if (!actor.active || actor.localPending || actor.organizationId !== view.participant.organizationId || view.participant.deletedAt != null) return false;
  if (view.allowedActions !== undefined) return view.allowedActions.includes("edit");
  if (actor.role === "ceo") return true;
  const assignment = view.acceptedAssignment ?? null;
  if (assignment && assignment.organizationId === actor.organizationId && assignment.participantId === view.participant.id) {
    return actor.role === "mentor" ? assignment.mentorId === actor.id : actor.role === "coordinator" && assignment.coordinatorId === actor.id;
  }
  return actor.role === "coordinator" && !assignment && view.participant.createdBy === actor.id;
}

export function assignmentScope(actor: StaffProfile, view: AuthorityView, staff: readonly StaffProfile[]) {
  const sameOrganization = actor.organizationId === view.participant.organizationId;
  const acceptedAssignment = view.acceptedAssignment ?? null;
  const canAssign = actor.active && sameOrganization && canEditParticipant(actor, view) && (actor.role === "ceo" || (actor.role === "coordinator" && !acceptedAssignment && !view.assignment)) && !fieldIsProtected(actor, view.participant.id, view.protections, "assignment");
  // Pending staff choices are queue dependencies; they never authorize the actor.
  const mentors = staff.filter((member) => (member.active || member.localPending) && member.role === "mentor" && member.organizationId === actor.organizationId && (actor.role === "ceo" || member.coordinatorId === actor.id));
  const coordinators = staff.filter((member) => (member.active || member.localPending) && member.role === "coordinator" && member.organizationId === actor.organizationId && (actor.role === "ceo" || member.id === actor.id));
  return { canAssign, mentors, coordinators };
}
