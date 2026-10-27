import "server-only";

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { ApiFailure, CommandResult, CommandSuccess, MentoringCommand, ParticipantFields, ParticipantView, StaffProfile } from "../contracts";
import { applyRecordedContact, canPerformParticipantAction, checkWritePreconditions, preserveCeoConflict, type ContactEntry } from "../domain";
import type { CommandContext } from "./command-context";
import { handleContactCommand, recordAppointmentHistory, recordManualColorHistory } from "../features/contacts/server";
import { handleAuthorityCommand, isAuthorityCommand } from "../features/authority/server";
import { handleOversightCommand } from "../features/oversight/server";
import { canReviewMonthlyScope } from "../features/oversight/selectors";
import { handleReminderCommand, rebuildParticipantReminders } from "../features/reminders/server";
import { MentoringServerError, serverFailure, withTransaction } from "./db";
import { iso, loadActorGrants, loadParticipant, ownsUnassignedParticipant, requireIdentity, staffFromRow } from "./repository";
import { commandHash, parseCommand } from "./validation";

const failure = (code: ApiFailure["error"]["code"], message: string, field?: string): ApiFailure => ({ ok: false, error: { code, message, ...(field ? { field } : {}) } });
const success = (command: MentoringCommand, participantId?: string): CommandSuccess => ({ ok: true, operationId: command.operationId, replayed: false, acceptance: "accepted", ...(participantId ? { participantId } : {}) });

async function reserveResource(client: PoolClient, actor: StaffProfile, resourceId: string, kind: "participant" | "contact"): Promise<boolean> {
  const result = await client.query("INSERT INTO mentoring.resource_ids (id,organization_id,kind) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING RETURNING id", [resourceId, actor.organizationId, kind]);
  return result.rowCount === 1;
}

async function saveReceipt(client: PoolClient, actor: StaffProfile, command: MentoringCommand, hash: string, result: CommandResult): Promise<CommandResult> {
  await client.query("INSERT INTO mentoring.operations (organization_id, actor_id, operation_id, payload_hash, response, created_at) VALUES ($1,$2,$3,$4,$5::jsonb,clock_timestamp())", [actor.organizationId, actor.id, command.operationId, hash, JSON.stringify(result)]);
  return result;
}

async function audit(client: PoolClient, actor: StaffProfile, command: MentoringCommand, participantId?: string, details: Record<string, unknown> = {}): Promise<void> {
  await client.query("INSERT INTO mentoring.audit (id, organization_id, actor_id, operation_id, action, participant_id, details, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,clock_timestamp())", [randomUUID(), actor.organizationId, actor.id, command.operationId, command.type, participantId ?? null, JSON.stringify(details)]);
}

async function protect(client: PoolClient, actor: StaffProfile, resourceId: string, revision: number, fieldPaths?: readonly string[]): Promise<void> {
  if (actor.role !== "ceo" || fieldPaths?.length === 0) return;
  await client.query(`INSERT INTO mentoring.ceo_protections
    (organization_id,resource_id,protected_by_staff_id,protected_revision,active,field_paths,created_at)
    VALUES ($1,$2,$3,$4,true,$5::text[],clock_timestamp())
    ON CONFLICT (organization_id,resource_id) DO UPDATE SET
      protected_by_staff_id=EXCLUDED.protected_by_staff_id,protected_revision=EXCLUDED.protected_revision,
      field_paths=CASE WHEN EXCLUDED.field_paths IS NULL THEN NULL
        WHEN NOT mentoring.ceo_protections.active THEN EXCLUDED.field_paths
        WHEN mentoring.ceo_protections.field_paths IS NULL OR cardinality(mentoring.ceo_protections.field_paths)=0 THEN mentoring.ceo_protections.field_paths
        ELSE ARRAY(SELECT DISTINCT unnest(mentoring.ceo_protections.field_paths || EXCLUDED.field_paths)) END,
      active=true,version=mentoring.ceo_protections.version+1,updated_at=clock_timestamp(),
      reason=NULL,unlocked_by_staff_id=NULL,unlocked_at=NULL`, [actor.organizationId, resourceId, actor.id, revision, fieldPaths ?? null]);
}

async function protectParticipantField(client: PoolClient, actor: StaffProfile, participantId: string, revision: number, field: "manualColor" | "appointment"): Promise<void> {
  await protect(client, actor, participantId, revision, [field]);
}

