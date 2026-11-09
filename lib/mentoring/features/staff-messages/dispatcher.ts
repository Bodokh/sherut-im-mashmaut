import "server-only";

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { withTransaction } from "../../server/db";
import { iso, staffFromRow } from "../../server/repository";
import { invokeReminderTransport } from "../reminders/dispatcher";
import { configuredReminderTransport, safeProviderReference, transportBlockedReason, validProviderName, type ReminderTransport, type TransportResult } from "../reminders/transport";
import { eligibleStaffSmsPhone } from "./server";

export type StaffSmsTransaction = <T>(run: (client: PoolClient) => Promise<T>) => Promise<T>;

export interface StaffSmsClaim {
  readonly organizationId: string;
  readonly deliveryId: string;
  readonly claimToken: string;
  readonly provider: string;
  readonly recipient: string;
  readonly message: string;
  readonly idempotencyKey: string;
}

/** Unknown external effects never return to the pending queue. */
export async function expireStaffSmsLeases(client: PoolClient, organizationId: string, now: string): Promise<number> {
  const result = await client.query(`WITH expired AS (
    SELECT id FROM mentoring.staff_sms_deliveries WHERE organization_id=$1 AND state='dispatching' AND lease_expires_at<=$2
    ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED
  ) UPDATE mentoring.staff_sms_deliveries d SET state='uncertain',reason='lease_expired',finished_at=$2,updated_at=$2
    FROM expired WHERE d.organization_id=$1 AND d.id=expired.id`, [organizationId, now]);
  return result.rowCount ?? 0;
}

/** Membership locks precede the delivery lock; commit before any network call. */
export async function claimStaffSms(client: PoolClient, organizationId: string, deliveryId: string, now: string, transport: ReminderTransport | null): Promise<StaffSmsClaim | null> {
  if (!transport || transportBlockedReason(transport) || !validProviderName(transport.provider)) return null;
  const candidate = await client.query(`SELECT d.*,b.sender_staff_id,b.message FROM mentoring.staff_sms_deliveries d
    JOIN mentoring.staff_sms_batches b ON b.organization_id=d.organization_id AND b.id=d.batch_id
    WHERE d.organization_id=$1 AND d.id=$2`, [organizationId, deliveryId]);
  const delivery = candidate.rows[0];
  if (!delivery || delivery.state !== "pending") return null;
  const members = await client.query("SELECT * FROM mentoring.memberships WHERE organization_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR SHARE", [organizationId, [...new Set([delivery.sender_staff_id, ...delivery.recipient_staff_ids])]]);
  const locked = await client.query("SELECT state FROM mentoring.staff_sms_deliveries WHERE organization_id=$1 AND id=$2 FOR UPDATE", [organizationId, deliveryId]);
  if (locked.rows[0]?.state !== "pending") return null;
  const staff = members.rows.map(staffFromRow);
  const sender = staff.find((member) => member.id === delivery.sender_staff_id);
  const reason = !sender?.active || sender.role !== "ceo" ? "sender_ineligible"
    : !staff.some((member) => delivery.recipient_staff_ids.includes(member.id) && eligibleStaffSmsPhone(member) === delivery.destination) ? "recipient_ineligible" : null;
  const clock = await client.query("SELECT clock_timestamp() AS now");
  const claimNow = new Date(Math.max(Date.parse(now), Date.parse(iso(clock.rows[0].now)))).toISOString();
  if (reason) {
    await client.query("UPDATE mentoring.staff_sms_deliveries SET state='cancelled',reason=$3,finished_at=$4,updated_at=$4 WHERE organization_id=$1 AND id=$2", [organizationId, deliveryId, reason, claimNow]);
    return null;
  }
  const claimToken = randomUUID();
  const leaseExpiresAt = new Date(Date.parse(claimNow) + 60_000).toISOString();
  await client.query(`UPDATE mentoring.staff_sms_deliveries SET state='dispatching',claim_token=$3,claimed_at=$4,lease_expires_at=$5,provider=$6,updated_at=$4
    WHERE organization_id=$1 AND id=$2`, [organizationId, deliveryId, claimToken, claimNow, leaseExpiresAt, transport.provider]);
  return { organizationId, deliveryId, claimToken, provider: transport.provider, recipient: String(delivery.destination), message: String(delivery.message), idempotencyKey: `mentoring-staff-sms:${deliveryId}` };
}

