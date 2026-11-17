import "server-only";

import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import { canPerformParticipantAction } from "../../domain";
import type { CommandResult, MentoringCommand, StaffProfile } from "../../contracts";
import type { CommandContext } from "../../server/command-context";
import { loadActorGrants, loadParticipant, ownsUnassignedParticipant } from "../../server/repository";
import type { TrackingCardView, TrackingCommand, TrackingReportView, TrackingSubject } from "./contracts";
import { TRACKING_COMMAND_TYPES } from "./contracts";
import { trackingSchemaState } from "./database-schema";

const REPORTS_PER_CARD = 100;
const iso = (value: unknown): string => new Date(value as string | Date).toISOString();
const nullableIso = (value: unknown): string | null => value == null ? null : iso(value);

export const isTrackingCommand = (command: { readonly type: string }): command is TrackingCommand =>
  (TRACKING_COMMAND_TYPES as readonly string[]).includes(command.type);

/** Tracking cards are management documents: mentors never read or write them. */
export const canUseTrackingCards = (actor: Pick<StaffProfile, "role" | "active">): boolean => actor.active && actor.role !== "mentor";

function reportFromRow(row: QueryResultRow): TrackingReportView {
  return {
    id: String(row.id), authorId: String(row.author_id), authorName: String(row.author_name),
    method: row.method as TrackingReportView["method"], outcome: row.outcome as TrackingReportView["outcome"],
    occurredAt: iso(row.occurred_at), receivedAt: iso(row.received_at), notes: String(row.notes),
  };
}

/**
 * The workspace query already limits `participantIds` to cards the actor may see.
 * Mentor cards are scoped here: the CEO sees every mentor, a coordinator only the
 * mentors of her own team.
 */
export async function loadTrackingCards(client: PoolClient, actor: StaffProfile, participantIds: readonly string[]): Promise<readonly TrackingCardView[] | undefined> {
  if (!canUseTrackingCards(actor)) return undefined;
  if (await trackingSchemaState(client) !== "ready") return undefined;
  const mentorRows = await client.query("SELECT id FROM mentoring.memberships WHERE organization_id = $1 AND role = 'mentor' AND ($2 = 'ceo' OR coordinator_id = $3)", [actor.organizationId, actor.role, actor.id]);
  const mentorIds = mentorRows.rows.map((row) => String(row.id));
  if (!participantIds.length && !mentorIds.length) return [];
  const scope = [actor.organizationId, participantIds, mentorIds];
  const cards = await client.query(`SELECT c.*, m.display_name AS updated_by_name FROM mentoring.tracking_cards c
    JOIN mentoring.memberships m ON m.organization_id = c.organization_id AND m.id = c.updated_by
    WHERE c.organization_id = $1 AND (c.participant_id = ANY($2::uuid[]) OR c.mentor_id = ANY($3::uuid[]))`, scope);
  const reports = await client.query(`SELECT * FROM (
      SELECT r.*, m.display_name AS author_name,
        row_number() OVER (PARTITION BY coalesce(r.participant_id, r.mentor_id) ORDER BY r.occurred_at DESC, r.received_at DESC, r.id) AS position
      FROM mentoring.tracking_reports r
      JOIN mentoring.memberships m ON m.organization_id = r.organization_id AND m.id = r.author_id
      WHERE r.organization_id = $1 AND (r.participant_id = ANY($2::uuid[]) OR r.mentor_id = ANY($3::uuid[]))
    ) ranked WHERE position <= ${REPORTS_PER_CARD} ORDER BY occurred_at DESC, received_at DESC, id`, scope);
  const views = new Map<string, TrackingCardView>();
  const keyOf = (kind: string, subjectId: string) => `${kind}:${subjectId}`;
  const empty = (kind: "mentee" | "mentor", subjectId: string): TrackingCardView => ({
    kind, subjectId, version: null, status: null, statusAt: null, notes: "", nextFollowupAt: null,
    updatedAt: null, updatedBy: null, updatedByName: null, reports: [],
  });
  for (const row of cards.rows) {
    const kind = row.subject_kind === "mentor" ? "mentor" : "mentee";
    const subjectId = String(kind === "mentor" ? row.mentor_id : row.participant_id);
    views.set(keyOf(kind, subjectId), {
      ...empty(kind, subjectId), version: Number(row.version), status: row.status as TrackingCardView["status"],
      statusAt: nullableIso(row.status_at), notes: String(row.notes), nextFollowupAt: nullableIso(row.next_followup_at),
      updatedAt: iso(row.updated_at), updatedBy: String(row.updated_by), updatedByName: String(row.updated_by_name),
    });
  }
  for (const row of reports.rows) {
    const kind = row.subject_kind === "mentor" ? "mentor" : "mentee";
    const subjectId = String(kind === "mentor" ? row.mentor_id : row.participant_id);
    const key = keyOf(kind, subjectId);
    const current = views.get(key) ?? empty(kind, subjectId);
    views.set(key, { ...current, reports: [...current.reports, reportFromRow(row)] });
  }
  return [...views.values()];
}

