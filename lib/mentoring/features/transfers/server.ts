import "server-only";

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { CommandResult, MentoringCommand, StaffProfile } from "../../contracts";
import { checkWritePreconditions, type ServiceType } from "../../domain";
import type { CommandContext } from "../../server/command-context";
import { iso, loadParticipant, staffFromRow } from "../../server/repository";
import {
  canCoordinatorManageTransfers,
  canViewTransfers,
  type RequestParticipantTransferCommand,
  type RespondParticipantTransferCommand,
  type TransferEmailStatus,
  type TransferRequestStatus,
  type TransferRequestView,
  type TransferableParticipantSummary,
  type WorkspaceTransferSlice,
} from "./contracts";
import { transferSchemaState } from "./database-schema";
import { isTransferCommand } from "./schema";

export { canCoordinatorManageTransfers, isTransferCommand };

function transferFromRow(row: Record<string, unknown>): TransferRequestView {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    participantId: String(row.participant_id),
    participantName: String(row.participant_name),
    sourceAssignmentId: String(row.source_assignment_id),
    requesterCoordinatorId: String(row.requester_coordinator_id),
    currentCoordinatorId: String(row.current_coordinator_id),
    targetMentorId: String(row.target_mentor_id),
    status: row.status as TransferRequestStatus,
    requestNote: row.request_note ? String(row.request_note) : null,
    responseNote: row.response_note ? String(row.response_note) : null,
    respondedByStaffId: row.responded_by_staff_id ? String(row.responded_by_staff_id) : null,
    resultingAssignmentId: row.resulting_assignment_id ? String(row.resulting_assignment_id) : null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    respondedAt: row.responded_at ? iso(row.responded_at) : null,
    emailStatus: row.email_status ? (String(row.email_status) as TransferEmailStatus) : null,
  };
}

function transferableFromRow(row: Record<string, unknown>): TransferableParticipantSummary {
  return {
    participantId: String(row.participant_id),
    displayName: String(row.display_name),
    serviceType: (row.service_type as ServiceType | null) ?? null,
    currentCoordinatorId: String(row.current_coordinator_id),
    currentAssignmentId: String(row.current_assignment_id),
    assignmentProtected: Boolean(row.assignment_protected),
  };
}

export async function loadWorkspaceTransfers(client: PoolClient, actor: StaffProfile): Promise<WorkspaceTransferSlice> {
  if (!canViewTransfers(actor)) return {};
  if ((await transferSchemaState(client)) !== "ready") {
    return { transferRequests: [], transferableParticipants: [] };
  }

  const requestsResult = await client.query(`
    SELECT tr.*, p.display_name AS participant_name, email.status AS email_status
    FROM mentoring.transfer_requests tr
    JOIN mentoring.participants p
      ON p.organization_id = tr.organization_id AND p.id = tr.participant_id
    LEFT JOIN mentoring.transfer_request_emails email
      ON email.organization_id = tr.organization_id AND email.transfer_request_id = tr.id
    WHERE tr.organization_id = $1
      AND (p.deleted_at IS NULL OR $3 = 'ceo')
      AND ($3 = 'ceo' OR tr.current_coordinator_id = $2 OR tr.requester_coordinator_id = $2)
    ORDER BY (tr.status = 'pending') DESC, tr.created_at DESC, tr.id
  `, [actor.organizationId, actor.id, actor.role]);

  if (actor.role !== "coordinator") {
    return {
      transferRequests: requestsResult.rows.map(transferFromRow),
      transferableParticipants: [],
    };
  }

  const directoryResult = await client.query(`
    SELECT p.id AS participant_id,
      p.display_name,
      p.service_type,
      a.coordinator_id AS current_coordinator_id,
      a.id AS current_assignment_id,
      EXISTS (
        SELECT 1
        FROM mentoring.ceo_protections cp
        WHERE cp.organization_id = p.organization_id
          AND cp.resource_id = p.id
          AND cp.active = true
          AND (cp.field_paths IS NULL OR 'assignment' = ANY(cp.field_paths))
      ) AS assignment_protected
    FROM mentoring.participants p
    JOIN mentoring.assignments a
      ON a.organization_id = p.organization_id
      AND a.participant_id = p.id
      AND a.ended_at IS NULL
    JOIN mentoring.memberships c
      ON c.organization_id = a.organization_id
      AND c.id = a.coordinator_id
      AND c.active = true
      AND c.role = 'coordinator'
    WHERE p.organization_id = $1
      AND p.deleted_at IS NULL
      AND p.lifecycle = 'active'
      AND a.coordinator_id <> $2
    ORDER BY p.display_name, p.id
  `, [actor.organizationId, actor.id]);

  return {
    transferRequests: requestsResult.rows.map(transferFromRow),
    transferableParticipants: directoryResult.rows.map(transferableFromRow),
  };
}

