import "server-only";

import { randomUUID } from "node:crypto";
import type { PoolClient, QueryResultRow } from "pg";
import type { CommandResult, MentoringCommand } from "../../contracts";
import type { CommandContext } from "../../server/command-context";
import type { AssignmentHistoryView, AuthorityCommand, AuthorityExtras, GrantView, ParticipantDeletionState, ParticipantLifecycle, ProtectionStateView } from "./contracts";
import { CONTACT_PROTECTION_FIELDS, PARTICIPANT_PROTECTION_FIELDS } from "./schema";

const commandTypes = new Set(["set_access_grant", "set_ceo_protection", "set_participant_lifecycle", "delete_participant", "restore_participant", "update_staff"]);
export const isAuthorityCommand = (command: { readonly type: string }): command is AuthorityCommand => commandTypes.has(command.type);
const instant = (value: unknown): string => new Date(value as string | Date).toISOString();
const optionalInstant = (value: unknown): string | null => value == null ? null : instant(value);
const nullable = (value: unknown): string | null => value == null ? null : String(value);

export function deletionStateFromRow(row: QueryResultRow): ParticipantDeletionState {
  return { deletedAt: optionalInstant(row.deleted_at), deletedBy: nullable(row.deleted_by), deletionReason: nullable(row.deletion_reason), deletedPreviousLifecycle: row.deleted_previous_lifecycle as ParticipantLifecycle | null ?? null };
}

async function bumpParticipant(context: CommandContext, participantId: string, markCeoChange = false): Promise<void> {
  await context.client.query("UPDATE mentoring.participants SET last_ceo_version = CASE WHEN $3::boolean THEN version + 1 ELSE last_ceo_version END, version = version + 1, updated_at = clock_timestamp() WHERE organization_id = $1 AND id = $2", [context.actor.organizationId, participantId, markCeoChange]);
}

async function cancelUnsentReminders(context: CommandContext, participantId: string): Promise<void> {
  await context.client.query("UPDATE mentoring.outbox SET status = 'cancelled' WHERE organization_id = $1 AND participant_id = $2 AND status IN ('blocked','pending')", [context.actor.organizationId, participantId]);
  // Reconcile canonical jobs after the lifecycle/tombstone change as well as
  // legacy outbox rows; the planner preserves claimed and delivered evidence.
  await context.refreshReminders(participantId);
}

async function setAccessGrant(context: CommandContext, command: Extract<AuthorityCommand, { type: "set_access_grant" }>): Promise<CommandResult> {
  const { client, actor } = context;
  // Target membership and grant rows serialize role/revocation with normal writes.
  const staff = await client.query("SELECT id,role,active FROM mentoring.memberships WHERE organization_id = $1 AND id = $2 ORDER BY id FOR UPDATE", [actor.organizationId, command.staffId]);
  const target = staff.rows[0];
  if (!target) return context.failure("not_found", "חבר/ת הצוות לא נמצאו בארגון.", "staffId");
  const active = command.actions.length > 0;
  if (active && !target.active) return context.failure("validation", "ניתן לתת הרשאה רק לחבר/ת צוות עם גישה פעילה.", "staffId");
  if (command.actions.includes("approve") && target.role === "mentor") return context.failure("forbidden", "אין לתת הרשאת אישור לחונך/ת.", "actions");
  const current = await client.query("SELECT * FROM mentoring.grants WHERE organization_id = $1 AND staff_id = $2 AND participant_id = $3 FOR UPDATE", [actor.organizationId, command.staffId, command.participantId]);
  const row = current.rows[0];
  if ((row ? Number(row.version) : null) !== command.expectedGrantVersion) return context.failure("conflict", "הרשאות חבר/ת הצוות השתנו. יש לרענן לפני שמירה.", "expectedGrantVersion");
  const acceptedAt = instant((await client.query("SELECT clock_timestamp() AS now")).rows[0].now);
  if (active && command.expiresAt !== null && Date.parse(command.expiresAt) <= Date.parse(acceptedAt)) return context.failure("validation", "תוקף ההרשאה חייב להיות בעתיד.", "expiresAt");
  const nextVersion = row ? Number(row.version) + 1 : 1;
  const actions = [...command.actions].sort();
  if (row) {
    await client.query("UPDATE mentoring.grants SET actions = $4::text[], active = $5, expires_at = $6, version = version + 1, granted_by_staff_id = CASE WHEN $5::boolean THEN $7 ELSE granted_by_staff_id END, revoked_by_staff_id = CASE WHEN $5::boolean THEN NULL ELSE $7 END, revoked_at = CASE WHEN $5::boolean THEN NULL ELSE $8::timestamptz END, reason = $9, updated_at = $8 WHERE organization_id = $1 AND staff_id = $2 AND participant_id = $3", [actor.organizationId, command.staffId, command.participantId, actions, active, command.expiresAt, actor.id, acceptedAt, command.reason]);
  } else {
    await client.query("INSERT INTO mentoring.grants (id,organization_id,staff_id,participant_id,actions,active,expires_at,version,granted_by_staff_id,revoked_by_staff_id,revoked_at,reason,created_at,updated_at) VALUES ($1,$2,$3,$4,$5::text[],$6,$7,1,$8,$9,$10,$11,$12,$12)", [randomUUID(), actor.organizationId, command.staffId, command.participantId, actions, active, command.expiresAt, active ? actor.id : null, active ? null : actor.id, active ? null : acceptedAt, command.reason, acceptedAt]);
  }
  await bumpParticipant(context, command.participantId);
  // A previously queued delivery must re-evaluate the changed recipient scope.
  await context.refreshReminders(command.participantId);
  await context.audit(command, command.participantId, { staffId: command.staffId, actions, active, expiresAt: command.expiresAt, grantVersion: nextVersion, reason: command.reason });
  return context.success(command, command.participantId);
}

