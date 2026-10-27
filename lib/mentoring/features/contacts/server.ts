import "server-only";

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { CommandResult, MentoringCommand, ParticipantView } from "../../contracts";
import { checkWritePreconditions, type ContactEntry, type ManualColor, type Review } from "../../domain";
import type { CommandContext } from "../../server/command-context";
import { iso } from "../../server/repository";
import type { AppointmentChange, ContactCommand, ContactHistory, ContactRevision, ManualColorChange, ReviewEvent } from "./contracts";
import { invalidationNeedsAppointmentReview, planContactRevision } from "./policy";

const contactCommandTypes = new Set(["revise_contact", "invalidate_contact", "reschedule_appointment", "set_manual_color"]);

async function participantVersionFailure(ctx: CommandContext, command: ContactCommand, view: ParticipantView): Promise<CommandResult | null> {
  if (command.expectedVersion === view.participant.version) return null;
  const metadata = await ctx.client.query("SELECT last_ceo_version FROM mentoring.participants WHERE organization_id = $1 AND id = $2", [ctx.actor.organizationId, view.participant.id]);
  if (ctx.actor.role !== "ceo" && command.expectedVersion < Number(metadata.rows[0]?.last_ceo_version ?? 0)) return ctx.preserveConflict(command, view);
  return ctx.failure("conflict", "כרטיס החניכה השתנה. יש לרענן אותו לפני שליחה חוזרת.", "expectedVersion");
}

async function protectionFailure(ctx: CommandContext, command: ContactCommand, view: ParticipantView, resource: { id: string; organizationId: string; version: number }, fields?: readonly string[]): Promise<CommandResult | null> {
  const protection = view.protections.find((item) => item.resourceId === resource.id && item.active);
  const check = checkWritePreconditions({ actor: ctx.actor, resource, expectedVersion: resource.version, hasScope: true, protection, changedFields: fields });
  if (check.ok) return null;
  return check.code === "ceo_protected" ? ctx.preserveConflict(command, view) : ctx.failure("forbidden", "אין הרשאה לשנות רשומה זו.");
}

async function bumpParticipant(ctx: CommandContext, view: ParticipantView): Promise<void> {
  await ctx.client.query("UPDATE mentoring.participants SET last_ceo_version = CASE WHEN $3::boolean THEN version + 1 ELSE last_ceo_version END, version = version + 1, updated_at = $4 WHERE organization_id = $1 AND id = $2", [ctx.actor.organizationId, view.participant.id, ctx.actor.role === "ceo", ctx.now]);
}

/** Merge field protection without weakening a pre-existing whole-record lock. */
async function protectParticipantField(ctx: CommandContext, view: ParticipantView, field: "manualColor" | "appointment"): Promise<void> {
  if (ctx.actor.role !== "ceo") return;
  await ctx.client.query("INSERT INTO mentoring.ceo_protections (organization_id,resource_id,protected_by_staff_id,protected_revision,active,field_paths,created_at,updated_at) VALUES ($1,$2,$3,$4,true,ARRAY[$5]::text[],$6,$6) ON CONFLICT (organization_id,resource_id) DO UPDATE SET protected_by_staff_id = EXCLUDED.protected_by_staff_id, protected_revision = EXCLUDED.protected_revision, active = true, field_paths = CASE WHEN NOT mentoring.ceo_protections.active THEN EXCLUDED.field_paths WHEN mentoring.ceo_protections.field_paths IS NULL OR cardinality(mentoring.ceo_protections.field_paths) = 0 THEN mentoring.ceo_protections.field_paths ELSE ARRAY(SELECT DISTINCT unnest(mentoring.ceo_protections.field_paths || EXCLUDED.field_paths)) END, version = mentoring.ceo_protections.version + 1, reason = NULL, updated_at = EXCLUDED.updated_at, unlocked_by_staff_id = NULL, unlocked_at = NULL", [ctx.actor.organizationId, view.participant.id, ctx.actor.id, view.participant.version + 1, field, ctx.now]);
}