async function preserveConflict(client: PoolClient, actor: StaffProfile, command: MentoringCommand, view: ParticipantView, now: string): Promise<ApiFailure> {
  const conflict = preserveCeoConflict<unknown>({ operationId: command.operationId, organizationId: actor.organizationId, resourceId: view.participant.id, submittedByStaffId: actor.id, authoritative: view, submitted: command, preservedAt: now });
  const conflictId = randomUUID();
  await client.query("INSERT INTO mentoring.conflicts (id,organization_id,participant_id,actor_id,operation_id,authoritative_value,submitted_value,created_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)", [conflictId, actor.organizationId, view.participant.id, actor.id, command.operationId, JSON.stringify(conflict.authoritative), JSON.stringify(conflict.submitted), now]);
  await audit(client, actor, command, view.participant.id, { conflictId, outcome: "ceo_protected", authoritativeVersion: view.participant.version });
  return { ok: false, error: { code: "ceo_protected", message: "הגרסה של המנכ״ל נשמרה. התוכן ששלחת נשמר בנפרד לעיון ההנהלה.", conflictId } };
}

async function cancelReminders(client: PoolClient, organizationId: string, participantId: string): Promise<void> {
  await client.query("UPDATE mentoring.outbox SET status = 'cancelled' WHERE organization_id = $1 AND participant_id = $2 AND status IN ('blocked','pending')", [organizationId, participantId]);
}

const fieldColumns: Record<keyof ParticipantFields, string> = {
  displayName: "display_name", phone: "phone", serviceType: "service_type", servicePlace: "service_place", serviceRole: "service_role", profileNotes: "profile_notes",
};

async function createParticipant(client: PoolClient, actor: StaffProfile, command: Extract<MentoringCommand, { type: "create_participant" }>): Promise<CommandResult> {
  const id = command.operationId;
  const fields = command.fields;
  if (!await reserveResource(client, actor, id, "participant")) return failure("conflict", "מזהה הפעולה כבר משויך לרשומה אחרת. יש ליצור פעולה חדשה.");
  const inserted = await client.query("INSERT INTO mentoring.participants (id,organization_id,display_name,phone,service_type,service_place,service_role,profile_notes,created_by,last_ceo_version,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,clock_timestamp(),clock_timestamp()) ON CONFLICT (id) DO NOTHING RETURNING id", [id, actor.organizationId, fields.displayName?.trim() || "חניכה ללא שם", fields.phone || null, fields.serviceType ?? null, fields.servicePlace || null, fields.serviceRole || null, fields.profileNotes || null, actor.id, actor.role === "ceo" ? 1 : 0]);
  if (inserted.rowCount !== 1) return failure("conflict", "מזהה החניכה כבר קיים. יש ליצור פעולה חדשה.");
  await protect(client, actor, id, 1, Object.keys(fields));
  await audit(client, actor, command, id, { version: 1 });
  return success(command, id);
}

async function updateParticipant(client: PoolClient, actor: StaffProfile, command: Extract<MentoringCommand, { type: "update_participant" }>, view: ParticipantView): Promise<CommandResult> {
  const values: unknown[] = [actor.organizationId, view.participant.id];
  const sets = Object.entries(command.fields).map(([field, value]) => {
    // Names are selected from a closed map after strict schema validation.
    values.push(field === "displayName" ? (String(value ?? "").trim() || "חניכה ללא שם") : (value || null));
    return `${fieldColumns[field as keyof ParticipantFields]} = $${values.length}`;
  });
  await client.query(`UPDATE mentoring.participants SET ${sets.join(", ")}, ${actor.role === "ceo" ? "last_ceo_version = version + 1," : ""} version = version + 1, updated_at = clock_timestamp() WHERE organization_id = $1 AND id = $2`, values);
  await protect(client, actor, view.participant.id, view.participant.version + 1, Object.keys(command.fields));
  await audit(client, actor, command, view.participant.id, { fields: Object.keys(command.fields), version: view.participant.version + 1 });
  return success(command, view.participant.id);
}

