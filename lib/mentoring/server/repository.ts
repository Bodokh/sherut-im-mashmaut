import "server-only";

import type { PoolClient, QueryResultRow } from "pg";
import type { ConflictView, ParticipantProfile, ParticipantView, StaffProfile, WorkspaceSnapshot } from "../contracts";
import type { AccessGrant, Appointment, Assignment, CeoProtection, ContactEntry, Review } from "../domain";
import { MentoringServerError, ORGANIZATION_ID, withTransaction } from "./db";
import { canPerformParticipantAction, type ParticipantAction } from "../domain";

type Row = QueryResultRow;
const text = (value: unknown): string => String(value);
const nullable = (value: unknown): string | null => value == null ? null : String(value);
export const iso = (value: unknown): string => new Date(value as string | Date).toISOString();
const nullableIso = (value: unknown): string | null => value == null ? null : iso(value);

export function staffFromRow(row: Row): StaffProfile {
  return {
    id: text(row.id), organizationId: text(row.organization_id), authUserId: nullable(row.auth_user_id) ?? "",
    displayName: text(row.display_name), email: nullable(row.email), phone: nullable(row.phone),
    coordinatorId: nullable(row.coordinator_id), smsMuted: row.sms_muted === true,
    role: row.role as StaffProfile["role"], active: row.active === true, version: Number(row.version),
  };
}

export function participantFromRow(row: Row): ParticipantProfile {
  return {
    id: text(row.id), organizationId: text(row.organization_id), displayName: text(row.display_name), phone: nullable(row.phone),
    serviceType: row.service_type as ParticipantProfile["serviceType"], servicePlace: nullable(row.service_place),
    serviceRole: nullable(row.service_role), profileNotes: nullable(row.profile_notes),
    lifecycle: row.lifecycle as ParticipantProfile["lifecycle"], version: Number(row.version), createdAt: iso(row.created_at),
    createdBy: text(row.created_by), deletedAt: nullableIso(row.deleted_at), deletedBy: nullable(row.deleted_by), deletionReason: nullable(row.deletion_reason), deletedPreviousLifecycle: row.deleted_previous_lifecycle as ParticipantProfile["deletedPreviousLifecycle"],
  };
}

export function assignmentFromRow(row: Row): Assignment {
  return { id: text(row.id), organizationId: text(row.organization_id), participantId: text(row.participant_id), mentorId: text(row.mentor_id), coordinatorId: nullable(row.coordinator_id), assignedAt: iso(row.assigned_at), followupAnchorAt: iso(row.followup_anchor_at), version: Number(row.version) };
}

export function appointmentFromRow(row: Row): Appointment {
  return { id: text(row.id), organizationId: text(row.organization_id), participantId: text(row.participant_id), mentorId: text(row.mentor_id), scheduledAt: iso(row.scheduled_at), version: Number(row.version), sourceContactId: nullable(row.source_contact_id), requiresReview: row.requires_review === true };
}

export function contactFromRow(row: Row): ContactEntry {
  return { id: text(row.id), organizationId: text(row.organization_id), participantId: text(row.participant_id), actorId: text(row.actor_id), method: row.method as ContactEntry["method"], outcome: row.outcome as ContactEntry["outcome"], occurredAt: iso(row.occurred_at), receivedAt: iso(row.received_at), notes: text(row.notes), revision: Number(row.revision), invalidatedAt: nullableIso(row.invalidated_at) };
}

export function protectionFromRow(row: Row): CeoProtection {
  return { organizationId: text(row.organization_id), resourceId: text(row.resource_id), protectedByStaffId: text(row.protected_by_staff_id), protectedRevision: Number(row.protected_revision), active: row.active === true, fieldPaths: row.field_paths as string[] | null };
}

export function grantFromRow(row: Row): AccessGrant {
  return { id: text(row.id), organizationId: text(row.organization_id), staffId: text(row.staff_id), participantId: text(row.participant_id), actions: row.actions as AccessGrant["actions"], active: row.active === true, expiresAt: nullableIso(row.expires_at) };
}

/** Call only with a provider-verified identity and verified email, never request JSON. */
export async function identityInTransaction(client: PoolClient, authUserId: string, verifiedEmail?: string | null): Promise<StaffProfile | null> {
  if (!authUserId || authUserId.length > 300) return null;
  const existing = await client.query("SELECT * FROM mentoring.memberships WHERE organization_id = $1 AND auth_user_id = $2 FOR UPDATE", [ORGANIZATION_ID, authUserId]);
  if (existing.rows[0]) return existing.rows[0].active === true ? staffFromRow(existing.rows[0]) : null;
  if (!verifiedEmail) return null;
  const email = verifiedEmail.trim().toLowerCase();
  // Email alone cannot create membership, reactivate it, or replace a prior binding.
  const approved = await client.query("SELECT * FROM mentoring.memberships WHERE organization_id = $1 AND lower(email) = $2 AND auth_user_id IS NULL AND active = true FOR UPDATE", [ORGANIZATION_ID, email]);
  if (!approved.rows[0]) return null;
  const bound = await client.query("UPDATE mentoring.memberships SET auth_user_id = $3, version = version + 1, updated_at = clock_timestamp() WHERE organization_id = $1 AND id = $2 AND auth_user_id IS NULL AND active = true RETURNING *", [ORGANIZATION_ID, approved.rows[0].id, authUserId]);
  return bound.rows[0] ? staffFromRow(bound.rows[0]) : null;
}

