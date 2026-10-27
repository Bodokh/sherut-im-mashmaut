/**
 * Provider-independent mentoring rules.
 *
 * Provisional product defaults are documented in README.md. Server callers must
 * load current authorization/protection inside the transaction that accepts a
 * write; these pure functions do not establish an authenticated session.
 */

export type StaffRole = "mentor" | "coordinator" | "ceo";
export type ManualColor = "green" | "orange" | "red";
export type ServiceType = "national" | "military";
export type ContactMethod = "phone" | "in_person";
export type ContactOutcome = "completed" | "no_answer";
export type ParticipantAction = "view" | "edit" | "approve" | "delete";
export type InstantInput = string | Date;

export interface StaffMember {
  readonly id: string;
  readonly organizationId: string;
  readonly role: StaffRole;
  readonly active: boolean;
  readonly version: number;
}

export interface Participant {
  readonly id: string;
  readonly organizationId: string;
  readonly displayName: string;
  readonly serviceType: ServiceType | null;
  readonly phone: string | null;
  readonly lifecycle: "active" | "paused" | "closed";
  readonly version: number;
  readonly deletedAt?: string | null;
}

export interface Assignment {
  readonly id: string;
  readonly organizationId: string;
  readonly participantId: string;
  readonly mentorId: string;
  readonly coordinatorId: string | null;
  readonly assignedAt: string;
  /** Provisional continuity policy: reassignment preserves the first obligation. */
  readonly followupAnchorAt?: string;
  readonly version: number;
}

export interface ContactEntry {
  readonly localPending?: boolean;
  readonly localTimestamp?: boolean;
  readonly id: string;
  readonly organizationId: string;
  readonly participantId: string;
  readonly actorId: string;
  readonly method: ContactMethod;
  readonly outcome: ContactOutcome;
  readonly occurredAt: string;
  readonly receivedAt: string;
  readonly notes?: string;
  readonly revision: number;
  readonly invalidatedAt?: string | null;
}

export interface Appointment {
  readonly id: string;
  readonly organizationId: string;
  readonly participantId: string;
  readonly mentorId: string;
  readonly scheduledAt: string;
  readonly version: number;
  readonly sourceContactId?: string | null;
  readonly requiresReview?: boolean;
}

export interface Review {
  readonly localPending?: boolean;
  readonly localTimestamp?: boolean;
  readonly contactId: string;
  readonly revision: number;
  readonly decision: "approved" | "returned_for_correction";
  readonly reviewedByStaffId: string;
  readonly reviewedAt: string;
}

export interface AccessGrant {
  readonly id: string;
  readonly organizationId: string;
  readonly staffId: string;
  readonly participantId: string;
  readonly actions: readonly ParticipantAction[];
  readonly active: boolean;
  readonly expiresAt?: string | null;
}

export interface CeoProtection {
  readonly organizationId: string;
  readonly resourceId: string;
  readonly protectedByStaffId: string;
  readonly protectedRevision: number;
  readonly active: boolean;
  /** Null, omitted, or an empty list is whole-record protection, not an unlock. */
  readonly fieldPaths?: readonly string[] | null;
}

export interface FollowupReference {
  readonly organizationId: string;
  readonly participantId: string;
  readonly assignedAt: string | null;
  readonly followupAnchorAt?: string | null;
  readonly contacts: readonly ContactEntry[];
  readonly nextAppointment: Appointment | null;
  readonly timeZone?: string;
}

export interface Followup {
  readonly status: "unassigned" | "within_interval" | "appointment_missed" | "seven_day_overdue";
  readonly anchorAt: string | null;
  readonly anchorSource: "assignment" | "completed_contact" | null;
  readonly dueAt: string | null;
  readonly lastCompletedContactAt: string | null;
  readonly nextAppointmentMissing: boolean;
}

export interface ValidationIssue {
  readonly field: string;
  readonly code: string;
  readonly message: string;
  readonly severity: "error" | "warning";
}

export interface CompletedContactInput {
  readonly method: ContactMethod;
  readonly occurredAt: string;
  readonly nextAppointmentAt?: string | null;
  readonly timeZone?: string;
}

