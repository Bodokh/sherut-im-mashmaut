import "server-only";

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { StaffProfile } from "../../contracts";
import { MentoringServerError } from "../../server/db";
import { iso, staffFromRow } from "../../server/repository";
import { normalizeStaffMobile } from "../reminders/policy";
import { configuredReminderTransport, transportBlockedReason, validProviderName, type ReminderTransport } from "../reminders/transport";
import type { SendStaffSmsCommand, StaffSmsBatchView, StaffSmsDeliveryView } from "./contracts";

const MAX_BATCH_HISTORY = 20;

export function eligibleStaffSmsPhone(staff: StaffProfile): string | null {
  return staff.active && !(staff.role === "ceo" && staff.smsMuted) ? normalizeStaffMobile(staff.phone) : null;
}

/** The command receipt and audit must commit in this same transaction. */
export async function createStaffSmsBatch(client: PoolClient, actor: StaffProfile, command: SendStaffSmsCommand, now: string, transport: ReminderTransport | null = configuredReminderTransport()): Promise<{ batchId: string; recipientCount: number; deliveryCount: number }> {
  const members = await client.query("SELECT * FROM mentoring.memberships WHERE organization_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR SHARE", [actor.organizationId, [...new Set([actor.id, ...command.recipients.map((recipient) => recipient.staffId)])]]);
  const staff = members.rows.map(staffFromRow);
  const currentActor = staff.find((member) => member.id === actor.id);
  if (!currentActor?.active || currentActor.role !== "ceo") throw new MentoringServerError("forbidden", "שליחת הודעות לצוות זמינה להנהלה בלבד.");
  if (!transport || transportBlockedReason(transport) || !validProviderName(transport.provider)) throw new MentoringServerError("unavailable", "שליחת SMS אינה זמינה כעת. ההודעה לא נשמרה לשליחה מאוחרת.");
  if (typeof command.message !== "string" || !command.message.trim() || command.message.length > 1_000 || command.recipients.length === 0 || command.recipients.length > 500 || new Set(command.recipients.map((recipient) => recipient.staffId)).size !== command.recipients.length) throw new MentoringServerError("validation", "יש להזין הודעה באורך של עד 1,000 תווים ולבחור נמענים.");
  const destinations = new Map<string, StaffProfile[]>();
  for (const recipient of command.recipients) {
    const member = staff.find((candidate) => candidate.id === recipient.staffId);
    if (!member || member.version !== recipient.expectedVersion) throw new MentoringServerError("conflict", "פרטי הצוות השתנו. יש לרענן ולבדוק את בחירת הנמענים לפני השליחה.");
    const phone = eligibleStaffSmsPhone(member);
    if (!phone) throw new MentoringServerError("validation", "אחד הנמענים אינו פעיל, חסר מספר נייד תקין או שהשתיק הודעות.", "recipients");
    destinations.set(phone, [...(destinations.get(phone) ?? []), member]);
  }
  await client.query(`INSERT INTO mentoring.staff_sms_batches(id,organization_id,sender_staff_id,operation_id,message,selected_recipients,created_at)
    VALUES($1,$2,$3,$1,$4,$5::jsonb,$6)`, [command.operationId, actor.organizationId, actor.id, command.message, JSON.stringify(command.recipients), now]);
  for (const [phone, recipients] of destinations) await client.query(`INSERT INTO mentoring.staff_sms_deliveries(id,organization_id,batch_id,destination,recipient_staff_ids,recipient_names,state,created_at,updated_at)
    VALUES($1,$2,$3,$4,$5::uuid[],$6::text[],'pending',$7,$7)`, [randomUUID(), actor.organizationId, command.operationId, phone, recipients.map((member) => member.id), recipients.map((member) => member.displayName), now]);
  return { batchId: command.operationId, recipientCount: command.recipients.length, deliveryCount: destinations.size };
}

export async function loadStaffSmsBatches(client: PoolClient, actor: StaffProfile): Promise<readonly StaffSmsBatchView[]> {
  if (!actor.active || actor.role !== "ceo") return [];
  const batches = await client.query(`SELECT b.*,m.display_name AS sender_name FROM mentoring.staff_sms_batches b
    JOIN mentoring.memberships m ON m.organization_id=b.organization_id AND m.id=b.sender_staff_id
    JOIN mentoring.memberships viewer ON viewer.organization_id=b.organization_id AND viewer.id=$2 AND viewer.active=true AND viewer.role='ceo'
    WHERE b.organization_id=$1 ORDER BY b.created_at DESC,b.id LIMIT $3`, [actor.organizationId, actor.id, MAX_BATCH_HISTORY]);
  if (!batches.rows.length) return [];
  const deliveries = await client.query("SELECT * FROM mentoring.staff_sms_deliveries WHERE organization_id=$1 AND batch_id=ANY($2::uuid[]) ORDER BY created_at,id", [actor.organizationId, batches.rows.map((batch) => batch.id)]);
  return batches.rows.map((batch): StaffSmsBatchView => ({ id: String(batch.id), message: String(batch.message), senderName: String(batch.sender_name), createdAt: iso(batch.created_at), recipientCount: batch.selected_recipients.length,
    deliveries: deliveries.rows.filter((delivery) => delivery.batch_id === batch.id).map((delivery): StaffSmsDeliveryView => ({ id: String(delivery.id), recipientStaffIds: delivery.recipient_staff_ids, recipientNames: delivery.recipient_names, state: delivery.state, reason: delivery.reason, providerReference: delivery.provider_reference, updatedAt: iso(delivery.updated_at) })) }));
}
