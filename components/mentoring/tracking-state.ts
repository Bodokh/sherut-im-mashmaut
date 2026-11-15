import type { StaffProfile, WorkspaceSnapshot } from "../../lib/mentoring/contracts";
import type { TrackingCardView, TrackingSubject, TrackingSubjectKind } from "../../lib/mentoring/features/tracking/contracts";
import { parseCommand } from "../../lib/mentoring/validation";
import { fromDateTimeInput, toDateTimeInput } from "./format";

/** Tracking cards are a management tool: the CEO and coordinators only. */
export function canUseTrackingCards(actor: Pick<StaffProfile, "active" | "role" | "localPending">): boolean {
  return actor.active && !actor.localPending && actor.role !== "mentor";
}

export function trackingSubjectId(subject: TrackingSubject): string {
  return subject.kind === "mentee" ? subject.participantId : subject.staffId;
}

export function trackingSubject(kind: TrackingSubjectKind, subjectId: string): TrackingSubject {
  return kind === "mentee" ? { kind, participantId: subjectId } : { kind, staffId: subjectId };
}

/** A card that was never saved still has a stable, empty representation. */
export function trackingCardFor(snapshot: Pick<WorkspaceSnapshot, "trackingCards">, kind: TrackingSubjectKind, subjectId: string): TrackingCardView {
  return snapshot.trackingCards?.find((card) => card.kind === kind && card.subjectId === subjectId) ?? {
    kind, subjectId, version: null, status: null, statusAt: null, notes: "", nextFollowupAt: null,
    updatedAt: null, updatedBy: null, updatedByName: null, reports: [],
  };
}

export interface TrackingCardFormValues {
  status: string;
  notes: string;
  nextFollowupAt: string;
}

export function trackingCardFormValues(card: TrackingCardView): TrackingCardFormValues {
  return { status: card.status ?? "none", notes: card.notes, nextFollowupAt: card.nextFollowupAt ? toDateTimeInput(card.nextFollowupAt) : "" };
}

export interface TrackingReportFormValues {
  method: string;
  outcome: string;
  occurredAt: string;
  notes: string;
}

type Issue = { readonly field: string; readonly message: string };
type Built = { readonly ok: true; readonly payload: Record<string, unknown> } | { readonly ok: false; readonly issue: Issue };
// Validation needs a well-formed operation ID; the real one is attached by the form so retries stay idempotent.
const VALIDATION_OPERATION_ID = "00000000-0000-4000-8000-000000000000";

export function trackingCardCommand(subject: TrackingSubject, card: TrackingCardView, values: TrackingCardFormValues): Built {
  const nextFollowupAt = values.nextFollowupAt ? fromDateTimeInput(values.nextFollowupAt) : null;
  if (values.nextFollowupAt && !nextFollowupAt) return { ok: false, issue: { field: "nextFollowupAt", message: "מועד המעקב הבא אינו תקין. יש לבחור תאריך ושעה מחדש." } };
  const payload = {
    type: "save_tracking_card", subject, expectedCardVersion: card.version,
    fields: { status: values.status === "none" ? null : values.status, notes: values.notes, nextFollowupAt },
  };
  const parsed = parseCommand({ ...payload, operationId: VALIDATION_OPERATION_ID });
  if (!parsed.ok) return { ok: false, issue: { field: parsed.error.field?.split(".").at(-1) ?? "notes", message: parsed.error.message } };
  return { ok: true, payload };
}

export function trackingReportCommand(subject: TrackingSubject, values: TrackingReportFormValues, now: Date = new Date()): Built {
  const occurredAt = fromDateTimeInput(values.occurredAt);
  if (!occurredAt) return { ok: false, issue: { field: "occurredAt", message: "יש לבחור את מועד הקשר: תאריך ושעה." } };
  if (Date.parse(occurredAt) > now.getTime() + 5 * 60_000) return { ok: false, issue: { field: "occurredAt", message: "אפשר לדווח רק על קשר שכבר התקיים. יש לבחור מועד שחלף." } };
  if (!values.notes.trim()) return { ok: false, issue: { field: "notes", message: "יש להזין את תוכן הדיווח." } };
  const payload = { type: "record_tracking_report", subject, method: values.method, outcome: values.outcome, occurredAt, notes: values.notes };
  const parsed = parseCommand({ ...payload, operationId: VALIDATION_OPERATION_ID });
  if (!parsed.ok) return { ok: false, issue: { field: parsed.error.field?.split(".").at(-1) ?? "notes", message: parsed.error.message } };
  return { ok: true, payload };
}

export const trackingMethodNames = { phone: "שיחת טלפון", in_person: "פגישה פנים אל פנים", message: "הודעה" } as const;
export const trackingOutcomeNames = { completed: "התקיים קשר", no_answer: "לא היה מענה" } as const;

/** Mentors whose tracking card the actor may open: all for the CEO, the own team for a coordinator. */
export function trackedMentors(actor: StaffProfile, staff: readonly StaffProfile[]): readonly StaffProfile[] {
  if (!canUseTrackingCards(actor)) return [];
  return staff.filter((member) => member.role === "mentor" && member.organizationId === actor.organizationId && (actor.role === "ceo" || member.coordinatorId === actor.id))
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "he"));
}