async function snapshotContact(ctx: CommandContext, entry: ContactEntry, kind: ContactRevision["changeKind"], reason: string | null, operationId: string | null): Promise<void> {
  await ctx.client.query("INSERT INTO mentoring.contact_revisions (organization_id,contact_id,participant_id,revision,actor_id,method,outcome,occurred_at,received_at,notes,invalidated_at,revised_by_staff_id,revised_at,reason,change_kind,operation_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT (organization_id,contact_id,revision) DO NOTHING", [ctx.actor.organizationId, entry.id, entry.participantId, entry.revision, entry.actorId, entry.method, entry.outcome, entry.occurredAt, entry.receivedAt, entry.notes ?? "", entry.invalidatedAt ?? null, kind === "initial" ? entry.actorId : ctx.actor.id, kind === "initial" ? entry.receivedAt : ctx.now, reason, kind, operationId]);
}

export async function recordAppointmentHistory(client: PoolClient, organizationId: string, participantId: string, actorId: string, now: string, kind: AppointmentChange["changeKind"], reason: string | null = null): Promise<void> {
  await client.query("INSERT INTO mentoring.appointment_history (id,organization_id,participant_id,appointment_id,scheduled_at,appointment_version,mentor_id,source_contact_id,requires_review,changed_by_staff_id,changed_at,reason,change_kind) SELECT $1,a.organization_id,a.participant_id,a.id,a.scheduled_at,a.version,a.mentor_id,a.source_contact_id,a.requires_review,$4,$5,$6,$7 FROM mentoring.appointments a WHERE a.organization_id = $2 AND a.participant_id = $3 AND a.is_current ON CONFLICT (organization_id,appointment_id,appointment_version) DO NOTHING", [randomUUID(), organizationId, participantId, actorId, now, reason, kind]);
}

