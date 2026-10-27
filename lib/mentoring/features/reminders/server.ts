import type { PoolClient } from "pg";
import type { CommandResult, MentoringCommand, StaffProfile } from "../../contracts";
import type { CommandContext } from "../../server/command-context";
import { MentoringServerError, withTransaction } from "../../server/db";
import { iso, loadParticipant, staffFromRow } from "../../server/repository";
import { getOrganizationSettings } from "../oversight/server";
import type { ReminderAttempt, ReminderJobView, ReminderReadiness, ReminderReason } from "./contracts";
import { normalizeStaffMobile, planReminderOccurrences, selectReminderRecipients } from "./policy";
import { configuredReminderTransport, transportBlockedReason, type ReminderTransport } from "./transport";

export type ReminderTransaction = <T>(run: (client: PoolClient) => Promise<T>) => Promise<T>;
export const reminderTransaction: ReminderTransaction = (run) => withTransaction(run);
const MAX_EVALUATION_PARTICIPANTS = 200;
const MAX_HISTORY_DIAGNOSTICS = 200;

/** All callers use participant → job lock ordering, including the dispatcher. */
export async function rebuildParticipantReminders(client: PoolClient, organizationId: string, participantId: string, actorId: string, operationId: string | null, now: string, transport: ReminderTransport | null = configuredReminderTransport()): Promise<number> {
  const locked = await client.query("SELECT id, lifecycle, deleted_at FROM mentoring.participants WHERE organization_id=$1 AND id=$2 FOR UPDATE", [organizationId, participantId]);
  if (!locked.rows[0]) return 0;
  const view = await loadParticipant(client, organizationId, participantId);
  if (!view) return 0;
  const settings = await getOrganizationSettings(client, organizationId, now);
  const members = await client.query("SELECT * FROM mentoring.memberships WHERE organization_id=$1 ORDER BY id", [organizationId]);
  const staff = members.rows.map(staffFromRow);
  const eligible = locked.rows[0].deleted_at == null && locked.rows[0].lifecycle === "active";
  const occurrences = eligible ? planReminderOccurrences(view, settings, now) : [];
  const recipients = eligible ? selectReminderRecipients(view, staff, settings) : [];
  const keys: string[] = [];
  for (const occurrence of occurrences) for (const recipient of recipients) {
    const reason: ReminderReason = normalizeStaffMobile(recipient.phone) ? transportBlockedReason(transport) : "invalid_staff_phone";
    keys.push(`${recipient.id}|${occurrence.occurrenceKey}`);
    await client.query(`INSERT INTO mentoring.reminder_jobs
      (id,organization_id,participant_id,recipient_staff_id,kind,occurrence_key,generation,scheduled_at,reference_at,state,reason,last_evaluated_by,last_evaluated_operation_id,created_at,updated_at)
      VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
      ON CONFLICT (organization_id,participant_id,recipient_staff_id,occurrence_key) DO UPDATE SET
        generation=CASE WHEN reminder_jobs.state IN ('pending','blocked','cancelled') THEN EXCLUDED.generation ELSE reminder_jobs.generation END,
        scheduled_at=CASE WHEN reminder_jobs.state IN ('pending','blocked','cancelled') THEN EXCLUDED.scheduled_at ELSE reminder_jobs.scheduled_at END,
        reference_at=CASE WHEN reminder_jobs.state IN ('pending','blocked','cancelled') THEN EXCLUDED.reference_at ELSE reminder_jobs.reference_at END,
        state=CASE WHEN reminder_jobs.state IN ('pending','blocked','cancelled') THEN EXCLUDED.state ELSE reminder_jobs.state END,
        reason=CASE WHEN reminder_jobs.state IN ('pending','blocked','cancelled') THEN EXCLUDED.reason ELSE reminder_jobs.reason END,
        last_evaluated_by=EXCLUDED.last_evaluated_by,last_evaluated_operation_id=EXCLUDED.last_evaluated_operation_id,updated_at=EXCLUDED.updated_at`,
    [organizationId, participantId, recipient.id, occurrence.kind, occurrence.occurrenceKey, occurrence.generation, occurrence.scheduledAt, occurrence.referenceAt, reason ? "blocked" : "pending", reason, actorId, operationId, now]);
  }
  // In-flight, accepted, delivered, and uncertain attempts retain their evidence.
  // A later contact cannot promise to retract an already claimed external SMS.
  await client.query(`UPDATE mentoring.reminder_jobs SET state='cancelled',reason='superseded',updated_at=$3
    WHERE organization_id=$1 AND participant_id=$2 AND state IN ('pending','blocked')
    AND NOT ((recipient_staff_id::text || '|' || occurrence_key)=ANY($4::text[]))`, [organizationId, participantId, now, keys]);
  return keys.length;
}

export interface ReminderEvaluation { readonly scanned: number; readonly planned: number; readonly nextCursor: string | null }

/** A bounded page. CLI callers continue with nextCursor in a new transaction. */
export async function evaluateReminders(client: PoolClient, actor: StaffProfile, now: string, afterParticipantId: string | null = null): Promise<ReminderEvaluation> {
  const identity = await client.query("SELECT * FROM mentoring.memberships WHERE organization_id=$1 AND id=$2 AND active=true", [actor.organizationId, actor.id]);
  const current = identity.rows[0] ? staffFromRow(identity.rows[0]) : null;
  if (!current || current.role === "mentor") throw new MentoringServerError("forbidden", "סריקת תזכורות זמינה להנהלה ולרכזים ולרכזות בלבד.");
  const rows = await client.query(`SELECT p.id FROM mentoring.participants p
    WHERE p.organization_id=$1 AND ($4::uuid IS NULL OR p.id>$4::uuid) AND
      ($3='ceo' OR EXISTS (SELECT 1 FROM mentoring.assignments a WHERE a.organization_id=p.organization_id AND a.participant_id=p.id AND a.ended_at IS NULL AND a.coordinator_id=$2))
    ORDER BY p.id LIMIT $5`, [current.organizationId, current.id, current.role, afterParticipantId, MAX_EVALUATION_PARTICIPANTS + 1]);
  const page = rows.rows.slice(0, MAX_EVALUATION_PARTICIPANTS);
  let planned = 0;
  for (const row of page) planned += await rebuildParticipantReminders(client, current.organizationId, String(row.id), current.id, null, now);
  return { scanned: page.length, planned, nextCursor: rows.rows.length > MAX_EVALUATION_PARTICIPANTS ? String(page.at(-1)!.id) : null };
}