export interface MentoringSnapshot {
  readonly participant: Participant;
  readonly assignment: Assignment | null;
  readonly contacts: readonly ContactEntry[];
  readonly nextAppointment: Appointment | null;
  readonly manualColor: ManualColor | null;
}

export interface RecordContactInput {
  readonly entry: ContactEntry;
  readonly nextAppointment?: Appointment | null;
  readonly manualColor?: ManualColor;
  readonly expectedAppointmentVersion: number | null;
  readonly timeZone?: string;
}

export type ContactTransitionResult =
  | { readonly ok: true; readonly state: MentoringSnapshot; readonly warnings: readonly ValidationIssue[] }
  | { readonly ok: false; readonly kind: "validation"; readonly issues: readonly ValidationIssue[]; readonly submission: RecordContactInput }
  | { readonly ok: false; readonly kind: "conflict"; readonly code: "stale_completed_contact" | "appointment_version_conflict" | "duplicate_contact"; readonly submission: RecordContactInput; readonly currentState: MentoringSnapshot };

export class DomainInputError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DomainInputError";
    this.code = code;
  }
}

export const DEFAULT_CADENCE_POLICY = {
  id: "proposed-israel-calendar-seven-days-v1",
  timeZone: "Asia/Jerusalem",
  days: 7,
  overdueAtEquality: true,
  daylightSavingDisambiguation: "earlier-overlap-forward-gap",
} as const;

const DAY = 86_400_000;
const HOUR = 3_600_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function instantMs(value: InstantInput): number {
  if (value instanceof Date) {
    if (Number.isFinite(value.getTime())) return value.getTime();
    throw new DomainInputError("invalid_instant", "A valid date is required.");
  }
  // Avoid interpreting a timestamp using the current machine's local timezone.
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})$/i.exec(value);
  if (!match) throw new DomainInputError("invalid_instant", "Use an ISO timestamp with an explicit offset.");
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map((part) => Number(part ?? 0));
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  calendar.setUTCHours(hour, minute, second, 0);
  const validCalendar = calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month - 1 && calendar.getUTCDate() === day && hour < 24 && minute < 60 && second < 60;
  const result = Date.parse(value);
  if (!validCalendar || !Number.isFinite(result)) throw new DomainInputError("invalid_instant", "The timestamp is not a valid calendar date.");
  return result;
}

function maybeInstantMs(value: string | null | undefined): number | null {
  if (!value) return null;
  try { return instantMs(value); } catch { return null; }
}

