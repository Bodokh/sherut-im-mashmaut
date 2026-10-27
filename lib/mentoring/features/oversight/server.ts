import type { PoolClient } from "pg";
import type { CommandResult, MentoringCommand, StaffProfile } from "../../contracts";
import type { CommandContext } from "../../server/command-context";
import {
  defaultOrganizationSettings,
  type MonthlyReview,
  type MonthlyReviewHistory,
  type OrganizationSettings,
} from "./contracts";

type Row = Record<string, unknown>;
const iso = (value: unknown) => value instanceof Date ? value.toISOString() : String(value);

export function organizationSettingsFromRow(row: Row): OrganizationSettings {
  return {
    organizationId: String(row.organization_id), version: Number(row.version),
    offlineLeaseHours: Number(row.offline_lease_hours),
    reminderAudience: row.reminder_audience as OrganizationSettings["reminderAudience"],
    appointmentReminderMinutesBefore: Number(row.appointment_reminder_minutes_before),
    overdueRemindersEnabled: row.overdue_reminders_enabled === true,
    overdueRepeatHours: row.overdue_repeat_hours == null ? null : Number(row.overdue_repeat_hours),
    updatedAt: iso(row.updated_at), updatedBy: row.updated_by == null ? null : String(row.updated_by),
  };
}

/** Safe for all staff: this accessor never returns provider secrets or access grants. */
export async function getOrganizationSettings(client: PoolClient, organizationId: string, now: string): Promise<OrganizationSettings> {
  const result = await client.query("SELECT * FROM mentoring.organization_settings WHERE organization_id = $1", [organizationId]);
  return result.rows[0] ? organizationSettingsFromRow(result.rows[0]) : defaultOrganizationSettings(organizationId, now);
}

function historyFromRow(row: Row): MonthlyReviewHistory {
  return {
    version: Number(row.version), summary: String(row.summary), reviewed: row.reviewed === true,
    updatedAt: iso(row.updated_at), updatedBy: String(row.updated_by),
    updatedByName: String(row.updated_by_name), ceoProtected: row.ceo_protected === true,
  };
}

export async function loadOversightExtras(client: PoolClient, actor: StaffProfile, now: string): Promise<{ settings: OrganizationSettings; monthlyReviews: readonly MonthlyReview[] }> {
  const settings = await getOrganizationSettings(client, actor.organizationId, now);
  if (actor.role === "mentor" || !actor.active) return { settings, monthlyReviews: [] };
  const rows = await client.query(`SELECT r.*, m.display_name AS updated_by_name FROM mentoring.monthly_reviews r
    JOIN mentoring.memberships m ON m.organization_id = r.organization_id AND m.id = r.updated_by
    WHERE r.organization_id = $1 AND ($3 = 'ceo' OR r.scope_staff_id = $2)
    ORDER BY r.month DESC, r.scope_staff_id NULLS FIRST, r.id`, [actor.organizationId, actor.id, actor.role]);
  const history = await client.query(`SELECT h.*, m.display_name AS updated_by_name FROM mentoring.monthly_review_history h
    JOIN mentoring.monthly_reviews r ON r.organization_id = h.organization_id AND r.id = h.review_id
    JOIN mentoring.memberships m ON m.organization_id = h.organization_id AND m.id = h.updated_by
    WHERE r.organization_id = $1 AND ($3 = 'ceo' OR r.scope_staff_id = $2)
    ORDER BY h.version DESC`, [actor.organizationId, actor.id, actor.role]);
  return { settings, monthlyReviews: rows.rows.map((row): MonthlyReview => ({
    ...historyFromRow(row), id: String(row.id), organizationId: String(row.organization_id),
    month: String(row.month), scopeStaffId: row.scope_staff_id == null ? null : String(row.scope_staff_id),
    history: history.rows.filter((item) => item.review_id === row.id).map(historyFromRow),
  })) };
}

