import type { ParticipantView, StaffProfile, WorkspaceSnapshot } from "../../contracts";
import type { ContactEntry, Review } from "../../domain";
import { computeFollowup } from "../../domain";
import type { ContactRevision } from "../contacts/contracts";

export const OVERSIGHT_TIME_ZONE = "Asia/Jerusalem";
const localParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: OVERSIGHT_TIME_ZONE, calendar: "iso8601", hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});

function parts(instant: number) {
  return Object.fromEntries(localParts.formatToParts(instant).map((part) => [part.type, part.value]));
}

export function isMonth(value: string): boolean { return /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(value); }

export function israelMonth(instant: string): string {
  const value = Date.parse(instant);
  if (!Number.isFinite(value)) throw new Error("A valid instant is required.");
  const current = parts(value);
  return `${current.year.padStart(4, "0")}-${current.month}`;
}

function localMonthStart(year: number, month: number): number {
  const wall = new Date(0);
  wall.setUTCFullYear(year, month - 1, 1);
  wall.setUTCHours(0, 0, 0, 0);
  const target = wall.getTime();
  // Derive the actual Israel offset around the boundary. Never assume that a
  // calendar month is an integer multiple of 24h or use the device timezone.
  const offsets = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) {
    const probe = target + hours * 3_600_000;
    const value = parts(probe);
    const local = new Date(0);
    local.setUTCFullYear(Number(value.year), Number(value.month) - 1, Number(value.day));
    local.setUTCHours(Number(value.hour), Number(value.minute), Number(value.second), 0);
    offsets.add(local.getTime() - probe);
  }
  const exact = [...offsets].map((offset) => target - offset).sort((a, b) => a - b).find((candidate) => {
    const value = parts(candidate);
    return Number(value.year) === year && Number(value.month) === month && Number(value.day) === 1 && value.hour === "00" && value.minute === "00";
  });
  if (exact === undefined) throw new Error("The Israel month boundary could not be resolved.");
  return exact;
}

export function israelMonthBounds(month: string): { startAt: string; endAt: string } {
  if (!isMonth(month)) throw new Error("Use a valid YYYY-MM month.");
  const [year, calendarMonth] = month.split("-").map(Number);
  const nextYear = calendarMonth === 12 ? year + 1 : year;
  const nextMonth = calendarMonth === 12 ? 1 : calendarMonth + 1;
  return { startAt: new Date(localMonthStart(year, calendarMonth)).toISOString(), endAt: new Date(localMonthStart(nextYear, nextMonth)).toISOString() };
}

export function canReviewMonthlyScope(actor: StaffProfile, scopeStaffId: string | null): boolean {
  return actor.active && (actor.role === "ceo" || (actor.role === "coordinator" && scopeStaffId === actor.id));
}

export interface MonthlyContactEvidence {
  readonly contact: ContactEntry;
  readonly acceptedContact: ContactEntry | null;
  readonly localPending: boolean;
  readonly participantId: string;
  readonly participantName: string;
  readonly authorName: string;
  readonly occurredInMonth: boolean;
  readonly receivedInMonth: boolean;
  readonly uploadedAfterMonth: boolean;
  readonly reviewDecision: Review["decision"] | null;
  readonly changes: readonly ContactRevision[];
}
export interface ParticipantMonthlyActivity {
  readonly view: ParticipantView;
  /** Historical evidence remains visible; tombstones do not form today's roster. */
  readonly deletedAt: string | null;
  readonly completed: number;
  readonly attempted: number;
  readonly reportsReceived: number;
  readonly laterUploads: number;
  readonly invalidated: number;
  readonly awaitingReview: number;
  readonly currentlyOverdue: boolean;
  readonly currentFollowup: ReturnType<typeof computeFollowup>;
}
export interface StaffMonthlyCoverage {
  readonly staffId: string;
  readonly staffName: string;
  readonly assignedParticipants: number;
  readonly participantsWithCompletedContact: number;
  readonly completed: number;
  readonly attempted: number;
  readonly reportsReceived: number;
}

/**
 * A current, permission-scoped view of actual records. Assignment/lifecycle and
 * overdue status describe the snapshot time; this does not reconstruct a past
 * month's roster or claim that an absence of data proves a missed contact.
 */