export async function handleReminderCommand(ctx: CommandContext, command: MentoringCommand): Promise<CommandResult | null> {
  if (command.type !== "evaluate_reminders") return null;
  if (!ctx.actor.active || ctx.actor.role === "mentor") return ctx.failure("forbidden", "סריקת תזכורות זמינה להנהלה ולרכזים ולרכזות בלבד.");
  const result = await evaluateReminders(ctx.client, ctx.actor, ctx.now, command.afterParticipantId ?? null);
  await ctx.audit(command, undefined, { scanned: result.scanned, planned: result.planned, more: result.nextCursor !== null });
  return { ...ctx.success(command), reminderScan: result };
}

export async function loadReminderExtras(client: PoolClient, actor: StaffProfile, visibleParticipantIds: readonly string[]): Promise<{ reminders: readonly ReminderJobView[]; reminderReadiness: ReminderReadiness }> {
  const settings = await getOrganizationSettings(client, actor.organizationId, new Date().toISOString());
  const transport = configuredReminderTransport();
  const blocked = transportBlockedReason(transport);
  const rows = !actor.active || actor.role === "mentor" || visibleParticipantIds.length === 0 ? { rows: [] } : await client.query(`WITH scoped AS (SELECT j.*,p.display_name AS participant_name,m.display_name AS recipient_name
    FROM mentoring.reminder_jobs j JOIN mentoring.participants p ON p.organization_id=j.organization_id AND p.id=j.participant_id
    JOIN mentoring.memberships m ON m.organization_id=j.organization_id AND m.id=j.recipient_staff_id
    WHERE j.organization_id=$1 AND j.participant_id=ANY($2::uuid[]) AND p.deleted_at IS NULL
      AND ($4='ceo' OR EXISTS (SELECT 1 FROM mentoring.assignments a WHERE a.organization_id=j.organization_id AND a.participant_id=j.participant_id AND a.ended_at IS NULL AND a.coordinator_id=$3)))
    SELECT * FROM scoped WHERE state NOT IN ('delivered','cancelled')
    UNION ALL (SELECT * FROM scoped WHERE state IN ('delivered','cancelled') ORDER BY updated_at DESC,id LIMIT $5)
    ORDER BY updated_at DESC,id`, [actor.organizationId, [...visibleParticipantIds], actor.id, actor.role, MAX_HISTORY_DIAGNOSTICS + 1]);
  const current = rows.rows.filter((row) => !["delivered", "cancelled"].includes(row.state));
  const history = rows.rows.filter((row) => ["delivered", "cancelled"].includes(row.state));
  // A large history must never evict an unresolved/current job from the prepared
  // offline working set. Failed deliveries remain unresolved diagnostics too.
  // Only delivered/cancelled history is bounded and labelled.
  const jobs = [...current, ...history.slice(0, MAX_HISTORY_DIAGNOSTICS)];
  const attempts = jobs.length === 0 ? { rows: [] } : await client.query("SELECT * FROM mentoring.reminder_attempts WHERE organization_id=$1 AND job_id=ANY($2::uuid[]) ORDER BY attempt_number DESC", [actor.organizationId, jobs.map((row) => row.id)]);
  const reminders = jobs.map((row): ReminderJobView => ({
    id: String(row.id), participantId: String(row.participant_id), participantName: String(row.participant_name), recipientStaffId: String(row.recipient_staff_id), recipientName: String(row.recipient_name),
    kind: row.kind, scheduledAt: iso(row.scheduled_at), referenceAt: iso(row.reference_at), state: row.state, reason: row.reason, updatedAt: iso(row.updated_at),
    attempts: attempts.rows.filter((attempt) => attempt.job_id === row.id).map((attempt): ReminderAttempt => ({ id: String(attempt.id), attemptNumber: Number(attempt.attempt_number), state: attempt.state, claimedAt: iso(attempt.claimed_at), finishedAt: attempt.finished_at == null ? null : iso(attempt.finished_at), leaseExpiresAt: iso(attempt.lease_expires_at), provider: String(attempt.provider), providerReference: attempt.provider_reference, reason: attempt.reason })),
  }));
  return { reminders, reminderReadiness: { smsProviderConfigured: transport !== null, smsCredentialsConfigured: transport?.credentialsConfigured === true, smsSendingEnabled: blocked === null, hostedSchedulerConfigured: false, evaluationMode: "manual_and_cli", blockedReasons: [...(transport ? [] : ["missing_sms_provider" as const]), ...(transport?.credentialsConfigured ? [] : ["missing_sms_credentials" as const]), ...(blocked === "sending_disabled" ? ["sending_disabled" as const] : []), "hosted_scheduler_not_configured"], audience: settings.reminderAudience, appointmentReminderMinutesBefore: settings.appointmentReminderMinutesBefore, overdueRemindersEnabled: settings.overdueRemindersEnabled, overdueRepeatHours: settings.overdueRepeatHours, diagnosticsTruncated: history.length > MAX_HISTORY_DIAGNOSTICS } };
}
