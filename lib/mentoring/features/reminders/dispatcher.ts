import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { StaffProfile } from "../../contracts";
import { iso, loadParticipant, staffFromRow } from "../../server/repository";
import { getOrganizationSettings } from "../oversight/server";
import { normalizeStaffMobile, planReminderOccurrences, reminderMessage, selectReminderRecipients } from "./policy";
import { rebuildParticipantReminders, reminderTransaction, type ReminderTransaction } from "./server";
import { configuredReminderTransport, safeProviderReference, transportBlockedReason, validProviderName, type ReminderTransport, type TransportResult } from "./transport";

export interface ReminderClaim {
  readonly organizationId: string;
  readonly jobId: string;
  readonly attemptId: string;
  readonly claimToken: string;
  readonly recipient: string;
  readonly message: string;
  readonly provider: string;
  readonly idempotencyKey: string;
}

/** Unknown previous effects are never made pending by lease recovery. */
export async function expireReminderLeases(client: PoolClient, organizationId: string, now: string): Promise<number> {
  const candidates = await client.query("SELECT id,participant_id FROM mentoring.reminder_jobs WHERE organization_id=$1 AND state='dispatching' AND lease_expires_at<=$2 ORDER BY participant_id,id LIMIT 100", [organizationId, now]);
  let expired = 0;
  for (const candidate of candidates.rows) {
    await client.query("SELECT id FROM mentoring.participants WHERE organization_id=$1 AND id=$2 FOR UPDATE", [organizationId, candidate.participant_id]);
    const result = await client.query(`UPDATE mentoring.reminder_jobs SET state='uncertain',reason='lease_expired',updated_at=$3
      WHERE organization_id=$1 AND id=$2 AND state='dispatching' AND lease_expires_at<=$3 RETURNING claim_token`, [organizationId, candidate.id, now]);
    if (!result.rows[0]) continue;
    await client.query(`UPDATE mentoring.reminder_attempts SET state='uncertain',reason='lease_expired',finished_at=$4
      WHERE organization_id=$1 AND job_id=$2 AND claim_token=$3 AND state='dispatching'`, [organizationId, candidate.id, result.rows[0].claim_token, now]);
    expired += 1;
  }
  return expired;
}