async function setCeoProtection(context: CommandContext, command: Extract<AuthorityCommand, { type: "set_ceo_protection" }>): Promise<CommandResult> {
  const { client, actor, view } = context;
  const isParticipant = command.resourceId === command.participantId;
  const contact = view!.contacts.find((entry) => entry.id === command.resourceId && entry.participantId === command.participantId && entry.organizationId === actor.organizationId);
  if (!isParticipant && !contact) return context.failure("not_found", "הרשומה המוגנת אינה שייכת לכרטיס החניכה.", "resourceId");
  const allowed: readonly string[] = isParticipant ? PARTICIPANT_PROTECTION_FIELDS : CONTACT_PROTECTION_FIELDS;
  if (command.fieldPaths?.some((field) => !allowed.includes(field))) return context.failure("validation", "תחום ההגנה אינו מתאים לסוג הרשומה.", "fieldPaths");
  const protection = await client.query("SELECT * FROM mentoring.ceo_protections WHERE organization_id = $1 AND resource_id = $2 FOR UPDATE", [actor.organizationId, command.resourceId]);
  const row = protection.rows[0];
  if ((row ? Number(row.version) : null) !== command.expectedProtectionVersion) return context.failure("conflict", "הגנת המנכ״ל השתנתה. יש לרענן לפני שמירה.", "expectedProtectionVersion");
  const revision = isParticipant ? view!.participant.version + 1 : contact!.revision;
  // Only this explicit, versioned CEO command can narrow or unlock a whole lock.
  await client.query("INSERT INTO mentoring.ceo_protections (organization_id,resource_id,protected_by_staff_id,protected_revision,active,field_paths,version,reason,unlocked_by_staff_id,unlocked_at,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6::text[],1,$7,$8,$9,$10,$10) ON CONFLICT (organization_id,resource_id) DO UPDATE SET protected_by_staff_id = EXCLUDED.protected_by_staff_id, protected_revision = EXCLUDED.protected_revision, active = EXCLUDED.active, field_paths = EXCLUDED.field_paths, version = mentoring.ceo_protections.version + 1, reason = EXCLUDED.reason, unlocked_by_staff_id = EXCLUDED.unlocked_by_staff_id, unlocked_at = EXCLUDED.unlocked_at, updated_at = EXCLUDED.updated_at", [actor.organizationId, command.resourceId, actor.id, revision, command.active, command.fieldPaths, command.reason, command.active ? null : actor.id, command.active ? null : context.now, context.now]);
  await bumpParticipant(context, command.participantId, true);
  await context.audit(command, command.participantId, { resourceId: command.resourceId, active: command.active, fieldPaths: command.fieldPaths, protectionVersion: row ? Number(row.version) + 1 : 1, reason: command.reason });
  return context.success(command, command.participantId);
}