export async function resolveStaffIdentity(authUserId: string, verifiedEmail?: string | null): Promise<StaffProfile | null> {
  return withTransaction((client) => identityInTransaction(client, authUserId, verifiedEmail));
}

export async function requireIdentity(client: PoolClient, authUserId: string, verifiedEmail?: string | null): Promise<StaffProfile> {
  const actor = await identityInTransaction(client, authUserId, verifiedEmail);
  if (!actor) throw new MentoringServerError("not_staff", "החשבון אינו משויך לצוות פעיל. יש לפנות להנהלה.");
  return actor;
}

export async function loadParticipant(client: PoolClient, organizationId: string, participantId: string, lock = false): Promise<ParticipantView | null> {
  const participant = await client.query(`SELECT * FROM mentoring.participants WHERE organization_id = $1 AND id = $2${lock ? " FOR UPDATE" : ""}`, [organizationId, participantId]);
  const row = participant.rows[0];
  if (!row) return null;
  const assignments = await client.query("SELECT * FROM mentoring.assignments WHERE organization_id = $1 AND participant_id = $2 AND ended_at IS NULL", [organizationId, participantId]);
  const appointments = await client.query("SELECT * FROM mentoring.appointments WHERE organization_id = $1 AND participant_id = $2 AND is_current = true", [organizationId, participantId]);
  const contacts = await client.query("SELECT * FROM mentoring.contacts WHERE organization_id = $1 AND participant_id = $2 ORDER BY occurred_at DESC, received_at DESC, id", [organizationId, participantId]);
  const reviews = await client.query("SELECT r.* FROM mentoring.reviews r JOIN mentoring.contacts c ON c.organization_id = r.organization_id AND c.id = r.contact_id WHERE c.organization_id = $1 AND c.participant_id = $2", [organizationId, participantId]);
  const protections = await client.query("SELECT * FROM mentoring.ceo_protections WHERE organization_id = $1 AND active = true AND (resource_id = $2 OR resource_id IN (SELECT id FROM mentoring.contacts WHERE organization_id = $1 AND participant_id = $2))", [organizationId, participantId]);
  return {
    participant: participantFromRow(row), assignment: assignments.rows[0] ? assignmentFromRow(assignments.rows[0]) : null,
    nextAppointment: appointments.rows[0] ? appointmentFromRow(appointments.rows[0]) : null,
    manualColor: row.manual_color as ParticipantView["manualColor"], manualColorAt: nullableIso(row.manual_color_at),
    contacts: contacts.rows.map(contactFromRow), protections: protections.rows.map(protectionFromRow),
    reviews: reviews.rows.map((review): Review => ({ contactId: text(review.contact_id), revision: Number(review.revision), decision: review.decision as Review["decision"], reviewedByStaffId: text(review.reviewed_by_staff_id), reviewedAt: iso(review.reviewed_at) })),
  };
}

export async function loadActorGrants(client: PoolClient, actor: StaffProfile, participantId: string): Promise<readonly AccessGrant[]> {
  const result = await client.query("SELECT * FROM mentoring.grants WHERE organization_id = $1 AND staff_id = $2 AND participant_id = $3 AND active = true FOR SHARE", [actor.organizationId, actor.id, participantId]);
  return result.rows.map(grantFromRow);
}

export async function ownsUnassignedParticipant(client: PoolClient, actor: StaffProfile, view: ParticipantView): Promise<boolean> {
  if (actor.role !== "coordinator" || view.assignment || view.participant.deletedAt != null) return false;
  const result = await client.query("SELECT 1 FROM mentoring.participants WHERE organization_id = $1 AND id = $2 AND created_by = $3", [actor.organizationId, view.participant.id, actor.id]);
  return result.rowCount === 1;
}