/** Resolves and locks the subject, then applies the same scope rules as the rest of the workspace. */
async function authorizeSubject(ctx: CommandContext, subject: TrackingSubject): Promise<CommandResult | null> {
  const { client, actor, now } = ctx;
  if (subject.kind === "mentee") {
    const view = await loadParticipant(client, actor.organizationId, subject.participantId, true);
    if (!view || view.participant.deletedAt) return ctx.failure("not_found", "כרטיס החניכה לא נמצא.");
    const grants = await loadActorGrants(client, actor, subject.participantId);
    const allowed = canPerformParticipantAction(actor, view.participant, view.assignment, "edit", grants, now) || await ownsUnassignedParticipant(client, actor, view);
    return allowed ? null : ctx.failure("forbidden", "אין הרשאה לעדכן את כרטיס המעקב של החניכה הזאת.");
  }
  const mentor = await client.query("SELECT id, coordinator_id FROM mentoring.memberships WHERE organization_id = $1 AND id = $2 AND role = 'mentor' FOR SHARE", [actor.organizationId, subject.staffId]);
  if (!mentor.rows[0]) return ctx.failure("not_found", "כרטיס החונך/ת לא נמצא.");
  if (actor.role !== "ceo" && String(mentor.rows[0].coordinator_id ?? "") !== actor.id) return ctx.failure("forbidden", "אפשר לעדכן כרטיס מעקב רק לחונכים ולחונכות מהצוות שלך.");
  return null;
}

function subjectColumns(subject: TrackingSubject): { readonly kind: "mentee" | "mentor"; readonly participantId: string | null; readonly mentorId: string | null; readonly subjectId: string } {
  return subject.kind === "mentee"
    ? { kind: "mentee", participantId: subject.participantId, mentorId: null, subjectId: subject.participantId }
    : { kind: "mentor", participantId: null, mentorId: subject.staffId, subjectId: subject.staffId };
}

export async function handleTrackingCommand(ctx: CommandContext, command: MentoringCommand): Promise<CommandResult | null> {
  if (!isTrackingCommand(command)) return null;
  const { client, actor, now } = ctx;
  if (!canUseTrackingCards(actor)) return ctx.failure("forbidden", "כרטיסי המעקב זמינים למנכ״ל ולרכזות בלבד.");
  if (await trackingSchemaState(client) !== "ready") return ctx.failure("not_configured", "כרטיסי המעקב אינם זמינים כרגע. יש לנסות שוב מאוחר יותר.");
  const denied = await authorizeSubject(ctx, command.subject);
  if (denied) return denied;
  const subject = subjectColumns(command.subject);
  const result = (): CommandResult => ({ ...ctx.success(command, subject.kind === "mentee" ? subject.participantId ?? undefined : undefined), ...(subject.kind === "mentor" ? { staffId: subject.subjectId } : {}) });
  const subjectPredicate = subject.kind === "mentee" ? "participant_id = $2" : "mentor_id = $2";

  if (command.type === "record_tracking_report") {
    await client.query(`INSERT INTO mentoring.tracking_reports (id, organization_id, subject_kind, participant_id, mentor_id, author_id, method, outcome, occurred_at, received_at, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,clock_timestamp(),$10)`,
    [randomUUID(), actor.organizationId, subject.kind, subject.participantId, subject.mentorId, actor.id, command.method, command.outcome, command.occurredAt, command.notes]);
    await ctx.audit(command, subject.participantId ?? undefined, { subjectKind: subject.kind, subjectId: subject.subjectId, method: command.method, outcome: command.outcome });
    return result();
  }

  const current = await client.query(`SELECT * FROM mentoring.tracking_cards WHERE organization_id = $1 AND ${subjectPredicate} FOR UPDATE`, [actor.organizationId, subject.subjectId]);
  const row = current.rows[0];
  const fields = command.fields;
  if (!row) {
    if (command.expectedCardVersion !== null) return ctx.failure("conflict", "כרטיס המעקב השתנה. יש לרענן את הנתונים לפני שמירה.", "expectedCardVersion");
    const inserted = await client.query(`INSERT INTO mentoring.tracking_cards (id, organization_id, subject_kind, participant_id, mentor_id, status, status_at, notes, next_followup_at, version, updated_by, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,CASE WHEN $6::text IS NULL THEN NULL ELSE $7::timestamptz END,$8,$9,1,$10,clock_timestamp(),clock_timestamp())
      ON CONFLICT DO NOTHING RETURNING id`,
    [randomUUID(), actor.organizationId, subject.kind, subject.participantId, subject.mentorId, fields.status, now, fields.notes, fields.nextFollowupAt, actor.id]);
    if (inserted.rowCount !== 1) return ctx.failure("conflict", "כרטיס המעקב נוצר בינתיים. יש לרענן את הנתונים לפני שמירה.", "expectedCardVersion");
    await ctx.audit(command, subject.participantId ?? undefined, { subjectKind: subject.kind, subjectId: subject.subjectId, version: 1, status: fields.status });
    return result();
  }
  if (Number(row.version) !== command.expectedCardVersion) return ctx.failure("conflict", "כרטיס המעקב עודכן. יש לרענן את הנתונים לפני שמירה.", "expectedCardVersion");
  const statusChanged = (row.status ?? null) !== fields.status;
  await client.query(`UPDATE mentoring.tracking_cards SET status = $3::text,
      status_at = CASE WHEN $3::text IS NULL THEN NULL WHEN $4::boolean THEN $5::timestamptz ELSE status_at END,
      notes = $6, next_followup_at = $7, version = version + 1, updated_by = $8, updated_at = clock_timestamp()
    WHERE organization_id = $1 AND id = $2`,
  [actor.organizationId, row.id, fields.status, statusChanged, now, fields.notes, fields.nextFollowupAt, actor.id]);
  await ctx.audit(command, subject.participantId ?? undefined, { subjectKind: subject.kind, subjectId: subject.subjectId, version: Number(row.version) + 1, status: fields.status });
  return result();
}
