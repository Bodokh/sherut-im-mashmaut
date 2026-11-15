import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import test from "node:test";
import { Pool } from "pg";
import "../server/typescript-loader.mjs";

const enabled = process.env.MENTORING_INTEGRATION_TESTS === "1";
const organizationId = "11111111-1111-4111-8111-111111111111";

test("real PostgreSQL tracking cards, coordinator scope and staff contact masking", { skip: !enabled, timeout: 120_000 }, async (t) => {
  assert.notEqual(process.env.NODE_ENV, "production", "The fixture suite cannot run in production.");
  assert.ok(process.execArgv.includes("--conditions=react-server"), "Run with --conditions=react-server.");
  const envFile = new URL("../../../.env.local", import.meta.url);
  if (!process.env.MENTORING_DATABASE_URL && existsSync(envFile)) loadEnvFile(envFile);
  assert.ok(process.env.MENTORING_DATABASE_URL, "An already migrated development database is required.");
  const { executeCommand } = await import("../../../lib/mentoring/server/commands.ts");
  const { getWorkspace } = await import("../../../lib/mentoring/server/repository.ts");
  const { getDatabasePool } = await import("../../../lib/mentoring/server/db.ts");
  const database = new Pool({ connectionString: process.env.MENTORING_DATABASE_URL_UNPOOLED ?? process.env.MENTORING_DATABASE_URL, max: 3, connectionTimeoutMillis: 10_000 });
  try {
    const schema = await database.query("SELECT to_regclass('mentoring.tracking_cards') IS NOT NULL AS cards, to_regclass('mentoring.tracking_reports') IS NOT NULL AS reports");
    assert.equal(schema.rows[0].cards && schema.rows[0].reports, true, "Apply every mentoring migration before opting in. This suite never migrates.");
    assert.equal((await database.query("SELECT count(*)::int AS count FROM mentoring.participants")).rows[0].count, 0, "Run only in the reserved empty development-database window.");
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
    assert.equal(result.ok, false, "The operation must not be accepted.");
    assert.equal(result.error.code, code);
    return result.error;
  };
  async function addStaff(role, coordinatorId = null) {
    const person = { id: randomUUID(), authUserId: `tracking_test_${randomUUID()}`, email: `${randomUUID()}@mentoring-tests.invalid`, phone: `05${Math.floor(10000000 + Math.random() * 89999999)}`, role };
    staff.push(person);
    await database.query("INSERT INTO mentoring.memberships (id,organization_id,auth_user_id,email,display_name,phone,role,coordinator_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [person.id, organizationId, person.authUserId, person.email, `בדיקת מעקב ${runId} ${role}`, person.phone, role, coordinatorId]);
    return person;
  }
  async function mentee(owner, mentor, coordinator) {
    const id = randomUUID();
    participantIds.push(id);
    accepted(await run(owner, { type: "create_participant", operationId: id, fields: { displayName: `בדיקת מעקב ${runId}` } }));
    accepted(await run(owner, { type: "assign_participant", operationId: randomUUID(), participantId: id, expectedVersion: 1, mentorId: mentor.id, coordinatorId: coordinator.id }));
    return id;
  }
  const count = async (table, column, ids) => (await database.query(`SELECT count(*)::int AS count FROM mentoring.${table} WHERE organization_id=$1 AND ${column}=ANY($2::uuid[])`, [organizationId, ids])).rows[0].count;
  const saveCard = (actor, subject, expectedCardVersion, fields = {}) => run(actor, { type: "save_tracking_card", operationId: randomUUID(), subject, expectedCardVersion, fields: { status: "orange", notes: `כרטיס ${runId}`, nextFollowupAt: null, ...fields } });
  const report = (actor, subject, notes = `דיווח ${runId}`) => run(actor, { type: "record_tracking_report", operationId: randomUUID(), subject, method: "phone", outcome: "completed", occurredAt: new Date(Date.now() - 60_000).toISOString(), notes });

  t.after(async () => {
    const staffIds = staff.map((person) => person.id);
    const cleanup = await database.connect();
    try {
      await cleanup.query("BEGIN");
      await cleanup.query("DELETE FROM mentoring.tracking_reports WHERE organization_id=$1 AND (participant_id=ANY($2::uuid[]) OR mentor_id=ANY($3::uuid[]) OR author_id=ANY($3::uuid[]))", [organizationId, participantIds, staffIds]);
      await cleanup.query("DELETE FROM mentoring.tracking_cards WHERE organization_id=$1 AND (participant_id=ANY($2::uuid[]) OR mentor_id=ANY($3::uuid[]) OR updated_by=ANY($3::uuid[]))", [organizationId, participantIds, staffIds]);
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
      throw new Error(`Tracking fixture cleanup failed. Remove only test run ${runId}.`);
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
  const menteeA = await mentee(ceo, mentorA, coordinatorA);
  const menteeB = await mentee(ceo, mentorB, coordinatorB);
  const subjectOf = (id) => ({ kind: "mentee", participantId: id });
  const mentorSubject = (person) => ({ kind: "mentor", staffId: person.id });

  await t.test("mentors can neither read nor write tracking cards", async () => {
    denied(await saveCard(mentorA, subjectOf(menteeA), null), "forbidden");
    denied(await report(mentorA, subjectOf(menteeA)), "forbidden");
    denied(await saveCard(mentorA, mentorSubject(mentorA), null), "forbidden");
    assert.equal((await getWorkspace(mentorA.authUserId, mentorA.email)).trackingCards, undefined);
    assert.equal(await count("tracking_cards", "participant_id", participantIds), 0);
  });

  await t.test("a coordinator fills the card of a mentee under her and sees it, with optimistic versions", async () => {
    const first = accepted(await saveCard(coordinatorA, subjectOf(menteeA), null, { status: "red" }));
    assert.equal(first.participantId, menteeA);
    let card = (await getWorkspace(coordinatorA.authUserId, coordinatorA.email)).trackingCards.find((item) => item.subjectId === menteeA);
    assert.equal(card.version, 1);
    assert.equal(card.status, "red");
    denied(await saveCard(coordinatorA, subjectOf(menteeA), null), "conflict");
    accepted(await saveCard(coordinatorA, subjectOf(menteeA), 1, { status: "green" }));
    accepted(await report(coordinatorA, subjectOf(menteeA)));
    card = (await getWorkspace(ceo.authUserId, ceo.email)).trackingCards.find((item) => item.subjectId === menteeA);
    assert.equal(card.version, 2);
    assert.equal(card.status, "green");
    assert.equal(card.reports.length, 1);
    assert.equal(card.reports[0].authorId, coordinatorA.id);
  });

  await t.test("another coordinator cannot read or write a mentee outside her team", async () => {
    denied(await saveCard(coordinatorB, subjectOf(menteeA), 2), "forbidden");
    denied(await report(coordinatorB, subjectOf(menteeA)), "forbidden");
    const workspace = await getWorkspace(coordinatorB.authUserId, coordinatorB.email);
    assert.equal(workspace.trackingCards.some((item) => item.subjectId === menteeA), false);
    assert.equal(workspace.participants.some((view) => view.participant.id === menteeA), false);
  });

  await t.test("mentor cards are limited to the coordinator's own team while the CEO covers everyone", async () => {
    accepted(await saveCard(coordinatorA, mentorSubject(mentorA), null));
    accepted(await report(coordinatorA, mentorSubject(mentorA)));
    denied(await saveCard(coordinatorA, mentorSubject(mentorB), null), "forbidden");
    denied(await report(coordinatorA, mentorSubject(mentorB)), "forbidden");
    denied(await saveCard(coordinatorA, mentorSubject(coordinatorB), null), "not_found");
    accepted(await saveCard(ceo, mentorSubject(mentorB), null));
    const own = (await getWorkspace(coordinatorA.authUserId, coordinatorA.email)).trackingCards.filter((item) => item.kind === "mentor");
    assert.deepEqual(own.map((item) => item.subjectId), [mentorA.id]);
    const all = (await getWorkspace(ceo.authUserId, ceo.email)).trackingCards.filter((item) => item.kind === "mentor").map((item) => item.subjectId).sort();
    assert.deepEqual(all, [mentorA.id, mentorB.id].sort());
  });

  await t.test("coordinators see contact details of their own mentors only; mentors see no colleague contacts", async () => {
    const asCoordinator = (await getWorkspace(coordinatorA.authUserId, coordinatorA.email)).staff;
    const own = asCoordinator.find((person) => person.id === mentorA.id);
    assert.equal(own.phone, mentorA.phone);
    assert.equal(own.email, mentorA.email);
    const other = asCoordinator.find((person) => person.id === mentorB.id);
    assert.equal(other.phone, null);
    assert.equal(other.email, null);
    const asMentor = (await getWorkspace(mentorA.authUserId, mentorA.email)).staff;
    assert.equal(asMentor.find((person) => person.id === mentorA.id).phone, mentorA.phone);
    assert.equal(asMentor.find((person) => person.id === coordinatorA.id).phone, null);
    const asCeo = (await getWorkspace(ceo.authUserId, ceo.email)).staff;
    assert.equal(asCeo.find((person) => person.id === mentorB.id).phone, mentorB.phone);
  });

  await t.test("a coordinator reports a contact on behalf of her mentor's mentee, but not outside her team", async () => {
    const contactFor = (id, version) => ({ type: "record_contact", operationId: randomUUID(), participantId: id, expectedVersion: version, expectedAppointmentVersion: null, method: "phone", outcome: "completed", occurredAt: new Date(Date.now() - 60_000).toISOString(), notes: `בדיקת קשר ${runId}`, nextAppointmentAt: new Date(Date.now() + 86_400_000).toISOString() });
    const versionOf = async (id) => (await database.query("SELECT version FROM mentoring.participants WHERE organization_id=$1 AND id=$2", [organizationId, id])).rows[0].version;
    accepted(await run(coordinatorA, contactFor(menteeA, await versionOf(menteeA))));
    denied(await run(coordinatorA, contactFor(menteeB, await versionOf(menteeB))), "forbidden");
  });

  await t.test("assigning a mentor requires the coordinator who leads that mentor's team", async () => {
    const version = (await database.query("SELECT version FROM mentoring.participants WHERE organization_id=$1 AND id=$2", [organizationId, menteeB])).rows[0].version;
    const mismatch = denied(await run(ceo, { type: "assign_participant", operationId: randomUUID(), participantId: menteeB, expectedVersion: version, mentorId: mentorA.id, coordinatorId: coordinatorB.id }), "validation");
    assert.equal(mismatch.field, "mentorId");
  });

  await t.test("permanent deletion removes the mentee's tracking card and reports", async () => {
    assert.ok(await count("tracking_cards", "participant_id", [menteeA]) >= 1);
    assert.ok(await count("tracking_reports", "participant_id", [menteeA]) >= 1);
    const version = (await database.query("SELECT version,display_name FROM mentoring.participants WHERE organization_id=$1 AND id=$2", [organizationId, menteeA])).rows[0];
    accepted(await run(ceo, { type: "permanently_delete_participant", operationId: randomUUID(), participantId: menteeA, expectedVersion: version.version, reason: `בדיקה ${runId}`, confirmationName: version.display_name }));
    assert.equal(await count("tracking_cards", "participant_id", [menteeA]), 0);
    assert.equal(await count("tracking_reports", "participant_id", [menteeA]), 0);
    assert.equal(await count("tracking_cards", "mentor_id", [mentorA.id]), 1, "A mentor's own card is not affected by a mentee purge.");
  });
});
