import type { ParticipantView, StaffProfile } from "../../lib/mentoring/contracts";

/** Presentation of responsibility within an already authorized workspace. */
export function personalParticipants(actor: StaffProfile, participants: readonly ParticipantView[]): readonly ParticipantView[] {
  return participants.filter((view) => {
    if (view.participant.organizationId !== actor.organizationId || view.participant.deletedAt != null || view.deletedAt != null) return false;
    if (actor.role === "ceo") return true;
    if (actor.role === "mentor") return view.assignment?.mentorId === actor.id;
    return view.assignment?.coordinatorId === actor.id ||
      (!view.assignment && (view.participant.createdBy === actor.id || view.participant.localCreatedByStaffId === actor.id));
  });
}

export function teamStaff(actor: StaffProfile, staff: readonly StaffProfile[]): readonly StaffProfile[] {
  return staff.filter((member) => member.organizationId === actor.organizationId &&
    (actor.role !== "coordinator" || member.id === actor.id || (member.role === "mentor" && member.coordinatorId === actor.id)));
}

export function coordinatorGroups(actor: StaffProfile, staff: readonly StaffProfile[], participants: readonly ParticipantView[]) {
  const ownParticipants = personalParticipants(actor, participants);
  const mentors = teamStaff(actor, staff).filter((member) => member.role === "mentor");
  const groups: { mentor: StaffProfile | null; participants: readonly ParticipantView[] }[] = mentors.map((mentor) => ({
    mentor,
    participants: ownParticipants.filter((view) => view.assignment?.mentorId === mentor.id),
  }));
  const knownMentors = new Set(mentors.map((mentor) => mentor.id));
  const ungrouped = ownParticipants.filter((view) => !view.assignment || !knownMentors.has(view.assignment.mentorId));
  if (ungrouped.length) groups.push({ mentor: null, participants: ungrouped });
  return groups;
}