async function loadVisibleParticipants(client: PoolClient, organizationId: string, participantIds: string[]): Promise<ParticipantView[]> {
  if (!participantIds.length) return [];
  const parameters = [organizationId, participantIds];
  const participants = await client.query("SELECT * FROM mentoring.participants WHERE organization_id = $1 AND id = ANY($2::uuid[]) ORDER BY created_at DESC, id", parameters);
  const assignments = await client.query("SELECT * FROM mentoring.assignments WHERE organization_id = $1 AND participant_id = ANY($2::uuid[]) AND ended_at IS NULL", parameters);
  const appointments = await client.query("SELECT * FROM mentoring.appointments WHERE organization_id = $1 AND participant_id = ANY($2::uuid[]) AND is_current = true", parameters);
  const contacts = await client.query("SELECT * FROM mentoring.contacts WHERE organization_id = $1 AND participant_id = ANY($2::uuid[]) ORDER BY occurred_at DESC, received_at DESC, id", parameters);
  const reviews = await client.query("SELECT r.*, c.participant_id FROM mentoring.reviews r JOIN mentoring.contacts c ON c.organization_id = r.organization_id AND c.id = r.contact_id WHERE c.organization_id = $1 AND c.participant_id = ANY($2::uuid[])", parameters);
  const protections = await client.query("SELECT p.*, c.participant_id AS contact_participant_id FROM mentoring.ceo_protections p LEFT JOIN mentoring.contacts c ON c.organization_id = p.organization_id AND c.id = p.resource_id WHERE p.organization_id = $1 AND p.active = true AND (p.resource_id = ANY($2::uuid[]) OR c.participant_id = ANY($2::uuid[]))", parameters);
  const group = (rows: Row[], key: string): Map<string, Row[]> => {
    const result = new Map<string, Row[]>();
    for (const row of rows) {
      const id = text(row[key]);
      const entries = result.get(id) ?? [];
      entries.push(row);
      result.set(id, entries);
    }
    return result;
  };
  const assignmentsByParticipant = group(assignments.rows, "participant_id");
  const appointmentsByParticipant = group(appointments.rows, "participant_id");
  const contactsByParticipant = group(contacts.rows, "participant_id");
  const reviewsByParticipant = group(reviews.rows, "participant_id");
  const protectionsByParticipant = group(protections.rows.map((row) => ({ ...row, participant_id: row.contact_participant_id ?? row.resource_id })), "participant_id");
  return participants.rows.map((row): ParticipantView => {
    const id = text(row.id);
    const assignment = assignmentsByParticipant.get(id)?.[0];
    const appointment = appointmentsByParticipant.get(id)?.[0];
    return {
      participant: participantFromRow(row), assignment: assignment ? assignmentFromRow(assignment) : null,
      nextAppointment: appointment ? appointmentFromRow(appointment) : null,
      manualColor: row.manual_color as ParticipantView["manualColor"], manualColorAt: nullableIso(row.manual_color_at),
      contacts: (contactsByParticipant.get(id) ?? []).map(contactFromRow),
      protections: (protectionsByParticipant.get(id) ?? []).map(protectionFromRow),
      reviews: (reviewsByParticipant.get(id) ?? []).map((review): Review => ({ contactId: text(review.contact_id), revision: Number(review.revision), decision: review.decision as Review["decision"], reviewedByStaffId: text(review.reviewed_by_staff_id), reviewedAt: iso(review.reviewed_at) })),
    };
  });
}