/** Commit this result before invoking a transport. No external effect occurs here. */
export async function claimReminder(client: PoolClient, actor: StaffProfile, jobId: string, now: string, transport: ReminderTransport | null): Promise<ReminderClaim | null> {
  // The participant row is the synchronization barrier shared with contact,
  // correction, assignment, lifecycle and deletion command transactions.
  const participant = await client.query(`SELECT p.id FROM mentoring.participants p JOIN mentoring.reminder_jobs j
    ON j.organization_id=p.organization_id AND j.participant_id=p.id
    WHERE j.organization_id=$1 AND j.id=$2 FOR UPDATE OF p`, [actor.organizationId, jobId]);
  if (!participant.rows[0]) return null;
  const participantId = String(participant.rows[0].id);
  const job = await client.query("SELECT * FROM mentoring.reminder_jobs WHERE organization_id=$1 AND id=$2 FOR UPDATE", [actor.organizationId, jobId]);
  if (!job.rows[0] || !["pending", "blocked"].includes(job.rows[0].state) || Date.parse(iso(job.rows[0].scheduled_at)) > Date.parse(now)) return null;
  const identity = await client.query("SELECT * FROM mentoring.memberships WHERE organization_id=$1 AND id=$2 AND active=true FOR SHARE", [actor.organizationId, actor.id]);
  const currentActor = identity.rows[0] ? staffFromRow(identity.rows[0]) : null;
  if (!currentActor || currentActor.role === "mentor") return null;
  const view = await loadParticipant(client, actor.organizationId, participantId);
  if (!view || (currentActor.role !== "ceo" && view.assignment?.coordinatorId !== currentActor.id)) return null;
  // Freeze policy and recipient account/preference rows until the claim commits.
  await client.query("SELECT organization_id FROM mentoring.organization_settings WHERE organization_id=$1 FOR SHARE", [actor.organizationId]);
  const settings = await getOrganizationSettings(client, actor.organizationId, now);
  const members = await client.query("SELECT * FROM mentoring.memberships WHERE organization_id=$1 ORDER BY id FOR SHARE", [actor.organizationId]);
  const recipients = selectReminderRecipients(view, members.rows.map(staffFromRow), settings);
  const recipient = recipients.find((member) => member.id === job.rows[0].recipient_staff_id);
  // A contact may have committed while the participant lock was waiting. Its
  // occurrence must not be excluded by the caller's earlier clock snapshot.
  // The supplied clock remains a lower bound for deterministic future tests.
  const clock = await client.query("SELECT clock_timestamp() AS now");
  const claimNow = new Date(Math.max(Date.parse(now), Date.parse(iso(clock.rows[0].now)))).toISOString();
  // Rebuilding uses this same lock and cancels any occurrence superseded by a
  // contact committed before this claim. Previously accepted jobs stay terminal.
  await rebuildParticipantReminders(client, actor.organizationId, participantId, currentActor.id, null, claimNow, transport);
  const refreshed = await client.query("SELECT * FROM mentoring.reminder_jobs WHERE organization_id=$1 AND id=$2", [actor.organizationId, jobId]);
  const current = refreshed.rows[0];
  if (!current || current.state !== "pending" || !recipient || !transport || transportBlockedReason(transport) || !validProviderName(transport.provider)) return null;
  const deleted = await client.query("SELECT deleted_at,lifecycle FROM mentoring.participants WHERE organization_id=$1 AND id=$2", [actor.organizationId, participantId]);
  if (!deleted.rows[0] || deleted.rows[0].deleted_at != null || deleted.rows[0].lifecycle !== "active") return null;
  const occurrence = planReminderOccurrences(view, settings, claimNow).find((item) => item.occurrenceKey === current.occurrence_key && item.generation === current.generation && Date.parse(item.scheduledAt) <= Date.parse(claimNow));
  const phone = normalizeStaffMobile(recipient.phone);
  if (!occurrence || !phone) return null;
  const claimToken = randomUUID();
  const attemptId = randomUUID();
  const leaseExpiresAt = new Date(Date.parse(claimNow) + 60_000).toISOString();
  const sequence = await client.query("SELECT coalesce(max(attempt_number),0)+1 AS number FROM mentoring.reminder_attempts WHERE organization_id=$1 AND job_id=$2", [actor.organizationId, jobId]);
  await client.query(`INSERT INTO mentoring.reminder_attempts(id,organization_id,job_id,participant_id,claim_token,attempt_number,state,claimed_at,lease_expires_at,provider,generation,scheduled_at,reference_at,recipient_version,claimed_by_staff_id)
    VALUES($1,$2,$3,$4,$5,$6,'dispatching',$7,$8,$9,$10,$11,$12,$13,$14)`, [attemptId, actor.organizationId, jobId, participantId, claimToken, Number(sequence.rows[0].number), claimNow, leaseExpiresAt, transport.provider, current.generation, current.scheduled_at, current.reference_at, recipient.version, currentActor.id]);
  await client.query("UPDATE mentoring.reminder_jobs SET state='dispatching',reason=NULL,claim_token=$3,lease_expires_at=$4,updated_at=$5 WHERE organization_id=$1 AND id=$2", [actor.organizationId, jobId, claimToken, leaseExpiresAt, claimNow]);
  return { organizationId: actor.organizationId, jobId, attemptId, claimToken, recipient: phone, message: reminderMessage(view.participant.displayName, occurrence), provider: transport.provider, idempotencyKey: `mentoring-reminder:${jobId}` };
}