/** Participates in the dispatcher's verified identity/idempotency/audit transaction. */
export async function handleOversightCommand(ctx: CommandContext, command: MentoringCommand): Promise<CommandResult | null> {
  if (command.type !== "update_organization_settings" && command.type !== "save_monthly_review") return null;
  const { actor, client, now } = ctx;
  if (!actor.active) return ctx.failure("forbidden", "נדרשת הרשאת צוות פעילה.");
  if (command.type === "update_organization_settings") {
    if (actor.role !== "ceo") return ctx.failure("forbidden", "שינוי הגדרות הארגון זמין למנכ״ל בלבד.");
    await client.query("INSERT INTO mentoring.organization_settings (organization_id) VALUES ($1) ON CONFLICT (organization_id) DO NOTHING", [actor.organizationId]);
    const current = await client.query("SELECT * FROM mentoring.organization_settings WHERE organization_id = $1 FOR UPDATE", [actor.organizationId]);
    const before = organizationSettingsFromRow(current.rows[0]);
    if (before.version !== command.expectedVersion) return ctx.failure("conflict", "הגדרות הארגון עודכנו. הטיוטה נשמרה; יש לבדוק את הגרסה העדכנית לפני ניסיון נוסף.", "expectedVersion");
    const policy = command.settings;
    const changed = await client.query(`UPDATE mentoring.organization_settings SET version = version + 1,
      offline_lease_hours = $2, reminder_audience = $3, appointment_reminder_minutes_before = $4,
      overdue_reminders_enabled = $5, overdue_repeat_hours = $6, updated_at = $7, updated_by = $8
      WHERE organization_id = $1 RETURNING *`, [actor.organizationId, policy.offlineLeaseHours, policy.reminderAudience, policy.appointmentReminderMinutesBefore, policy.overdueRemindersEnabled, policy.overdueRepeatHours, now, actor.id]);
    const after = organizationSettingsFromRow(changed.rows[0]);
    await client.query(`INSERT INTO mentoring.organization_settings_history
      (organization_id, version, settings, reason, updated_at, updated_by) VALUES ($1, $2, $3::jsonb, $4, $5, $6)`,
    [actor.organizationId, after.version, JSON.stringify(after), command.reason, now, actor.id]);
    await ctx.audit(command, undefined, { previousVersion: before.version, version: after.version, reason: command.reason, previousSettings: before, settings: after });
    // Updating operational timing/routing also reconciles reminders already due.
    const participants = await client.query("SELECT id FROM mentoring.participants WHERE organization_id = $1 AND lifecycle = 'active' AND deleted_at IS NULL ORDER BY id", [actor.organizationId]);
    for (const participant of participants.rows) await ctx.refreshReminders(String(participant.id));
    return ctx.success(command);
  }

  if (actor.role === "mentor" || (actor.role === "coordinator" && command.scopeStaffId !== actor.id)) return ctx.failure("forbidden", "סקירה חודשית זמינה להנהלה בלבד ובהתאם לצוות שבאחריותה.");
  if (command.scopeStaffId !== null) {
    const scope = await client.query("SELECT id FROM mentoring.memberships WHERE organization_id = $1 AND id = $2 AND role = 'coordinator' FOR SHARE", [actor.organizationId, command.scopeStaffId]);
    if (!scope.rows[0]) return ctx.failure("validation", "יש לבחור צוות של רכז/ת באותו ארגון.", "scopeStaffId");
  }
  // The absence of a row must also be locked: two managers can create the same
  // month/team concurrently. A transaction advisory lock precedes the read.
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`${actor.organizationId}:monthly:${command.month}:${command.scopeStaffId ?? "organization"}`]);
  const existing = await client.query("SELECT * FROM mentoring.monthly_reviews WHERE organization_id = $1 AND month = $2 AND scope_staff_id IS NOT DISTINCT FROM $3::uuid FOR UPDATE", [actor.organizationId, command.month, command.scopeStaffId]);
  const current = existing.rows[0];
  if (current?.ceo_protected === true && actor.role !== "ceo") return ctx.failure("ceo_protected", "הסקירה נערכה על ידי המנכ״ל. הגרסה מוגנת והטיוטה שלך נשמרה לבדיקה.");
  if ((current ? Number(current.version) : null) !== command.expectedVersion) return ctx.failure("conflict", "הסקירה החודשית עודכנה. הטקסט שלך נשמר בטיוטה; יש לבדוק את הגרסה העדכנית לפני ניסיון נוסף.", "expectedVersion");
  let saved: Row;
  if (current) {
    const updated = await client.query(`UPDATE mentoring.monthly_reviews SET version = version + 1,
      summary = $3, reviewed = $4, ceo_protected = $5, updated_at = $6, updated_by = $7
      WHERE organization_id = $1 AND id = $2 RETURNING *`, [actor.organizationId, current.id, command.summary, command.reviewed, actor.role === "ceo" || current.ceo_protected === true, now, actor.id]);
    saved = updated.rows[0];
  } else {
    const inserted = await client.query(`INSERT INTO mentoring.monthly_reviews
      (id, organization_id, month, scope_staff_id, summary, reviewed, ceo_protected, updated_at, updated_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`, [command.operationId, actor.organizationId, command.month, command.scopeStaffId, command.summary, command.reviewed, actor.role === "ceo", now, actor.id]);
    saved = inserted.rows[0];
  }
  await client.query(`INSERT INTO mentoring.monthly_review_history
    (organization_id, review_id, version, summary, reviewed, ceo_protected, updated_at, updated_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [actor.organizationId, saved.id, saved.version, command.summary, command.reviewed, saved.ceo_protected, now, actor.id]);
  await ctx.audit(command, undefined, { reviewId: saved.id, month: command.month, scopeStaffId: command.scopeStaffId, previousVersion: current ? Number(current.version) : null, version: Number(saved.version), reviewed: command.reviewed, ceoProtected: saved.ceo_protected });
  return ctx.success(command);
}