/** A known result belongs to its committed claim even after staff access changes. */
export async function recordStaffSmsResult(client: PoolClient, claim: StaffSmsClaim, result: TransportResult, now: string): Promise<void> {
  const current = await client.query("SELECT state,claim_token,provider FROM mentoring.staff_sms_deliveries WHERE organization_id=$1 AND id=$2 FOR UPDATE", [claim.organizationId, claim.deliveryId]);
  const delivery = current.rows[0];
  if (!delivery || delivery.claim_token !== claim.claimToken || delivery.provider !== claim.provider || !["dispatching", "uncertain", "provider_accepted"].includes(delivery.state)) return;
  const reference = safeProviderReference(result.providerReference);
  const state = !["provider_accepted", "delivered", "failed", "uncertain"].includes(result.state) || ((result.state === "provider_accepted" || result.state === "delivered") && !reference) ? "uncertain" : result.state;
  if (delivery.state === "provider_accepted" && state !== "delivered") return;
  const reason = state === "uncertain" ? "provider_outcome_unknown" : state === "failed" ? "provider_rejected" : null;
  await client.query(`UPDATE mentoring.staff_sms_deliveries SET state=$4,reason=$5,provider_reference=coalesce($6,provider_reference),finished_at=$7,updated_at=$7
    WHERE organization_id=$1 AND id=$2 AND claim_token=$3`, [claim.organizationId, claim.deliveryId, claim.claimToken, state, reason, reference, now]);
}

export interface StaffSmsDispatcherResult {
  readonly considered: number;
  readonly claimed: number;
  readonly outcomes: Readonly<Record<string, number>>;
  readonly blocked: boolean;
}

export async function runStaffSmsDispatcher(options: { readonly organizationId: string; readonly batchId?: string; readonly transport?: ReminderTransport | null; readonly transaction?: StaffSmsTransaction; readonly resultTransaction?: StaffSmsTransaction; readonly now?: () => string; readonly limit?: number; readonly timeoutMs?: number }): Promise<StaffSmsDispatcherResult> {
  const transaction = options.transaction ?? withTransaction;
  const resultTransaction = options.resultTransaction ?? transaction;
  const transport = options.transport === undefined ? configuredReminderTransport() : options.transport;
  const now = options.now ?? (() => new Date().toISOString());
  const limit = Math.max(1, Math.min(Math.floor(options.limit ?? 5), 25));
  await transaction((client) => expireStaffSmsLeases(client, options.organizationId, now()));
  if (!transport || transportBlockedReason(transport) || !validProviderName(transport.provider)) return { considered: 0, claimed: 0, outcomes: {}, blocked: true };
  const ids = await transaction(async (client) => (await client.query(`SELECT id FROM mentoring.staff_sms_deliveries
    WHERE organization_id=$1 AND state='pending' AND ($2::uuid IS NULL OR batch_id=$2) ORDER BY created_at,id LIMIT $3`, [options.organizationId, options.batchId ?? null, limit])).rows.map((row) => String(row.id)));
  let claimed = 0;
  const outcomes: Record<string, number> = {};
  for (const id of ids) {
    const claim = await transaction((client) => claimStaffSms(client, options.organizationId, id, now(), transport));
    if (!claim) continue;
    claimed += 1;
    const result = await invokeReminderTransport(transport, claim, options.timeoutMs ?? 10_000);
    await resultTransaction((client) => recordStaffSmsResult(client, claim, result, now()));
    outcomes[result.state] = (outcomes[result.state] ?? 0) + 1;
  }
  return { considered: ids.length, claimed, outcomes, blocked: false };
}
