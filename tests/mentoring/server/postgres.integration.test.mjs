import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import "./typescript-loader.mjs";

// Explicit opt-in is required: this suite writes temporary fixtures to the real
// development database and removes them in its cleanup hook.
const enabled = process.env.MENTORING_INTEGRATION_TESTS === "1";
const organizationId = "11111111-1111-4111-8111-111111111111";

test("real PostgreSQL mentoring transactions and current authorization", { skip: !enabled, timeout: 360_000 }, async (t) => {
  assert.notEqual(process.env.NODE_ENV, "production", "The integration suite cannot run in production.");
  assert.ok(process.execArgv.some((argument) => argument === "--conditions=react-server"), "Run with --conditions=react-server for the server-only boundary.");
  const envFile = new URL("../../../.env.local", import.meta.url);
  if (!process.env.MENTORING_DATABASE_URL && existsSync(envFile)) loadEnvFile(envFile);
  assert.ok(process.env.MENTORING_DATABASE_URL, "A migrated development database is required.");

  const { executeCommand } = await import("../../../lib/mentoring/server/commands.ts");
  const { getWorkspace, resolveStaffIdentity } = await import("../../../lib/mentoring/server/repository.ts");
  const { getDatabasePool, withTransaction } = await import("../../../lib/mentoring/server/db.ts");
  const database = new Pool({ connectionString: process.env.MENTORING_DATABASE_URL_UNPOOLED ?? process.env.MENTORING_DATABASE_URL, max: 3, connectionTimeoutMillis: 10_000 });
  try {
    const schema = await database.query("SELECT to_regclass('mentoring.resource_ids') IS NOT NULL AS resources, to_regclass('mentoring.contact_revisions') IS NOT NULL AS contact_revisions, to_regclass('mentoring.grants') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'mentoring' AND table_name = 'grants' AND column_name = 'version') AS authority, to_regclass('mentoring.organization_settings') IS NOT NULL AS oversight, to_regclass('mentoring.reminder_jobs') IS NOT NULL AS reminder_jobs, to_regclass('mentoring.reminder_attempts') IS NOT NULL AS reminder_attempts, EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'mentoring' AND table_name = 'participants' AND column_name = 'last_ceo_version') AS protection_version, EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'mentoring' AND table_name = 'assignments' AND column_name = 'followup_anchor_at') AS followup_anchor");
    assert.ok(Object.values(schema.rows[0]).every(Boolean), "Apply every mentoring migration through 006 before running integration tests.");
    // Staff lifecycle commands deliberately re-evaluate reminders across this
    // organization. Run only in the parent's reserved empty development window,
    // so fixture actors can never replace attribution on legitimate reminders.
    const baseline = await database.query("SELECT count(*)::int AS count FROM mentoring.participants WHERE organization_id = $1", [organizationId]);
    assert.equal(baseline.rows[0].count, 0, "The core integration suite requires an empty participant baseline and a reserved serial database window.");
  } catch {
    await database.end();
    throw new Error("The development database is unavailable, missing migrations, or has existing participants. No fixtures were written; reserve an empty serial test target.");
  }
  const suffix = randomUUID();
  const staff = [];
  const createdStaffIds = new Set();
  const participantIds = [];
  const resourceIds = new Set();

  const run = (actor, command) => {
    if (["create_participant", "record_contact"].includes(command.type)) resourceIds.add(command.operationId);
    if (command.type === "create_participant" && !participantIds.includes(command.operationId)) participantIds.push(command.operationId);
    if (command.type === "create_staff") createdStaffIds.add(command.operationId);
    return executeCommand(actor.authUserId, actor.email, command);
  };
  const accepted = (result) => {
    assert.equal(result.ok, true, result.ok ? undefined : `${result.error.code}: ${result.error.message}`);
    assert.equal(result.acceptance, "accepted");
    return result;
  };
  const failed = (result, code) => {
    assert.equal(result.ok, false);
    assert.equal(result.error.code, code);
    return result.error;
  };
  async function addStaff(role, coordinatorId = null, unbound = false) {
    const member = { id: randomUUID(), authUserId: `test_${randomUUID()}`, email: `${randomUUID()}@mentoring-tests.invalid`, role, coordinatorId };
    staff.push(member);
    await database.query("INSERT INTO mentoring.memberships (id,organization_id,auth_user_id,email,display_name,role,coordinator_id) VALUES ($1,$2,$3,$4,$5,$6,$7)", [member.id, organizationId, unbound ? null : member.authUserId, member.email, `בדיקת שרת ${suffix} ${role}`, role, coordinatorId]);
    return member;
  }
  async function create(actor, fields = {}) {
    const operationId = randomUUID();
    const result = accepted(await run(actor, { type: "create_participant", operationId, fields: { displayName: `בדיקת שרת ${suffix}`, ...fields } }));
    assert.equal(result.participantId, operationId, "The create operation ID is the immutable participant ID.");
    return operationId;
  }
  async function state(participantId) {
    const participant = (await database.query("SELECT * FROM mentoring.participants WHERE organization_id = $1 AND id = $2", [organizationId, participantId])).rows[0];
    const appointment = (await database.query("SELECT * FROM mentoring.appointments WHERE organization_id = $1 AND participant_id = $2 AND is_current", [organizationId, participantId])).rows[0] ?? null;
    const assignment = (await database.query("SELECT * FROM mentoring.assignments WHERE organization_id = $1 AND participant_id = $2 AND ended_at IS NULL", [organizationId, participantId])).rows[0] ?? null;
    return { participant, appointment, assignment };
  }
  async function assign(actor, participantId, mentor, coordinator) {
    const current = await state(participantId);
    return accepted(await run(actor, { type: "assign_participant", operationId: randomUUID(), participantId, expectedVersion: current.participant.version, mentorId: mentor.id, coordinatorId: coordinator?.id ?? null }));
  }
  async function contactCommand(participantId, overrides = {}) {
    const current = await state(participantId);
    return {
      type: "record_contact", operationId: randomUUID(), participantId,
      expectedVersion: current.participant.version, expectedAppointmentVersion: current.appointment?.version ?? null,
      method: "phone", outcome: "completed", occurredAt: new Date().toISOString(),
      nextAppointmentAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), notes: `בדיקת קשר ${suffix}`,
      ...overrides,
    };
  }
  async function reminderJobs(participantId) {
    return (await database.query("SELECT id,recipient_staff_id,kind,occurrence_key,generation,scheduled_at,reference_at,state,reason,last_evaluated_by,last_evaluated_operation_id FROM mentoring.reminder_jobs WHERE organization_id = $1 AND participant_id = $2 ORDER BY id", [organizationId, participantId])).rows;
  }

  t.after(async () => {
    const staffIds = [...new Set([...staff.map((member) => member.id), ...createdStaffIds])];
    const cleanup = await database.connect();
    try {
      await cleanup.query("BEGIN");
      // Never erase or invent evaluator attribution on a nonfixture record.
      // The empty-baseline/serial preflight makes these references impossible.
      const outside = await cleanup.query("SELECT (SELECT count(*)::int FROM mentoring.reminder_jobs WHERE organization_id = $1 AND last_evaluated_by = ANY($2::uuid[]) AND NOT (participant_id = ANY($3::uuid[]) OR recipient_staff_id = ANY($2::uuid[]))) AS reminders, (SELECT count(*)::int FROM mentoring.organization_settings WHERE organization_id = $1 AND updated_by = ANY($2::uuid[])) AS settings, (SELECT count(*)::int FROM mentoring.organization_settings_history WHERE organization_id = $1 AND updated_by = ANY($2::uuid[])) AS settings_history, (SELECT count(*)::int FROM mentoring.monthly_reviews WHERE organization_id = $1 AND updated_by = ANY($2::uuid[]) AND (scope_staff_id IS NULL OR NOT (scope_staff_id = ANY($2::uuid[])))) AS shared_monthly_reviews", [organizationId, staffIds, participantIds]);
      assert.ok(Object.values(outside.rows[0]).every((count) => count === 0), "Unexpected nonfixture attribution must be reviewed instead of deleting or remapping legitimate records.");
      await cleanup.query("DELETE FROM mentoring.reminder_attempts WHERE organization_id = $1 AND (participant_id = ANY($3::uuid[]) OR job_id IN (SELECT id FROM mentoring.reminder_jobs WHERE organization_id = $1 AND recipient_staff_id = ANY($2::uuid[])))", [organizationId, staffIds, participantIds]);
      await cleanup.query("DELETE FROM mentoring.reminder_jobs WHERE organization_id = $1 AND (participant_id = ANY($3::uuid[]) OR recipient_staff_id = ANY($2::uuid[]))", [organizationId, staffIds, participantIds]);
      for (const table of ["review_events", "contact_revisions", "appointment_history", "manual_color_history"]) {
        await cleanup.query(`DELETE FROM mentoring.${table} WHERE organization_id = $1 AND participant_id = ANY($2::uuid[])`, [organizationId, participantIds]);
      }
      await cleanup.query("DELETE FROM mentoring.monthly_review_history WHERE organization_id = $1 AND review_id IN (SELECT id FROM mentoring.monthly_reviews WHERE organization_id = $1 AND scope_staff_id = ANY($2::uuid[]))", [organizationId, staffIds]);
      await cleanup.query("DELETE FROM mentoring.monthly_reviews WHERE organization_id = $1 AND scope_staff_id = ANY($2::uuid[])", [organizationId, staffIds]);
      for (const table of ["outbox", "audit", "conflicts"]) {
        await cleanup.query(`DELETE FROM mentoring.${table} WHERE organization_id = $1 AND (actor_id = ANY($2::uuid[]) OR participant_id = ANY($3::uuid[]))`, [organizationId, staffIds, participantIds]);
      }
      await cleanup.query("DELETE FROM mentoring.reviews WHERE organization_id = $1 AND (reviewed_by_staff_id = ANY($2::uuid[]) OR contact_id IN (SELECT id FROM mentoring.contacts WHERE organization_id = $1 AND participant_id = ANY($3::uuid[])))", [organizationId, staffIds, participantIds]);
      // Resource ownership also covers unlocked-by and granted/revoked-by FKs.
      await cleanup.query("DELETE FROM mentoring.ceo_protections WHERE organization_id = $1 AND resource_id = ANY($2::uuid[])", [organizationId, [...resourceIds]]);
      await cleanup.query("DELETE FROM mentoring.grants WHERE organization_id = $1 AND (participant_id = ANY($3::uuid[]) OR staff_id = ANY($2::uuid[]))", [organizationId, staffIds, participantIds]);
      for (const table of ["appointments", "contacts", "assignments"]) {
        await cleanup.query(`DELETE FROM mentoring.${table} WHERE organization_id = $1 AND participant_id = ANY($2::uuid[])`, [organizationId, participantIds]);
      }
      await cleanup.query("DELETE FROM mentoring.participants WHERE organization_id = $1 AND id = ANY($2::uuid[])", [organizationId, participantIds]);
      await cleanup.query("DELETE FROM mentoring.resource_ids WHERE organization_id = $1 AND id = ANY($2::uuid[])", [organizationId, [...resourceIds]]);
      await cleanup.query("DELETE FROM mentoring.operations WHERE organization_id = $1 AND actor_id = ANY($2::uuid[])", [organizationId, staffIds]);
      await cleanup.query("DELETE FROM mentoring.memberships WHERE organization_id = $1 AND id = ANY($2::uuid[])", [organizationId, staffIds]);
      await cleanup.query("COMMIT");
    } catch {
      await cleanup.query("ROLLBACK").catch(() => undefined);
      throw new Error(`Integration fixture cleanup failed. Remove only rows for test run ${suffix}.`);
    } finally {
      cleanup.release();
      await database.end();
      await getDatabasePool().end();
    }
  });

  const ceo = await addStaff("ceo");
  const coordinatorA = await addStaff("coordinator");
  const coordinatorB = await addStaff("coordinator");
  const mentorA = await addStaff("mentor", coordinatorA.id);
  const mentorB = await addStaff("mentor", coordinatorB.id);

  await t.test("only a preapproved unbound active email can bind an identity", async () => {
    const unbound = await addStaff("mentor", coordinatorA.id, true);
    assert.equal(await resolveStaffIdentity(unbound.authUserId, null), null);
    assert.equal(await resolveStaffIdentity(`test_${randomUUID()}`, `${randomUUID()}@mentoring-tests.invalid`), null);
    const resolved = await resolveStaffIdentity(unbound.authUserId, unbound.email.toUpperCase());
    assert.equal(resolved?.id, unbound.id);
    assert.equal(resolved?.role, "mentor");
    assert.equal(await resolveStaffIdentity(`test_${randomUUID()}`, unbound.email), null, "An existing binding cannot be taken over by matching email.");
    await database.query("UPDATE mentoring.memberships SET active = false WHERE id = $1", [unbound.id]);
    assert.equal(await resolveStaffIdentity(unbound.authUserId, unbound.email), null);
  });

  await t.test("staff preapproval respects management scope and duplicate email never reactivates or rebinds", async () => {
    const command = { type: "create_staff", operationId: randomUUID(), fields: { displayName: `בדיקת שרת ${suffix} preapproved`, email: `${randomUUID()}@mentoring-tests.invalid`, phone: null, role: "mentor", coordinatorId: coordinatorA.id } };
    failed(await run(mentorA, { ...command, operationId: randomUUID() }), "forbidden");
    failed(await run(coordinatorA, { ...command, operationId: randomUUID(), fields: { ...command.fields, role: "coordinator", coordinatorId: null } }), "forbidden");
    failed(await run(coordinatorA, { ...command, operationId: randomUUID(), fields: { ...command.fields, coordinatorId: coordinatorB.id } }), "forbidden");
    const created = accepted(await run(coordinatorA, command));
    assert.equal(created.staffId, command.operationId);
    let member = (await database.query("SELECT * FROM mentoring.memberships WHERE id = $1", [created.staffId])).rows[0];
    assert.equal(member.auth_user_id, null);
    assert.equal(member.role, "mentor");
    assert.equal(member.coordinator_id, coordinatorA.id);
    const authUserId = `test_${randomUUID()}`;
    assert.equal((await resolveStaffIdentity(authUserId, command.fields.email))?.id, member.id);
    member = (await database.query("SELECT * FROM mentoring.memberships WHERE id = $1", [created.staffId])).rows[0];
    accepted(await run(ceo, { type: "set_staff_active", operationId: randomUUID(), staffId: member.id, expectedVersion: member.version, active: false }));
    failed(await run(ceo, { ...command, operationId: randomUUID(), fields: { ...command.fields, email: command.fields.email.toUpperCase(), displayName: "שם שאסור להחליף" } }), "conflict");
    const replayed = accepted(await run(coordinatorA, command));
    assert.equal(replayed.replayed, true);
    failed(await run(coordinatorA, { ...command, fields: { ...command.fields, displayName: "תוכן שונה באותו מזהה" } }), "conflict");
    const unchanged = (await database.query("SELECT * FROM mentoring.memberships WHERE id = $1", [created.staffId])).rows[0];
    assert.equal(unchanged.active, false);
    assert.equal(unchanged.auth_user_id, authUserId);
    assert.equal(unchanged.display_name, command.fields.displayName);
    assert.equal((await database.query("SELECT count(*)::int AS count FROM mentoring.audit WHERE organization_id = $1 AND actor_id = $2 AND operation_id = $3", [organizationId, coordinatorA.id, command.operationId])).rows[0].count, 1);
    const management = await getWorkspace(ceo.authUserId, ceo.email);
    assert.ok(management.staff.some((person) => person.id === member.id && !person.active));
    const coordinatorCommand = { type: "create_staff", operationId: randomUUID(), fields: { displayName: `בדיקת שרת ${suffix} coordinator`, email: `${randomUUID()}@mentoring-tests.invalid`, phone: null, role: "coordinator", coordinatorId: null } };
    assert.equal(accepted(await run(ceo, coordinatorCommand)).staffId, coordinatorCommand.operationId);
    const mentorCommand = { ...command, operationId: randomUUID(), fields: { ...command.fields, displayName: `בדיקת שרת ${suffix} owner-created`, email: `${randomUUID()}@mentoring-tests.invalid`, coordinatorId: coordinatorB.id } };
    assert.equal(accepted(await run(ceo, mentorCommand)).staffId, mentorCommand.operationId);
  });

  await t.test("only the CEO can deactivate or reactivate current staff without changing their identity", async () => {
    const command = { type: "create_staff", operationId: randomUUID(), fields: { displayName: `בדיקת שרת ${suffix} activation`, email: `${randomUUID()}@mentoring-tests.invalid`, phone: null, role: "mentor", coordinatorId: coordinatorA.id } };
    accepted(await run(ceo, command));
    const member = { id: command.operationId, authUserId: `test_${randomUUID()}`, email: command.fields.email };
    assert.equal((await resolveStaffIdentity(member.authUserId, member.email))?.id, member.id);
    const current = (await database.query("SELECT * FROM mentoring.memberships WHERE id = $1", [member.id])).rows[0];
    const deactivate = { type: "set_staff_active", operationId: randomUUID(), staffId: member.id, expectedVersion: current.version, active: false };
    failed(await run(mentorA, { ...deactivate, operationId: randomUUID() }), "forbidden");
    failed(await run(coordinatorA, { ...deactivate, operationId: randomUUID() }), "forbidden");
    failed(await run(ceo, { ...deactivate, operationId: randomUUID(), expectedVersion: current.version + 1 }), "conflict");
    const ceoRow = (await database.query("SELECT * FROM mentoring.memberships WHERE id = $1", [ceo.id])).rows[0];
    failed(await run(ceo, { ...deactivate, operationId: randomUUID(), staffId: ceo.id, expectedVersion: ceoRow.version }), "forbidden");
    const ownCreate = { type: "create_participant", operationId: randomUUID(), fields: {} };
    failed(await run(member, ownCreate), "forbidden");
    accepted(await run(ceo, deactivate));
    assert.equal(await resolveStaffIdentity(member.authUserId, member.email), null);
    failed(await run(member, ownCreate), "not_staff");
    assert.equal(accepted(await run(ceo, deactivate)).replayed, true);
    let row = (await database.query("SELECT * FROM mentoring.memberships WHERE id = $1", [member.id])).rows[0];
    assert.equal(row.version, current.version + 1);
    const reactivate = { type: "set_staff_active", operationId: randomUUID(), staffId: member.id, expectedVersion: row.version, active: true };
    accepted(await run(ceo, reactivate));
    row = (await database.query("SELECT * FROM mentoring.memberships WHERE id = $1", [member.id])).rows[0];
    assert.equal(row.active, true);
    assert.equal(row.auth_user_id, current.auth_user_id);
    assert.equal(row.email, current.email);
    assert.equal(row.role, current.role);
    assert.equal(row.coordinator_id, current.coordinator_id);
    assert.equal((await resolveStaffIdentity(member.authUserId, member.email))?.id, member.id);
    assert.equal(accepted(await run(ceo, reactivate)).replayed, true);
    failed(await run(ceo, { ...reactivate, active: false }), "conflict");
    assert.equal((await database.query("SELECT count(*)::int AS count FROM mentoring.audit WHERE organization_id = $1 AND actor_id = $2 AND operation_id = $3", [organizationId, ceo.id, reactivate.operationId])).rows[0].count, 1);
  });

  await t.test("same contact operation concurrently commits one contact, receipt, appointment, and canonical reminder set", async () => {
    const participantId = await create(coordinatorA);
    await assign(coordinatorA, participantId, mentorA, coordinatorA);
    const command = await contactCommand(participantId);
    const results = await Promise.all([run(mentorA, command), run(mentorA, { ...command })]);
    results.forEach(accepted);
    assert.deepEqual(results.map((result) => result.replayed).sort(), [false, true]);
    const counts = await database.query("SELECT (SELECT count(*)::int FROM mentoring.contacts WHERE id = $1) AS contacts, (SELECT count(*)::int FROM mentoring.operations WHERE organization_id = $2 AND actor_id = $3 AND operation_id = $1) AS receipts, (SELECT count(*)::int FROM mentoring.appointments WHERE organization_id = $2 AND participant_id = $4 AND is_current) AS appointments, (SELECT count(*)::int FROM mentoring.reminder_jobs WHERE organization_id = $2 AND last_evaluated_by = $3 AND last_evaluated_operation_id = $1) AS reminders", [command.operationId, organizationId, mentorA.id, participantId]);
    assert.equal(counts.rows[0].contacts, 1);
    assert.equal(counts.rows[0].receipts, 1);
    assert.equal(counts.rows[0].appointments, 1);
    assert.ok(counts.rows[0].reminders > 0);
    const jobsBeforeReplay = await reminderJobs(participantId);
    const currentJobs = jobsBeforeReplay.filter((job) => job.last_evaluated_operation_id === command.operationId && job.state !== "cancelled");
    assert.deepEqual([...new Set(currentJobs.map((job) => job.kind))].sort(), ["appointment", "seven_day_overdue"]);
    assert.equal(new Set(currentJobs.map((job) => `${job.recipient_staff_id}|${job.occurrence_key}`)).size, currentJobs.length);
    assert.equal((await database.query("SELECT count(*)::int AS count FROM mentoring.outbox WHERE organization_id = $1 AND participant_id = $2", [organizationId, participantId])).rows[0].count, 0, "The canonical planner must not create legacy broadcast outbox records.");
    const repeated = accepted(await run(mentorA, command));
    assert.equal(repeated.replayed, true);
    const afterReplay = await database.query("SELECT count(*)::int AS count FROM mentoring.reminder_jobs WHERE organization_id = $1 AND last_evaluated_by = $2 AND last_evaluated_operation_id = $3", [organizationId, mentorA.id, command.operationId]);
    assert.equal(afterReplay.rows[0].count, counts.rows[0].reminders);
    assert.deepEqual(await reminderJobs(participantId), jobsBeforeReplay, "A receipt replay must not recreate or reattribute canonical reminder jobs.");
    failed(await run(mentorA, { ...command, notes: "תוכן אחר באותו מזהה" }), "conflict");
    const current = await state(participantId);
    assert.equal(current.participant.version, 3);
    assert.equal(current.appointment.version, 1);
    const { nextAppointmentAt: omitted, ...attempt } = await contactCommand(participantId, { outcome: "no_answer" });
    assert.ok(omitted);
    accepted(await run(mentorA, attempt));
    const afterAttempt = await state(participantId);
    assert.equal(afterAttempt.appointment.version, current.appointment.version);
    assert.equal(afterAttempt.appointment.scheduled_at.toISOString(), current.appointment.scheduled_at.toISOString());
    assert.equal(afterAttempt.participant.version, 4);
  });

  await t.test("initial record_contact appointment persistence failure rolls back every transaction write", async () => {
    const participantId = await create(coordinatorA);
    await assign(coordinatorA, participantId, mentorA, coordinatorA);
    const before = await state(participantId);
    assert.equal(before.appointment, null, "This must exercise the first contact's appointment insert.");
    const remindersBefore = await reminderJobs(participantId);
    const command = await contactCommand(participantId, { manualColor: "green" });
    const appPool = getDatabasePool();
    const originalConnect = appPool.connect;
    let restoreClient = () => undefined;
    let interceptedConnections = 0;
    let contactInserted = false;
    let appointmentFailureInjected = false;
    let injectedSqlState = null;
    let rolledBack = false;
    let result;

    // Intercept only the next real application transaction. Every normal query
    // still reaches PostgreSQL; the targeted appointment write instead executes
    // an actual 22012 database error after the contact INSERT has succeeded.
    // No schema trigger, production hook, or fake persistence path is installed.
    appPool.connect = function (...connectArguments) {
      const connection = Reflect.apply(originalConnect, this, connectArguments);
      if (connectArguments.some((argument) => typeof argument === "function")) return connection;
      return connection.then((client) => {
        interceptedConnections += 1;
        if (interceptedConnections !== 1) return client;
        const originalQuery = client.query;
        const originalRelease = client.release;
        const wrappedQuery = function (...queryArguments) {
          const statement = typeof queryArguments[0] === "string" ? queryArguments[0] : queryArguments[0]?.text ?? "";
          if (/^INSERT INTO mentoring\.contacts\b/i.test(statement) && queryArguments[1]?.[0] === command.operationId) {
            return Reflect.apply(originalQuery, this, queryArguments).then((inserted) => {
              contactInserted = inserted.rowCount === 1;
              return inserted;
            });
          }
          if (contactInserted && !appointmentFailureInjected && /^INSERT INTO mentoring\.appointments\b/i.test(statement)) {
            appointmentFailureInjected = true;
            return Reflect.apply(originalQuery, this, ["SELECT 1 / 0"]).catch((error) => {
              injectedSqlState = error.code;
              throw error;
            });
          }
          if (/^ROLLBACK$/i.test(statement)) {
            return Reflect.apply(originalQuery, this, queryArguments).then((rollback) => {
              rolledBack = true;
              return rollback;
            });
          }
          return Reflect.apply(originalQuery, this, queryArguments);
        };
        const wrappedRelease = function (...releaseArguments) {
          restoreClient();
          return Reflect.apply(originalRelease, this, releaseArguments);
        };
        restoreClient = () => {
          if (client.query === wrappedQuery) client.query = originalQuery;
          if (client.release === wrappedRelease) client.release = originalRelease;
        };
        client.query = wrappedQuery;
        client.release = wrappedRelease;
        return client;
      });
    };
    try {
      result = await run(mentorA, command);
    } finally {
      appPool.connect = originalConnect;
      restoreClient();
    }

    failed(result, "unavailable");
    assert.equal(interceptedConnections, 1, "A division-by-zero failure must not trigger a transaction retry.");
    assert.equal(contactInserted, true, "The real contact row must have been inserted before the downstream failure.");
    assert.equal(appointmentFailureInjected, true, "The failure must occur on initial appointment persistence.");
    assert.equal(injectedSqlState, "22012");
    assert.equal(rolledBack, true, "PostgreSQL must acknowledge the transaction rollback.");
    assert.equal(appPool.connect, originalConnect);
    assert.deepEqual(await state(participantId), before, "Participant version/color, assignment, and absent appointment must remain authoritative.");
    assert.deepEqual(await reminderJobs(participantId), remindersBefore, "The existing assignment reminder jobs must remain unchanged.");
    const persisted = await database.query("SELECT (SELECT count(*)::int FROM mentoring.contacts WHERE organization_id = $2 AND id = $1) AS contacts, (SELECT count(*)::int FROM mentoring.appointments WHERE organization_id = $2 AND participant_id = $4) AS appointments, (SELECT count(*)::int FROM mentoring.contact_revisions WHERE organization_id = $2 AND participant_id = $4) AS contact_revisions, (SELECT count(*)::int FROM mentoring.review_events WHERE organization_id = $2 AND participant_id = $4) AS review_events, (SELECT count(*)::int FROM mentoring.appointment_history WHERE organization_id = $2 AND participant_id = $4) AS appointment_history, (SELECT count(*)::int FROM mentoring.manual_color_history WHERE organization_id = $2 AND participant_id = $4) AS color_history, (SELECT count(*)::int FROM mentoring.ceo_protections WHERE organization_id = $2 AND resource_id = $1) AS protections, (SELECT count(*)::int FROM mentoring.reminder_jobs WHERE organization_id = $2 AND last_evaluated_by = $3 AND last_evaluated_operation_id = $1) AS reminders, (SELECT count(*)::int FROM mentoring.audit WHERE organization_id = $2 AND actor_id = $3 AND operation_id = $1) AS audits, (SELECT count(*)::int FROM mentoring.operations WHERE organization_id = $2 AND actor_id = $3 AND operation_id = $1) AS receipts, (SELECT count(*)::int FROM mentoring.resource_ids WHERE organization_id = $2 AND id = $1) AS resources", [command.operationId, organizationId, mentorA.id, participantId]);
    assert.ok(Object.values(persisted.rows[0]).every((count) => count === 0), "No contact, appointment, history, protection, reminder, audit, receipt, or reserved resource may survive.");
    assert.equal(await withTransaction(async (client) => (await client.query("SELECT 1 AS value")).rows[0].value), 1, "The restored real pool must remain usable after rollback.");
  });

  await t.test("two different operations sharing a stale participant version cannot both commit", async () => {
    const participantId = await create(coordinatorA);
    await assign(coordinatorA, participantId, mentorA, coordinatorA);
    const first = await contactCommand(participantId);
    const second = { ...first, operationId: randomUUID(), notes: "דיווח מקביל" };
    const results = await Promise.all([run(mentorA, first), run(mentorA, second)]);
    assert.equal(results.filter((result) => result.ok).length, 1);
    failed(results.find((result) => !result.ok), "conflict");
    const rows = await database.query("SELECT count(*)::int AS count FROM mentoring.contacts WHERE organization_id = $1 AND participant_id = $2", [organizationId, participantId]);
    assert.equal(rows.rows[0].count, 1);
  });

  await t.test("participant and contact operation IDs cannot alias a protected resource", async () => {
    const participantId = await create(coordinatorA);
    await assign(coordinatorA, participantId, mentorA, coordinatorA);
    const collision = await contactCommand(participantId, { operationId: participantId });
    failed(await run(mentorA, collision), "conflict");
    assert.equal((await database.query("SELECT count(*)::int AS count FROM mentoring.contacts WHERE id = $1", [participantId])).rows[0].count, 0);
    const contact = await contactCommand(participantId);
    accepted(await run(mentorA, contact));
    const asParticipant = { type: "create_participant", operationId: contact.operationId, fields: { displayName: "מזהה תפוס" } };
    failed(await run(coordinatorB, asParticipant), "conflict");
    assert.equal((await database.query("SELECT count(*)::int AS count FROM mentoring.participants WHERE id = $1", [contact.operationId])).rows[0].count, 0);
  });

  await t.test("creator access ends after transfer and only explicit grants restore the permitted action", async () => {
    const participantId = await create(coordinatorA);
    let workspace = await getWorkspace(coordinatorA.authUserId, coordinatorA.email);
    assert.ok(workspace.participants.some((view) => view.participant.id === participantId));
    await assign(ceo, participantId, mentorB, coordinatorB);
    workspace = await getWorkspace(coordinatorA.authUserId, coordinatorA.email);
    assert.ok(!workspace.participants.some((view) => view.participant.id === participantId));
    const current = await state(participantId);
    failed(await run(coordinatorA, { type: "update_participant", operationId: randomUUID(), participantId, expectedVersion: current.participant.version, fields: { phone: "0500000000" } }), "forbidden");
    const grantId = randomUUID();
    await database.query("INSERT INTO mentoring.grants (id,organization_id,staff_id,participant_id,actions) VALUES ($1,$2,$3,$4,ARRAY['view']::text[])", [grantId, organizationId, coordinatorA.id, participantId]);
    workspace = await getWorkspace(coordinatorA.authUserId, coordinatorA.email);
    assert.ok(workspace.participants.some((view) => view.participant.id === participantId));
    failed(await run(coordinatorA, { type: "update_participant", operationId: randomUUID(), participantId, expectedVersion: current.participant.version, fields: { phone: "0500000000" } }), "forbidden");
    await database.query("UPDATE mentoring.grants SET active = false, version = version + 1, updated_at = clock_timestamp() WHERE id = $1", [grantId]);
    workspace = await getWorkspace(coordinatorA.authUserId, coordinatorA.email);
    assert.ok(!workspace.participants.some((view) => view.participant.id === participantId));
  });

  await t.test("offline snapshot leases stop at timed grant expiry while permanent and inherent scope keep 24 hours", async () => {
    const participantId = await create(coordinatorA);
    await assign(coordinatorA, participantId, mentorA, coordinatorA);
    const timedGrantId = randomUUID();
    const timedGrant = await database.query("INSERT INTO mentoring.grants (id,organization_id,staff_id,participant_id,actions,expires_at) VALUES ($1,$2,$3,$4,ARRAY['view']::text[],clock_timestamp() + interval '5 minutes') RETURNING expires_at", [timedGrantId, organizationId, mentorB.id, participantId]);
    const expiresAt = timedGrant.rows[0].expires_at.toISOString();
    const temporary = await getWorkspace(mentorB.authUserId, mentorB.email);
    assert.ok(temporary.participants.some((view) => view.participant.id === participantId), "The temporary grant must expose its permitted participant.");
    assert.ok(Date.parse(temporary.offlineValidUntil) <= Date.parse(expiresAt), "Offline access must not outlive its known authorization deadline.");
    assert.ok(Date.parse(temporary.offlineValidUntil) > Date.parse(temporary.serverTime));
    // Authority now keeps one versioned row per staff/participant, including
    // revocation tombstones. Reconfigure that grant rather than insert a duplicate.
    await database.query("UPDATE mentoring.grants SET expires_at = NULL, version = version + 1, updated_at = clock_timestamp() WHERE id = $1", [timedGrantId]);
    const permanent = await getWorkspace(mentorB.authUserId, mentorB.email);
    assert.ok(permanent.participants.some((view) => view.participant.id === participantId));
    assert.equal(Date.parse(permanent.offlineValidUntil) - Date.parse(permanent.serverTime), 24 * 60 * 60 * 1000, "A permanent grant does not shorten the bounded default lease.");
    const assigned = await getWorkspace(mentorA.authUserId, mentorA.email);
    assert.ok(assigned.participants.some((view) => view.participant.id === participantId));
    assert.equal(Date.parse(assigned.offlineValidUntil) - Date.parse(assigned.serverTime), 24 * 60 * 60 * 1000);
    // Even a redundant timed grant cannot reduce the CEO's inherent scope.
    await database.query("INSERT INTO mentoring.grants (id,organization_id,staff_id,participant_id,actions,expires_at) VALUES ($1,$2,$3,$4,ARRAY['view']::text[],clock_timestamp() + interval '5 minutes')", [randomUUID(), organizationId, ceo.id, participantId]);
    const owner = await getWorkspace(ceo.authUserId, ceo.email);
    assert.ok(owner.participants.some((view) => view.participant.id === participantId));
    assert.equal(Date.parse(owner.offlineValidUntil) - Date.parse(owner.serverTime), 24 * 60 * 60 * 1000);
  });

  await t.test("CEO-created profile and assignment fields stay protected without blocking a new mentor contact or locking an empty profile", async () => {
    const ceoNotes = "ערך פרופיל שסיפק המנכ״ל ונשאר מוגן";
    const participantId = await create(ceo, { profileNotes: ceoNotes });
    let protection = (await database.query("SELECT * FROM mentoring.ceo_protections WHERE organization_id = $1 AND resource_id = $2", [organizationId, participantId])).rows[0];
    assert.ok(Array.isArray(protection.field_paths) && protection.field_paths.length > 0, "Automatic CEO profile protection must name supplied fields rather than silently lock the whole resource.");
    assert.deepEqual([...protection.field_paths].sort(), ["displayName", "profileNotes"]);
    await assign(ceo, participantId, mentorA, coordinatorA);
    protection = (await database.query("SELECT * FROM mentoring.ceo_protections WHERE organization_id = $1 AND resource_id = $2", [organizationId, participantId])).rows[0];
    assert.deepEqual([...protection.field_paths].sort(), ["assignment", "displayName", "profileNotes"], "Assignment protection must merge with the existing supplied profile fields.");
    const contact = await contactCommand(participantId);
    accepted(await run(mentorA, contact));
    let current = await state(participantId);
    assert.equal(current.participant.profile_notes, ceoNotes);
    assert.equal(current.appointment.version, 1);
    assert.equal((await database.query("SELECT actor_id FROM mentoring.contacts WHERE organization_id = $1 AND id = $2", [organizationId, contact.operationId])).rows[0].actor_id, mentorA.id);
    failed(await run(mentorA, { type: "update_participant", operationId: randomUUID(), participantId, expectedVersion: current.participant.version, fields: { profileNotes: "שינוי שאסור להחיל על הערך של המנכ״ל" } }), "ceo_protected");
    current = await state(participantId);
    assert.equal(current.participant.profile_notes, ceoNotes, "Accepting a new contact must not unlock the CEO's supplied profile value.");

    const emptyCreate = { type: "create_participant", operationId: randomUUID(), fields: {} };
    assert.equal(accepted(await run(ceo, emptyCreate)).participantId, emptyCreate.operationId);
    const emptyProtections = await database.query("SELECT * FROM mentoring.ceo_protections WHERE organization_id = $1 AND resource_id = $2", [organizationId, emptyCreate.operationId]);
    assert.equal(emptyProtections.rows.length, 0, "An empty CEO create must not turn an empty field list into whole-record protection.");
    assert.equal((await state(emptyCreate.operationId)).participant.version, 1);
  });

  await t.test("CEO versions preserve a rejected submission exactly once while current contact append stays allowed", async () => {
    const participantId = await create(coordinatorA);
    await assign(coordinatorA, participantId, mentorA, coordinatorA);
    const old = await state(participantId);
    const staleContact = await contactCommand(participantId, { notes: "תוכן אופליין שצריך להישמר" });
    accepted(await run(ceo, { type: "update_participant", operationId: randomUUID(), participantId, expectedVersion: old.participant.version, fields: { profileNotes: "הגרסה המחייבת של המנכ״ל" } }));
    const error = failed(await run(mentorA, staleContact), "ceo_protected");
    assert.ok(error.conflictId);
    const repeated = failed(await run(mentorA, staleContact), "ceo_protected");
    assert.equal(repeated.conflictId, error.conflictId);
    const conflicts = await database.query("SELECT submitted_value,authoritative_value FROM mentoring.conflicts WHERE organization_id = $1 AND actor_id = $2 AND operation_id = $3", [organizationId, mentorA.id, staleContact.operationId]);
    assert.equal(conflicts.rows.length, 1);
    assert.equal(conflicts.rows[0].submitted_value.notes, staleContact.notes);
    assert.equal(conflicts.rows[0].authoritative_value.participant.profileNotes, "הגרסה המחייבת של המנכ״ל");
    const currentContact = await contactCommand(participantId);
    accepted(await run(mentorA, currentContact));
    const ceoColor = await contactCommand(participantId, { manualColor: "green" });
    accepted(await run(ceo, ceoColor));
    const colorBeforeAttempt = await state(participantId);
    const { nextAppointmentAt: omitted, ...sameColorAttempt } = await contactCommand(participantId, { outcome: "no_answer", manualColor: "green" });
    assert.ok(omitted);
    accepted(await run(mentorA, sameColorAttempt));
    const colorAfterAttempt = await state(participantId);
    assert.equal(colorAfterAttempt.participant.manual_color_at.toISOString(), colorBeforeAttempt.participant.manual_color_at.toISOString(), "An unchanged color must not alter the CEO's timestamp.");
    const current = await state(participantId);
    const protectedUpdate = { type: "update_participant", operationId: randomUUID(), participantId, expectedVersion: current.participant.version, fields: { profileNotes: "אין להחליף את גרסת המנכ״ל" } };
    failed(await run(mentorA, protectedUpdate), "ceo_protected");
    const colorChange = await contactCommand(participantId, { manualColor: "orange" });
    failed(await run(mentorA, colorChange), "ceo_protected");
    const after = await state(participantId);
    assert.equal(after.participant.profile_notes, "הגרסה המחייבת של המנכ״ל");
    assert.equal(after.participant.manual_color, "green");
    assert.equal((await database.query("SELECT count(*)::int AS count FROM mentoring.contacts WHERE id = $1", [colorChange.operationId])).rows[0].count, 0);
  });

  await t.test("future contact and wrong approval revision never create accepted data", async () => {
    const participantId = await create(coordinatorA);
    await assign(coordinatorA, participantId, mentorA, coordinatorA);
    const future = await contactCommand(participantId, { occurredAt: new Date(Date.now() + 60_000).toISOString() });
    failed(await run(mentorA, future), "validation");
    assert.equal((await database.query("SELECT count(*)::int AS count FROM mentoring.contacts WHERE id = $1", [future.operationId])).rows[0].count, 0);
    const completed = await contactCommand(participantId);
    accepted(await run(mentorA, completed));
    const review = { type: "review_contact", operationId: randomUUID(), participantId, contactId: completed.operationId, revision: 1, decision: "approved" };
    failed(await run(mentorA, review), "forbidden");
    failed(await run(coordinatorA, { ...review, operationId: randomUUID(), revision: 2 }), "conflict");
    accepted(await run(coordinatorA, review));
    const after = await state(participantId);
    assert.equal(after.participant.version, 3, "Approval is separate from contact/cadence revision.");
    const rows = await database.query("SELECT * FROM mentoring.reviews WHERE organization_id = $1 AND contact_id = $2", [organizationId, completed.operationId]);
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].revision, 1);
  });

  await t.test("a demoted coordinator cannot replay a foreign-author correction despite retaining view and edit access", async () => {
    const participantId = await create(coordinatorA);
    await assign(coordinatorA, participantId, mentorA, coordinatorA);
    const original = await contactCommand(participantId);
    accepted(await run(mentorA, original));
    const correctingCoordinator = await addStaff("coordinator");
    let current = await state(participantId);
    accepted(await run(ceo, { type: "set_access_grant", operationId: randomUUID(), participantId, expectedVersion: current.participant.version, staffId: correctingCoordinator.id, expectedGrantVersion: null, actions: ["view", "edit"], expiresAt: null, reason: "בדיקת סמכות תיקון לפני ואחרי שינוי תפקיד" }));
    current = await state(participantId);
    const correction = { type: "revise_contact", operationId: randomUUID(), participantId, expectedVersion: current.participant.version, contactId: original.operationId, expectedRevision: 1, expectedAppointmentVersion: current.appointment.version, method: original.method, outcome: original.outcome, occurredAt: original.occurredAt, notes: "תיקון של רכזת לדיווח שכתבה החונכת", reason: "תיקון מורשה לפני שינוי התפקיד" };
    accepted(await run(correctingCoordinator, correction));
    const acceptedEntry = (await database.query("SELECT * FROM mentoring.contacts WHERE organization_id = $1 AND id = $2", [organizationId, original.operationId])).rows[0];
    assert.equal(acceptedEntry.actor_id, mentorA.id, "Correction must preserve the original author.");
    assert.equal(acceptedEntry.revision, 2);
    const member = (await database.query("SELECT * FROM mentoring.memberships WHERE organization_id = $1 AND id = $2", [organizationId, correctingCoordinator.id])).rows[0];
    accepted(await run(ceo, { type: "update_staff", operationId: randomUUID(), staffId: member.id, expectedVersion: member.version, fields: { role: "mentor", coordinatorId: null } }));
    const workspace = await getWorkspace(correctingCoordinator.authUserId, correctingCoordinator.email);
    assert.equal(workspace.actor.role, "mentor");
    assert.ok(workspace.participants.find((view) => view.participant.id === participantId)?.allowedActions?.includes("edit"), "The explicit edit grant must remain valid, isolating authorship as the reason for denial.");
    const grant = (await database.query("SELECT * FROM mentoring.grants WHERE organization_id = $1 AND staff_id = $2 AND participant_id = $3", [organizationId, correctingCoordinator.id, participantId])).rows[0];
    assert.equal(grant.active, true);
    assert.deepEqual([...grant.actions].sort(), ["edit", "view"]);
    const before = await state(participantId);
    const remindersBefore = await reminderJobs(participantId);
    const freshCorrection = { ...correction, operationId: randomUUID(), expectedVersion: before.participant.version, expectedRevision: 2, expectedAppointmentVersion: before.appointment.version, notes: "תיקון חדש שאסור לחונכת לבצע על דיווח של אחרת" };
    failed(await run(correctingCoordinator, freshCorrection), "forbidden");
    failed(await run(correctingCoordinator, correction), "forbidden");
    assert.deepEqual(await state(participantId), before);
    assert.deepEqual(await reminderJobs(participantId), remindersBefore);
    const unchanged = (await database.query("SELECT * FROM mentoring.contacts WHERE organization_id = $1 AND id = $2", [organizationId, original.operationId])).rows[0];
    assert.deepEqual(unchanged, acceptedEntry);
    const persisted = await database.query("SELECT (SELECT count(*)::int FROM mentoring.operations WHERE organization_id = $1 AND actor_id = $2 AND operation_id = $3 AND response->>'ok' = 'true') AS accepted_receipts, (SELECT count(*)::int FROM mentoring.audit WHERE organization_id = $1 AND actor_id = $2 AND operation_id = $3) AS correction_audits, (SELECT count(*)::int FROM mentoring.operations WHERE organization_id = $1 AND actor_id = $2 AND operation_id = $4) AS rejected_fresh_receipts", [organizationId, correctingCoordinator.id, correction.operationId, freshCorrection.operationId]);
    assert.deepEqual(persisted.rows[0], { accepted_receipts: 1, correction_audits: 1, rejected_fresh_receipts: 0 });
  });

  await t.test("assignment receipt provenance permits initial coordinator retries but rejects a former CEO replacement replay", async () => {
    const participantId = await create(coordinatorA);
    const initialState = await state(participantId);
    const initial = { type: "assign_participant", operationId: randomUUID(), participantId, expectedVersion: initialState.participant.version, mentorId: mentorA.id, coordinatorId: coordinatorA.id };
    accepted(await run(coordinatorA, initial));
    const replacementOwner = await addStaff("ceo");
    const replacementMentor = await addStaff("mentor", coordinatorA.id);
    const assigned = await state(participantId);
    const replacement = { ...initial, operationId: randomUUID(), expectedVersion: assigned.participant.version, mentorId: replacementMentor.id };
    accepted(await run(replacementOwner, replacement));
    const beforeInitialReplay = await state(participantId);
    assert.equal(beforeInitialReplay.assignment.version, 2);
    const jobsBeforeInitialReplay = await reminderJobs(participantId);
    assert.equal(accepted(await run(coordinatorA, initial)).replayed, true, "An initial matching receipt stays replayable while current coordinator scope remains valid.");
    assert.deepEqual(await state(participantId), beforeInitialReplay, "An initial receipt retry must not restore the old assignment.");
    assert.deepEqual(await reminderJobs(participantId), jobsBeforeInitialReplay);
    const provenance = await database.query("SELECT actor_id,operation_id,details->>'assignmentVersion' AS assignment_version FROM mentoring.audit WHERE organization_id = $1 AND operation_id = ANY($2::uuid[]) AND action = 'assign_participant'", [organizationId, [initial.operationId, replacement.operationId]]);
    assert.equal(provenance.rows.length, 2, "The initial receipt retry must not append another assignment audit.");
    assert.equal(provenance.rows.find((row) => row.operation_id === initial.operationId)?.actor_id, coordinatorA.id);
    assert.equal(provenance.rows.find((row) => row.operation_id === replacement.operationId)?.actor_id, replacementOwner.id);
    assert.equal(provenance.rows.find((row) => row.operation_id === initial.operationId)?.assignment_version, "1");
    assert.equal(provenance.rows.find((row) => row.operation_id === replacement.operationId)?.assignment_version, "2");

    // Public staff editing intentionally cannot demote CEOs. Trusted fixture SQL
    // simulates an external authority change without adding any request bypass.
    await database.query("UPDATE mentoring.memberships SET role = 'coordinator', coordinator_id = NULL, sms_muted = false, version = version + 1, updated_at = clock_timestamp() WHERE organization_id = $1 AND id = $2", [organizationId, replacementOwner.id]);
    const current = await state(participantId);
    accepted(await run(ceo, { type: "set_access_grant", operationId: randomUUID(), participantId, expectedVersion: current.participant.version, staffId: replacementOwner.id, expectedGrantVersion: null, actions: ["view", "edit"], expiresAt: null, reason: "בדיקת חזרת קבלה לאחר הסרת סמכות מנכ״ל" }));
    const workspace = await getWorkspace(replacementOwner.authUserId, replacementOwner.email);
    assert.equal(workspace.actor.role, "coordinator");
    assert.ok(workspace.participants.find((view) => view.participant.id === participantId)?.allowedActions?.includes("edit"), "Replay denial must not be caused by losing participant access.");
    const beforeDeniedReplay = await state(participantId);
    const jobsBeforeDeniedReplay = await reminderJobs(participantId);
    failed(await run(replacementOwner, replacement), "forbidden");
    assert.deepEqual(await state(participantId), beforeDeniedReplay);
    assert.deepEqual(await reminderJobs(participantId), jobsBeforeDeniedReplay);
    const receipts = await database.query("SELECT (SELECT count(*)::int FROM mentoring.operations WHERE organization_id = $1 AND actor_id = $2 AND operation_id = $3 AND response->>'ok' = 'true') AS accepted_receipts, (SELECT count(*)::int FROM mentoring.audit WHERE organization_id = $1 AND actor_id = $2 AND operation_id = $3 AND details->>'assignmentVersion' = '2') AS replacement_audits", [organizationId, replacementOwner.id, replacement.operationId]);
    assert.deepEqual(receipts.rows[0], { accepted_receipts: 1, replacement_audits: 1 });
  });

  await t.test("a grant expiring while waiting for the participant lock cannot authorize the write", async () => {
    const participantId = await create(coordinatorA);
    await assign(coordinatorA, participantId, mentorA, coordinatorA);
    const command = await contactCommand(participantId);
    const grantId = randomUUID();
    await database.query("INSERT INTO mentoring.grants (id,organization_id,staff_id,participant_id,actions,expires_at) VALUES ($1,$2,$3,$4,ARRAY['view','edit']::text[],clock_timestamp() + interval '1 hour')", [grantId, organizationId, mentorB.id, participantId]);
    const lock = await database.connect();
    let pending;
    let result;
    try {
      await lock.query("BEGIN");
      await lock.query("SELECT id FROM mentoring.participants WHERE organization_id = $1 AND id = $2 FOR UPDATE", [organizationId, participantId]);
      const lockerPid = (await lock.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      pending = run(mentorB, command);
      let observedWait = false;
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        const blocked = await database.query("SELECT 1 FROM pg_stat_activity WHERE $1::integer = ANY(pg_blocking_pids(pid)) AND query LIKE 'SELECT * FROM mentoring.participants%'", [lockerPid]);
        if (blocked.rowCount) { observedWait = true; break; }
        await delay(25);
      }
      assert.ok(observedWait, "The queued command must reach its participant lock before the grant expires.");
      // Expire it only after observing that exact wait. A clock captured before
      // the wait incorrectly treats this new expiry as still in the future.
      await database.query("UPDATE mentoring.grants SET expires_at = clock_timestamp(), version = version + 1, updated_at = clock_timestamp() WHERE id = $1", [grantId]);
    } finally {
      await lock.query("COMMIT").catch(() => undefined);
      lock.release();
      if (pending) result = await pending;
    }
    failed(result, "forbidden");
    assert.equal((await database.query("SELECT count(*)::int AS count FROM mentoring.contacts WHERE id = $1", [command.operationId])).rows[0].count, 0);
  });

  await t.test("a real two-client deadlock retries the entire transaction and both operations finish", async () => {
    const participantId = await create(coordinatorA);
    let mentorReady;
    let assignmentReady;
    const mentorHasMembership = new Promise((resolve) => { mentorReady = resolve; });
    const assignmentHasParticipant = new Promise((resolve) => { assignmentReady = resolve; });
    let mentorAttempts = 0;
    let assignmentAttempts = 0;
    // Reproduce the lock order of a mentor contact racing a CEO reassignment.
    // The first barrier is already resolved if PostgreSQL retries this callback.
    const mentorTransaction = withTransaction(async (client) => {
      mentorAttempts += 1;
      await client.query("SELECT id FROM mentoring.memberships WHERE organization_id = $1 AND id = $2 FOR UPDATE", [organizationId, mentorA.id]);
      mentorReady();
      await assignmentHasParticipant;
      await client.query("SELECT id FROM mentoring.participants WHERE organization_id = $1 AND id = $2 FOR UPDATE", [organizationId, participantId]);
      return "mentor completed";
    });
    await mentorHasMembership;
    const assignmentTransaction = withTransaction(async (client) => {
      assignmentAttempts += 1;
      await client.query("SELECT id FROM mentoring.memberships WHERE organization_id = $1 AND id = $2 FOR UPDATE", [organizationId, ceo.id]);
      await client.query("SELECT id FROM mentoring.participants WHERE organization_id = $1 AND id = $2 FOR UPDATE", [organizationId, participantId]);
      assignmentReady();
      await client.query("SELECT id FROM mentoring.memberships WHERE organization_id = $1 AND id = $2 FOR SHARE", [organizationId, mentorA.id]);
      return "assignment completed";
    });
    assert.deepEqual(await Promise.all([mentorTransaction, assignmentTransaction]), ["mentor completed", "assignment completed"]);
    assert.ok(mentorAttempts + assignmentAttempts >= 3, "PostgreSQL must abort one first attempt and exercise a whole-transaction retry.");
    assert.ok(mentorAttempts <= 3 && assignmentAttempts <= 3, "Retries remain bounded.");
    assert.equal((await state(participantId)).participant.version, 1, "A lock-only retry must not change application data.");
  });

  await t.test("grant expiry after partial writes rolls back the contact, appointment, audit, canonical reminders, and receipt", async () => {
    const participantId = await create(coordinatorA);
    await assign(coordinatorA, participantId, mentorA, coordinatorA);
    accepted(await run(mentorA, await contactCommand(participantId)));
    const before = await state(participantId);
    const remindersBefore = await reminderJobs(participantId);
    const command = await contactCommand(participantId);
    const lock = await database.connect();
    let pending;
    let result;
    try {
      await lock.query("BEGIN");
      await lock.query("SELECT id FROM mentoring.appointments WHERE organization_id = $1 AND id = $2 FOR UPDATE", [organizationId, before.appointment.id]);
      const lockerPid = (await lock.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      const grantId = randomUUID();
      const granted = await database.query("INSERT INTO mentoring.grants (id,organization_id,staff_id,participant_id,actions,expires_at) VALUES ($1,$2,$3,$4,ARRAY['view','edit']::text[],clock_timestamp() + interval '5 seconds') RETURNING expires_at", [grantId, organizationId, mentorB.id, participantId]);
      const expiresAt = granted.rows[0].expires_at.toISOString();
      pending = run(mentorB, command);
      let observedWait = false;
      const deadline = Date.now() + 8_000;
      while (Date.now() < deadline) {
        const blocked = await database.query("SELECT 1 FROM pg_stat_activity WHERE $1::integer = ANY(pg_blocking_pids(pid)) AND query LIKE 'UPDATE mentoring.appointments%'", [lockerPid]);
        if (blocked.rowCount) { observedWait = true; break; }
        await delay(25);
      }
      assert.ok(observedWait, "The contact must reach the appointment update after passing its initial authorization.");
      const remaining = await database.query("SELECT clock_timestamp() < $1::timestamptz AS still_valid", [expiresAt]);
      assert.equal(remaining.rows[0].still_valid, true, "The grant must still be valid when the downstream wait begins.");
      // Keep the appointment locked until the original expiry passes. Updating
      // the grant here would block on the writer's legitimate FOR SHARE lock.
      await lock.query("SELECT pg_sleep(GREATEST(0, EXTRACT(EPOCH FROM ($1::timestamptz - clock_timestamp()))) + 0.1)", [expiresAt]);
    } finally {
      await lock.query("COMMIT").catch(() => undefined);
      lock.release();
      if (pending) result = await pending;
    }
    failed(result, "forbidden");
    const after = await state(participantId);
    assert.equal(after.participant.version, before.participant.version);
    assert.equal(after.appointment.version, before.appointment.version);
    assert.equal(after.appointment.scheduled_at.toISOString(), before.appointment.scheduled_at.toISOString());
    const persisted = await database.query("SELECT (SELECT count(*)::int FROM mentoring.contacts WHERE id = $1) AS contacts, (SELECT count(*)::int FROM mentoring.audit WHERE organization_id = $2 AND actor_id = $3 AND operation_id = $1) AS audits, (SELECT count(*)::int FROM mentoring.reminder_jobs WHERE organization_id = $2 AND last_evaluated_by = $3 AND last_evaluated_operation_id = $1) AS reminders, (SELECT count(*)::int FROM mentoring.operations WHERE organization_id = $2 AND actor_id = $3 AND operation_id = $1) AS receipts, (SELECT count(*)::int FROM mentoring.resource_ids WHERE id = $1) AS resources", [command.operationId, organizationId, mentorB.id]);
    assert.deepEqual(persisted.rows[0], { contacts: 0, audits: 0, reminders: 0, receipts: 0, resources: 0 });
    assert.deepEqual(await reminderJobs(participantId), remindersBefore, "Partial-write failure must roll back canonical job creation and attribution updates.");
  });

  await t.test("an accepted receipt cannot be replayed after its grant expires during the grant lock wait", async () => {
    const participantId = await create(coordinatorA);
    await assign(coordinatorA, participantId, mentorA, coordinatorA);
    const grantId = randomUUID();
    await database.query("INSERT INTO mentoring.grants (id,organization_id,staff_id,participant_id,actions,expires_at) VALUES ($1,$2,$3,$4,ARRAY['view','edit']::text[],clock_timestamp() + interval '1 hour')", [grantId, organizationId, mentorB.id, participantId]);
    const command = await contactCommand(participantId);
    accepted(await run(mentorB, command));
    const before = await state(participantId);
    const remindersBefore = (await database.query("SELECT count(*)::int AS count FROM mentoring.reminder_jobs WHERE organization_id = $1 AND last_evaluated_by = $2 AND last_evaluated_operation_id = $3", [organizationId, mentorB.id, command.operationId])).rows[0].count;
    const jobsBeforeReplay = await reminderJobs(participantId);
    const expiresAt = (await database.query("UPDATE mentoring.grants SET expires_at = clock_timestamp() + interval '5 seconds', version = version + 1, updated_at = clock_timestamp() WHERE id = $1 RETURNING expires_at", [grantId])).rows[0].expires_at.toISOString();
    const lock = await database.connect();
    let pending;
    let result;
    try {
      await lock.query("BEGIN");
      await lock.query("SELECT id FROM mentoring.grants WHERE organization_id = $1 AND id = $2 FOR UPDATE", [organizationId, grantId]);
      const lockerPid = (await lock.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      pending = run(mentorB, command);
      let observedWait = false;
      const deadline = Date.now() + 8_000;
      while (Date.now() < deadline) {
        const blocked = await database.query("SELECT 1 FROM pg_stat_activity WHERE $1::integer = ANY(pg_blocking_pids(pid)) AND query LIKE 'SELECT * FROM mentoring.grants%'", [lockerPid]);
        if (blocked.rowCount) { observedWait = true; break; }
        await delay(25);
      }
      assert.ok(observedWait, "The accepted operation must reach its current grant lock before replaying the receipt.");
      assert.equal((await database.query("SELECT clock_timestamp() < $1::timestamptz AS still_valid", [expiresAt])).rows[0].still_valid, true);
      await lock.query("SELECT pg_sleep(GREATEST(0, EXTRACT(EPOCH FROM ($1::timestamptz - clock_timestamp()))) + 0.1)", [expiresAt]);
    } finally {
      await lock.query("COMMIT").catch(() => undefined);
      lock.release();
      if (pending) result = await pending;
    }
    failed(result, "forbidden");
    const after = await state(participantId);
    assert.equal(after.participant.version, before.participant.version);
    assert.equal(after.appointment.version, before.appointment.version);
    const persisted = await database.query("SELECT (SELECT count(*)::int FROM mentoring.contacts WHERE id = $1) AS contacts, (SELECT count(*)::int FROM mentoring.audit WHERE organization_id = $2 AND actor_id = $3 AND operation_id = $1) AS audits, (SELECT count(*)::int FROM mentoring.reminder_jobs WHERE organization_id = $2 AND last_evaluated_by = $3 AND last_evaluated_operation_id = $1) AS reminders, (SELECT count(*)::int FROM mentoring.operations WHERE organization_id = $2 AND actor_id = $3 AND operation_id = $1) AS receipts", [command.operationId, organizationId, mentorB.id]);
    assert.deepEqual(persisted.rows[0], { contacts: 1, audits: 1, reminders: remindersBefore, receipts: 1 });
    assert.deepEqual(await reminderJobs(participantId), jobsBeforeReplay);
  });

  await t.test("reassignment preserves cadence and the appointment time while transferring responsibility", async () => {
    const participantId = await create(coordinatorA);
    await assign(coordinatorA, participantId, mentorA, coordinatorA);
    accepted(await run(mentorA, await contactCommand(participantId)));
    const before = await state(participantId);
    // Replacing even a same-team mentor now requires the CEO; a coordinator's
    // initial matching permission must not become an ongoing replacement right.
    const sameTeamReplacement = await addStaff("mentor", coordinatorA.id);
    failed(await run(coordinatorA, { type: "assign_participant", operationId: randomUUID(), participantId, expectedVersion: before.participant.version, mentorId: sameTeamReplacement.id, coordinatorId: coordinatorA.id }), "forbidden");
    const afterDeniedReplacement = await state(participantId);
    assert.equal(afterDeniedReplacement.participant.version, before.participant.version);
    assert.equal(afterDeniedReplacement.assignment.id, before.assignment.id);
    assert.equal(afterDeniedReplacement.appointment.version, before.appointment.version);
    await assign(ceo, participantId, mentorB, coordinatorB);
    const after = await state(participantId);
    assert.equal(after.assignment.followup_anchor_at.toISOString(), before.assignment.followup_anchor_at.toISOString());
    assert.equal(after.appointment.scheduled_at.toISOString(), before.appointment.scheduled_at.toISOString());
    assert.equal(after.appointment.mentor_id, mentorB.id);
    assert.equal(after.appointment.version, before.appointment.version + 1);
    assert.equal(after.assignment.mentor_id, mentorB.id);
    assert.equal(after.assignment.version, before.assignment.version + 1);
    failed(await run(mentorA, await contactCommand(participantId)), "forbidden");
    const nextContact = await contactCommand(participantId);
    accepted(await run(mentorB, nextContact));
    await database.query("UPDATE mentoring.memberships SET active = false WHERE id = $1", [mentorB.id]);
    failed(await run(mentorB, nextContact), "not_staff");
  });
});
