import type { ParticipantView, StaffProfile } from "../../lib/mentoring/contracts";

export interface MentorNode {
  readonly mentor: StaffProfile;
  readonly mentees: readonly ParticipantView[];
}

export interface TeamNode {
  /** Null is the bucket of mentors who have no coordinator yet. */
  readonly coordinator: StaffProfile | null;
  readonly mentors: readonly MentorNode[];
  /** Active mentors only; a former mentor with open mentees stays listed but is not counted. */
  readonly mentorCount: number;
  readonly menteeCount: number;
  readonly inactiveMentorCount: number;
}

export interface OrganizationTree {
  readonly teams: readonly TeamNode[];
  readonly withoutCoordinator: TeamNode | null;
  readonly unassignedMentees: readonly ParticipantView[];
  /** Cards whose accompaniment ended are kept out of the counts and the tree. */
  readonly closedMentees: number;
}

const byName = (left: StaffProfile, right: StaffProfile) => left.displayName.localeCompare(right.displayName, "he");

function countable(actor: StaffProfile, view: ParticipantView): boolean {
  return view.participant.organizationId === actor.organizationId && view.participant.deletedAt == null && view.deletedAt == null;
}

function teamNode(coordinator: StaffProfile | null, mentorNodes: readonly MentorNode[]): TeamNode {
  const active = mentorNodes.filter((node) => node.mentor.active);
  return {
    coordinator,
    mentors: mentorNodes,
    mentorCount: active.length,
    menteeCount: mentorNodes.reduce((sum, node) => sum + node.mentees.length, 0),
    inactiveMentorCount: mentorNodes.length - active.length,
  };
}

/**
 * Coordinators → their mentors → those mentors' mentees. The CEO sees the whole
 * organization; a coordinator only her own team. This only arranges data that the
 * server already limited to the actor; it never widens access.
 */
export function organizationTree(actor: StaffProfile, staff: readonly StaffProfile[], participants: readonly ParticipantView[]): OrganizationTree {
  if (actor.role === "mentor") return { teams: [], withoutCoordinator: null, unassignedMentees: [], closedMentees: 0 };
  const members = staff.filter((member) => member.organizationId === actor.organizationId);
  const visible = participants.filter((view) => countable(actor, view));
  const open = visible.filter((view) => view.participant.lifecycle !== "closed");
  const closedMentees = visible.length - open.length;
  const byMentor = new Map<string, ParticipantView[]>();
  for (const view of open) {
    const mentorId = view.assignment?.mentorId;
    if (mentorId) byMentor.set(mentorId, [...(byMentor.get(mentorId) ?? []), view]);
  }
  const nodeFor = (mentor: StaffProfile): MentorNode => ({
    mentor,
    mentees: [...(byMentor.get(mentor.id) ?? [])].sort((left, right) => left.participant.displayName.localeCompare(right.participant.displayName, "he")),
  });
  const mentorsOf = (coordinatorId: string | null) => members
    .filter((member) => member.role === "mentor" && (member.coordinatorId ?? null) === coordinatorId && (member.active || (byMentor.get(member.id)?.length ?? 0) > 0))
    .sort(byName).map(nodeFor);

  const coordinators = members
    .filter((member) => member.role === "coordinator" && (actor.role === "ceo" || member.id === actor.id))
    .filter((member) => member.active || mentorsOf(member.id).length > 0)
    .sort(byName);
  const teams = coordinators.map((coordinator) => teamNode(coordinator, mentorsOf(coordinator.id)));

  const loose = actor.role === "ceo" ? mentorsOf(null) : [];
  const knownMentors = new Set(members.filter((member) => member.role === "mentor").map((member) => member.id));
  const unassignedMentees = open.filter((view) => !view.assignment || !knownMentors.has(view.assignment.mentorId))
    .filter((view) => actor.role === "ceo" || !view.assignment);
  return {
    teams,
    withoutCoordinator: loose.length ? teamNode(null, loose) : null,
    unassignedMentees,
    closedMentees,
  };
}

export function organizationTotals(tree: OrganizationTree) {
  const teams = [...tree.teams, ...(tree.withoutCoordinator ? [tree.withoutCoordinator] : [])];
  return {
    coordinators: tree.teams.filter((team) => team.coordinator?.active).length,
    mentors: teams.reduce((sum, team) => sum + team.mentorCount, 0),
    mentees: teams.reduce((sum, team) => sum + team.menteeCount, 0) + tree.unassignedMentees.length,
    unassignedMentees: tree.unassignedMentees.length,
  };
}