export async function rejectPendingParticipantTransfers(
  client: PoolClient,
  organizationId: string,
  participantId: string,
  actorId: string,
  now: string,
  reason: string,
): Promise<void> {
  if ((await transferSchemaState(client)) !== "ready") return;
  const resolved = await client.query<{ id: string }>(`
    UPDATE mentoring.transfer_requests
    SET status = 'rejected',
        responded_by_staff_id = $3,
        responded_at = $4::timestamptz,
        response_note = coalesce(response_note, $5),
        updated_at = clock_timestamp()
    WHERE organization_id = $1 AND participant_id = $2 AND status = 'pending'
    RETURNING id
  `, [organizationId, participantId, actorId, now, reason]);
  if (resolved.rows.length > 0) {
    await client.query(`
      UPDATE mentoring.transfer_request_emails
      SET status = 'cancelled'
      WHERE organization_id = $1
        AND transfer_request_id = ANY($2::uuid[])
        AND status = 'queued'
    `, [organizationId, resolved.rows.map((row) => row.id)]);
  }
}

async function requestParticipantTransfer(
  context: CommandContext,
  command: RequestParticipantTransferCommand,
): Promise<CommandResult> {
  const { client, actor, now } = context;
  const view = await loadParticipant(client, actor.organizationId, command.participantId, true);
  if (!view || view.participant.deletedAt) {
    return context.failure("not_found", "כרטיס החניכה לא נמצא.");
  }
  if (view.participant.lifecycle !== "active") {
    return context.failure("validation", "אפשר לבקש העברת שיוך רק עבור חניכה בליווי פעיל.", "participantId");
  }

  const protection = view.protections.find((item) => item.resourceId === view.participant.id && item.active);
  const precondition = checkWritePreconditions({
    actor,
    resource: view.participant,
    expectedVersion: view.participant.version,
    hasScope: true,
    protection,
    changedFields: ["assignment"],
  });
  if (!precondition.ok && precondition.code === "ceo_protected") {
    return context.failure("ceo_protected", "שיוך החניכה נעול בהגנת מנכ״ל ואינו ניתן להעברה ללא אישור מנכ״ל.", "participantId");
  }

  if (!view.assignment) {
    return context.failure("validation", "החניכה עדיין אינה משובצת. ניתן לשייך חניכה חדשה ישירות ללא בקשת העברה.", "participantId");
  }
  if (!view.assignment.coordinatorId) {
    return context.failure("validation", "לחניכה זו אין רכזת משויכת פעילה; שינוי השיוך אפשרי על ידי המנכ״ל בלבד.", "participantId");
  }
  if (view.assignment.coordinatorId === actor.id) {
    return context.failure("validation", "החניכה כבר משויכת לצוות שלך.", "participantId");
  }

  const staffResult = await client.query(
    "SELECT * FROM mentoring.memberships WHERE organization_id = $1 AND id = ANY($2::uuid[]) ORDER BY id FOR SHARE",
    [actor.organizationId, [view.assignment.coordinatorId, command.targetMentorId]],
  );
  const members = staffResult.rows.map(staffFromRow);
  const currentCoordinator = members.find((member) => member.id === view.assignment!.coordinatorId && member.active && member.role === "coordinator");
  const targetMentor = members.find((member) => member.id === command.targetMentorId && member.active && member.role === "mentor");
  if (!currentCoordinator) {
    return context.failure("validation", "הרכזת הנוכחית אינה פעילה כעת; העברת השיוך אפשרית על ידי המנכ״ל בלבד.", "participantId");
  }
  if (!targetMentor) {
    return context.failure("validation", "יש לבחור חונכת עם גישה פעילה.", "targetMentorId");
  }
  if (targetMentor.coordinatorId !== actor.id) {
    return context.failure("forbidden", "אפשר לבקש העברת שיוך רק עבור חונכת בצוות שלך.", "targetMentorId");
  }

  const existingPending = await client.query(
    "SELECT id FROM mentoring.transfer_requests WHERE organization_id = $1 AND participant_id = $2 AND requester_coordinator_id = $3 AND status = 'pending' FOR UPDATE",
    [actor.organizationId, view.participant.id, actor.id],
  );
  if (existingPending.rows[0]) {
    return context.failure("conflict", "כבר קיימת בקשת העברה ממתינה שלך עבור חניכה זו.", "participantId");
  }

  const inserted = await client.query(`
    INSERT INTO mentoring.transfer_requests (
      id, organization_id, participant_id, source_assignment_id,
      requester_coordinator_id, current_coordinator_id, target_mentor_id,
      status, request_note, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9::timestamptz, $9::timestamptz)
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `, [
    command.operationId,
    actor.organizationId,
    view.participant.id,
    view.assignment.id,
    actor.id,
    currentCoordinator.id,
    targetMentor.id,
    command.note ?? null,
    now,
  ]);
  if (inserted.rowCount !== 1) {
    return context.failure("conflict", "מזהה הבקשה כבר קיים. יש לשלוח בקשה חדשה.");
  }

  if (currentCoordinator.email) {
    await client.query(`
      INSERT INTO mentoring.transfer_request_emails (
        organization_id, transfer_request_id, recipient_staff_id, recipient_email,
        status, created_at, next_attempt_at
      )
      VALUES ($1, $2, $3, $4, 'queued', $5::timestamptz, $5::timestamptz)
    `, [actor.organizationId, command.operationId, currentCoordinator.id, currentCoordinator.email, now]);
  }

  await context.audit(command, view.participant.id, {
    transferRequestId: command.operationId,
    requesterCoordinatorId: actor.id,
    currentCoordinatorId: currentCoordinator.id,
    targetMentorId: targetMentor.id,
    sourceAssignmentId: view.assignment.id,
  });

  return {
    ...context.success(command, view.participant.id),
    transferRequestId: command.operationId,
  };
}

