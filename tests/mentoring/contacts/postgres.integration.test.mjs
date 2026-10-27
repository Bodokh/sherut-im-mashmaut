import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import test from "node:test";
import { Pool } from "pg";
import "../server/typescript-loader.mjs";

const enabled = process.env.MENTORING_INTEGRATION_TESTS === "1";
const organizationId = "11111111-1111-4111-8111-111111111111";

test("contact lifecycle uses real PostgreSQL transactions and revision-specific review", { skip: !enabled, timeout: 180_000 }, async (t) => {
  assert.notEqual(process.env.NODE_ENV, "production");
  assert.ok(process.execArgv.includes("--conditions=react-server"), "Use --conditions=react-server.");
  const envFile = new URL("../../../.env.local", import.meta.url);
  if (!process.env.MENTORING_DATABASE_URL && existsSync(envFile)) loadEnvFile(envFile);
  assert.ok(process.env.MENTORING_DATABASE_URL, "An existing migrated development database is required.");
  const { executeCommand } = await import("../../../lib/mentoring/server/commands.ts");
  const { loadParticipant, requireIdentity } = await import("../../../lib/mentoring/server/repository.ts");
  const { handleContactCommand, loadContactHistory } = await import("../../../lib/mentoring/features/contacts/server.ts");
  const { computeFollowup, isRevisionApproved } = await import("../../../lib/mentoring/domain/index.ts");
  const { getDatabasePool, withTransaction } = await import("../../../lib/mentoring/server/db.ts");
  const database = new Pool({ connectionString: process.env.MENTORING_DATABASE_URL_UNPOOLED ?? process.env.MENTORING_DATABASE_URL, max: 2, connectionTimeoutMillis: 10_000 });
  const people = [];
  const participants = [];
  const resources = [];
  const runId = randomUUID();

  t.after(async () => {
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      for (const table of ["outbox", "audit", "conflicts"]) await client.query(`DELETE FROM mentoring.${table} WHERE organization_id = $1 AND participant_id = ANY($2::uuid[])`, [organizationId, participants]);
      // New reminder tables may be present when the full system is integrated.
      for (const table of ["reminder_attempts", "reminder_jobs", "reminder_obligations"]) {
        const found = await client.query("SELECT to_regclass($1) AS name", [`mentoring.${table}`]);
        if (found.rows[0].name) {
          const columns = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='mentoring' AND table_name=$1", [table]);
          if (columns.rows.some((row) => row.column_name === "participant_id")) await client.query(`DELETE FROM mentoring.${table} WHERE organization_id = $1 AND participant_id = ANY($2::uuid[])`, [organizationId, participants]);
        }
      }
      await client.query("DELETE FROM mentoring.reviews WHERE organization_id = $1 AND contact_id = ANY($2::uuid[])", [organizationId, resources]);
      await client.query("DELETE FROM mentoring.ceo_protections WHERE organization_id = $1 AND resource_id = ANY($2::uuid[])", [organizationId, resources]);
      for (const table of ["grants", "appointments", "contacts", "assignments"]) await client.query(`DELETE FROM mentoring.${table} WHERE organization_id = $1 AND participant_id = ANY($2::uuid[])`, [organizationId, participants]);
      await client.query("DELETE FROM mentoring.participants WHERE organization_id = $1 AND id = ANY($2::uuid[])", [organizationId, participants]);
      await client.query("DELETE FROM mentoring.resource_ids WHERE organization_id = $1 AND id = ANY($2::uuid[])", [organizationId, resources]);
      await client.query("DELETE FROM mentoring.operations WHERE organization_id = $1 AND actor_id = ANY($2::uuid[])", [organizationId, people.map((person) => person.id)]);
      await client.query("DELETE FROM mentoring.memberships WHERE organization_id = $1 AND id = ANY($2::uuid[])", [organizationId, people.map((person) => person.id)]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(`Contact test cleanup failed for fixture run ${runId}.`, { cause: error });
    } finally {
      client.release();
      await database.end();
      await getDatabasePool().end();
    }
  });
  const migration = await database.query("SELECT to_regclass('mentoring.contact_revisions') AS revisions,to_regclass('mentoring.reminder_jobs') AS reminders");
  assert.ok(migration.rows[0].revisions && migration.rows[0].reminders, "Apply all mentoring migrations before this suite.");
  async function member(role, coordinatorId = null) {
    const result = { id: randomUUID(), authUserId: `contact_test_${randomUUID()}`, email: `${randomUUID()}@contacts.invalid` };
    people.push(result);
    await database.query("INSERT INTO mentoring.memberships (id,organization_id,auth_user_id,email,display_name,role,coordinator_id) VALUES ($1,$2,$3,$4,$5,$6,$7)", [result.id, organizationId, result.authUserId, result.email, `Contact tests ${runId}`, role, coordinatorId]);
    return result;
  }
  const coordinator = await member("coordinator");
  const mentor = await member("mentor", coordinator.id);
  const otherMentor = await member("mentor", coordinator.id);
  const ceo = await member("ceo");
  const run = (actor, command) => executeCommand(actor.authUserId, actor.email, command);
  const accept = (result) => { assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.error)); return result; };
  const reject = (result, code) => { assert.equal(result.ok, false); assert.equal(result.error.code, code); return result.error; };
  async function state(id) {
    const client = await database.connect();
    try {
      const view = await loadParticipant(client, organizationId, id);
      const history = (await loadContactHistory(client, organizationId, [id])).get(id);
      assert.ok(view && history);
      return { view, history };
    } finally { client.release(); }
  }
  async function fixture({ oldContact = false, appointment = true } = {}) {
    const participantId = randomUUID();
    const contactId = randomUUID();
    const appointmentId = randomUUID();
    participants.push(participantId);
    resources.push(participantId, contactId);
    const occurredAt = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const scheduledAt = new Date(Date.now() + 2 * 86_400_000).toISOString();
    await database.query("INSERT INTO mentoring.resource_ids (id,organization_id,kind) VALUES ($1,$3,'participant'),($2,$3,'contact')", [participantId, contactId, organizationId]);
    await database.query("INSERT INTO mentoring.participants (id,organization_id,display_name,created_by) VALUES ($1,$2,$3,$4)", [participantId, organizationId, `Contact fixture ${runId}`, coordinator.id]);
    await database.query("INSERT INTO mentoring.assignments (id,organization_id,participant_id,mentor_id,coordinator_id,assigned_at,followup_anchor_at) VALUES ($1,$2,$3,$4,$5,$6,$6)", [randomUUID(), organizationId, participantId, mentor.id, coordinator.id, new Date(Date.now() - 20 * 86_400_000).toISOString()]);
    await database.query("INSERT INTO mentoring.contacts (id,organization_id,participant_id,actor_id,method,outcome,occurred_at,received_at,notes) VALUES ($1,$2,$3,$4,'phone','completed',$5,$6,'original notes')", [contactId, organizationId, participantId, mentor.id, occurredAt, new Date(Date.now() - 8 * 86_400_000).toISOString()]);
    if (oldContact) {
      const earlier = randomUUID();
      resources.push(earlier);
      await database.query("INSERT INTO mentoring.resource_ids (id,organization_id,kind) VALUES ($1,$2,'contact')", [earlier, organizationId]);
      await database.query("INSERT INTO mentoring.contacts (id,organization_id,participant_id,actor_id,method,outcome,occurred_at,notes) VALUES ($1,$2,$3,$4,'in_person','completed',$5,'older notes')", [earlier, organizationId, participantId, mentor.id, new Date(Date.now() - 15 * 86_400_000).toISOString()]);
    }
    if (appointment) await database.query("INSERT INTO mentoring.appointments (id,organization_id,participant_id,mentor_id,scheduled_at,source_contact_id) VALUES ($1,$2,$3,$4,$5,$6)", [appointmentId, organizationId, participantId, mentor.id, scheduledAt, contactId]);
    return { participantId, contactId, occurredAt, scheduledAt };
  }
  async function revisionCommand(fixture, overrides = {}) {
    const { view } = await state(fixture.participantId);
    const entry = view.contacts.find((contact) => contact.id === (overrides.contactId ?? fixture.contactId));
    return { type: "revise_contact", operationId: randomUUID(), participantId: fixture.participantId, expectedVersion: view.participant.version, contactId: entry.id, expectedRevision: entry.revision, expectedAppointmentVersion: view.nextAppointment?.version ?? null, method: entry.method, outcome: entry.outcome, occurredAt: entry.occurredAt, notes: "corrected notes", reason: "Correct inaccurate report", ...overrides };
  }

  async function makeInactive(data, lifecycle) {
    let current = await state(data.participantId);
    accept(await run(ceo, { type: "set_participant_lifecycle", operationId: randomUUID(), participantId: data.participantId, expectedVersion: current.view.participant.version, lifecycle, reason: "Historical maintenance fixture" }));
    // Explicitly retain lifecycle-only protection so the report's original
    // author can exercise maintenance without overriding any CEO field.
    current = await state(data.participantId);
    const protection = (await database.query("SELECT version FROM mentoring.ceo_protections WHERE organization_id=$1 AND resource_id=$2", [organizationId, data.participantId])).rows[0];
    accept(await run(ceo, { type: "set_ceo_protection", operationId: randomUUID(), participantId: data.participantId, expectedVersion: current.view.participant.version, resourceId: data.participantId, expectedProtectionVersion: protection.version, active: true, fieldPaths: ["lifecycle"], reason: "Allow historical report maintenance while keeping lifecycle protected" }));
  }

  await t.test("a correction leaves approval on original content and preserves original author and receipt", async () => {
    const data = await fixture();
    accept(await run(coordinator, { type: "review_contact", operationId: randomUUID(), participantId: data.participantId, contactId: data.contactId, revision: 1, decision: "approved" }));
    const before = await state(data.participantId);
    const command = await revisionCommand(data);
    accept(await run(mentor, command));
    const after = await state(data.participantId);
    assert.equal(after.view.contacts[0].revision, 2);
    assert.equal(after.view.contacts[0].actorId, mentor.id);
    assert.equal(after.view.contacts[0].receivedAt, before.view.contacts[0].receivedAt);
    assert.equal(after.view.nextAppointment.version, before.view.nextAppointment.version);
    assert.equal(after.history.contactRevisions.length, 2);
    const original = after.history.contactRevisions.find((entry) => entry.revision === 1);
    const corrected = after.history.contactRevisions.find((entry) => entry.revision === 2);
    assert.equal(original.notes, "original notes");
    assert.equal(original.review.decision, "approved");
    assert.equal(corrected.notes, "corrected notes");
    assert.equal(corrected.review, null);
    assert.equal(corrected.revisedByStaffId, mentor.id);
    assert.equal(corrected.reason, command.reason);
    assert.equal(isRevisionApproved(after.view.contacts[0], after.view.reviews[0]), false);
    assert.equal(after.history.reviewEvents.length, 1);
    assert.equal(after.history.reviewEvents[0].revision, 1);
    accept(await run(mentor, command));
    assert.equal((await state(data.participantId)).history.contactRevisions.length, 2, "A lost-response retry creates no duplicate revision.");
    const rows = await database.query("SELECT (SELECT count(*)::int FROM mentoring.audit WHERE operation_id=$1) AS audits,(SELECT count(*)::int FROM mentoring.operations WHERE operation_id=$1) AS receipts", [command.operationId]);
    assert.deepEqual(rows.rows[0], { audits: 1, receipts: 1 });
  });

  await t.test("review decisions remain attributable events when a later review changes the projection", async () => {
    const data = await fixture();
    for (const decision of ["approved", "returned_for_correction", "approved"]) accept(await run(coordinator, { type: "review_contact", operationId: randomUUID(), participantId: data.participantId, contactId: data.contactId, revision: 1, decision }));
    const after = await state(data.participantId);
    assert.equal(after.view.reviews[0].decision, "approved");
    assert.equal(after.history.reviewEvents.length, 3);
    assert.equal(after.history.reviewEvents.filter((event) => event.decision === "approved").length, 2);
    assert.equal(after.history.reviewEvents.filter((event) => event.decision === "returned_for_correction").length, 1);
    assert.ok(after.history.reviewEvents.every((event) => event.reviewedByStaffId === coordinator.id && event.revision === 1 && event.operationId));
  });

  await t.test("a downstream reminder-refresh failure rolls back revision, appointment, participant and history", async () => {
    const data = await fixture();
    const before = await state(data.participantId);
    const command = await revisionCommand(data, { occurredAt: new Date(Date.parse(data.occurredAt) + 60_000).toISOString(), nextAppointmentAt: new Date(Date.now() + 86_400_000).toISOString() });
    await assert.rejects(withTransaction(async (client) => {
      const actor = await requireIdentity(client, mentor.authUserId, mentor.email);
      const view = await loadParticipant(client, organizationId, data.participantId, true);
      const now = (await client.query("SELECT clock_timestamp() AS now")).rows[0].now.toISOString();
      return handleContactCommand({
        client, actor, view, now,
        failure: (code, message, field) => ({ ok: false, error: { code, message, field } }),
        success: (operation, participantId) => ({ ok: true, operationId: operation.operationId, participantId, replayed: false, acceptance: "accepted" }),
        preserveConflict: async () => { throw new Error("Unexpected protected fixture."); },
        protect: async () => undefined,
        audit: async () => { throw new Error("Reminder refresh must precede audit in this fixture."); },
        refreshReminders: async () => { throw new Error("Injected reminder persistence failure."); },
      }, command);
    }), /Injected reminder persistence failure/);
    const after = await state(data.participantId);
    assert.equal(after.view.participant.version, before.view.participant.version);
    assert.deepEqual(after.view.contacts, before.view.contacts);
    assert.deepEqual(after.view.nextAppointment, before.view.nextAppointment);
    assert.deepEqual(after.history, before.history);
  });

  await t.test("latest time correction requires an explicit schedule and historical correction cannot rewind it", async () => {
    const data = await fixture({ oldContact: true });
    const correctedAt = new Date(Date.parse(data.occurredAt) + 60_000).toISOString();
    const missing = await revisionCommand(data, { occurredAt: correctedAt });
    reject(await run(mentor, missing), "validation");
    const scheduledAt = new Date(Date.now() + 86_400_000).toISOString();
    accept(await run(mentor, { ...missing, operationId: randomUUID(), nextAppointmentAt: scheduledAt }));
    const after = await state(data.participantId);
    assert.equal(after.view.nextAppointment.scheduledAt, scheduledAt);
    assert.equal(after.view.nextAppointment.version, 2);
    const older = after.view.contacts.find((entry) => entry.id !== data.contactId);
    accept(await run(mentor, await revisionCommand(data, { contactId: older.id, notes: "Historical correction" })));
    const historical = await state(data.participantId);
    assert.equal(historical.view.nextAppointment.scheduledAt, scheduledAt);
    assert.equal(historical.view.nextAppointment.version, 2);
    assert.equal(historical.history.appointmentHistory.length, 2);
  });

  await t.test("management invalidation recomputes cadence and retains the schedule with a persistent warning", async () => {
    const data = await fixture({ oldContact: true });
    accept(await run(mentor, { type: "set_manual_color", operationId: randomUUID(), participantId: data.participantId, expectedVersion: 1, color: "orange" }));
    const { view } = await state(data.participantId);
    const priorJobs = await database.query("SELECT id FROM mentoring.reminder_jobs WHERE organization_id=$1 AND participant_id=$2 AND state IN ('pending','blocked')", [organizationId, data.participantId]);
    assert.ok(priorJobs.rowCount > 0, "A current reminder generation must exist before invalidation.");
    const invalidate = { type: "invalidate_contact", operationId: randomUUID(), participantId: data.participantId, expectedVersion: view.participant.version, contactId: data.contactId, expectedRevision: 1, expectedAppointmentVersion: view.nextAppointment.version, reason: "Duplicate or incorrect contact" };
    reject(await run(mentor, invalidate), "forbidden");
    const acceptedInvalidation = { ...invalidate, operationId: randomUUID() };
    accept(await run(coordinator, acceptedInvalidation));
    const after = await state(data.participantId);
    const invalidated = after.view.contacts.find((entry) => entry.id === data.contactId);
    assert.ok(invalidated.invalidatedAt);
    assert.equal(invalidated.revision, 2);
    assert.equal(after.view.nextAppointment.scheduledAt, data.scheduledAt);
    assert.deepEqual(after.history.contactWarnings, ["appointment_requires_review"]);
    const followup = computeFollowup({ organizationId, participantId: data.participantId, assignedAt: after.view.assignment.assignedAt, contacts: after.view.contacts, nextAppointment: after.view.nextAppointment }, new Date().toISOString());
    assert.equal(followup.lastCompletedContactAt, after.view.contacts.find((entry) => entry.id !== data.contactId).occurredAt);
    assert.equal(after.history.contactRevisions.find((entry) => entry.revision === 2).changeKind, "invalidation");
    const staleJobs = await database.query("SELECT state,reason FROM mentoring.reminder_jobs WHERE organization_id=$1 AND id=ANY($2::uuid[])", [organizationId, priorJobs.rows.map((job) => job.id)]);
    assert.ok(staleJobs.rows.every((job) => job.state === "cancelled" && job.reason === "superseded"), "Invalidation must supersede stale reminder generations in the accepting commit.");
    const replacementJobs = await database.query("SELECT last_evaluated_operation_id FROM mentoring.reminder_jobs WHERE organization_id=$1 AND participant_id=$2 AND state IN ('pending','blocked')", [organizationId, data.participantId]);
    assert.ok(replacementJobs.rowCount > 0);
    assert.ok(replacementJobs.rows.every((job) => job.last_evaluated_operation_id === acceptedInvalidation.operationId));
  });

  await t.test("rescheduling and manual color never fabricate contact or clear an overdue actual-contact deadline", async () => {
    const data = await fixture();
    const before = await state(data.participantId);
    const future = new Date(Date.now() + 86_400_000).toISOString();
    accept(await run(mentor, { type: "reschedule_appointment", operationId: randomUUID(), participantId: data.participantId, expectedVersion: before.view.participant.version, expectedAppointmentVersion: before.view.nextAppointment.version, scheduledAt: future, reason: "Mentor unavailable" }));
    let after = await state(data.participantId);
    accept(await run(mentor, { type: "set_manual_color", operationId: randomUUID(), participantId: data.participantId, expectedVersion: after.view.participant.version, color: "green", reason: "Manual follow-up report" }));
    after = await state(data.participantId);
    assert.equal(after.view.contacts.length, 1);
    assert.equal(after.view.contacts[0].occurredAt, data.occurredAt);
    assert.equal(after.history.manualColorHistory[0].setByStaffId, mentor.id);
    assert.equal(after.view.manualColor, "green");
    assert.equal(after.view.participant.version, before.view.participant.version + 2);
    assert.equal(computeFollowup({ organizationId, participantId: data.participantId, assignedAt: after.view.assignment.assignedAt, contacts: after.view.contacts, nextAppointment: after.view.nextAppointment }, new Date().toISOString()).status, "seven_day_overdue");
  });

  await t.test("current scope, author ownership and all revision tokens are enforced", async () => {
    const data = await fixture();
    const command = await revisionCommand(data);
    reject(await run(otherMentor, command), "forbidden");
    await database.query("INSERT INTO mentoring.grants (id,organization_id,staff_id,participant_id,actions) VALUES ($1,$2,$3,$4,ARRAY['view','edit']::text[])", [randomUUID(), organizationId, otherMentor.id, data.participantId]);
    reject(await run(otherMentor, { ...command, operationId: randomUUID() }), "forbidden");
    reject(await run(mentor, { ...command, operationId: randomUUID(), expectedRevision: 2 }), "conflict");
    reject(await run(mentor, { ...command, operationId: randomUUID(), expectedAppointmentVersion: null }), "conflict");
    reject(await run(mentor, { ...command, operationId: randomUUID(), expectedVersion: 2 }), "conflict");
    const after = await state(data.participantId);
    assert.equal(after.view.contacts[0].revision, 1);
    assert.equal(after.history.contactRevisions.length, 0);
  });

  await t.test("CEO contact and manual-color changes remain protected with one preserved retry conflict", async () => {
    const data = await fixture();
    accept(await run(ceo, await revisionCommand(data, { notes: "CEO authoritative correction" })));
    const protectedCommand = await revisionCommand(data, { notes: "Queued mentor correction" });
    const first = reject(await run(mentor, protectedCommand), "ceo_protected");
    assert.ok(first.conflictId);
    assert.equal(reject(await run(mentor, protectedCommand), "ceo_protected").conflictId, first.conflictId);
    const beforeColor = await state(data.participantId);
    accept(await run(ceo, { type: "set_manual_color", operationId: randomUUID(), participantId: data.participantId, expectedVersion: beforeColor.view.participant.version, color: "red" }));
    const afterColor = await state(data.participantId);
    reject(await run(mentor, { type: "set_manual_color", operationId: randomUUID(), participantId: data.participantId, expectedVersion: afterColor.view.participant.version, color: "green" }), "ceo_protected");
    assert.equal((await state(data.participantId)).view.manualColor, "red");
  });

  await t.test("a CEO color change renews an explicitly unlocked protection without reviving unrelated fields", async () => {
    const data = await fixture();
    accept(await run(ceo, { type: "set_ceo_protection", operationId: randomUUID(), participantId: data.participantId, expectedVersion: 1, resourceId: data.participantId, expectedProtectionVersion: null, active: true, fieldPaths: ["profileNotes"], reason: "Protect profile notes" }));
    let current = await state(data.participantId);
    const before = (await database.query("SELECT version FROM mentoring.ceo_protections WHERE organization_id=$1 AND resource_id=$2", [organizationId, data.participantId])).rows[0];
    accept(await run(ceo, { type: "set_ceo_protection", operationId: randomUUID(), participantId: data.participantId, expectedVersion: current.view.participant.version, resourceId: data.participantId, expectedProtectionVersion: before.version, active: false, fieldPaths: null, reason: "Explicitly unlock previous profile protection" }));
    current = await state(data.participantId);
    const unlocked = (await database.query("SELECT version FROM mentoring.ceo_protections WHERE organization_id=$1 AND resource_id=$2", [organizationId, data.participantId])).rows[0];
    accept(await run(ceo, { type: "set_manual_color", operationId: randomUUID(), participantId: data.participantId, expectedVersion: current.view.participant.version, color: "orange" }));
    const protection = (await database.query("SELECT active,field_paths,version,reason,unlocked_by_staff_id,unlocked_at FROM mentoring.ceo_protections WHERE organization_id=$1 AND resource_id=$2", [organizationId, data.participantId])).rows[0];
    assert.equal(protection.active, true);
    assert.deepEqual(protection.field_paths, ["manualColor"]);
    assert.equal(protection.version, unlocked.version + 1);
    assert.equal(protection.unlocked_by_staff_id, null);
    assert.equal(protection.unlocked_at, null);
    assert.equal(protection.reason, null, "The previous unlock reason must not describe the renewed protection.");
  });

  await t.test("a selected appointment protection blocks a completed contact with fresh tokens and preserves one retry conflict", async () => {
    const data = await fixture();
    accept(await run(ceo, { type: "set_ceo_protection", operationId: randomUUID(), participantId: data.participantId, expectedVersion: 1, resourceId: data.participantId, expectedProtectionVersion: null, active: true, fieldPaths: ["appointment"], reason: "Keep selected appointment authoritative" }));
    const before = await state(data.participantId);
    const command = { type: "record_contact", operationId: randomUUID(), participantId: data.participantId, expectedVersion: before.view.participant.version, expectedAppointmentVersion: before.view.nextAppointment.version, method: "phone", outcome: "completed", occurredAt: new Date().toISOString(), notes: "Completed contact must not bypass selected appointment protection", nextAppointmentAt: new Date(Date.now() + 86_400_000).toISOString() };
    resources.push(command.operationId);
    const first = reject(await run(mentor, command), "ceo_protected");
    assert.ok(first.conflictId);
    assert.equal(reject(await run(mentor, command), "ceo_protected").conflictId, first.conflictId);
    const after = await state(data.participantId);
    assert.equal(after.view.participant.version, before.view.participant.version);
    assert.deepEqual(after.view.contacts, before.view.contacts);
    assert.deepEqual(after.view.nextAppointment, before.view.nextAppointment);
    const persisted = await database.query("SELECT (SELECT count(*)::int FROM mentoring.contacts WHERE id=$1) AS contacts,(SELECT count(*)::int FROM mentoring.resource_ids WHERE id=$1) AS resources,(SELECT count(*)::int FROM mentoring.conflicts WHERE organization_id=$2 AND actor_id=$3 AND operation_id=$1) AS conflicts", [command.operationId, organizationId, mentor.id]);
    assert.deepEqual(persisted.rows[0], { contacts: 0, resources: 0, conflicts: 1 });
    reject(await run(mentor, { type: "reschedule_appointment", operationId: randomUUID(), participantId: data.participantId, expectedVersion: after.view.participant.version, expectedAppointmentVersion: after.view.nextAppointment.version, scheduledAt: new Date(Date.now() + 3 * 86_400_000).toISOString(), reason: "Attempt to replace the explicitly protected appointment" }), "ceo_protected");
    assert.deepEqual((await state(data.participantId)).view.nextAppointment, before.view.nextAppointment);
  });

  await t.test("a CEO completed contact remains protected while a later mentor contact advances the next cycle", async () => {
    const data = await fixture();
    accept(await run(ceo, { type: "set_manual_color", operationId: randomUUID(), participantId: data.participantId, expectedVersion: 1, color: "red" }));
    let current = await state(data.participantId);
    const contact = { type: "record_contact", operationId: randomUUID(), participantId: data.participantId, expectedVersion: current.view.participant.version, expectedAppointmentVersion: current.view.nextAppointment.version, method: "in_person", outcome: "completed", occurredAt: new Date().toISOString(), notes: "CEO accepted contact and appointment", nextAppointmentAt: new Date(Date.now() + 86_400_000).toISOString() };
    resources.push(contact.operationId);
    accept(await run(ceo, contact));
    current = await state(data.participantId);
    const protection = (await database.query("SELECT field_paths FROM mentoring.ceo_protections WHERE organization_id=$1 AND resource_id=$2 AND active", [organizationId, data.participantId])).rows[0];
    assert.deepEqual(protection.field_paths, ["manualColor"], "Recording a new cycle must not add a standalone appointment lock.");
    assert.equal(current.view.nextAppointment.sourceContactId, contact.operationId);
    const ceoEntry = current.view.contacts.find((entry) => entry.id === contact.operationId);
    const ceoAppointment = current.view.nextAppointment;
    const contactProtection = (await database.query("SELECT active,field_paths FROM mentoring.ceo_protections WHERE organization_id=$1 AND resource_id=$2", [organizationId, contact.operationId])).rows[0];
    assert.equal(contactProtection.active, true);
    assert.equal(contactProtection.field_paths, null, "The accepted CEO contact itself remains whole-record protected.");
    reject(await run(coordinator, await revisionCommand(data, { contactId: contact.operationId, notes: "Attempt to alter the CEO's accepted contact" })), "ceo_protected");
    const mentorContact = { type: "record_contact", operationId: randomUUID(), participantId: data.participantId, expectedVersion: current.view.participant.version, expectedAppointmentVersion: current.view.nextAppointment.version, method: "phone", outcome: "completed", occurredAt: new Date().toISOString(), notes: "Next successful mentoring cycle", nextAppointmentAt: new Date(Date.now() + 2 * 86_400_000).toISOString() };
    resources.push(mentorContact.operationId);
    accept(await run(mentor, mentorContact));
    const after = await state(data.participantId);
    assert.deepEqual(after.view.contacts.find((entry) => entry.id === contact.operationId), ceoEntry);
    assert.equal(after.view.nextAppointment.sourceContactId, mentorContact.operationId);
    assert.equal(after.view.nextAppointment.scheduledAt, mentorContact.nextAppointmentAt);
    assert.equal(after.view.nextAppointment.version, ceoAppointment.version + 1);
    assert.equal(after.view.participant.version, current.view.participant.version + 1);
    assert.equal(after.view.manualColor, "red");
    assert.equal(after.view.manualColorAt, current.view.manualColorAt, "A later contact must not change the CEO's manual report.");
    const retainedAppointment = after.history.appointmentHistory.find((entry) => entry.appointmentVersion === ceoAppointment.version);
    assert.equal(retainedAppointment.sourceContactId, contact.operationId);
    assert.equal(retainedAppointment.scheduledAt, contact.nextAppointmentAt, "The CEO's original next date remains in immutable appointment history.");
  });

  for (const lifecycle of ["paused", "closed"]) {
    await t.test(`${lifecycle} reports allow authorized historical time/outcome correction while preserving the selected appointment`, async () => {
      const data = await fixture({ oldContact: true });
      await makeInactive(data, lifecycle);
      const before = await state(data.participantId);
      const correctedAt = new Date(Date.parse(data.occurredAt) + 60_000).toISOString();
      const command = await revisionCommand(data, { occurredAt: correctedAt });
      reject(await run(mentor, { ...command, operationId: randomUUID(), nextAppointmentAt: new Date(Date.now() + 86_400_000).toISOString() }), "validation");
      accept(await run(mentor, command));
      let after = await state(data.participantId);
      assert.equal(after.view.participant.lifecycle, lifecycle);
      assert.equal(after.view.nextAppointment.id, before.view.nextAppointment.id);
      assert.equal(after.view.nextAppointment.scheduledAt, before.view.nextAppointment.scheduledAt);
      assert.equal(after.view.contacts.find((entry) => entry.id === data.contactId).occurredAt, correctedAt);
      assert.deepEqual(after.history.contactWarnings, ["appointment_requires_review"]);
      const scheduledVersion = after.view.nextAppointment.version;
      accept(await run(mentor, await revisionCommand(data, { notes: "Historical narrative clarification" })));
      after = await state(data.participantId);
      assert.equal(after.view.nextAppointment.version, scheduledVersion, "Narrative correction must not mutate appointment metadata.");
      accept(await run(mentor, await revisionCommand(data, { method: "phone", outcome: "no_answer", notes: "Corrected unsuccessful attempt" })));
      after = await state(data.participantId);
      assert.equal(after.view.nextAppointment.scheduledAt, before.view.nextAppointment.scheduledAt);
      assert.equal(after.view.contacts.find((entry) => entry.id === data.contactId).outcome, "no_answer");
      const appointments = await database.query("SELECT count(*)::int AS count FROM mentoring.appointments WHERE organization_id=$1 AND participant_id=$2", [organizationId, data.participantId]);
      assert.equal(appointments.rows[0].count, 1);
      const activeJobs = await database.query("SELECT count(*)::int AS count FROM mentoring.reminder_jobs WHERE organization_id=$1 AND participant_id=$2 AND state IN ('pending','blocked')", [organizationId, data.participantId]);
      assert.equal(activeJobs.rows[0].count, 0, "Inactive historical maintenance cannot create live reminder obligations.");
    });

    await t.test(`${lifecycle} historical correction cannot invent an appointment when none exists`, async () => {
      const data = await fixture({ appointment: false });
      await makeInactive(data, lifecycle);
      accept(await run(mentor, await revisionCommand(data, { occurredAt: new Date(Date.parse(data.occurredAt) + 60_000).toISOString() })));
      const after = await state(data.participantId);
      assert.equal(after.view.nextAppointment, null);
      assert.equal(after.history.appointmentHistory.length, 0);
      assert.equal(after.view.contacts[0].revision, 2);
    });
  }
});