async function updateStaff(context: CommandContext, command: Extract<AuthorityCommand, { type: "update_staff" }>): Promise<CommandResult> {
  const { client, actor } = context;
  const ids = [...new Set([command.staffId, ...(command.fields.coordinatorId ? [command.fields.coordinatorId] : [])])].sort();
  const members = await client.query("SELECT * FROM mentoring.memberships WHERE organization_id = $1 AND id = ANY($2::uuid[]) ORDER BY id FOR UPDATE", [actor.organizationId, ids]);
  const target = members.rows.find((row) => row.id === command.staffId);
  if (!target) return context.failure("not_found", "חבר/ת הצוות לא נמצאו.", "staffId");
  if (Number(target.version) !== command.expectedVersion) return context.failure("conflict", "פרטי חבר/ת הצוות השתנו. יש לרענן לפני שמירה.", "expectedVersion");
  if (target.role === "ceo" && (command.fields.role !== undefined || command.fields.coordinatorId !== undefined)) return context.failure("forbidden", "לא ניתן לשנות את תפקיד המנכ״ל או את שיוכו.");
  const nextRole = command.fields.role ?? String(target.role);
  const nextCoordinator = command.fields.coordinatorId === undefined ? nullable(target.coordinator_id) : command.fields.coordinatorId;
  if (nextRole !== "mentor" && nextCoordinator !== null) return context.failure("validation", "אפשר לשייך לרכז/ת רק בעלי תפקיד חונך/ת.", "fields.coordinatorId");
  if (nextCoordinator !== null && command.fields.coordinatorId !== undefined) {
    const coordinator = members.rows.find((row) => row.id === nextCoordinator);
    if (nextCoordinator === command.staffId || !coordinator || !coordinator.active || coordinator.role !== "coordinator") return context.failure("validation", "יש לבחור רכז/ת עם גישה פעילה מהארגון.", "fields.coordinatorId");
  }
  const roleChanged = nextRole !== target.role;
  const teamChanged = nextCoordinator !== nullable(target.coordinator_id);
  if (roleChanged || teamChanged) {
    const ownership = await client.query("SELECT EXISTS (SELECT 1 FROM mentoring.assignments WHERE organization_id = $1 AND ended_at IS NULL AND mentor_id = $2 AND ($3 <> 'mentor' OR coordinator_id IS DISTINCT FROM $4::uuid)) AS mentor_owner, EXISTS (SELECT 1 FROM mentoring.assignments WHERE organization_id = $1 AND ended_at IS NULL AND coordinator_id = $2 AND $3 <> 'coordinator') AS coordinator_owner, EXISTS (SELECT 1 FROM mentoring.memberships WHERE organization_id = $1 AND coordinator_id = $2 AND active = true AND $3 <> 'coordinator') AS staff_owner, EXISTS (SELECT 1 FROM mentoring.appointments WHERE organization_id = $1 AND mentor_id = $2 AND is_current = true AND $3 <> 'mentor') AS appointment_owner, EXISTS (SELECT 1 FROM mentoring.grants WHERE organization_id = $1 AND staff_id = $2 AND active = true AND 'approve' = ANY(actions) AND (expires_at IS NULL OR expires_at > $5::timestamptz) AND $3 = 'mentor') AS approval_owner", [actor.organizationId, command.staffId, nextRole, nextCoordinator, context.now]);
    if (Object.values(ownership.rows[0]).some((value) => value === true)) return context.failure("conflict", "יש להעביר שיוכים והרשאות קיימים לפני שינוי התפקיד או הצוות.", "fields.role");
  }
  const columns = { displayName: "display_name", phone: "phone", role: "role", coordinatorId: "coordinator_id" } as const;
  const values: unknown[] = [actor.organizationId, command.staffId];
  const updates = Object.entries(command.fields).map(([field, value]) => { values.push(field === "phone" ? value || null : value); return `${columns[field as keyof typeof columns]} = $${values.length}`; });
  await client.query(`UPDATE mentoring.memberships SET ${updates.join(", ")}, version = version + 1, updated_at = clock_timestamp() WHERE organization_id = $1 AND id = $2`, values);
  await context.audit(command, undefined, { staffId: command.staffId, fields: Object.keys(command.fields), version: Number(target.version) + 1 });
  return { ...context.success(command), staffId: command.staffId };
}