async function respondParticipantTransfer(
  context: CommandContext,
  command: RespondParticipantTransferCommand,
): Promise<CommandResult> {
  const { client, actor, now } = context;
  const requestResult = await client.query(
    "SELECT * FROM mentoring.transfer_requests WHERE organization_id = $1 AND id = $2 FOR UPDATE",
    [actor.organizationId, command.transferRequestId],
  );
  const request = requestResult.rows[0];
  if (!request) {
    return context.failure("not_found", "בקשת ההעברה לא נמצאה.");
  }
  if (String(request.current_coordinator_id) !== actor.id) {
    return context.failure("forbidden", "רק הרכזת המחזיקה בשיוך החניכה רשאית לאשר או לדחות את הבקשה.");
  }
  if (request.status !== "pending") {
    return context.failure("conflict", "בקשת ההעברה כבר טופלה.");
  }

  const participantId = String(request.participant_id);
  const view = await loadParticipant(client, actor.organizationId, participantId, true);
  if (!view) {
    return context.failure("not_found", "כרטיס החניכה לא נמצא.");
  }

  if (command.decision === "rejected") {
    await client.query(`
      UPDATE mentoring.transfer_requests
      SET status = 'rejected',
          response_note = $3,
          responded_by_staff_id = $4,
          responded_at = $5::timestamptz,
          updated_at = clock_timestamp()
      WHERE organization_id = $1 AND id = $2
    `, [actor.organizationId, command.transferRequestId, command.note ?? null, actor.id, now]);
    await client.query(
      "UPDATE mentoring.transfer_request_emails SET status = 'cancelled' WHERE organization_id = $1 AND transfer_request_id = $2 AND status = 'queued'",
      [actor.organizationId, command.transferRequestId],
    );
    await context.audit(command, participantId, {
      transferRequestId: command.transferRequestId,
      decision: "rejected",
      requesterCoordinatorId: String(request.requester_coordinator_id),
      currentCoordinatorId: actor.id,
    });
    return {
      ...context.success(command, participantId),
      transferRequestId: command.transferRequestId,
    };
  }

  if (view.participant.deletedAt) {
    return context.failure("not_found", "כרטיס החניכה נמצא בסל המחזור ואינו ניתן להעברה.");
  }
  if (view.participant.lifecycle !== "active") {
    return context.failure("validation", "אפשר להעביר שיוך רק עבור חניכה בליווי פעיל.");
  }

  const protection = view.protections.find((item) => item.resourceId === view.participant.id && item.active);
  const precondition = checkWritePreconditions({
    actor,
    resource: view.participant,
    expectedVersion: view.participant.version,
    hasScope: true,
    protection,
    changedFields: ["assignment"],
  });
  if (!precondition.ok && precondition.code === "ceo_protected") {
    return context.failure("ceo_protected", "שיוך החניכה נעול בהגנת מנכ״ל ואינו ניתן להעברה ללא אישור מנכ״ל.");
  }

  if (!view.assignment || view.assignment.id !== String(request.source_assignment_id) || view.assignment.coordinatorId !== actor.id) {
    return context.failure("conflict", "שיוך החניכה השתנה מאז שליחת הבקשה.");
  }

  const requesterCoordinatorId = String(request.requester_coordinator_id);
  const targetMentorId = String(request.target_mentor_id);
  const staffResult = await client.query(
    "SELECT * FROM mentoring.memberships WHERE organization_id = $1 AND id = ANY($2::uuid[]) ORDER BY id FOR SHARE",
    [actor.organizationId, [requesterCoordinatorId, targetMentorId]],
  );
  const members = staffResult.rows.map(staffFromRow);
  const requesterCoordinator = members.find((member) => member.id === requesterCoordinatorId && member.active && member.role === "coordinator");
  const targetMentor = members.find((member) => member.id === targetMentorId && member.active && member.role === "mentor");
  if (!requesterCoordinator) {
    return context.failure("conflict", "הרכזת המבקשת אינה פעילה כעת ולא ניתן להשלים את ההעברה.");
  }
  if (!targetMentor || targetMentor.coordinatorId !== requesterCoordinator.id) {
    return context.failure("conflict", "החונכת המיועדת בצוות המבקש אינה פעילה או שאינה משויכת עוד לרכזת המבקשת.");
  }

  await client.query(
    "UPDATE mentoring.assignments SET ended_at = $3 WHERE organization_id = $1 AND participant_id = $2 AND ended_at IS NULL",
    [actor.organizationId, participantId, now],
  );
  if (view.nextAppointment) {
    await client.query(
      "UPDATE mentoring.appointments SET mentor_id = $3, version = version + 1 WHERE organization_id = $1 AND participant_id = $2 AND is_current = true",
      [actor.organizationId, participantId, targetMentor.id],
    );
  }
  const newAssignmentId = randomUUID();
  const assignmentVersion = view.assignment.version + 1;
  const followupAnchorAt = view.assignment.followupAnchorAt ?? view.assignment.assignedAt;
  await client.query(
    "INSERT INTO mentoring.assignments (id,organization_id,participant_id,mentor_id,coordinator_id,assigned_at,followup_anchor_at,version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    [newAssignmentId, actor.organizationId, participantId, targetMentor.id, requesterCoordinator.id, now, followupAnchorAt, assignmentVersion],
  );
  await client.query(
    "UPDATE mentoring.participants SET version = version + 1, updated_at = clock_timestamp() WHERE organization_id = $1 AND id = $2",
    [actor.organizationId, participantId],
  );
  await client.query(
    "UPDATE mentoring.outbox SET status = 'cancelled' WHERE organization_id = $1 AND participant_id = $2 AND status IN ('blocked','pending')",
    [actor.organizationId, participantId],
  );

  await client.query(`
    UPDATE mentoring.transfer_requests
    SET status = 'approved',
        response_note = $3,
        responded_by_staff_id = $4,
        responded_at = $5::timestamptz,
        resulting_assignment_id = $6,
        updated_at = clock_timestamp()
    WHERE organization_id = $1 AND id = $2
  `, [actor.organizationId, command.transferRequestId, command.note ?? null, actor.id, now, newAssignmentId]);

  await client.query(
    "UPDATE mentoring.transfer_request_emails SET status = 'cancelled' WHERE organization_id = $1 AND transfer_request_id = $2 AND status = 'queued'",
    [actor.organizationId, command.transferRequestId],
  );

  const siblingPending = await client.query<{ id: string }>(`
    UPDATE mentoring.transfer_requests
    SET status = 'rejected',
        responded_by_staff_id = $4,
        responded_at = $5::timestamptz,
        response_note = 'נסגרה עקב אישור העברת החניכה לרכזת אחרת.',
        updated_at = clock_timestamp()
    WHERE organization_id = $1 AND participant_id = $2 AND id <> $3 AND status = 'pending'
    RETURNING id
  `, [actor.organizationId, participantId, command.transferRequestId, actor.id, now]);
  if (siblingPending.rows.length > 0) {
    await client.query(
      "UPDATE mentoring.transfer_request_emails SET status = 'cancelled' WHERE organization_id = $1 AND transfer_request_id = ANY($2::uuid[]) AND status = 'queued'",
      [actor.organizationId, siblingPending.rows.map((row) => row.id)],
    );
  }

  await context.refreshReminders(participantId);
  await context.audit(command, participantId, {
    transferRequestId: command.transferRequestId,
    decision: "approved",
    requesterCoordinatorId: requesterCoordinator.id,
    currentCoordinatorId: actor.id,
    targetMentorId: targetMentor.id,
    assignmentVersion,
  });

  return {
    ...context.success(command, participantId),
    transferRequestId: command.transferRequestId,
  };
}

export async function handleTransferCommand(context: CommandContext, command: MentoringCommand): Promise<CommandResult | null> {
  if (!isTransferCommand(command)) return null;
  if (!canCoordinatorManageTransfers(context.actor)) {
    return context.failure("forbidden", "בקשות העברת שיוך מנוהלות בין רכזות בלבד.");
  }
  if ((await transferSchemaState(context.client)) !== "ready") {
    return context.failure("not_configured", "בקשות העברת השיוך עדיין אינן זמינות בסביבה זו. יש להריץ את עדכון מסד הנתונים של מערך הליווי.");
  }
  return command.type === "request_participant_transfer"
    ? requestParticipantTransfer(context, command)
    : respondParticipantTransfer(context, command);
}