async function assignParticipant(client: PoolClient, actor: StaffProfile, command: Extract<MentoringCommand, { type: "assign_participant" }>, view: ParticipantView, now: string): Promise<CommandResult> {
  if (view.assignment && actor.role !== "ceo") return failure("forbidden", "החלפת השיוך הקיים מחייבת אישור וביצוע של המנכ״ל.");
  // Lock all staff rows in a deterministic order before checking current roles.
  const staffResult = await client.query("SELECT * FROM mentoring.memberships WHERE organization_id = $1 AND id = ANY($2::uuid[]) ORDER BY id FOR SHARE", [actor.organizationId, [command.mentorId, ...(command.coordinatorId ? [command.coordinatorId] : [])]]);
  const members = staffResult.rows.map(staffFromRow);
  const mentor = members.find((member) => member.id === command.mentorId && member.active && member.role === "mentor");
  const coordinator = members.find((member) => member.id === command.coordinatorId && member.active && member.role === "coordinator");
  if (!mentor) return failure("validation", "יש לבחור חונך/ת עם גישה פעילה.", "mentorId");
  if (command.coordinatorId && !coordinator) return failure("validation", "יש לבחור רכז/ת עם גישה פעילה.", "coordinatorId");
  if (actor.role === "coordinator" && (command.coordinatorId !== actor.id || mentor.coordinatorId !== actor.id)) return failure("forbidden", "אפשר לשייך חניכות רק לחונכים ולחונכות בצוות שלך.");
  await client.query("UPDATE mentoring.assignments SET ended_at = $3 WHERE organization_id = $1 AND participant_id = $2 AND ended_at IS NULL", [actor.organizationId, view.participant.id, now]);
  if (view.nextAppointment) await client.query("UPDATE mentoring.appointments SET mentor_id = $3, version = version + 1 WHERE organization_id = $1 AND participant_id = $2 AND is_current = true", [actor.organizationId, view.participant.id, mentor.id]);
  const assignmentVersion = (view.assignment?.version ?? 0) + 1;
  const followupAnchorAt = view.assignment?.followupAnchorAt ?? view.assignment?.assignedAt ?? now;
  await client.query("INSERT INTO mentoring.assignments (id,organization_id,participant_id,mentor_id,coordinator_id,assigned_at,followup_anchor_at,version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [randomUUID(), actor.organizationId, view.participant.id, mentor.id, command.coordinatorId, now, followupAnchorAt, assignmentVersion]);
  await client.query("UPDATE mentoring.participants SET last_ceo_version = CASE WHEN $3::boolean THEN version + 1 ELSE last_ceo_version END, version = version + 1, updated_at = clock_timestamp() WHERE organization_id = $1 AND id = $2", [actor.organizationId, view.participant.id, actor.role === "ceo"]);
  await protect(client, actor, view.participant.id, view.participant.version + 1, ["assignment"]);
  await cancelReminders(client, actor.organizationId, view.participant.id);
  await audit(client, actor, command, view.participant.id, { mentorId: mentor.id, coordinatorId: command.coordinatorId, assignmentVersion });
  return success(command, view.participant.id);
}

async function recordContact(client: PoolClient, actor: StaffProfile, command: Extract<MentoringCommand, { type: "record_contact" }>, view: ParticipantView, now: string): Promise<CommandResult> {
  if (command.expectedAppointmentVersion !== (view.nextAppointment?.version ?? null)) return failure("conflict", "הפגישה הבאה השתנתה. יש לרענן את הכרטיס לפני שליחה חוזרת.", "expectedAppointmentVersion");
  const entry: ContactEntry = { id: command.operationId, organizationId: actor.organizationId, participantId: view.participant.id, actorId: actor.id, method: command.method, outcome: command.outcome, occurredAt: command.occurredAt, receivedAt: now, notes: command.notes, revision: 1, invalidatedAt: null };
  const changedColor = command.manualColor !== view.manualColor ? command.manualColor : undefined;
  const next = command.outcome === "completed" && command.nextAppointmentAt && view.assignment ? { id: view.nextAppointment?.id ?? randomUUID(), organizationId: actor.organizationId, participantId: view.participant.id, mentorId: view.assignment.mentorId, scheduledAt: command.nextAppointmentAt, version: (view.nextAppointment?.version ?? 0) + 1 } : null;
  const transition = applyRecordedContact({ participant: view.participant, assignment: view.assignment, contacts: view.contacts, nextAppointment: view.nextAppointment, manualColor: view.manualColor }, { entry, nextAppointment: next, expectedAppointmentVersion: command.expectedAppointmentVersion, ...(command.manualColor ? { manualColor: command.manualColor } : {}) }, now);
  if (!transition.ok) {
    if (transition.kind === "conflict") return failure("conflict", "נוסף דיווח חדש יותר. יש לרענן את הכרטיס ולבדוק את הדיווח לפני שליחה חוזרת.");
    const issue = transition.issues.find((item) => item.severity === "error");
    return failure("validation", issue?.field === "assignment" ? "יש לשייך חונך/ת לפני תיעוד קשר." : issue?.field === "nextAppointmentAt" ? "יש לבחור תאריך ושעה לפגישה הבאה, לאחר מועד הקשר שתועד." : "יש לבדוק את מועד הקשר. לא ניתן לתעד קשר שבוצע בעתיד.", issue?.field);
  }
  if (!await reserveResource(client, actor, entry.id, "contact")) return failure("conflict", "מזהה הפעולה כבר משויך לרשומה אחרת. יש לשלוח פעולה חדשה.");
  const inserted = await client.query("INSERT INTO mentoring.contacts (id,organization_id,participant_id,actor_id,method,outcome,occurred_at,received_at,notes,revision) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1) ON CONFLICT (id) DO NOTHING RETURNING id", [entry.id, actor.organizationId, entry.participantId, actor.id, entry.method, entry.outcome, entry.occurredAt, now, entry.notes]);
  if (inserted.rowCount !== 1) return failure("conflict", "מזהה הדיווח כבר קיים. יש לשלוח פעולה חדשה.");
  if (next) {
    await recordAppointmentHistory(client, actor.organizationId, view.participant.id, actor.id, now, "prior_state");
    if (view.nextAppointment) await client.query("UPDATE mentoring.appointments SET scheduled_at = $3, mentor_id = $4, source_contact_id = $5, requires_review = false, version = version + 1 WHERE organization_id = $1 AND id = $2 AND is_current = true", [actor.organizationId, next.id, next.scheduledAt, next.mentorId, entry.id]);
    else await client.query("INSERT INTO mentoring.appointments (id,organization_id,participant_id,mentor_id,scheduled_at,version,is_current,created_at,source_contact_id,requires_review) VALUES ($1,$2,$3,$4,$5,$6,true,clock_timestamp(),$7,false)", [next.id, actor.organizationId, next.participantId, next.mentorId, next.scheduledAt, next.version, entry.id]);
    await recordAppointmentHistory(client, actor.organizationId, view.participant.id, actor.id, now, "contact_recorded");
    await cancelReminders(client, actor.organizationId, view.participant.id);
  }
  await client.query("UPDATE mentoring.participants SET last_ceo_version = CASE WHEN $5::boolean THEN version + 1 ELSE last_ceo_version END, version = version + 1, manual_color = CASE WHEN $3::text IS NULL THEN manual_color ELSE $3 END, manual_color_at = CASE WHEN $3::text IS NULL THEN manual_color_at ELSE $4::timestamptz END, updated_at = clock_timestamp() WHERE organization_id = $1 AND id = $2", [actor.organizationId, view.participant.id, changedColor ?? null, now, actor.role === "ceo"]);
  // Each completed contact starts a new cycle. Its original appointment is
  // retained in immutable history; explicit schedule locks are checked above.
  await protect(client, actor, entry.id, 1);
  if (changedColor !== undefined) {
    await protectParticipantField(client, actor, view.participant.id, view.participant.version + 1, "manualColor");
    await recordManualColorHistory(client, actor.organizationId, view.participant.id, actor.id, now, changedColor, view.participant.version + 1);
  }
  await audit(client, actor, command, view.participant.id, { contactId: entry.id, outcome: entry.outcome, version: view.participant.version + 1, warnings: transition.warnings.map((item) => item.code) });
  return success(command, view.participant.id);
}

async function reviewContact(client: PoolClient, actor: StaffProfile, command: Extract<MentoringCommand, { type: "review_contact" }>, view: ParticipantView, now: string): Promise<CommandResult> {
  const entry = view.contacts.find((item) => item.id === command.contactId);
  if (!entry) return failure("not_found", "הדיווח לא נמצא בכרטיס החניכה.");
  if (entry.revision !== command.revision || entry.invalidatedAt != null) return failure("conflict", "הדיווח השתנה. ניתן לאשר רק את הגרסה הנוכחית.");
  const protection = view.protections.find((item) => item.resourceId === entry.id && item.active);
  if (actor.role !== "ceo" && protection) return preserveConflict(client, actor, command, view, now);
  await client.query("INSERT INTO mentoring.review_events (id,organization_id,contact_id,participant_id,revision,decision,reviewed_by_staff_id,reviewed_at,operation_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [randomUUID(),actor.organizationId,entry.id,view.participant.id,entry.revision,command.decision,actor.id,now,command.operationId]);
  await client.query("INSERT INTO mentoring.reviews (organization_id,contact_id,revision,decision,reviewed_by_staff_id,reviewed_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (organization_id,contact_id,revision) DO UPDATE SET decision = EXCLUDED.decision, reviewed_by_staff_id = EXCLUDED.reviewed_by_staff_id, reviewed_at = EXCLUDED.reviewed_at", [actor.organizationId, entry.id, entry.revision, command.decision, actor.id, now]);
  if (actor.role === "ceo") await protect(client, actor, entry.id, entry.revision);
  await audit(client, actor, command, view.participant.id, { contactId: entry.id, revision: entry.revision, decision: command.decision });
  return success(command, view.participant.id);
}

async function createStaff(client: PoolClient, actor: StaffProfile, command: Extract<MentoringCommand, { type: "create_staff" }>): Promise<CommandResult> {
  const fields = command.fields;
  if (actor.role === "coordinator" && (fields.role !== "mentor" || fields.coordinatorId !== actor.id)) return failure("forbidden", "אפשר לצרף חונכים וחונכות לצוות שלך בלבד.");
  if (fields.role === "coordinator" && fields.coordinatorId !== null) return failure("validation", "אין לבחור רכז/ת אחראי/ת לתפקיד רכז/ת.", "fields.coordinatorId");
  if (fields.coordinatorId) {
    const coordinator = await client.query("SELECT id FROM mentoring.memberships WHERE organization_id = $1 AND id = $2 AND role = 'coordinator' AND active = true FOR SHARE", [actor.organizationId, fields.coordinatorId]);
    if (!coordinator.rows[0]) return failure("validation", "יש לבחור רכז/ת עם גישה פעילה מהארגון.", "fields.coordinatorId");
  }
  // Membership is preapproved only. The provider identity remains unbound until
  // a verified Clerk email matches on sign-in; no invitations are sent here.
  const id = command.operationId;
  const inserted = await client.query("INSERT INTO mentoring.memberships (id,organization_id,email,display_name,phone,role,coordinator_id,active,version,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,true,1,clock_timestamp(),clock_timestamp()) ON CONFLICT DO NOTHING RETURNING id", [id, actor.organizationId, fields.email, fields.displayName, fields.phone || null, fields.role, fields.coordinatorId]);
  if (inserted.rowCount !== 1) return failure("conflict", "כתובת הדוא״ל או מזהה חבר/ת הצוות כבר קיימים. הרשאות קיימות לא שונו.", "fields.email");
  await audit(client, actor, command, undefined, { staffId: id, role: fields.role, coordinatorId: fields.coordinatorId });
  return { ...success(command), staffId: id };
}

async function setStaffActive(client: PoolClient, actor: StaffProfile, command: Extract<MentoringCommand, { type: "set_staff_active" }>): Promise<CommandResult> {
  // Serialize owner-count decisions, including concurrent requests by two CEOs.
  await client.query("SELECT id FROM mentoring.organizations WHERE id = $1 FOR UPDATE", [actor.organizationId]);
  const result = await client.query("SELECT * FROM mentoring.memberships WHERE organization_id = $1 AND id = $2 FOR UPDATE", [actor.organizationId, command.staffId]);
  const row = result.rows[0];
  if (!row) return failure("not_found", "חבר/ת הצוות לא נמצאו.");
  const target = staffFromRow(row);
  if (target.version !== command.expectedVersion) return failure("conflict", "פרטי חבר/ת הצוות השתנו. יש לרענן לפני עדכון ההרשאה.", "expectedVersion");
  if (!command.active && target.id === actor.id) return failure("forbidden", "לא ניתן לבטל את הגישה לחשבון המנכ״ל המחובר.");
  if (!command.active && target.role === "ceo" && target.active) {
    const owners = await client.query("SELECT count(*)::int AS count FROM mentoring.memberships WHERE organization_id = $1 AND role = 'ceo' AND active = true", [actor.organizationId]);
    if (Number(owners.rows[0].count) <= 1) return failure("forbidden", "חייב להישאר לפחות חשבון מנכ״ל פעיל אחד.");
  }
  await client.query("UPDATE mentoring.memberships SET active = $3, version = version + 1, updated_at = clock_timestamp() WHERE organization_id = $1 AND id = $2", [actor.organizationId, target.id, command.active]);
  if (!command.active) await client.query("UPDATE mentoring.outbox SET status = 'cancelled' WHERE organization_id = $1 AND recipient_staff_id = $2 AND status IN ('blocked','pending')", [actor.organizationId, target.id]);
  await audit(client, actor, command, undefined, { staffId: target.id, active: command.active, version: target.version + 1 });
  return { ...success(command), staffId: target.id };
}

// Before phone normalization, these commands hashed a trimmed string (including
// empty or otherwise invalid numbers). Reconstruct that representation only for
// matching an existing receipt. The surrogate still validates every other field.
function legacyPhoneCommand(value: unknown): MentoringCommand | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!["create_participant", "update_participant", "create_staff", "update_staff"].includes(String(input.type))) return null;
  if (!input.fields || typeof input.fields !== "object" || Array.isArray(input.fields)) return null;
  const fields = input.fields as Record<string, unknown>;
  if (!Object.hasOwn(fields, "phone") || (typeof fields.phone !== "string" && fields.phone !== null)) return null;
  const phone = typeof fields.phone === "string" ? fields.phone.trim() : null;
  if (phone !== null && phone.length > 40) return null;
  const surrogate = parseCommand({ ...input, fields: { ...fields, phone: null } });
  if (!surrogate.ok || !("fields" in surrogate.command)) return null;
  return { ...surrogate.command, fields: { ...surrogate.command.fields, phone } } as MentoringCommand;
}