/** The caller owns identity/participant locks, receipt, transaction and commit. */
export async function handleAuthorityCommand(context: CommandContext, command: MentoringCommand): Promise<CommandResult | null> {
  if (!isAuthorityCommand(command)) return null;
  if (!context.actor.active || context.actor.role !== "ceo") return context.failure("forbidden", "הפעולה זמינה למנכ״ל בלבד.");
  if (command.type === "update_staff") return updateStaff(context, command);
  const view = context.view;
  if (!view || view.participant.id !== command.participantId || view.participant.organizationId !== context.actor.organizationId) return context.failure("not_found", "כרטיס החניכה לא נמצא.");
  if (command.expectedVersion !== view.participant.version) return context.failure("conflict", "כרטיס החניכה השתנה. יש לרענן לפני שמירה.", "expectedVersion");
  const result = await context.client.query("SELECT deleted_at,deleted_by,deletion_reason,deleted_previous_lifecycle FROM mentoring.participants WHERE organization_id = $1 AND id = $2", [context.actor.organizationId, command.participantId]);
  if (!result.rows[0]) return context.failure("not_found", "כרטיס החניכה לא נמצא.");
  const deletion = deletionStateFromRow(result.rows[0]);
  if (command.type === "restore_participant") {
    if (!deletion.deletedAt) return context.failure("conflict", "כרטיס החניכה אינו נמצא בסל המחזור.");
    const lifecycle = deletion.deletedPreviousLifecycle!;
    await context.client.query("UPDATE mentoring.participants SET lifecycle = $3, deleted_at = NULL, deleted_by = NULL, deletion_reason = NULL, deleted_previous_lifecycle = NULL, last_ceo_version = version + 1, version = version + 1, updated_at = clock_timestamp() WHERE organization_id = $1 AND id = $2", [context.actor.organizationId, command.participantId, lifecycle]);
    if (lifecycle === "active") await context.refreshReminders(command.participantId);
    await context.audit(command, command.participantId, { reason: command.reason, lifecycle, deletedAt: deletion.deletedAt, previousDeletionReason: deletion.deletionReason, version: view.participant.version + 1 });
    return context.success(command, command.participantId);
  }
  if (deletion.deletedAt) return context.failure("conflict", "כרטיס החניכה נמחק. יש לשחזר אותו לפני שינוי.");
  if (command.type === "set_access_grant") return setAccessGrant(context, command);
  if (command.type === "set_ceo_protection") return setCeoProtection(context, command);
  if (command.type === "delete_participant") {
    await context.client.query("UPDATE mentoring.participants SET deleted_at = $3, deleted_by = $4, deletion_reason = $5, deleted_previous_lifecycle = lifecycle, last_ceo_version = version + 1, version = version + 1, updated_at = clock_timestamp() WHERE organization_id = $1 AND id = $2", [context.actor.organizationId, command.participantId, context.now, context.actor.id, command.reason]);
    await cancelUnsentReminders(context, command.participantId);
    await context.audit(command, command.participantId, { reason: command.reason, previousLifecycle: view.participant.lifecycle, version: view.participant.version + 1 });
    return context.success(command, command.participantId);
  }
  if (command.type === "set_participant_lifecycle") {
    await context.client.query("UPDATE mentoring.participants SET lifecycle = $3, last_ceo_version = version + 1, version = version + 1, updated_at = clock_timestamp() WHERE organization_id = $1 AND id = $2", [context.actor.organizationId, command.participantId, command.lifecycle]);
    await context.protect(command.participantId, view.participant.version + 1, ["lifecycle"]);
    if (command.lifecycle === "active") await context.refreshReminders(command.participantId);
    else await cancelUnsentReminders(context, command.participantId);
    await context.audit(command, command.participantId, { reason: command.reason, previousLifecycle: view.participant.lifecycle, lifecycle: command.lifecycle, version: view.participant.version + 1 });
    return context.success(command, command.participantId);
  }
  return null;
}