export async function recordManualColorHistory(client: PoolClient, organizationId: string, participantId: string, actorId: string, now: string, color: ManualColor, participantVersion: number, reason: string | null = null): Promise<void> {
  await client.query("INSERT INTO mentoring.manual_color_history (id,organization_id,participant_id,color,set_by_staff_id,set_at,reason,participant_version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [randomUUID(), organizationId, participantId, color, actorId, now, reason, participantVersion]);
}

async function snapshotAppointment(ctx: CommandContext, view: ParticipantView, kind: AppointmentChange["changeKind"], reason: string | null): Promise<void> {
  return recordAppointmentHistory(ctx.client, ctx.actor.organizationId, view.participant.id, ctx.actor.id, ctx.now, kind, reason);
}

async function changeAppointment(ctx: CommandContext, view: ParticipantView, input: { kind: AppointmentChange["changeKind"]; reason: string; scheduledAt?: string; sourceContactId?: string; warning?: boolean }): Promise<void> {
  await snapshotAppointment(ctx, view, "prior_state", null);
  if (view.nextAppointment) {
    await ctx.client.query("UPDATE mentoring.appointments SET scheduled_at = COALESCE($3::timestamptz,scheduled_at), source_contact_id = COALESCE($4::uuid,source_contact_id), requires_review = $5, version = version + 1 WHERE organization_id = $1 AND participant_id = $2 AND is_current", [ctx.actor.organizationId, view.participant.id, input.scheduledAt ?? null, input.sourceContactId ?? null, input.warning ?? false]);
  } else if (input.scheduledAt && view.assignment) {
    await ctx.client.query("INSERT INTO mentoring.appointments (id,organization_id,participant_id,mentor_id,scheduled_at,source_contact_id,requires_review,created_at) VALUES ($1,$2,$3,$4,$5,$6,false,$7)", [randomUUID(), ctx.actor.organizationId, view.participant.id, view.assignment.mentorId, input.scheduledAt, input.sourceContactId ?? null, ctx.now]);
  }
  await snapshotAppointment(ctx, view, input.kind, input.reason);
}

async function reviseContact(ctx: CommandContext, command: Extract<ContactCommand, { type: "revise_contact" | "invalidate_contact" }>, view: ParticipantView): Promise<CommandResult> {
  const entry = view.contacts.find((item) => item.id === command.contactId);
  if (!entry) return ctx.failure("not_found", "הדיווח לא נמצא בכרטיס החניכה.");
  if (ctx.actor.role === "mentor" && (command.type === "invalidate_contact" || entry.actorId !== ctx.actor.id)) return ctx.failure("forbidden", command.type === "invalidate_contact" ? "פסילת דיווח זמינה להנהלה בלבד." : "אפשר לתקן רק דיווחים שנכתבו בחשבון שלך.");
  const protectedResult = await protectionFailure(ctx, command, view, { id: entry.id, organizationId: entry.organizationId, version: entry.revision });
  if (protectedResult) return protectedResult;
  if (entry.revision !== command.expectedRevision || entry.invalidatedAt != null) return ctx.failure("conflict", "הדיווח השתנה. יש לרענן את הכרטיס ולבחור את הגרסה העדכנית.", "expectedRevision");
  if (command.expectedAppointmentVersion !== (view.nextAppointment?.version ?? null)) return ctx.failure("conflict", "הפגישה הבאה השתנתה. יש לרענן את הכרטיס.", "expectedAppointmentVersion");
  let effect: "replace" | "retain" | "retain_with_warning" = invalidationNeedsAppointmentReview(view.contacts, entry.id) ? "retain_with_warning" : "retain";
  if (command.type === "revise_contact") {
    const plan = planContactRevision(view.contacts, entry.id, command, ctx.now, view.participant.lifecycle);
    if (!plan.ok) return ctx.failure("validation", plan.message, plan.field);
    effect = plan.appointmentEffect;
    if (effect === "replace" && !view.assignment) return ctx.failure("validation", "יש לשייך חונך/ת לפני קביעת הפגישה הבאה.", "assignment");
  }
  if (effect !== "retain") {
    const appointmentProtection = await protectionFailure(ctx, command, view, view.participant, ["appointment"]);
    if (appointmentProtection) return appointmentProtection;
  }
  await snapshotContact(ctx, entry, "initial", null, null);
  const revision = entry.revision + 1;
  const changed: ContactEntry = command.type === "revise_contact" ? { ...entry, method: command.method, outcome: command.outcome, occurredAt: command.occurredAt, notes: command.notes, revision } : { ...entry, revision, invalidatedAt: ctx.now };
  await ctx.client.query("UPDATE mentoring.contacts SET method = $4, outcome = $5, occurred_at = $6, notes = $7, revision = $8, invalidated_at = $9 WHERE organization_id = $1 AND id = $2 AND participant_id = $3", [ctx.actor.organizationId, entry.id, view.participant.id, changed.method, changed.outcome, changed.occurredAt, changed.notes ?? "", revision, changed.invalidatedAt ?? null]);
  await snapshotContact(ctx, changed, command.type === "revise_contact" ? "correction" : "invalidation", command.reason, command.operationId);
  if (effect !== "retain") {
    await changeAppointment(ctx, view, { kind: command.type === "revise_contact" ? "contact_correction" : "contact_invalidation", reason: command.reason, ...(effect === "replace" && command.type === "revise_contact" ? { scheduledAt: command.nextAppointmentAt, sourceContactId: entry.id } : { warning: true }) });
    await protectParticipantField(ctx, view, "appointment");
  }
  await bumpParticipant(ctx, view);
  await ctx.protect(entry.id, revision);
  await ctx.refreshReminders(view.participant.id);
  await ctx.audit(command, view.participant.id, { contactId: entry.id, previousRevision: entry.revision, revision, reason: command.reason, appointmentEffect: effect, version: view.participant.version + 1 });
  return ctx.success(command, view.participant.id);
}

async function rescheduleAppointment(ctx: CommandContext, command: Extract<ContactCommand, { type: "reschedule_appointment" }>, view: ParticipantView): Promise<CommandResult> {
  const protection = await protectionFailure(ctx, command, view, view.participant, ["appointment"]);
  if (protection) return protection;
  if (!view.nextAppointment || command.expectedAppointmentVersion !== view.nextAppointment.version) return ctx.failure("conflict", "הפגישה הבאה השתנתה או אינה קיימת. יש לרענן את הכרטיס.", "expectedAppointmentVersion");
  if (!Number.isFinite(Date.parse(command.scheduledAt)) || Date.parse(command.scheduledAt) <= Date.parse(ctx.now)) return ctx.failure("validation", "יש לבחור מועד עתידי לפגישה הבאה.", "scheduledAt");
  await changeAppointment(ctx, view, { kind: "rescheduled", reason: command.reason, scheduledAt: command.scheduledAt });
  await bumpParticipant(ctx, view);
  await protectParticipantField(ctx, view, "appointment");
  await ctx.refreshReminders(view.participant.id);
  await ctx.audit(command, view.participant.id, { appointmentId: view.nextAppointment.id, previousAppointmentVersion: view.nextAppointment.version, appointmentVersion: view.nextAppointment.version + 1, reason: command.reason, version: view.participant.version + 1 });
  return ctx.success(command, view.participant.id);
}

async function setManualColor(ctx: CommandContext, command: Extract<ContactCommand, { type: "set_manual_color" }>, view: ParticipantView): Promise<CommandResult> {
  if (command.color === view.manualColor) return ctx.success(command, view.participant.id);
  const protection = await protectionFailure(ctx, command, view, view.participant, ["manualColor"]);
  if (protection) return protection;
  await ctx.client.query("UPDATE mentoring.participants SET manual_color = $3, manual_color_at = $4 WHERE organization_id = $1 AND id = $2", [ctx.actor.organizationId, view.participant.id, command.color, ctx.now]);
  await recordManualColorHistory(ctx.client, ctx.actor.organizationId, view.participant.id, ctx.actor.id, ctx.now, command.color, view.participant.version + 1, command.reason ?? null);
  await bumpParticipant(ctx, view);
  await protectParticipantField(ctx, view, "manualColor");
  await ctx.refreshReminders(view.participant.id);
  await ctx.audit(command, view.participant.id, { color: command.color, previousColor: view.manualColor, reason: command.reason ?? null, version: view.participant.version + 1 });
  return ctx.success(command, view.participant.id);
}

/** The caller supplies current scope, a locked participant and one transaction. */
export async function handleContactCommand(ctx: CommandContext, command: MentoringCommand): Promise<CommandResult | null> {
  if (!contactCommandTypes.has(command.type)) return null;
  const owned = command as ContactCommand;
  const view = ctx.view;
  if (!view) return ctx.failure("not_found", "כרטיס החניכה לא נמצא.");
  if (view.participant.id !== owned.participantId || view.participant.organizationId !== ctx.actor.organizationId) return ctx.failure("forbidden", "אין הרשאה לכרטיס זה.");
  const stale = await participantVersionFailure(ctx, owned, view);
  if (stale) return stale;
  switch (owned.type) {
    case "revise_contact":
    case "invalidate_contact": return reviseContact(ctx, owned, view);
    case "reschedule_appointment": return rescheduleAppointment(ctx, owned, view);
    case "set_manual_color": return setManualColor(ctx, owned, view);
  }
}

type Row = Record<string, unknown>;
const nullableIso = (value: unknown): string | null => value == null ? null : iso(value);
interface MutableHistory {
  contactRevisions: ContactRevision[];
  manualColorHistory: ManualColorChange[];
  appointmentHistory: AppointmentChange[];
  reviewEvents: ReviewEvent[];
  contactWarnings: "appointment_requires_review"[];
}
const emptyHistory = (): MutableHistory => ({ contactRevisions: [], manualColorHistory: [], appointmentHistory: [], reviewEvents: [], contactWarnings: [] });

/** Batch only IDs already authorized by the repository; never expose an unscoped lookup. */
export async function loadContactHistory(client: PoolClient, organizationId: string, participantIds: readonly string[]): Promise<Map<string, ContactHistory>> {
  const result = new Map(participantIds.map((id) => [id, emptyHistory()]));
  if (!participantIds.length) return result;
  const parameters = [organizationId, participantIds];
  const revisions = await client.query("SELECT cr.*,r.decision,r.reviewed_by_staff_id,r.reviewed_at FROM mentoring.contact_revisions cr LEFT JOIN mentoring.reviews r ON r.organization_id = cr.organization_id AND r.contact_id = cr.contact_id AND r.revision = cr.revision WHERE cr.organization_id = $1 AND cr.participant_id = ANY($2::uuid[]) ORDER BY cr.revised_at DESC,cr.revision DESC", parameters);
  const colors = await client.query("SELECT * FROM mentoring.manual_color_history WHERE organization_id = $1 AND participant_id = ANY($2::uuid[]) ORDER BY set_at DESC,id", parameters);
  const appointments = await client.query("SELECT * FROM mentoring.appointment_history WHERE organization_id = $1 AND participant_id = ANY($2::uuid[]) ORDER BY changed_at DESC,appointment_version DESC", parameters);
  const reviewEvents = await client.query("SELECT * FROM mentoring.review_events WHERE organization_id = $1 AND participant_id = ANY($2::uuid[]) ORDER BY reviewed_at DESC,id", parameters);
  const warnings = await client.query("SELECT participant_id FROM mentoring.appointments WHERE organization_id = $1 AND participant_id = ANY($2::uuid[]) AND is_current AND requires_review", parameters);
  for (const row of revisions.rows as Row[]) {
    const contactId = String(row.contact_id);
    const revision = Number(row.revision);
    const review: Review | null = row.decision == null ? null : { contactId, revision, decision: row.decision as Review["decision"], reviewedByStaffId: String(row.reviewed_by_staff_id), reviewedAt: iso(row.reviewed_at) };
    result.get(String(row.participant_id))?.contactRevisions.push({ id: contactId, organizationId, participantId: String(row.participant_id), actorId: String(row.actor_id), method: row.method as ContactEntry["method"], outcome: row.outcome as ContactEntry["outcome"], occurredAt: iso(row.occurred_at), receivedAt: iso(row.received_at), notes: String(row.notes), revision, invalidatedAt: nullableIso(row.invalidated_at), revisedByStaffId: String(row.revised_by_staff_id), revisedAt: iso(row.revised_at), reason: row.reason == null ? null : String(row.reason), changeKind: row.change_kind as ContactRevision["changeKind"], operationId: row.operation_id == null ? null : String(row.operation_id), review });
  }
  for (const row of colors.rows as Row[]) result.get(String(row.participant_id))?.manualColorHistory.push({ id: String(row.id), color: row.color as ManualColor, setByStaffId: String(row.set_by_staff_id), setAt: iso(row.set_at), reason: row.reason == null ? null : String(row.reason), participantVersion: Number(row.participant_version) });
  for (const row of appointments.rows as Row[]) result.get(String(row.participant_id))?.appointmentHistory.push({ id: String(row.id), appointmentId: String(row.appointment_id), scheduledAt: iso(row.scheduled_at), appointmentVersion: Number(row.appointment_version), mentorId: String(row.mentor_id), sourceContactId: row.source_contact_id == null ? null : String(row.source_contact_id), requiresReview: row.requires_review === true, changedByStaffId: String(row.changed_by_staff_id), changedAt: iso(row.changed_at), reason: row.reason == null ? null : String(row.reason), changeKind: row.change_kind as AppointmentChange["changeKind"] });
  for (const row of reviewEvents.rows as Row[]) result.get(String(row.participant_id))?.reviewEvents.push({ id: String(row.id), participantId: String(row.participant_id), contactId: String(row.contact_id), revision: Number(row.revision), decision: row.decision as Review["decision"], reviewedByStaffId: String(row.reviewed_by_staff_id), reviewedAt: iso(row.reviewed_at), operationId: row.operation_id == null ? null : String(row.operation_id) });
  for (const row of warnings.rows as Row[]) {
    const id = String(row.participant_id);
    const current = result.get(id);
    if (current) current.contactWarnings.push("appointment_requires_review");
  }
  return result;
}