/** Every accepted or preserved operation has one durable receipt in the same transaction. */
export async function executeCommand(authUserId: string, verifiedEmail: string | null, value: unknown): Promise<CommandResult> {
  const parsed = parseCommand(value);
  const legacy = legacyPhoneCommand(value);
  if (!parsed.ok && !legacy) return parsed;
  const command = parsed.ok ? parsed.command : legacy!;
  try {
    return await withTransaction(async (client) => {
      const actor = await requireIdentity(client, authUserId, verifiedEmail);
      let now = "";
      let view: ParticipantView | null = null;
      if (isAuthorityCommand(command) && actor.role !== "ceo") return failure("forbidden", "הפעולה זמינה למנכ״ל בלבד.");
      if (command.type === "update_organization_settings" && actor.role !== "ceo") return failure("forbidden", "שינוי מדיניות זמין למנכ״ל בלבד.");
      if (command.type === "save_monthly_review" && !canReviewMonthlyScope(actor, command.scopeStaffId)) return failure("forbidden", "אין הרשאה לסקירה החודשית שנבחרה.");
      if ((command.type === "invalidate_contact" || command.type === "evaluate_reminders") && actor.role === "mentor") return failure("forbidden", "הפעולה זמינה להנהלה ולרכזים ולרכזות בלבד.");
      if (command.type === "create_staff" && actor.role === "coordinator" && (command.fields.role !== "mentor" || command.fields.coordinatorId !== actor.id)) return failure("forbidden", "אפשר לצרף חונכים וחונכות לצוות שלך בלבד.");
      if (command.type === "create_participant" || command.type === "assign_participant" || command.type === "create_staff") {
        if (actor.role === "mentor") return failure("forbidden", "יצירה ושיוך של חניכות זמינים להנהלה ולרכזים ולרכזות בלבד.");
      }
      if (command.type === "set_sms_muted" || command.type === "resolve_conflict" || command.type === "set_staff_active") {
        if (actor.role !== "ceo") return failure("forbidden", "הפעולה זמינה למנכ״ל בלבד.");
      }
      if ("participantId" in command) {
        // Every participant writer takes this lock before assignment/grant/protection checks.
        view = await loadParticipant(client, actor.organizationId, command.participantId, true);
        if (!view) return failure("not_found", "כרטיס החניכה לא נמצא.");
        const grants = await loadActorGrants(client, actor, command.participantId);
        const time = await client.query("SELECT clock_timestamp() AS now");
        now = iso(time.rows[0].now);
        const action = command.type === "review_contact" ? "approve" : command.type === "delete_participant" ? "delete" : "edit";
        if (!canPerformParticipantAction(actor, view.participant, view.assignment, action, grants, now) && !await ownsUnassignedParticipant(client, actor, view)) return failure("forbidden", "אין הרשאה לפעול בכרטיס החניכה הזה.");
        if (command.type === "revise_contact" && actor.role === "mentor" && view.contacts.find((entry) => entry.id === command.contactId)?.actorId !== actor.id) return failure("forbidden", "ניתן לתקן רק דיווח שכתבת בעצמך.");
      }
      if (!now) now = iso((await client.query("SELECT clock_timestamp() AS now")).rows[0].now);
      const assertCurrentScope = async (): Promise<void> => {
        if (view && actor.role !== "ceo") {
          const grants = await loadActorGrants(client, actor, view.participant.id);
          const acceptedAt = iso((await client.query("SELECT clock_timestamp() AS now")).rows[0].now);
          const action = command.type === "review_contact" ? "approve" : "edit";
          if (!canPerformParticipantAction(actor, view.participant, view.assignment, action, grants, acceptedAt) && !await ownsUnassignedParticipant(client, actor, view)) {
            throw new MentoringServerError("forbidden", "ההרשאה לכרטיס פגה לפני השלמת הפעולה. יש לפנות להנהלה.");
          }
        }
      };
      const hash = parsed.ok ? commandHash(parsed.command) : null;
      const receipt = await client.query("SELECT payload_hash,response FROM mentoring.operations WHERE organization_id = $1 AND actor_id = $2 AND operation_id = $3 FOR UPDATE", [actor.organizationId, actor.id, command.operationId]);
      if (receipt.rows[0]) {
        if (receipt.rows[0].payload_hash !== hash && (!legacy || receipt.rows[0].payload_hash !== commandHash(legacy))) {
          await assertCurrentScope();
          return failure("conflict", "מזהה הפעולה כבר שימש לתוכן אחר. יש לשלוח פעולה חדשה.");
        }
        const result = receipt.rows[0].response as CommandResult;
        if (result.ok && command.type === "assign_participant" && actor.role !== "ceo") {
          // Classify the original action from immutable evidence. Current
          // assignment presence cannot distinguish a valid first-assignment
          // retry from a replacement formerly authorized by the CEO.
          const original = await client.query("SELECT details->>'assignmentVersion' AS assignment_version FROM mentoring.audit WHERE organization_id=$1 AND actor_id=$2 AND operation_id=$3 AND action='assign_participant'", [actor.organizationId, actor.id, command.operationId]);
          if (Number(original.rows[0]?.assignment_version) !== 1) return failure("forbidden", "שינוי שיוך הליווי זמין למנכ״ל בלבד.");
        }
        await assertCurrentScope();
        return result.ok ? { ...result, replayed: true } : result;
      }
      // Legacy parsing is never sufficient to authorize or persist a new write.
      if (!parsed.ok) return parsed;
      const writeHash = hash ?? commandHash(parsed.command);
      const finish = async (result: CommandResult): Promise<CommandResult> => {
        if (result.ok && view && ["update_participant", "assign_participant", "record_contact"].includes(command.type)) await rebuildParticipantReminders(client, actor.organizationId, view.participant.id, actor.id, command.operationId, now);
        if (result.ok && ["create_staff", "set_staff_active", "update_staff", "set_sms_muted"].includes(command.type)) {
          const affected = await client.query("SELECT id FROM mentoring.participants WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY id FOR UPDATE", [actor.organizationId]);
          for (const row of affected.rows) await rebuildParticipantReminders(client, actor.organizationId, String(row.id), actor.id, command.operationId, now);
        }
        // Expiry while another database lock is awaited rolls back every write.
        await assertCurrentScope();
        return saveReceipt(client, actor, command, writeHash, result);
      };
      if (view?.participant.deletedAt && command.type !== "restore_participant") return finish(failure("not_found", "הכרטיס נמצא בסל המחזור. יש לשחזר אותו לפני שינוי נוסף."));
      if (view && ["record_contact", "assign_participant", "reschedule_appointment"].includes(command.type) && view.participant.lifecycle !== "active") return finish(failure("validation", "אפשר לתעד קשר חדש, לשייך או לקבוע פגישה רק בכרטיס ליווי פעיל."));
      if (view && (command.type === "record_contact" || command.type === "update_participant" || command.type === "assign_participant")) {
        const protection = view.protections.find((item) => item.resourceId === view!.participant.id && item.active);
        if (command.type === "record_contact") {
          if (command.expectedVersion !== view.participant.version) {
            const metadata = await client.query("SELECT last_ceo_version FROM mentoring.participants WHERE organization_id = $1 AND id = $2", [actor.organizationId, view.participant.id]);
            if (actor.role !== "ceo" && command.expectedVersion < Number(metadata.rows[0].last_ceo_version)) return finish(await preserveConflict(client, actor, command, view, now));
            return finish(failure("conflict", "כרטיס החניכה השתנה. יש לרענן אותו לפני שליחה חוזרת.", "expectedVersion"));
          }
          if (command.manualColor !== undefined && command.manualColor !== view.manualColor) {
            const colorCheck = checkWritePreconditions({ actor, resource: view.participant, expectedVersion: command.expectedVersion, hasScope: true, protection, changedFields: ["manualColor"] });
            if (!colorCheck.ok && colorCheck.code === "ceo_protected") return finish(await preserveConflict(client, actor, command, view, now));
          }
          if (command.outcome === "completed") {
            const appointmentProtection = checkWritePreconditions({ actor, resource: view.participant, expectedVersion: command.expectedVersion, hasScope: true, protection, changedFields: ["appointment"] });
            if (!appointmentProtection.ok && appointmentProtection.code === "ceo_protected") return finish(await preserveConflict(client, actor, command, view, now));
          }
        } else {
          const precondition = checkWritePreconditions({ actor, resource: view.participant, expectedVersion: command.expectedVersion, hasScope: true, protection, changedFields: command.type === "update_participant" ? Object.keys(command.fields) : ["assignment"] });
          if (!precondition.ok) {
            if (precondition.code === "ceo_protected") return finish(await preserveConflict(client, actor, command, view, now));
            return finish(failure("conflict", "כרטיס החניכה השתנה. יש לרענן אותו לפני שליחה חוזרת.", "expectedVersion"));
          }
        }
      }
      const context: CommandContext = {
        client, actor, view, now, success, failure,
        audit: (operation, participantId, details) => audit(client, actor, operation, participantId, details),
        preserveConflict: (operation, currentView) => preserveConflict(client, actor, operation, currentView, now),
        protect: (resourceId, revision, fieldPaths) => protect(client, actor, resourceId, revision, fieldPaths),
        refreshReminders: async (participantId) => { await rebuildParticipantReminders(client, actor.organizationId, participantId, actor.id, command.operationId, now); },
      };
      for (const handler of [handleContactCommand, handleAuthorityCommand, handleOversightCommand, handleReminderCommand]) {
        const result = await handler(context, command);
        if (result !== null) return finish(result);
      }
      switch (command.type) {
        case "create_staff": return finish(await createStaff(client, actor, command));
        case "set_staff_active": return finish(await setStaffActive(client, actor, command));
        case "create_participant": return finish(await createParticipant(client, actor, command));
        case "update_participant": return finish(await updateParticipant(client, actor, command, view!));
        case "assign_participant": return finish(await assignParticipant(client, actor, command, view!, now));
        case "record_contact": return finish(await recordContact(client, actor, command, view!, now));
        case "review_contact": return finish(await reviewContact(client, actor, command, view!, now));
        case "set_sms_muted": {
          await client.query("UPDATE mentoring.memberships SET sms_muted = $3, version = version + 1, updated_at = clock_timestamp() WHERE organization_id = $1 AND id = $2", [actor.organizationId, actor.id, command.muted]);
          if (command.muted) await client.query("UPDATE mentoring.outbox SET status = 'cancelled' WHERE organization_id = $1 AND recipient_staff_id = $2 AND status IN ('pending','blocked')", [actor.organizationId, actor.id]);
          await audit(client, actor, command, undefined, { smsMuted: command.muted });
          return finish(success(command));
        }
        case "resolve_conflict": {
          const conflict = await client.query("SELECT * FROM mentoring.conflicts WHERE organization_id = $1 AND id = $2 FOR UPDATE", [actor.organizationId, command.conflictId]);
          if (!conflict.rows[0]) return finish(failure("not_found", "הדיווח השמור לא נמצא."));
          if (conflict.rows[0].resolved_at) return finish(failure("conflict", "הדיווח השמור כבר טופל."));
          await client.query("UPDATE mentoring.conflicts SET resolved_at = $3, resolved_by = $4 WHERE organization_id = $1 AND id = $2", [actor.organizationId, command.conflictId, now, actor.id]);
          const participantId = String(conflict.rows[0].participant_id);
          await audit(client, actor, command, participantId, { conflictId: command.conflictId, decision: command.decision });
          return finish(success(command, participantId));
        }
        default: return failure("validation", "הפעולה אינה נתמכת.");
      }
    });
  } catch (error) {
    // Never return SQL or provider details to a client.
    return serverFailure(error instanceof MentoringServerError ? error : undefined);
  }
}