/** Bounded provider wait; even a transport ignoring AbortSignal cannot hang a run. */
export async function invokeReminderTransport(transport: ReminderTransport, claim: ReminderClaim, timeoutMs = 15_000, reconcileReference?: string | null): Promise<TransportResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<TransportResult>((resolve) => { timer = setTimeout(() => { controller.abort(); resolve({ state: "uncertain" }); }, Math.max(1, Math.min(timeoutMs, 30_000))); });
    const request: Promise<TransportResult> = reconcileReference !== undefined
      ? transport.reconcile?.({ idempotencyKey: claim.idempotencyKey, providerReference: reconcileReference, signal: controller.signal }) ?? Promise.resolve({ state: "uncertain" })
      : transport.send({ recipient: claim.recipient, message: claim.message, idempotencyKey: claim.idempotencyKey, signal: controller.signal });
    const result = await Promise.race([request, timeout]);
    if (!result || !["provider_accepted", "delivered", "failed", "uncertain"].includes(result.state)) return { state: "uncertain" };
    const reference = safeProviderReference(result.providerReference);
    if ((result.state === "provider_accepted" || result.state === "delivered") && !reference) return { state: "uncertain" };
    return { state: result.state, ...(reference ? { providerReference: reference } : {}) } as TransportResult;
  } catch { return { state: "uncertain" }; }
  finally { if (timer) clearTimeout(timer); }
}

export async function recordReminderResult(client: PoolClient, claim: Pick<ReminderClaim, "organizationId" | "jobId" | "claimToken" | "provider">, result: TransportResult, now: string): Promise<void> {
  const participant = await client.query(`SELECT p.id FROM mentoring.participants p JOIN mentoring.reminder_jobs j ON j.organization_id=p.organization_id AND j.participant_id=p.id WHERE j.organization_id=$1 AND j.id=$2 FOR UPDATE OF p`, [claim.organizationId, claim.jobId]);
  if (!participant.rows[0]) return;
  const job = await client.query("SELECT state,claim_token FROM mentoring.reminder_jobs WHERE organization_id=$1 AND id=$2 FOR UPDATE", [claim.organizationId, claim.jobId]);
  if (!job.rows[0] || job.rows[0].claim_token !== claim.claimToken || !["dispatching", "uncertain", "provider_accepted"].includes(job.rows[0].state)) return;
  // Confirmed acceptance is monotonic: a later unsuccessful lookup cannot turn
  // known acceptance into an apparent failed message eligible for retry.
  if (job.rows[0].state === "provider_accepted" && result.state !== "delivered") return;
  const providerReference = safeProviderReference(result.providerReference);
  const state = (result.state === "provider_accepted" || result.state === "delivered") && !providerReference ? "uncertain" : result.state;
  const reason = state === "uncertain" ? "provider_outcome_unknown" : state === "failed" ? "provider_rejected" : null;
  const attempt = await client.query(`UPDATE mentoring.reminder_attempts SET state=$5,provider_reference=coalesce($6,provider_reference),reason=$7,finished_at=$8
    WHERE organization_id=$1 AND job_id=$2 AND claim_token=$3 AND provider=$4 RETURNING id`, [claim.organizationId, claim.jobId, claim.claimToken, claim.provider, state, providerReference, reason, now]);
  if (!attempt.rows[0]) return;
  await client.query("UPDATE mentoring.reminder_jobs SET state=$4,reason=$5,updated_at=$6 WHERE organization_id=$1 AND id=$2 AND claim_token=$3", [claim.organizationId, claim.jobId, claim.claimToken, state, reason, now]);
}

export interface DispatcherResult { readonly considered: number; readonly claimed: number; readonly outcomes: Readonly<Record<string, number>>; readonly blocked: boolean }