export function deriveMonthlyOversight(snapshot: WorkspaceSnapshot, month: string, scopeStaffId: string | null) {
  const { startAt, endAt } = israelMonthBounds(month);
  const start = Date.parse(startAt), end = Date.parse(endAt);
  const within = (instant: string) => { const value = Date.parse(instant); return Number.isFinite(value) && value >= start && value < end; };
  const allowed = canReviewMonthlyScope(snapshot.actor, scopeStaffId);
  const views = allowed ? snapshot.participants.filter((view) => view.participant.organizationId === snapshot.actor.organizationId && (scopeStaffId === null || view.assignment?.coordinatorId === scopeStaffId)) : [];
  const names = new Map(snapshot.staff.filter((staff) => staff.organizationId === snapshot.actor.organizationId).map((staff) => [staff.id, staff.displayName]));
  const contacts: MonthlyContactEvidence[] = [];
  let correctionsReceived = 0, invalidationsReceived = 0;
  const localPending = (value: object) => ("localPending" in value && value.localPending === true) || ("localTimestamp" in value && value.localTimestamp === true);
  const participants: ParticipantMonthlyActivity[] = views.map((view) => {
    const deletedAt = view.deletedAt || view.participant.deletedAt || null;
    const revisions = "contactRevisions" in view ? view.contactRevisions as readonly ContactRevision[] : [];
    const validContacts = view.contacts.filter((contact) => contact.organizationId === snapshot.actor.organizationId && contact.participantId === view.participant.id);
    for (const revision of revisions) {
      if (revision.organizationId !== snapshot.actor.organizationId || revision.participantId !== view.participant.id || localPending(revision) || !within(revision.revisedAt)) continue;
      if (revision.changeKind === "correction") correctionsReceived++;
      if (revision.changeKind === "invalidation") invalidationsReceived++;
    }
    const evidence = validContacts.map((contact): MonthlyContactEvidence => {
      const pending = localPending(contact);
      const changes = revisions.filter((revision) => revision.id === contact.id && revision.organizationId === contact.organizationId);
      // A pending correction keeps the last centrally accepted content as its
      // metric baseline; a brand new local report has no server receipt yet.
      const acceptedContact = pending ? changes.filter((revision) => !localPending(revision)).sort((a, b) => b.revision - a.revision)[0] ?? null : contact;
      return {
        contact, acceptedContact, localPending: pending, participantId: view.participant.id, participantName: view.participant.displayName,
        authorName: names.get(contact.actorId) ?? "חבר/ת צוות", occurredInMonth: within(contact.occurredAt),
        receivedInMonth: acceptedContact !== null && within(acceptedContact.receivedAt),
        uploadedAfterMonth: acceptedContact !== null && within(acceptedContact.occurredAt) && Date.parse(acceptedContact.receivedAt) >= end,
        reviewDecision: view.reviews.find((review) => !localPending(review) && review.contactId === contact.id && review.revision === contact.revision)?.decision ?? null,
        changes,
      };
    });
    // Corrections/invalidation received in this month remain inspectable even
    // when both occurrence and original receipt belong to a different month.
    contacts.push(...evidence.filter((item) => item.occurredInMonth || item.receivedInMonth || (item.acceptedContact && within(item.acceptedContact.occurredAt)) || item.changes.some((revision) => within(revision.revisedAt))));
    const acceptedContacts = evidence.flatMap((item) => item.acceptedContact ? [item.acceptedContact] : []);
    const actual = acceptedContacts.filter((contact) => within(contact.occurredAt) && contact.invalidatedAt == null);
    const acceptedAppointment = "acceptedNextAppointment" in view ? view.acceptedNextAppointment as ParticipantView["nextAppointment"] : view.nextAppointment;
    const followup = computeFollowup({ organizationId: view.participant.organizationId, participantId: view.participant.id,
      assignedAt: view.assignment?.assignedAt ?? null, followupAnchorAt: view.assignment?.followupAnchorAt,
      contacts: acceptedContacts, nextAppointment: acceptedAppointment }, snapshot.serverTime);
    return { view, deletedAt, completed: actual.filter((contact) => contact.outcome === "completed").length,
      attempted: actual.filter((contact) => contact.outcome === "no_answer").length,
      reportsReceived: evidence.filter((item) => item.receivedInMonth).length,
      laterUploads: evidence.filter((item) => item.uploadedAfterMonth).length,
      invalidated: acceptedContacts.filter((contact) => within(contact.occurredAt) && contact.invalidatedAt != null).length,
      awaitingReview: actual.filter((contact) => !view.reviews.some((review) => !localPending(review) && review.contactId === contact.id && review.revision === contact.revision && review.decision === "approved")).length,
      currentlyOverdue: !deletedAt && view.participant.lifecycle === "active" && Boolean(view.assignment) && (followup.status === "seven_day_overdue" || followup.status === "appointment_missed"),
      currentFollowup: followup,
    };
  });
  const team = allowed ? snapshot.staff.filter((staff) => staff.organizationId === snapshot.actor.organizationId && staff.role === "mentor" && (scopeStaffId === null || staff.coordinatorId === scopeStaffId)) : [];
  const coverage: StaffMonthlyCoverage[] = team.map((staff) => {
    const assigned = participants.filter((item) => !item.deletedAt && item.view.assignment?.mentorId === staff.id);
    const authored = contacts.flatMap((item) => item.acceptedContact?.actorId === staff.id && item.acceptedContact.invalidatedAt == null ? [item.acceptedContact] : []);
    return { staffId: staff.id, staffName: staff.displayName, assignedParticipants: assigned.length,
      participantsWithCompletedContact: assigned.filter((item) => item.completed > 0).length,
      completed: authored.filter((contact) => within(contact.occurredAt) && contact.outcome === "completed").length,
      attempted: authored.filter((contact) => within(contact.occurredAt) && contact.outcome === "no_answer").length,
      reportsReceived: contacts.filter((item) => item.contact.actorId === staff.id && item.receivedInMonth).length };
  });
  return { month, startAt, endAt, participants, coverage,
    contacts: contacts.sort((a, b) => Date.parse(b.contact.occurredAt) - Date.parse(a.contact.occurredAt) || a.contact.id.localeCompare(b.contact.id)),
    totals: {
      participants: participants.filter((item) => !item.deletedAt).length, deletedParticipants: participants.filter((item) => item.deletedAt).length,
      completed: participants.reduce((sum, item) => sum + item.completed, 0),
      attempted: participants.reduce((sum, item) => sum + item.attempted, 0), reportsReceived: participants.reduce((sum, item) => sum + item.reportsReceived, 0),
      laterUploads: participants.reduce((sum, item) => sum + item.laterUploads, 0), invalidated: participants.reduce((sum, item) => sum + item.invalidated, 0),
      awaitingReview: participants.reduce((sum, item) => sum + item.awaitingReview, 0), currentlyOverdue: participants.filter((item) => item.currentlyOverdue).length,
      correctionsReceived, invalidationsReceived, queuedContacts: contacts.filter((item) => item.localPending).length,
    },
  };
}