/** Batched rows for an already authorized participant set; never widens scope. */
export async function loadAuthorityExtras(client: PoolClient, organizationId: string, participantIds: readonly string[]): Promise<Map<string, AuthorityExtras>> {
  const ids = [...new Set(participantIds)];
  const extras = new Map<string, AuthorityExtras>();
  if (!ids.length) return extras;
  const parameters = [organizationId, ids];
  const participants = await client.query("SELECT id,deleted_at,deleted_by,deletion_reason,deleted_previous_lifecycle FROM mentoring.participants WHERE organization_id = $1 AND id = ANY($2::uuid[])", parameters);
  for (const row of participants.rows) extras.set(String(row.id), { ...deletionStateFromRow(row), accessGrants: [], protectionStates: [], assignmentHistory: [], authorityHistory: [] });
  const grants = await client.query("SELECT * FROM mentoring.grants WHERE organization_id = $1 AND participant_id = ANY($2::uuid[]) ORDER BY created_at,id", parameters);
  const protections = await client.query("SELECT p.*, c.participant_id AS contact_participant_id FROM mentoring.ceo_protections p LEFT JOIN mentoring.contacts c ON c.organization_id = p.organization_id AND c.id = p.resource_id WHERE p.organization_id = $1 AND (p.resource_id = ANY($2::uuid[]) OR c.participant_id = ANY($2::uuid[])) ORDER BY p.created_at,p.resource_id", parameters);
  const assignments = await client.query("SELECT * FROM mentoring.assignments WHERE organization_id = $1 AND participant_id = ANY($2::uuid[]) ORDER BY assigned_at DESC,id", parameters);
  const history = await client.query("SELECT * FROM mentoring.audit WHERE organization_id = $1 AND participant_id = ANY($2::uuid[]) AND action = ANY($3::text[]) ORDER BY created_at DESC,id", [...parameters, [...commandTypes, "assign_participant"]]);
  for (const row of grants.rows) {
    const item: GrantView = { id: String(row.id), organizationId, participantId: String(row.participant_id), staffId: String(row.staff_id), actions: row.actions, active: row.active === true, expiresAt: optionalInstant(row.expires_at), version: Number(row.version), grantedByStaffId: nullable(row.granted_by_staff_id), revokedByStaffId: nullable(row.revoked_by_staff_id), revokedAt: optionalInstant(row.revoked_at), reason: nullable(row.reason), createdAt: instant(row.created_at), updatedAt: instant(row.updated_at) };
    const target = extras.get(item.participantId); if (target) (target.accessGrants as GrantView[]).push(item);
  }
  for (const row of protections.rows) {
    const item: ProtectionStateView = { organizationId, resourceId: String(row.resource_id), protectedByStaffId: String(row.protected_by_staff_id), protectedRevision: Number(row.protected_revision), active: row.active === true, fieldPaths: row.field_paths, version: Number(row.version), reason: nullable(row.reason), createdAt: instant(row.created_at), updatedAt: instant(row.updated_at), unlockedByStaffId: nullable(row.unlocked_by_staff_id), unlockedAt: optionalInstant(row.unlocked_at) };
    const target = extras.get(String(row.contact_participant_id ?? row.resource_id)); if (target) (target.protectionStates as ProtectionStateView[]).push(item);
  }
  for (const row of assignments.rows) {
    const item: AssignmentHistoryView = { id: String(row.id), organizationId, participantId: String(row.participant_id), mentorId: String(row.mentor_id), coordinatorId: nullable(row.coordinator_id), assignedAt: instant(row.assigned_at), followupAnchorAt: instant(row.followup_anchor_at), version: Number(row.version), endedAt: optionalInstant(row.ended_at) };
    const target = extras.get(item.participantId); if (target) (target.assignmentHistory as AssignmentHistoryView[]).push(item);
  }
  for (const row of history.rows) {
    const target = extras.get(String(row.participant_id));
    if (target) (target.authorityHistory as unknown[]).push({ id: String(row.id), action: String(row.action), actorId: String(row.actor_id), operationId: String(row.operation_id), createdAt: instant(row.created_at), details: row.details });
  }
  return extras;
}
