import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import "../server/typescript-loader.mjs";

const enabled = process.env.MENTORING_INTEGRATION_TESTS === "1";
const organizationId = "11111111-1111-4111-8111-111111111111";

test("real PostgreSQL authority, lifecycle and tombstone boundaries", { skip: !enabled, timeout: 180_000 }, async (t) => {
  assert.notEqual(process.env.NODE_ENV, "production", "The fixture suite cannot run in production.");
  assert.ok(process.execArgv.includes("--conditions=react-server"), "Run with --conditions=react-server.");
  const envFile = new URL("../../../.env.local", import.meta.url);
  if (!process.env.MENTORING_DATABASE_URL && existsSync(envFile)) loadEnvFile(envFile);
  assert.ok(process.env.MENTORING_DATABASE_URL, "An already migrated development database is required.");
  const { executeCommand } = await import("../../../lib/mentoring/server/commands.ts");
  const { getWorkspace } = await import("../../../lib/mentoring/server/repository.ts");
  const { getDatabasePool } = await import("../../../lib/mentoring/server/db.ts");
  const { loadAuthorityExtras } = await import("../../../lib/mentoring/features/authority/server.ts");
  const database = new Pool({ connectionString: process.env.MENTORING_DATABASE_URL_UNPOOLED ?? process.env.MENTORING_DATABASE_URL, max: 3, connectionTimeoutMillis: 10_000 });
  try {
    const schema = await database.query("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='mentoring' AND table_name='participants' AND column_name='deleted_at') AS deletion, EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='mentoring' AND table_name='grants' AND column_name='version') AS grants, to_regclass('mentoring.reminder_jobs') IS NOT NULL AS reminder_jobs, to_regclass('mentoring.reminder_attempts') IS NOT NULL AS reminder_attempts");
    assert.equal(schema.rows[0].deletion && schema.rows[0].grants && schema.rows[0].reminder_jobs && schema.rows[0].reminder_attempts, true, "Apply every mentoring migration before opting in. This suite never migrates.");
    assert.equal((await database.query("SELECT count(*)::int AS count FROM mentoring.participants")).rows[0].count, 0, "Run only in the reserved empty development-database window. No existing participant data may be present.");
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
    return executeCommand(actor.authUserId, actor.email, command);
  };
  const accepted = (result) => {
    assert.equal(result.ok, true, result.ok ? undefined : `${result.error.code}: ${result.error.message}`);
    assert.equal(result.acceptance, "accepted");
    return result;
  };
  const denied = (result, code) => {
    assert.equal(result.ok, false, "The operation must not be centrally accepted.");
    if (code) assert.equal(result.error.code, code);
    return result.error;
  };
  async function addStaff(role, coordinatorId = null) {
    const person = { id: randomUUID(), authUserId: `authority_test_${randomUUID()}`, email: `${randomUUID()}@mentoring-tests.invalid`, role };
    staff.push(person);
    await database.query("INSERT INTO mentoring.memberships (id,organization_id,auth_user_id,email,display_name,phone,role,coordinator_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [person.id, organizationId, person.authUserId, person.email, `בדיקת סמכות ${runId} ${role}`, "0500000000", role, coordinatorId]);
    return person;
  }
  async function state(id) {
    const participant = (await database.query("SELECT * FROM mentoring.participants WHERE organization_id=$1 AND id=$2", [organizationId, id])).rows[0];
    const assignment = (await database.query("SELECT * FROM mentoring.assignments WHERE organization_id=$1 AND participant_id=$2 AND ended_at IS NULL", [organizationId, id])).rows[0] ?? null;
    const appointment = (await database.query("SELECT * FROM mentoring.appointments WHERE organization_id=$1 AND participant_id=$2 AND is_current", [organizationId, id])).rows[0] ?? null;
    return { participant, assignment, appointment };
  }
  async function participant(actor, mentor, coordinator) {
    const id = randomUUID();
    participantIds.push(id);
    accepted(await run(actor, { type: "create_participant", operationId: id, fields: { displayName: `בדיקת סמכות ${runId}` } }));
    if (mentor) accepted(await run(actor, { type: "assign_participant", operationId: randomUUID(), participantId: id, expectedVersion: 1, mentorId: mentor.id, coordinatorId: coordinator?.id ?? null }));
    return id;
  }
  async function authority(id, type, fields = {}) {
    return { type, operationId: randomUUID(), participantId: id, expectedVersion: (await state(id)).participant.version, reason: `בדיקה ${runId}`, ...fields };
  }
  async function contact(id, fields = {}) {
    const current = await state(id);
    return { type: "record_contact", operationId: randomUUID(), participantId: id, expectedVersion: current.participant.version, expectedAppointmentVersion: current.appointment?.version ?? null, method: "phone", outcome: "completed", occurredAt: new Date(Date.now() - 60_000).toISOString(), notes: `בדיקת קשר ${runId}`, nextAppointmentAt: new Date(Date.now() + 86_400_000).toISOString(), ...fields };
  }
  t.after(async () => {
    const staffIds = staff.map((person) => person.id);
    const cleanup = await database.connect();
    try {
      await cleanup.query("BEGIN");
      await cleanup.query("DELETE FROM mentoring.reminder_attempts WHERE organization_id=$1 AND participant_id=ANY($2::uuid[])", [organizationId, participantIds]);
      await cleanup.query("DELETE FROM mentoring.reminder_jobs WHERE organization_id=$1 AND participant_id=ANY($2::uuid[])", [organizationId, participantIds]);
      for (const table of ["outbox", "audit", "conflicts"]) await cleanup.query(`DELETE FROM mentoring.${table} WHERE organization_id=$1 AND (actor_id=ANY($2::uuid[]) OR participant_id=ANY($3::uuid[]))`, [organizationId, staffIds, participantIds]);
      await cleanup.query("DELETE FROM mentoring.reviews WHERE organization_id=$1 AND (reviewed_by_staff_id=ANY($2::uuid[]) OR contact_id IN (SELECT id FROM mentoring.contacts WHERE organization_id=$1 AND participant_id=ANY($3::uuid[])))", [organizationId, staffIds, participantIds]);
      await cleanup.query("DELETE FROM mentoring.ceo_protections WHERE organization_id=$1 AND (resource_id=ANY($2::uuid[]) OR resource_id IN (SELECT id FROM mentoring.contacts WHERE organization_id=$1 AND participant_id=ANY($2::uuid[])))", [organizationId, participantIds]);
      for (const table of ["grants", "appointments", "contacts", "assignments"]) await cleanup.query(`DELETE FROM mentoring.${table} WHERE organization_id=$1 AND participant_id=ANY($2::uuid[])`, [organizationId, participantIds]);
      await cleanup.query("DELETE FROM mentoring.participants WHERE organization_id=$1 AND id=ANY($2::uuid[])", [organizationId, participantIds]);
      await cleanup.query("DELETE FROM mentoring.resource_ids WHERE organization_id=$1 AND id=ANY($2::uuid[])", [organizationId, [...resourceIds]]);
      await cleanup.query("DELETE FROM mentoring.operations WHERE organization_id=$1 AND actor_id=ANY($2::uuid[])", [organizationId, staffIds]);
      await cleanup.query("DELETE FROM mentoring.memberships WHERE organization_id=$1 AND id=ANY($2::uuid[])", [organizationId, staffIds]);
      await cleanup.query("COMMIT");
    } catch {
      await cleanup.query("ROLLBACK").catch(() => undefined);
      throw new Error(`Authority fixture cleanup failed. Remove only test run ${runId}.`);
    } finally {
      cleanup.release();
      await database.end();
      await getDatabasePool().end();
    }
  });

  const ceo = await addStaff("ceo");
  const coordinator = await addStaff("coordinator");
  const otherCoordinator = await addStaff("coordinator");
  const mentor = await addStaff("mentor", coordinator.id);
  const outsider = await addStaff("mentor", otherCoordinator.id);

  await t.test("only CEO authority can grant and target role ceilings remain current", async () => {
    const id = await participant(coordinator, mentor, coordinator);
    const command = await authority(id, "set_access_grant", { staffId: outsider.id, expectedGrantVersion: null, actions: ["view", "edit"], expiresAt: null });
    denied(await run(coordinator, command), "forbidden");
    denied(await run(mentor, { ...command, operationId: randomUUID() }), "forbidden");
    denied(await run(ceo, { ...command, operationId: randomUUID(), actions: ["view", "approve"] }));
    denied(await run(ceo, { ...command, operationId: randomUUID(), staffId: randomUUID() }));
    denied(await run(ceo, { ...command, operationId: randomUUID(), expiresAt: new Date(Date.now() - 60_000).toISOString() }));
    const before = await state(id);
    accepted(await run(ceo, command));
    assert.equal((await state(id)).participant.version, before.participant.version + 1);
    const grant = (await database.query("SELECT * FROM mentoring.grants WHERE organization_id=$1 AND participant_id=$2 AND staff_id=$3", [organizationId, id, outsider.id])).rows[0];
    assert.equal(grant.version, 1);
    assert.equal(grant.granted_by_staff_id, ceo.id);
    assert.equal(grant.active, true);
    assert.deepEqual(new Set(grant.actions), new Set(["view", "edit"]));
    const visible = await getWorkspace(outsider.authUserId, outsider.email);
    assert.ok(visible.participants.some((view) => view.participant.id === id));
    denied(await run(ceo, await authority(id, "set_access_grant", { staffId: outsider.id, expectedGrantVersion: null, actions: ["view"], expiresAt: null })), "conflict");
  });

  await t.test("revocation is versioned and prevents replay and old queued writes", async () => {
    const id = await participant(coordinator, mentor, coordinator);
    accepted(await run(ceo, await authority(id, "set_access_grant", { staffId: outsider.id, expectedGrantVersion: null, actions: ["view", "edit"], expiresAt: null })));
    const acceptedContact = await contact(id);
    accepted(await run(outsider, acceptedContact));
    const oldQueue = await contact(id);
    accepted(await run(ceo, await authority(id, "set_access_grant", { staffId: outsider.id, expectedGrantVersion: 1, actions: [], expiresAt: null })));
    const grant = (await database.query("SELECT * FROM mentoring.grants WHERE organization_id=$1 AND participant_id=$2 AND staff_id=$3", [organizationId, id, outsider.id])).rows[0];
    assert.equal(grant.version, 2);
    assert.equal(grant.active, false);
    assert.deepEqual(grant.actions, []);
    assert.equal(grant.revoked_by_staff_id, ceo.id);
    assert.ok(grant.revoked_at);
    denied(await run(outsider, acceptedContact), "forbidden");
    denied(await run(outsider, oldQueue), "forbidden");
    assert.equal((await database.query("SELECT count(*)::int AS count FROM mentoring.contacts WHERE organization_id=$1 AND participant_id=$2", [organizationId, id])).rows[0].count, 1);
    assert.equal((await getWorkspace(outsider.authUserId, outsider.email)).participants.some((view) => view.participant.id === id), false);
  });

  await t.test("an expired grant cannot authorize a replay or a current-version write", async () => {
    const id = await participant(coordinator, mentor, coordinator);
    accepted(await run(ceo, await authority(id, "set_access_grant", { staffId: outsider.id, expectedGrantVersion: null, actions: ["view", "edit"], expiresAt: new Date(Date.now() + 60_000).toISOString() })));
    const command = await contact(id);
    accepted(await run(outsider, command));
    await database.query("UPDATE mentoring.grants SET expires_at=clock_timestamp()-interval '1 second' WHERE organization_id=$1 AND participant_id=$2 AND staff_id=$3", [organizationId, id, outsider.id]);
    denied(await run(outsider, command), "forbidden");
    denied(await run(outsider, await contact(id)), "forbidden");
  });

  await t.test("grant expiration during a target-membership lock wait prevents creation", async () => {
    const id = await participant(coordinator, mentor, coordinator);
    const before = await state(id);
    const lock = await database.connect();
    let pending;
    let result;
    try {
      await lock.query("BEGIN");
      await lock.query("SELECT id FROM mentoring.memberships WHERE organization_id=$1 AND id=$2 FOR UPDATE", [organizationId, outsider.id]);
      const lockerPid = (await lock.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      const expiresAt = new Date(Date.now() + 3_000).toISOString();
      pending = run(ceo, await authority(id, "set_access_grant", { staffId: outsider.id, expectedGrantVersion: null, actions: ["view", "edit"], expiresAt }));
      let observedWait = false;
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        const blocked = await database.query("SELECT 1 FROM pg_stat_activity WHERE $1::integer=ANY(pg_blocking_pids(pid)) AND query LIKE 'SELECT id,role,active FROM mentoring.memberships%'", [lockerPid]);
        if (blocked.rowCount) { observedWait = true; break; }
        await delay(25);
      }
      assert.ok(observedWait, "The request must reach the target membership lock before the grant expires.");
      assert.equal((await database.query("SELECT clock_timestamp() < $1::timestamptz AS still_valid", [expiresAt])).rows[0].still_valid, true);
      await lock.query("SELECT pg_sleep(GREATEST(0, EXTRACT(EPOCH FROM ($1::timestamptz-clock_timestamp())))+0.1)", [expiresAt]);
    } finally {
      await lock.query("COMMIT").catch(() => undefined);
      lock.release();
      if (pending) result = await pending;
    }
    const error = denied(result, "validation");
    assert.equal(error.field, "expiresAt");
    assert.equal((await state(id)).participant.version, before.participant.version);
    assert.equal((await database.query("SELECT count(*)::int AS count FROM mentoring.grants WHERE organization_id=$1 AND participant_id=$2 AND staff_id=$3", [organizationId, id, outsider.id])).rows[0].count, 0);
  });

  await t.test("explicit protection revisions guard selected fields and contact ownership", async () => {
    const id = await participant(coordinator, mentor, coordinator);
    const another = await participant(coordinator, mentor, coordinator);
    const anotherContact = await contact(another);
    accepted(await run(mentor, anotherContact));
    denied(await run(ceo, await authority(id, "set_ceo_protection", { resourceId: anotherContact.operationId, expectedProtectionVersion: null, active: true, fieldPaths: ["notes"] })));
    accepted(await run(ceo, await authority(id, "set_ceo_protection", { resourceId: id, expectedProtectionVersion: null, active: true, fieldPaths: ["manualColor"] })));
    const current = await state(id);
    accepted(await run(mentor, { type: "update_participant", operationId: randomUUID(), participantId: id, expectedVersion: current.participant.version, fields: { profileNotes: "עדכון שאינו נעול" } }));
    const protectedColor = await contact(id, { manualColor: "red" });
    const conflict = denied(await run(mentor, protectedColor), "ceo_protected");
    assert.ok(conflict.conflictId, "The submitted change is retained for review.");
    const retained = (await database.query("SELECT submitted_value FROM mentoring.conflicts WHERE organization_id=$1 AND id=$2", [organizationId, conflict.conflictId])).rows[0];
    assert.equal(retained.submitted_value.manualColor, "red");
    denied(await run(ceo, await authority(id, "set_ceo_protection", { resourceId: id, expectedProtectionVersion: null, active: false, fieldPaths: null })), "conflict");
    accepted(await run(ceo, await authority(id, "set_ceo_protection", { resourceId: id, expectedProtectionVersion: 1, active: false, fieldPaths: null })));
    const protection = (await database.query("SELECT * FROM mentoring.ceo_protections WHERE organization_id=$1 AND resource_id=$2", [organizationId, id])).rows[0];
    assert.equal(protection.active, false);
    assert.equal(protection.version, 2);
    assert.equal(protection.unlocked_by_staff_id, ceo.id);
    assert.ok(protection.unlocked_at);
  });

  await t.test("pause and reopen preserve the previous anchor, appointment and accepted contact", async () => {
    const id = await participant(coordinator, mentor, coordinator);
    const completed = await contact(id);
    accepted(await run(mentor, completed));
    const before = await state(id);
    const pause = await authority(id, "set_participant_lifecycle", { lifecycle: "paused" });
    denied(await run(coordinator, pause), "forbidden");
    accepted(await run(ceo, pause));
    const paused = await state(id);
    assert.equal(paused.participant.lifecycle, "paused");
    assert.equal(paused.assignment.followup_anchor_at.toISOString(), before.assignment.followup_anchor_at.toISOString());
    assert.equal(paused.appointment.id, before.appointment.id);
    assert.equal(paused.appointment.scheduled_at.toISOString(), before.appointment.scheduled_at.toISOString());
    assert.equal((await database.query("SELECT count(*)::int AS count FROM mentoring.outbox WHERE organization_id=$1 AND participant_id=$2 AND status IN ('blocked','pending')", [organizationId, id])).rows[0].count, 0);
    assert.equal((await database.query("SELECT count(*)::int AS count FROM mentoring.reminder_jobs WHERE organization_id=$1 AND participant_id=$2 AND state IN ('blocked','pending')", [organizationId, id])).rows[0].count, 0);
    denied(await run(mentor, await contact(id)));
    accepted(await run(ceo, await authority(id, "set_participant_lifecycle", { lifecycle: "active" })));
    const reopened = await state(id);
    assert.equal(reopened.participant.lifecycle, "active");
    assert.equal(reopened.assignment.followup_anchor_at.toISOString(), before.assignment.followup_anchor_at.toISOString());
    assert.equal(reopened.appointment.scheduled_at.toISOString(), before.appointment.scheduled_at.toISOString());
    assert.equal((await database.query("SELECT count(*)::int AS count FROM mentoring.contacts WHERE organization_id=$1 AND participant_id=$2", [organizationId, id])).rows[0].count, 1);
  });

  await t.test("deletion is reversible and delayed offline commands cannot resurrect data", async () => {
    const id = await participant(coordinator, mentor, coordinator);
    const completed = await contact(id);
    accepted(await run(mentor, completed));
    const queued = await contact(id);
    const before = await state(id);
    const removal = await authority(id, "delete_participant");
    denied(await run(coordinator, removal), "forbidden");
    accepted(await run(ceo, removal));
    const deleted = await state(id);
    assert.ok(deleted.participant.deleted_at);
    assert.equal(deleted.participant.deleted_by, ceo.id);
    assert.equal(deleted.participant.deleted_previous_lifecycle, before.participant.lifecycle);
    assert.equal(deleted.assignment.id, before.assignment.id);
    assert.equal(deleted.appointment.id, before.appointment.id);
    assert.equal((await database.query("SELECT count(*)::int AS count FROM mentoring.reminder_jobs WHERE organization_id=$1 AND participant_id=$2 AND state IN ('blocked','pending')", [organizationId, id])).rows[0].count, 0);
    assert.equal((await getWorkspace(mentor.authUserId, mentor.email)).participants.some((view) => view.participant.id === id), false);
    denied(await run(mentor, queued));
    denied(await run(mentor, completed), undefined);
    assert.equal((await database.query("SELECT count(*)::int AS count FROM mentoring.resource_ids WHERE organization_id=$1 AND id=ANY($2::uuid[])", [organizationId, [id, completed.operationId]])).rows[0].count, 2);
    denied(await run(ceo, await authority(id, "restore_participant", { expectedVersion: before.participant.version })), "conflict");
    accepted(await run(ceo, await authority(id, "restore_participant")));
    const restored = await state(id);
    assert.equal(restored.participant.deleted_at, null);
    assert.equal(restored.participant.lifecycle, before.participant.lifecycle);
    assert.equal(restored.assignment.followup_anchor_at.toISOString(), before.assignment.followup_anchor_at.toISOString());
    assert.equal(restored.appointment.scheduled_at.toISOString(), before.appointment.scheduled_at.toISOString());
    denied(await run(mentor, queued));
    assert.equal((await database.query("SELECT count(*)::int AS count FROM mentoring.contacts WHERE organization_id=$1 AND participant_id=$2", [organizationId, id])).rows[0].count, 1);
    const extras = await loadAuthorityExtras(database, organizationId, [id]);
    assert.equal(extras.get(id).deletedAt, null);
    assert.ok(extras.get(id).assignmentHistory.some((assignment) => assignment.id === before.assignment.id));
    assert.ok(extras.get(id).authorityHistory.some((event) => event.action === "delete_participant"));
    assert.ok(extras.get(id).authorityHistory.some((event) => event.action === "restore_participant"));
  });

  await t.test("staff edits preserve identity and cannot invalidate active ownership or CEO role", async () => {
    const id = await participant(coordinator, mentor, coordinator);
    const member = (await database.query("SELECT * FROM mentoring.memberships WHERE id=$1", [mentor.id])).rows[0];
    const change = { type: "update_staff", operationId: randomUUID(), staffId: mentor.id, expectedVersion: member.version, fields: { displayName: `שם חדש ${runId}`, phone: "0520000000" } };
    denied(await run(coordinator, change), "forbidden");
    accepted(await run(ceo, change));
    const updated = (await database.query("SELECT * FROM mentoring.memberships WHERE id=$1", [mentor.id])).rows[0];
    assert.equal(updated.auth_user_id, member.auth_user_id);
    assert.equal(updated.email, member.email);
    assert.equal(updated.phone, "0520000000");
    assert.equal(updated.version, member.version + 1);
    denied(await run(ceo, { ...change, operationId: randomUUID(), expectedVersion: member.version, fields: { phone: "0530000000" } }), "conflict");
    denied(await run(ceo, { ...change, operationId: randomUUID(), expectedVersion: updated.version, fields: { role: "coordinator", coordinatorId: null } }));
    denied(await run(ceo, { ...change, operationId: randomUUID(), expectedVersion: updated.version, fields: { coordinatorId: otherCoordinator.id } }));
    const owner = (await database.query("SELECT * FROM mentoring.memberships WHERE id=$1", [ceo.id])).rows[0];
    denied(await run(ceo, { ...change, operationId: randomUUID(), staffId: ceo.id, expectedVersion: owner.version, fields: { role: "mentor" } }));
    assert.equal((await state(id)).assignment.mentor_id, mentor.id);
    assert.equal((await database.query("SELECT role FROM mentoring.memberships WHERE id=$1", [ceo.id])).rows[0].role, "ceo");
  });

  await t.test("a former CEO cannot replay an earlier authority receipt despite retained edit scope", async () => {
    const formerCeo = await addStaff("ceo");
    const id = await participant(coordinator, mentor, coordinator);
    const earlier = await authority(id, "set_access_grant", { staffId: outsider.id, expectedGrantVersion: null, actions: ["view"], expiresAt: null });
    accepted(await run(formerCeo, earlier));
    accepted(await run(ceo, await authority(id, "set_access_grant", { staffId: formerCeo.id, expectedGrantVersion: null, actions: ["view", "edit"], expiresAt: null })));
    await database.query("UPDATE mentoring.memberships SET role='coordinator',version=version+1 WHERE organization_id=$1 AND id=$2", [organizationId, formerCeo.id]);
    assert.ok((await getWorkspace(formerCeo.authUserId, formerCeo.email)).participants.some((entry) => entry.participant.id === id), "The actor retains ordinary edit scope, so the CEO role must be checked separately.");
    denied(await run(formerCeo, earlier), "forbidden");
    const grant = (await database.query("SELECT version FROM mentoring.grants WHERE organization_id=$1 AND participant_id=$2 AND staff_id=$3", [organizationId, id, outsider.id])).rows[0];
    assert.equal(grant.version, 1);
  });
});