/** The provider call is deliberately outside every retryable transaction. */
export async function runDispatcher(options: { readonly actor: StaffProfile; readonly transport?: ReminderTransport | null; readonly transaction?: ReminderTransaction; readonly resultTransaction?: ReminderTransaction; readonly now?: () => string; readonly limit?: number; readonly timeoutMs?: number }): Promise<DispatcherResult> {
  const transaction = options.transaction ?? reminderTransaction;
  // A committed claim's known external result must remain recordable after
  // actor authority changes. This boundary can only persist that exact claim;
  // authorization, maintenance, candidate selection and new claims stay above.
  const resultTransaction = options.resultTransaction ?? transaction;
  const transport = options.transport === undefined ? configuredReminderTransport() : options.transport;
  const now = options.now ?? (() => new Date().toISOString());
  const limit = Math.max(1, Math.min(Math.floor(options.limit ?? 25), 100));
  const authorized = await transaction(async (client) => (await client.query("SELECT id FROM mentoring.memberships WHERE organization_id=$1 AND id=$2 AND active=true AND role IN ('ceo','coordinator')", [options.actor.organizationId, options.actor.id])).rows.length > 0);
  if (!authorized) return { considered: 0, claimed: 0, outcomes: {}, blocked: true };
  await transaction((client) => expireReminderLeases(client, options.actor.organizationId, now()));
  if (!transport || transportBlockedReason(transport) || !validProviderName(transport.provider)) return { considered: 0, claimed: 0, outcomes: {}, blocked: true };
  const ids = await transaction(async (client) => (await client.query(`SELECT j.id FROM mentoring.reminder_jobs j
    JOIN mentoring.participants p ON p.organization_id=j.organization_id AND p.id=j.participant_id AND p.lifecycle='active' AND p.deleted_at IS NULL
    JOIN mentoring.memberships recipient ON recipient.organization_id=j.organization_id AND recipient.id=j.recipient_staff_id AND recipient.active=true AND (recipient.role<>'ceo' OR recipient.sms_muted=false)
    JOIN mentoring.memberships actor ON actor.organization_id=j.organization_id AND actor.id=$4 AND actor.active=true
    WHERE j.organization_id=$1 AND (j.state='pending' OR (j.state='blocked' AND j.reason IN ('missing_sms_provider','missing_sms_credentials','sending_disabled'))) AND j.scheduled_at<=$2
      AND (actor.role='ceo' OR (actor.role='coordinator' AND EXISTS(SELECT 1 FROM mentoring.assignments a WHERE a.organization_id=j.organization_id AND a.participant_id=j.participant_id AND a.ended_at IS NULL AND a.coordinator_id=actor.id)))
    ORDER BY j.scheduled_at,j.id LIMIT $3`, [options.actor.organizationId, now(), limit, options.actor.id])).rows.map((row) => String(row.id)));
  let claimed = 0;
  const outcomes: Record<string, number> = {};
  for (const id of ids) {
    const claim = await transaction((client) => claimReminder(client, options.actor, id, now(), transport));
    if (!claim) continue;
    claimed += 1;
    const result = await invokeReminderTransport(transport, claim, options.timeoutMs);
    await resultTransaction((client) => recordReminderResult(client, claim, result, now()));
    outcomes[result.state] = (outcomes[result.state] ?? 0) + 1;
  }
  return { considered: ids.length, claimed, outcomes, blocked: false };
}

/** Read-only provider reconciliation; never calls send and never resets a job. */
export async function reconcileReminder(options: { readonly actor: StaffProfile; readonly jobId: string; readonly transport: ReminderTransport; readonly transaction?: ReminderTransaction; readonly now?: () => string }): Promise<boolean> {
  if (!options.transport.reconcile || !validProviderName(options.transport.provider)) return false;
  const transaction = options.transaction ?? reminderTransaction;
  const now = options.now ?? (() => new Date().toISOString());
  const current = await transaction(async (client) => {
    const row = await client.query(`SELECT j.*,a.provider,a.provider_reference FROM mentoring.reminder_jobs j JOIN mentoring.reminder_attempts a ON a.organization_id=j.organization_id AND a.job_id=j.id AND a.claim_token=j.claim_token
      JOIN mentoring.memberships m ON m.organization_id=j.organization_id AND m.id=$3 AND m.active=true
      WHERE j.organization_id=$1 AND j.id=$2 AND j.state IN ('uncertain','provider_accepted') AND (m.role='ceo' OR (m.role='coordinator' AND EXISTS(SELECT 1 FROM mentoring.assignments x WHERE x.organization_id=j.organization_id AND x.participant_id=j.participant_id AND x.ended_at IS NULL AND x.coordinator_id=m.id)))`, [options.actor.organizationId, options.jobId, options.actor.id]);
    return row.rows[0];
  });
  if (!current || current.provider !== options.transport.provider) return false;
  const claim = { organizationId: options.actor.organizationId, jobId: options.jobId, claimToken: String(current.claim_token), provider: String(current.provider), idempotencyKey: `mentoring-reminder:${options.jobId}`, recipient: "", message: "", attemptId: "" };
  const result = await invokeReminderTransport(options.transport, claim, 15_000, current.provider_reference == null ? null : String(current.provider_reference));
  await transaction((client) => recordReminderResult(client, claim, result, now()));
  return true;
}
