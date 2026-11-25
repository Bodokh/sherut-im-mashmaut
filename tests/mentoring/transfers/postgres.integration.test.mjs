import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import test from "node:test";
import { Pool } from "pg";
import "../server/typescript-loader.mjs";

const enabled = process.env.MENTORING_INTEGRATION_TESTS === "1";
const organizationId = "11111111-1111-4111-8111-111111111111";

test("real PostgreSQL mentee initial assignments, coordinator transfer requests, email notifications, and CEO overrides", { skip: !enabled, timeout: 180_000 }, async (t) => {
  assert.notEqual(process.env.NODE_ENV, "production", "The fixture suite cannot run in production.");
  assert.ok(process.execArgv.includes("--conditions=react-server"), "Run with --conditions=react-server.");
  const envFile = new URL("../../../.env.local", import.meta.url);
  if (!process.env.MENTORING_DATABASE_URL && existsSync(envFile)) loadEnvFile(envFile);
  assert.ok(process.env.MENTORING_DATABASE_URL, "An already migrated development database is required.");

  const { executeCommand } = await import("../../../lib/mentoring/server/commands.ts");
  const { getWorkspace } = await import("../../../lib/mentoring/server/repository.ts");
  const { getDatabasePool } = await import("../../../lib/mentoring/server/db.ts");
  const { dispatchTransferRequestEmails } = await import("../../../lib/mentoring/features/transfers/email.ts");

  const database = new Pool({
    connectionString: process.env.MENTORING_DATABASE_URL_UNPOOLED ?? process.env.MENTORING_DATABASE_URL,
    max: 3,
    connectionTimeoutMillis: 10_000,
  });

  try {
    const schema = await database.query(
      "SELECT to_regclass('mentoring.transfer_requests') IS NOT NULL AS requests, to_regclass('mentoring.transfer_request_emails') IS NOT NULL AS emails",
    );
    assert.equal(schema.rows[0].requests && schema.rows[0].emails, true, "Apply migration 017_transfer_requests.sql before running integration tests.");
    assert.equal(
      (await database.query("SELECT count(*)::int AS count FROM mentoring.participants WHERE organization_id = $1", [organizationId])).rows[0].count,
      0,
      "Run only in the reserved empty development-database window.",
    );
  } catch {
    await database.end();
    throw new Error("The migrated development database is unavailable or is not empty. No fixtures were written.");
  }

  const runId = randomUUID();
  const staff = [];
  const participantIds = [];
  const resourceIds = new Set();

  const run = (actor, command) => {
    if (["create_participant", "record_contact"].includes(command.type)) resourceIds.add(command.operationId);
    if (command.type === "create_participant" && !participantIds.includes(command.operationId)) participantIds.push(command.operationId);
    return executeCommand(actor.authUserId, actor.email, command);
  };
  const accepted = (result) => {
    assert.equal(result.ok, true, result.ok ? undefined : `${result.error.code}: ${result.error.message}`);
    assert.equal(result.acceptance, "accepted");
    return result;
  };
  const denied = (result, code) => {
    assert.equal(result.ok, false, `Expected failure ${code}, got ${JSON.stringify(result)}`);
    assert.equal(result.error.code, code);
    return result.error;
  };

  async function addStaff(role, label, coordinatorId = null) {
    const person = {
      id: randomUUID(),
      authUserId: `transfer_test_${randomUUID()}`,
      email: `${randomUUID()}@mentoring-tests.invalid`,
      phone: `05${Math.floor(10000000 + Math.random() * 89999999)}`,
      role,
      coordinatorId,
    };
    staff.push(person);
    await database.query(
      "INSERT INTO mentoring.memberships (id,organization_id,auth_user_id,email,display_name,phone,role,coordinator_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [person.id, organizationId, person.authUserId, person.email, `${label} ${runId}`, person.phone, role, coordinatorId],
    );
    return person;
  }

  async function createUnassigned(owner, displayName, extra = {}) {
    const id = randomUUID();
    accepted(await run(owner, {
      type: "create_participant",
      operationId: id,
      fields: { displayName, phone: "0509876543", profileNotes: "הערה חסויה בכרטיס", serviceType: "national", ...extra },
    }));
    return id;
  }

  async function participantState(participantId) {
    const participant = (await database.query("SELECT * FROM mentoring.participants WHERE organization_id = $1 AND id = $2", [organizationId, participantId])).rows[0] ?? null;
    const assignment = (await database.query("SELECT * FROM mentoring.assignments WHERE organization_id = $1 AND participant_id = $2 AND ended_at IS NULL", [organizationId, participantId])).rows[0] ?? null;
    const appointment = (await database.query("SELECT * FROM mentoring.appointments WHERE organization_id = $1 AND participant_id = $2 AND is_current = true", [organizationId, participantId])).rows[0] ?? null;
    return { participant, assignment, appointment };
  }

  t.after(async () => {
    const staffIds = staff.map((person) => person.id);
    const cleanup = await database.connect();
    try {
      await cleanup.query("BEGIN");
      await cleanup.query("DELETE FROM mentoring.transfer_request_emails WHERE organization_id = $1 AND (recipient_staff_id = ANY($2::uuid[]) OR transfer_request_id IN (SELECT id FROM mentoring.transfer_requests WHERE organization_id = $1 AND (participant_id = ANY($3::uuid[]) OR requester_coordinator_id = ANY($2::uuid[]) OR current_coordinator_id = ANY($2::uuid[]))))", [organizationId, staffIds, participantIds]);
      await cleanup.query("DELETE FROM mentoring.transfer_requests WHERE organization_id = $1 AND (participant_id = ANY($2::uuid[]) OR requester_coordinator_id = ANY($3::uuid[]) OR current_coordinator_id = ANY($3::uuid[]))", [organizationId, participantIds, staffIds]);
      await cleanup.query("DELETE FROM mentoring.tracking_reports WHERE organization_id = $1 AND (participant_id = ANY($2::uuid[]) OR mentor_id = ANY($3::uuid[]) OR author_id = ANY($3::uuid[]))", [organizationId, participantIds, staffIds]);
      await cleanup.query("DELETE FROM mentoring.tracking_cards WHERE organization_id = $1 AND (participant_id = ANY($2::uuid[]) OR mentor_id = ANY($3::uuid[]) OR updated_by = ANY($3::uuid[]))", [organizationId, participantIds, staffIds]);
      await cleanup.query("DELETE FROM mentoring.reminder_attempts WHERE organization_id = $1 AND participant_id = ANY($2::uuid[])", [organizationId, participantIds]);
      await cleanup.query("DELETE FROM mentoring.reminder_jobs WHERE organization_id = $1 AND participant_id = ANY($2::uuid[])", [organizationId, participantIds]);
      for (const table of ["appointment_history", "manual_color_history", "contact_revisions", "review_events"]) {
        await cleanup.query(`DELETE FROM mentoring.${table} WHERE organization_id = $1 AND participant_id = ANY($2::uuid[])`, [organizationId, participantIds]);
      }
      for (const table of ["outbox", "audit", "conflicts"]) {
        await cleanup.query(`DELETE FROM mentoring.${table} WHERE organization_id = $1 AND (actor_id = ANY($2::uuid[]) OR participant_id = ANY($3::uuid[]))`, [organizationId, staffIds, participantIds]);
      }
      await cleanup.query("DELETE FROM mentoring.reviews WHERE organization_id = $1 AND (reviewed_by_staff_id = ANY($2::uuid[]) OR contact_id IN (SELECT id FROM mentoring.contacts WHERE organization_id = $1 AND participant_id = ANY($3::uuid[])))", [organizationId, staffIds, participantIds]);
      await cleanup.query("DELETE FROM mentoring.ceo_protections WHERE organization_id = $1 AND resource_id = ANY($2::uuid[])", [organizationId, [...participantIds, ...resourceIds]]);
      for (const table of ["grants", "appointments", "contacts", "assignments"]) {
        await cleanup.query(`DELETE FROM mentoring.${table} WHERE organization_id = $1 AND participant_id = ANY($2::uuid[])`, [organizationId, participantIds]);
      }
      await cleanup.query("DELETE FROM mentoring.participants WHERE organization_id = $1 AND id = ANY($2::uuid[])", [organizationId, participantIds]);
      await cleanup.query("DELETE FROM mentoring.resource_ids WHERE organization_id = $1 AND id = ANY($2::uuid[])", [organizationId, [...resourceIds]]);
      await cleanup.query("DELETE FROM mentoring.operations WHERE organization_id = $1 AND actor_id = ANY($2::uuid[])", [organizationId, staffIds]);
      await cleanup.query("DELETE FROM mentoring.memberships WHERE organization_id = $1 AND id = ANY($2::uuid[])", [organizationId, staffIds]);
      await cleanup.query("COMMIT");
    } catch (error) {
      await cleanup.query("ROLLBACK").catch(() => undefined);
      throw new Error(`Transfer fixture cleanup failed (${error?.message ?? error}). Remove only test run ${runId}.`);
    } finally {
      cleanup.release();
      await database.end();
      await getDatabasePool().end();
    }
  });

  const ceo = await addStaff("ceo", "מנכ״לית");
  const coordinatorA = await addStaff("coordinator", "רכזת א");
  const coordinatorB = await addStaff("coordinator", "רכזת ב");
  const coordinatorC = await addStaff("coordinator", "רכזת ג");
  const mentorA1 = await addStaff("mentor", "חונכת א1", coordinatorA.id);
  const mentorA2 = await addStaff("mentor", "חונכת א2", coordinatorA.id);
  const mentorB1 = await addStaff("mentor", "חונכת ב1", coordinatorB.id);
  const mentorC1 = await addStaff("mentor", "חונכת ג1", coordinatorC.id);
  const soloMentor = await addStaff("mentor", "חונכת עצמאית", null);

  await t.test("mentors and coordinators can both see and assign new unassigned mentees", async () => {
    const menteeForMentor = await createUnassigned(ceo, "חניכה לחונכת");
    const menteeForSolo = await createUnassigned(coordinatorA, "חניכה לחונכת עצמאית");
    const menteeForCoordinatorB = await createUnassigned(ceo, "חניכה לרכזת ב");

    // Both mentors and coordinators see active unassigned mentees with canAssignInitial: true
    const mentorWorkspace = await getWorkspace(mentorA1.authUserId, mentorA1.email);
    const mentorUnassignedView = mentorWorkspace.participants.find((v) => v.participant.id === menteeForMentor);
    assert.ok(mentorUnassignedView, "Mentor should see active unassigned mentee");
    assert.equal(mentorUnassignedView.canAssignInitial, true);
    assert.deepEqual(mentorUnassignedView.allowedActions, ["view"]);
    assert.equal(mentorWorkspace.trackingCards, undefined, "Mentors never see tracking cards");

    const coordBWorkspace = await getWorkspace(coordinatorB.authUserId, coordinatorB.email);
    const coordUnassignedView = coordBWorkspace.participants.find((v) => v.participant.id === menteeForCoordinatorB);
    assert.ok(coordUnassignedView, "Coordinator should see active unassigned mentee created by CEO");
    assert.equal(coordUnassignedView.canAssignInitial, true);

    // Mentor cannot assign an unassigned mentee to a different mentor
    denied(await run(mentorA1, {
      type: "assign_participant",
      operationId: randomUUID(),
      participantId: menteeForMentor,
      expectedVersion: 1,
      mentorId: mentorA2.id,
      coordinatorId: coordinatorA.id,
    }), "forbidden");

    // Mentor A1 assigns the unassigned mentee to herself (paired with Coordinator A)
    const assignOpId = randomUUID();
    const assignCmd = {
      type: "assign_participant",
      operationId: assignOpId,
      participantId: menteeForMentor,
      expectedVersion: 1,
      mentorId: mentorA1.id,
      coordinatorId: coordinatorA.id,
    };
    accepted(await run(mentorA1, assignCmd));
    // Exact replay is idempotent
    const replayed = await run(mentorA1, assignCmd);
    assert.equal(replayed.ok, true);
    assert.equal(replayed.replayed, true);

    const stateAfterMentorAssign = await participantState(menteeForMentor);
    assert.equal(stateAfterMentorAssign.assignment.mentor_id, mentorA1.id);
    assert.equal(stateAfterMentorAssign.assignment.coordinator_id, coordinatorA.id);
    assert.equal(stateAfterMentorAssign.assignment.version, 1);

    // Solo mentor assigns unassigned mentee created by Coordinator A to herself (coordinatorId: null)
    accepted(await run(soloMentor, {
      type: "assign_participant",
      operationId: randomUUID(),
      participantId: menteeForSolo,
      expectedVersion: 1,
      mentorId: soloMentor.id,
      coordinatorId: null,
    }));
    assert.equal((await participantState(menteeForSolo)).assignment.mentor_id, soloMentor.id);

    // Coordinator B cannot assign unassigned mentee to Mentor A1 (outside her team)
    denied(await run(coordinatorB, {
      type: "assign_participant",
      operationId: randomUUID(),
      participantId: menteeForCoordinatorB,
      expectedVersion: 1,
      mentorId: mentorA1.id,
      coordinatorId: coordinatorB.id,
    }), "forbidden");

    // Coordinator B assigns unassigned mentee to Mentor B1 in her own team
    accepted(await run(coordinatorB, {
      type: "assign_participant",
      operationId: randomUUID(),
      participantId: menteeForCoordinatorB,
      expectedVersion: 1,
      mentorId: mentorB1.id,
      coordinatorId: coordinatorB.id,
    }));
    const stateAfterCoordAssign = await participantState(menteeForCoordinatorB);
    assert.equal(stateAfterCoordAssign.assignment.mentor_id, mentorB1.id);
    assert.equal(stateAfterCoordAssign.assignment.coordinator_id, coordinatorB.id);
  });

  await t.test("already-assigned mentee (Dina) cannot be directly reassigned by mentors or coordinators; transfers require holding coordinator approval", async () => {
    const dinaId = await createUnassigned(coordinatorA, "דינה");
    accepted(await run(coordinatorA, {
      type: "assign_participant",
      operationId: randomUUID(),
      participantId: dinaId,
      expectedVersion: 1,
      mentorId: mentorA1.id,
      coordinatorId: coordinatorA.id,
    }));

    // Record a contact with a future appointment so we verify appointment + reminder transfer on approval
    const occurredAt = (await database.query("SELECT clock_timestamp() AS now")).rows[0].now.toISOString();
    accepted(await run(mentorA1, {
      type: "record_contact",
      operationId: randomUUID(),
      participantId: dinaId,
      expectedVersion: 2,
      expectedAppointmentVersion: null,
      method: "phone",
      outcome: "completed",
      occurredAt,
      notes: "שיחת היכרות עם דינה",
      nextAppointmentAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    }));

    const beforeTransfer = await participantState(dinaId);
    assert.equal(beforeTransfer.participant.version, 3);
    assert.equal(beforeTransfer.assignment.coordinator_id, coordinatorA.id);
    assert.equal(beforeTransfer.appointment.mentor_id, mentorA1.id);

    // Direct reassignment is strictly forbidden for mentors and coordinators (even the holding coordinator!)
    for (const nonCeo of [mentorA1, mentorA2, mentorB1, coordinatorA, coordinatorB]) {
      denied(await run(nonCeo, {
        type: "assign_participant",
        operationId: randomUUID(),
        participantId: dinaId,
        expectedVersion: beforeTransfer.participant.version,
        mentorId: nonCeo.role === "mentor" ? nonCeo.id : mentorA2.id,
        coordinatorId: nonCeo.role === "coordinator" ? nonCeo.id : coordinatorA.id,
      }), "forbidden");
    }

    // Coordinator B sees Dina in redacted transferableParticipants directory, NOT in full participants
    const snapBInitial = await getWorkspace(coordinatorB.authUserId, coordinatorB.email);
    assert.equal(snapBInitial.participants.some((v) => v.participant.id === dinaId), false);
    const dinaDirectoryItem = snapBInitial.transferableParticipants.find((item) => item.participantId === dinaId);
    assert.ok(dinaDirectoryItem, "Coordinator B sees Dina in transferable directory");
    assert.deepEqual(Object.keys(dinaDirectoryItem).sort(), [
      "assignmentProtected",
      "currentAssignmentId",
      "currentCoordinatorId",
      "displayName",
      "participantId",
      "serviceType",
    ]);
    assert.equal("phone" in dinaDirectoryItem, false);
    assert.equal("profileNotes" in dinaDirectoryItem, false);

    // Mentors cannot request transfers, Coordinator A cannot request Dina (already hers), Coordinator B cannot pick Mentor A1
    denied(await run(mentorB1, {
      type: "request_participant_transfer",
      operationId: randomUUID(),
      participantId: dinaId,
      targetMentorId: mentorB1.id,
    }), "forbidden");

    denied(await run(coordinatorA, {
      type: "request_participant_transfer",
      operationId: randomUUID(),
      participantId: dinaId,
      targetMentorId: mentorA2.id,
    }), "validation");

    denied(await run(coordinatorB, {
      type: "request_participant_transfer",
      operationId: randomUUID(),
      participantId: dinaId,
      targetMentorId: mentorA1.id,
    }), "forbidden");

    // Coordinator B requests Dina's transfer -> first test REJECTION leaving Dina untouched
    const rejectReqId = randomUUID();
    const req1 = accepted(await run(coordinatorB, {
      type: "request_participant_transfer",
      operationId: rejectReqId,
      participantId: dinaId,
      targetMentorId: mentorB1.id,
      note: "בקשה ראשונה להעברת דינה",
    }));
    assert.equal(req1.transferRequestId, rejectReqId);

    // Duplicate pending request by Coordinator B is rejected with conflict
    denied(await run(coordinatorB, {
      type: "request_participant_transfer",
      operationId: randomUUID(),
      participantId: dinaId,
      targetMentorId: mentorB1.id,
    }), "conflict");

    // Email notification row was queued for Coordinator A; dispatch it via mock sender
    const sentEmails = [];
    await dispatchTransferRequestEmails(async (job) => {
      sentEmails.push(job);
      return { status: "accepted", providerId: "re_mock_1" };
    }, rejectReqId);
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].recipientEmail, coordinatorA.email);
    assert.match(sentEmails[0].participantName, /דינה/);

    // While pending, Dina has NOT moved
    assert.equal((await participantState(dinaId)).assignment.coordinator_id, coordinatorA.id);
    const snapAPending = await getWorkspace(coordinatorA.authUserId, coordinatorA.email);
    const incomingPending = snapAPending.transferRequests.find((r) => r.id === rejectReqId);
    assert.equal(incomingPending.status, "pending");
    assert.equal(incomingPending.emailStatus, "accepted");

    // Requester Coordinator B and Mentor A1 CANNOT approve or reject
    denied(await run(coordinatorB, {
      type: "respond_participant_transfer",
      operationId: randomUUID(),
      transferRequestId: rejectReqId,
      decision: "approved",
    }), "forbidden");
    denied(await run(mentorA1, {
      type: "respond_participant_transfer",
      operationId: randomUUID(),
      transferRequestId: rejectReqId,
      decision: "rejected",
    }), "forbidden");

    // Coordinator A REJECTS the first request -> Dina stays with Coordinator A + Mentor A1, version unchanged!
    accepted(await run(coordinatorA, {
      type: "respond_participant_transfer",
      operationId: randomUUID(),
      transferRequestId: rejectReqId,
      decision: "rejected",
      note: "כרגע ממשיכה בליווי אצלנו",
    }));
    const afterReject = await participantState(dinaId);
    assert.equal(afterReject.participant.version, beforeTransfer.participant.version);
    assert.equal(afterReject.assignment.id, beforeTransfer.assignment.id);
    assert.equal(afterReject.assignment.coordinator_id, coordinatorA.id);
    assert.equal(afterReject.assignment.mentor_id, mentorA1.id);

    // Coordinator B sees rejected status on outgoing request, and can now submit a new request; Coordinator C also submits a competing request
    const snapBAfterReject = await getWorkspace(coordinatorB.authUserId, coordinatorB.email);
    assert.equal(snapBAfterReject.transferRequests.find((r) => r.id === rejectReqId)?.status, "rejected");

    const approveReqId = randomUUID();
    accepted(await run(coordinatorB, {
      type: "request_participant_transfer",
      operationId: approveReqId,
      participantId: dinaId,
      targetMentorId: mentorB1.id,
      note: "בקשה מתואמת להעברת דינה",
    }));

    const competingReqId = randomUUID();
    accepted(await run(coordinatorC, {
      type: "request_participant_transfer",
      operationId: competingReqId,
      participantId: dinaId,
      targetMentorId: mentorC1.id,
    }));

    // Coordinator A APPROVES Coordinator B's request -> Dina atomically moves to Coordinator B + Mentor B1, and competing request is auto-rejected!
    accepted(await run(coordinatorA, {
      type: "respond_participant_transfer",
      operationId: randomUUID(),
      transferRequestId: approveReqId,
      decision: "approved",
      note: "מאושרת להעברה לצוות שלך",
    }));

    const afterApprove = await participantState(dinaId);
    assert.equal(afterApprove.participant.version, beforeTransfer.participant.version + 1);
    assert.equal(afterApprove.assignment.coordinator_id, coordinatorB.id);
    assert.equal(afterApprove.assignment.mentor_id, mentorB1.id);
    assert.equal(afterApprove.assignment.version, 2);
    assert.equal(afterApprove.appointment.mentor_id, mentorB1.id, "Current appointment mentor moves to new mentor");

    // Coordinator B and Mentor B1 now see Dina's full card with edit permission; Coordinator A no longer holds Dina's card
    const snapBAfterApprove = await getWorkspace(coordinatorB.authUserId, coordinatorB.email);
    const dinaViewB = snapBAfterApprove.participants.find((v) => v.participant.id === dinaId);
    assert.ok(dinaViewB, "Coordinator B now holds Dina's participant card");
    assert.equal(dinaViewB.allowedActions.includes("edit"), true);

    const snapMentorB1 = await getWorkspace(mentorB1.authUserId, mentorB1.email);
    assert.equal(snapMentorB1.participants.some((v) => v.participant.id === dinaId), true);

    const snapAAfterApprove = await getWorkspace(coordinatorA.authUserId, coordinatorA.email);
    assert.equal(snapAAfterApprove.participants.some((v) => v.participant.id === dinaId), false);
    assert.equal(snapAAfterApprove.transferRequests.find((r) => r.id === approveReqId)?.status, "approved");

    // Competing request from Coordinator C was automatically closed as rejected
    const snapCAfterApprove = await getWorkspace(coordinatorC.authUserId, coordinatorC.email);
    assert.equal(snapCAfterApprove.transferRequests.find((r) => r.id === competingReqId)?.status, "rejected");

    // Responding again to an already-approved request fails with conflict
    denied(await run(coordinatorA, {
      type: "respond_participant_transfer",
      operationId: randomUUID(),
      transferRequestId: approveReqId,
      decision: "rejected",
    }), "conflict");
  });

  await t.test("CEO direct reassignment override works immediately, auto-closes pending transfers, enforces CEO protections, and purges cleanly", async () => {
    const noaId = await createUnassigned(ceo, "נועה");
    accepted(await run(ceo, {
      type: "assign_participant",
      operationId: randomUUID(),
      participantId: noaId,
      expectedVersion: 1,
      mentorId: mentorA1.id,
      coordinatorId: coordinatorA.id,
    }));

    // Coordinator B submits a pending transfer request for Noa
    const pendingReqId = randomUUID();
    accepted(await run(coordinatorB, {
      type: "request_participant_transfer",
      operationId: pendingReqId,
      participantId: noaId,
      targetMentorId: mentorB1.id,
    }));

    // CEO directly reassigns Noa to Coordinator C + Mentor C1 as an override
    accepted(await run(ceo, {
      type: "assign_participant",
      operationId: randomUUID(),
      participantId: noaId,
      expectedVersion: 2,
      mentorId: mentorC1.id,
      coordinatorId: coordinatorC.id,
    }));

    const afterCeoOverride = await participantState(noaId);
    assert.equal(afterCeoOverride.assignment.coordinator_id, coordinatorC.id);
    assert.equal(afterCeoOverride.assignment.mentor_id, mentorC1.id);

    // Pending transfer request was automatically closed as rejected and its queued email cancelled
    const closedRow = (await database.query(
      "SELECT tr.status, email.status AS email_status FROM mentoring.transfer_requests tr LEFT JOIN mentoring.transfer_request_emails email ON email.organization_id = tr.organization_id AND email.transfer_request_id = tr.id WHERE tr.organization_id = $1 AND tr.id = $2",
      [organizationId, pendingReqId],
    )).rows[0];
    assert.equal(closedRow.status, "rejected");
    assert.equal(closedRow.email_status, "cancelled");

    // CEO applies assignment protection on Noa -> coordinators cannot request transfer
    accepted(await run(ceo, {
      type: "set_ceo_protection",
      operationId: randomUUID(),
      participantId: noaId,
      resourceId: noaId,
      expectedVersion: afterCeoOverride.participant.version,
      expectedProtectionVersion: null,
      active: true,
      fieldPaths: ["assignment"],
      reason: "נעילת שיוך",
    }));

    denied(await run(coordinatorA, {
      type: "request_participant_transfer",
      operationId: randomUUID(),
      participantId: noaId,
      targetMentorId: mentorA1.id,
    }), "ceo_protected");

    // CEO soft-deletes and permanently deletes Noa -> transfer_requests and transfer_request_emails are purged
    const currentNoa = await participantState(noaId);
    accepted(await run(ceo, {
      type: "delete_participant",
      operationId: randomUUID(),
      participantId: noaId,
      expectedVersion: currentNoa.participant.version,
      reason: "בדיקת מחיקה",
    }));
    const deletedNoa = await participantState(noaId);
    accepted(await run(ceo, {
      type: "permanently_delete_participant",
      operationId: randomUUID(),
      participantId: noaId,
      expectedVersion: deletedNoa.participant.version,
      reason: "ניקוי לצמיתות",
      confirmationName: "נועה",
    }));

    const remainingTransfers = (await database.query(
      "SELECT count(*)::int AS count FROM mentoring.transfer_requests WHERE organization_id = $1 AND participant_id = $2",
      [organizationId, noaId],
    )).rows[0].count;
    const remainingEmails = (await database.query(
      "SELECT count(*)::int AS count FROM mentoring.transfer_request_emails WHERE organization_id = $1 AND transfer_request_id = $2",
      [organizationId, pendingReqId],
    )).rows[0].count;
    assert.equal(remainingTransfers, 0);
    assert.equal(remainingEmails, 0);
  });
});