function formatter(timeZone: string): Intl.DateTimeFormat {
  const existing = formatters.get(timeZone);
  if (existing) return existing;
  try {
    const result = new Intl.DateTimeFormat("en-CA", { timeZone, calendar: "iso8601", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    formatters.set(timeZone, result);
    return result;
  } catch {
    throw new DomainInputError("invalid_timezone", "A valid IANA timezone is required.");
  }
}

function localEpoch(instant: number, timeZone: string): number {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(instant).map((part) => [part.type, part.value]));
  const wall = new Date(0);
  wall.setUTCFullYear(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  wall.setUTCHours(Number(parts.hour), Number(parts.minute), Number(parts.second), new Date(instant).getUTCMilliseconds());
  return wall.getTime();
}

/**
 * Proposed policy: same local clock time seven calendar days later. For a DST
 * overlap choose the earlier instant; for a missing time shift forward by the
 * gap. These disambiguation defaults remain an explicit product-policy choice.
 */
export function addSevenLocalDays(value: InstantInput, timeZone: string = DEFAULT_CADENCE_POLICY.timeZone): string {
  const source = instantMs(value);
  const targetWall = localEpoch(source, timeZone) + DEFAULT_CADENCE_POLICY.days * DAY;
  const offsets = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) {
    const probe = targetWall + hours * HOUR;
    offsets.add(localEpoch(probe, timeZone) - probe);
  }
  const candidates = [...offsets].map((offset) => targetWall - offset).sort((a, b) => a - b);
  const exact = candidates.find((candidate) => localEpoch(candidate, timeZone) === targetWall);
  if (exact !== undefined) return new Date(exact).toISOString();
  const forward = candidates.map((candidate) => ({ candidate, difference: localEpoch(candidate, timeZone) - targetWall })).filter((item) => item.difference > 0).sort((a, b) => a.difference - b.difference)[0];
  if (!forward) throw new DomainInputError("unresolvable_local_time", "The calendar deadline could not be resolved.");
  return new Date(forward.candidate).toISOString();
}

function matchesParticipant(record: { organizationId: string; participantId: string }, organizationId: string, participantId: string): boolean {
  return record.organizationId === organizationId && record.participantId === participantId;
}

function latestCompletedContact(reference: FollowupReference, now: number): ContactEntry | null {
  return reference.contacts.filter((entry) => matchesParticipant(entry, reference.organizationId, reference.participantId) && entry.outcome === "completed" && (entry.method === "phone" || entry.method === "in_person") && entry.invalidatedAt == null && instantMs(entry.occurredAt) <= now).reduce<ContactEntry | null>((latest, entry) => !latest || instantMs(entry.occurredAt) > instantMs(latest.occurredAt) ? entry : latest, null);
}

export function computeFollowup(reference: FollowupReference, now: InstantInput): Followup {
  const nowMs = instantMs(now);
  const appointment = reference.nextAppointment;
  if (appointment && !matchesParticipant(appointment, reference.organizationId, reference.participantId)) throw new DomainInputError("invalid_reference", "The appointment does not belong to the participant.");
  const latest = latestCompletedContact(reference, nowMs);
  const anchor = latest?.occurredAt ?? reference.followupAnchorAt ?? reference.assignedAt;
  if (!anchor) return { status: "unassigned", anchorAt: null, anchorSource: null, dueAt: null, lastCompletedContactAt: null, nextAppointmentMissing: !appointment };
  const dueAt = addSevenLocalDays(anchor, reference.timeZone);
  const status = nowMs >= instantMs(dueAt) ? "seven_day_overdue" : appointment && nowMs > instantMs(appointment.scheduledAt) ? "appointment_missed" : "within_interval";
  return { status, anchorAt: new Date(instantMs(anchor)).toISOString(), anchorSource: latest ? "completed_contact" : "assignment", dueAt, lastCompletedContactAt: latest ? new Date(instantMs(latest.occurredAt)).toISOString() : null, nextAppointmentMissing: !appointment };
}

export function validateCompletedContact(input: CompletedContactInput, now: InstantInput): ValidationIssue[] {
  const nowMs = instantMs(now);
  const issues: ValidationIssue[] = [];
  if (input.method !== "phone" && input.method !== "in_person") issues.push({ field: "method", code: "invalid_method", message: "Select a qualifying phone conversation or in-person meeting.", severity: "error" });
  const occurred = maybeInstantMs(input.occurredAt);
  const next = maybeInstantMs(input.nextAppointmentAt);
  if (occurred === null) issues.push({ field: "occurredAt", code: "invalid_contact_time", message: "Enter a valid actual contact time with a timezone offset.", severity: "error" });
  else if (occurred > nowMs) issues.push({ field: "occurredAt", code: "future_contact", message: "A completed contact cannot occur in the future.", severity: "error" });
  if (next === null) issues.push({ field: "nextAppointmentAt", code: "next_appointment_required", message: "Choose the next appointment date and time.", severity: "error" });
  else if (occurred !== null && next <= occurred) issues.push({ field: "nextAppointmentAt", code: "next_not_after_contact", message: "The next appointment must be later than the completed contact.", severity: "error" });
  else if (occurred !== null && next > instantMs(addSevenLocalDays(input.occurredAt, input.timeZone))) issues.push({ field: "nextAppointmentAt", code: "after_cadence_deadline", message: "The appointment is later than the seven-day contact deadline.", severity: "warning" });
  return issues;
}

export function applyRecordedContact(state: MentoringSnapshot, submission: RecordContactInput, now: InstantInput): ContactTransitionResult {
  const entry = submission.entry;
  const issue = (field: string, code: string, message: string): ContactTransitionResult => ({ ok: false, kind: "validation", issues: [{ field, code, message, severity: "error" }], submission });
  const conflict = (code: "stale_completed_contact" | "appointment_version_conflict" | "duplicate_contact"): ContactTransitionResult => ({ ok: false, kind: "conflict", code, submission, currentState: state });
  if (!matchesParticipant(entry, state.participant.organizationId, state.participant.id)) return issue("participantId", "participant_mismatch", "The contact does not belong to this participant.");
  if (!state.assignment || !matchesParticipant(state.assignment, state.participant.organizationId, state.participant.id)) return issue("assignment", "assignment_required", "An active primary assignment is required.");
  if (submission.manualColor !== undefined && !["green", "orange", "red"].includes(submission.manualColor)) return issue("manualColor", "invalid_manual_color", "Choose a valid manual follow-up color.");
  const occurred = maybeInstantMs(entry.occurredAt);
  if (occurred === null || occurred > instantMs(now)) return issue("occurredAt", "invalid_contact_time", "Record a valid contact time that is not in the future.");
  if (state.contacts.some((existing) => existing.id === entry.id)) return conflict("duplicate_contact");
  if (entry.outcome !== "completed" && entry.outcome !== "no_answer") return issue("outcome", "invalid_outcome", "Choose a supported contact outcome.");
  let nextAppointment = state.nextAppointment;
  const warnings: ValidationIssue[] = [];
  if (entry.outcome === "completed") {
    const next = submission.nextAppointment;
    if (entry.invalidatedAt != null) return issue("entry", "invalidated_contact", "An invalidated entry cannot be finalized as completed contact.");
    const validation = validateCompletedContact({ method: entry.method, occurredAt: entry.occurredAt, nextAppointmentAt: next?.scheduledAt, timeZone: submission.timeZone }, now);
    if (validation.some((item) => item.severity === "error")) return { ok: false, kind: "validation", issues: validation, submission };
    warnings.push(...validation);
    if (!next || !matchesParticipant(next, state.participant.organizationId, state.participant.id) || next.mentorId !== state.assignment.mentorId) return issue("nextAppointment", "appointment_mismatch", "The appointment must belong to the participant and accountable mentor.");
    if (submission.expectedAppointmentVersion !== (state.nextAppointment?.version ?? null)) return conflict("appointment_version_conflict");
    const latest = latestCompletedContact({ organizationId: state.participant.organizationId, participantId: state.participant.id, assignedAt: state.assignment.assignedAt, contacts: state.contacts, nextAppointment: state.nextAppointment }, instantMs(now));
    if (latest && occurred < instantMs(latest.occurredAt)) return conflict("stale_completed_contact");
    nextAppointment = { ...next };
  }
  return { ok: true, warnings, state: { ...state, contacts: [...state.contacts, { ...entry }].sort((a, b) => instantMs(b.occurredAt) - instantMs(a.occurredAt)), nextAppointment, manualColor: submission.manualColor ?? state.manualColor } };
}

export function isRevisionApproved(entry: ContactEntry, review: Review | null | undefined): boolean {
  return Boolean(review && review.contactId === entry.id && review.revision === entry.revision && review.decision === "approved" && entry.invalidatedAt == null);
}

function hasGrant(actor: StaffMember, participant: Participant, action: ParticipantAction, grants: readonly AccessGrant[], now: number): boolean {
  return grants.some((grant) => {
    if (!grant.active || grant.organizationId !== actor.organizationId || grant.staffId !== actor.id || grant.participantId !== participant.id || !grant.actions.includes(action)) return false;
    if (grant.expiresAt == null) return true;
    const expiry = maybeInstantMs(grant.expiresAt);
    return expiry !== null && expiry > now;
  });
}

export function canPerformParticipantAction(actor: StaffMember, participant: Participant, assignment: Assignment | null, action: ParticipantAction, grants: readonly AccessGrant[] = [], now: InstantInput = new Date()): boolean {
  if (actor.active !== true || !actor.id || !actor.organizationId || !participant.id || actor.organizationId !== participant.organizationId || !["mentor", "coordinator", "ceo"].includes(actor.role) || !["view", "edit", "approve", "delete"].includes(action)) return false;
  if (actor.role === "ceo") return true;
  if (participant.deletedAt != null) return false;
  if (action === "delete" || (action === "approve" && actor.role !== "coordinator")) return false;
  const assignedHere = assignment && matchesParticipant(assignment, participant.organizationId, participant.id);
  const roleScope = Boolean(assignedHere && (actor.role === "mentor" ? assignment.mentorId === actor.id : assignment.coordinatorId === actor.id));
  return roleScope || hasGrant(actor, participant, action, grants, instantMs(now));
}

export function canAccessParticipant(actor: StaffMember, participant: Participant, assignment: Assignment | null, grants: readonly AccessGrant[] = [], now: InstantInput = new Date()): boolean {
  return canPerformParticipantAction(actor, participant, assignment, "view", grants, now);
}

export interface WritePreconditions {
  readonly actor: StaffMember;
  readonly resource: { readonly id: string; readonly organizationId: string; readonly version: number };
  readonly expectedVersion: number;
  /** Must come from current authoritative scope evaluation, never request JSON. */
  readonly hasScope: boolean;
  readonly protection?: CeoProtection | null;
  readonly changedFields?: readonly string[];
}

export type WritePreconditionResult = { readonly ok: true } | { readonly ok: false; readonly code: "inactive_actor" | "wrong_organization" | "forbidden_scope" | "invalid_protection" | "ceo_protected" | "version_conflict" };

export function checkWritePreconditions(input: WritePreconditions): WritePreconditionResult {
  const { actor, resource, protection } = input;
  if (actor.active !== true) return { ok: false, code: "inactive_actor" };
  if (actor.organizationId !== resource.organizationId) return { ok: false, code: "wrong_organization" };
  if (input.hasScope !== true || !["mentor", "coordinator", "ceo"].includes(actor.role)) return { ok: false, code: "forbidden_scope" };
  if (protection?.active) {
    if (protection.organizationId !== resource.organizationId || protection.resourceId !== resource.id) return { ok: false, code: "invalid_protection" };
    if (actor.role !== "ceo") {
      const fields = protection.fieldPaths;
      const changed = input.changedFields;
      const overlaps = !fields?.length || !changed?.length || fields.some((field) => changed.some((path) => path === field || path.startsWith(`${field}.`) || field.startsWith(`${path}.`)));
      if (overlaps) return { ok: false, code: "ceo_protected" };
    }
  }
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1 || input.expectedVersion !== resource.version) return { ok: false, code: "version_conflict" };
  return { ok: true };
}

export interface CeoConflictInput<T> {
  readonly operationId: string;
  readonly resourceId: string;
  readonly organizationId: string;
  readonly submittedByStaffId: string;
  readonly authoritative: T;
  readonly submitted: T;
  readonly preservedAt: string;
}

/** Preserves payloads; persistence/deduplication and review authorization are server responsibilities. */
export function preserveCeoConflict<T>(input: CeoConflictInput<T>) {
  if (!input.operationId || !input.organizationId || !input.resourceId || !input.submittedByStaffId) throw new DomainInputError("invalid_conflict", "Conflict identity and authorship are required.");
  instantMs(input.preservedAt);
  return {
    id: `ceo-conflict/${encodeURIComponent(input.organizationId)}/${encodeURIComponent(input.submittedByStaffId)}/${encodeURIComponent(input.operationId)}`,
    kind: "ceo_protected" as const,
    operationId: input.operationId,
    resourceId: input.resourceId,
    organizationId: input.organizationId,
    submittedByStaffId: input.submittedByStaffId,
    authoritative: structuredClone(input.authoritative),
    submitted: structuredClone(input.submitted),
    preservedAt: new Date(instantMs(input.preservedAt)).toISOString(),
  };
}