export async function getWorkspace(authUserId: string, verifiedEmail?: string | null): Promise<WorkspaceSnapshot> {
  return withTransaction(async (client) => {
    const actor = await requireIdentity(client, authUserId, verifiedEmail);
    const time = await client.query("SELECT clock_timestamp() AS now");
    const serverTime = iso(time.rows[0].now);
    const visible = await client.query(`SELECT p.id FROM mentoring.participants p WHERE p.organization_id = $1 AND (p.deleted_at IS NULL OR $3 = 'ceo') AND ($3 = 'ceo' OR ($3 = 'coordinator' AND p.created_by = $2 AND NOT EXISTS (SELECT 1 FROM mentoring.assignments a WHERE a.organization_id = p.organization_id AND a.participant_id = p.id AND a.ended_at IS NULL)) OR EXISTS (SELECT 1 FROM mentoring.assignments a WHERE a.organization_id = p.organization_id AND a.participant_id = p.id AND a.ended_at IS NULL AND (($3 = 'mentor' AND a.mentor_id = $2) OR ($3 = 'coordinator' AND a.coordinator_id = $2))) OR EXISTS (SELECT 1 FROM mentoring.grants g WHERE g.organization_id = p.organization_id AND g.participant_id = p.id AND g.staff_id = $2 AND g.active = true AND 'view' = ANY(g.actions) AND (g.expires_at IS NULL OR g.expires_at > $4::timestamptz))) ORDER BY p.created_at DESC, p.id`, [actor.organizationId, actor.id, actor.role, serverTime]);
    const baseParticipants = await loadVisibleParticipants(client, actor.organizationId, visible.rows.map((row) => text(row.id)));
    const [{ loadContactHistory }, { loadAuthorityExtras }, { loadOversightExtras }, { loadReminderExtras }] = await Promise.all([
      import("../features/contacts/server"), import("../features/authority/server"), import("../features/oversight/server"), import("../features/reminders/server"),
    ]);
    const ids = baseParticipants.map((view) => view.participant.id);
    const history = await loadContactHistory(client, actor.organizationId, ids);
    const authority = await loadAuthorityExtras(client, actor.organizationId, ids);
    const oversight = await loadOversightExtras(client, actor, serverTime);
    const reminderData = await loadReminderExtras(client, actor, ids);
    const grantRows = await client.query("SELECT * FROM mentoring.grants WHERE organization_id = $1 AND staff_id = $2 AND active = true", [actor.organizationId, actor.id]);
    const currentGrants = grantRows.rows.map(grantFromRow);
    const participants = baseParticipants.map((view): ParticipantView => {
      const extras = authority.get(view.participant.id);
      const ownUnassigned = actor.role === "coordinator" && !view.assignment && view.participant.createdBy === actor.id;
      const allowedActions = (["view", "edit", "approve", "delete"] as ParticipantAction[]).filter((action) => canPerformParticipantAction(actor, view.participant, view.assignment, action, currentGrants, serverTime) || (ownUnassigned && action !== "delete"));
      return { ...view, ...history.get(view.participant.id), ...extras, allowedActions,
        accessGrants: extras?.accessGrants.filter((grant) => actor.role === "ceo" || grant.staffId === actor.id).map((grant) => actor.role === "ceo" ? grant : { ...grant, reason: null }),
        protectionStates: extras?.protectionStates.map((protection) => actor.role === "ceo" ? protection : { ...protection, reason: null }),
        authorityHistory: actor.role === "mentor" ? [] : actor.role === "ceo" ? extras?.authorityHistory : extras?.authorityHistory.filter((event) => !["set_access_grant", "set_ceo_protection"].includes(event.action)),
      };
    });
    // Staff contact details are visible only to management or their own record.
    const staffResult = await client.query("SELECT * FROM mentoring.memberships WHERE organization_id = $1 AND (active = true OR id = $2 OR $3 <> 'mentor') ORDER BY display_name, id", [actor.organizationId, actor.id, actor.role]);
    const staff = staffResult.rows.map(staffFromRow).map((member) => actor.role === "mentor" && member.id !== actor.id ? { ...member, email: null, phone: null, authUserId: "" } : member);
    const conflictsResult = await client.query("SELECT c.*, p.display_name AS participant_name, m.display_name AS author_name FROM mentoring.conflicts c JOIN mentoring.participants p ON p.organization_id = c.organization_id AND p.id = c.participant_id JOIN mentoring.memberships m ON m.organization_id = c.organization_id AND m.id = c.actor_id WHERE c.organization_id = $1 AND ($3 = 'ceo' OR c.actor_id = $2) ORDER BY c.created_at DESC", [actor.organizationId, actor.id, actor.role]);
    const visibleIds = new Set(participants.map((view) => view.participant.id));
    const conflicts: ConflictView[] = conflictsResult.rows.filter((row) => visibleIds.has(text(row.participant_id))).map((row) => ({ id: text(row.id), participantId: text(row.participant_id), participantName: text(row.participant_name), authorName: text(row.author_name), authoritativeValue: JSON.stringify(row.authoritative_value, null, 2), submittedValue: JSON.stringify(row.submitted_value, null, 2), createdAt: iso(row.created_at), resolvedAt: nullableIso(row.resolved_at) }));
    let offlineDeadline = Date.parse(serverTime) + oversight.settings.offlineLeaseHours * 60 * 60 * 1000;
    if (actor.role !== "ceo") {
      // A known grant deadline must never become a longer offline permission.
      // Conservatively bound the whole snapshot by all active timed grants;
      // permanent grants and the CEO's inherent scope do not shorten the lease.
      const expiry = await client.query("SELECT min(expires_at) AS expires_at FROM mentoring.grants WHERE organization_id = $1 AND staff_id = $2 AND active = true AND expires_at > $3::timestamptz", [actor.organizationId, actor.id, serverTime]);
      if (expiry.rows[0].expires_at != null) offlineDeadline = Math.min(offlineDeadline, Date.parse(iso(expiry.rows[0].expires_at)));
    }
    return { actor, staff, participants, conflicts, ...oversight, ...reminderData, serverTime, offlineValidUntil: new Date(offlineDeadline).toISOString(), capabilities: { smsConfigured: reminderData.reminderReadiness.smsProviderConfigured && reminderData.reminderReadiness.smsCredentialsConfigured, smsSendingEnabled: reminderData.reminderReadiness.smsSendingEnabled } };
  }, { repeatableRead: true });
}
