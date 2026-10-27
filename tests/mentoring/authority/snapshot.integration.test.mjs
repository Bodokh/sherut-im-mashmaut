import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import test from "node:test";
import { Pool } from "pg";
import "../server/typescript-loader.mjs";

const enabled = process.env.MENTORING_INTEGRATION_TESTS === "1";
const organizationId = "11111111-1111-4111-8111-111111111111";

test("real snapshots redact CEO administration and deny a tombstoned creator's receipt", { skip: !enabled, timeout: 90_000 }, async (t) => {
  assert.notEqual(process.env.NODE_ENV, "production");
  assert.ok(process.execArgv.includes("--conditions=react-server"));
  const envFile = new URL("../../../.env.local", import.meta.url);
  if (!process.env.MENTORING_DATABASE_URL && existsSync(envFile)) loadEnvFile(envFile);
  assert.ok(process.env.MENTORING_DATABASE_URL, "Use an already migrated development database.");
  const { executeCommand } = await import("../../../lib/mentoring/server/commands.ts");
  const { getWorkspace } = await import("../../../lib/mentoring/server/repository.ts");
  const { getDatabasePool } = await import("../../../lib/mentoring/server/db.ts");
  const database = new Pool({ connectionString: process.env.MENTORING_DATABASE_URL_UNPOOLED ?? process.env.MENTORING_DATABASE_URL, max: 1, connectionTimeoutMillis: 10_000 });
  try {
    const preflight = await database.query("SELECT (SELECT count(*)::int FROM mentoring.participants) AS participants, to_regclass('mentoring.reminder_attempts') IS NOT NULL AS migrated");
    assert.equal(preflight.rows[0].participants, 0, "Requires the reserved empty participant baseline.");
    assert.equal(preflight.rows[0].migrated, true);
  } catch {
    await database.end();
    throw new Error("The migrated development database is unavailable or is not empty. No fixtures were written.");
  }

  const runId = randomUUID();
  const member = (role) => ({ id: randomUUID(), authUserId: `snapshot_test_${randomUUID()}`, email: `${randomUUID()}@mentoring-tests.invalid`, role });
  const ceo = member("ceo");
  const coordinator = member("coordinator");
  const mentor = member("mentor");
  const staffIds = [ceo.id, coordinator.id, mentor.id];
  const participantId = randomUUID();
  const ownUnassignedId = randomUUID();
  const participantIds = [participantId, ownUnassignedId];
  const grantReason = `CEO grant reason ${runId}`;
  const protectionReason = `CEO protection reason ${runId}`;
  const run = (actor, command) => executeCommand(actor.authUserId, actor.email, command);
  const accepted = (result) => {
    assert.equal(result.ok, true, result.ok ? undefined : `${result.error.code}: ${result.error.message}`);
    return result;
  };

  t.after(async () => {
    const cleanup = await database.connect();
    try {
      await cleanup.query("BEGIN");
      for (const table of ["reminder_attempts", "reminder_jobs", "outbox", "audit", "conflicts", "review_events", "contact_revisions", "appointment_history", "manual_color_history"]) {
        await cleanup.query(`DELETE FROM mentoring.${table} WHERE organization_id=$1 AND participant_id=ANY($2::uuid[])`, [organizationId, participantIds]);
      }
      await cleanup.query("DELETE FROM mentoring.reviews WHERE organization_id=$1 AND contact_id IN (SELECT id FROM mentoring.contacts WHERE organization_id=$1 AND participant_id=ANY($2::uuid[]))", [organizationId, participantIds]);
      await cleanup.query("DELETE FROM mentoring.ceo_protections WHERE organization_id=$1 AND (resource_id=ANY($2::uuid[]) OR resource_id IN (SELECT id FROM mentoring.contacts WHERE organization_id=$1 AND participant_id=ANY($2::uuid[])))", [organizationId, participantIds]);
      for (const table of ["grants", "appointments", "contacts", "assignments"]) await cleanup.query(`DELETE FROM mentoring.${table} WHERE organization_id=$1 AND participant_id=ANY($2::uuid[])`, [organizationId, participantIds]);
      await cleanup.query("DELETE FROM mentoring.participants WHERE organization_id=$1 AND id=ANY($2::uuid[])", [organizationId, participantIds]);
      await cleanup.query("DELETE FROM mentoring.resource_ids WHERE organization_id=$1 AND id=ANY($2::uuid[])", [organizationId, participantIds]);
      await cleanup.query("DELETE FROM mentoring.operations WHERE organization_id=$1 AND actor_id=ANY($2::uuid[])", [organizationId, staffIds]);
      await cleanup.query("DELETE FROM mentoring.memberships WHERE organization_id=$1 AND id=ANY($2::uuid[])", [organizationId, staffIds]);
      await cleanup.query("COMMIT");
    } catch {
      await cleanup.query("ROLLBACK").catch(() => undefined);
      throw new Error(`Snapshot fixture cleanup failed. Remove only fixture run ${runId}.`);
    } finally {
      cleanup.release();
      await database.end();
      await getDatabasePool().end();
    }
  });

  for (const person of [ceo, coordinator, mentor]) await database.query("INSERT INTO mentoring.memberships (id,organization_id,auth_user_id,email,display_name,role,coordinator_id) VALUES ($1,$2,$3,$4,$5,$6,$7)", [person.id, organizationId, person.authUserId, person.email, `בדיקת סודיות ${runId} ${person.role}`, person.role, person === mentor ? coordinator.id : null]);
  await database.query("INSERT INTO mentoring.resource_ids (id,organization_id,kind) VALUES ($1,$2,'participant')", [participantId, organizationId]);
  await database.query("INSERT INTO mentoring.participants (id,organization_id,display_name,created_by) VALUES ($1,$2,$3,$4)", [participantId, organizationId, `בדיקת סודיות ${runId}`, coordinator.id]);
  await database.query("INSERT INTO mentoring.assignments (id,organization_id,participant_id,mentor_id,coordinator_id) VALUES ($1,$2,$3,$4,$5)", [randomUUID(), organizationId, participantId, mentor.id, coordinator.id]);
  for (const staffId of staffIds) await database.query("INSERT INTO mentoring.grants (id,organization_id,staff_id,participant_id,actions,granted_by_staff_id,reason) VALUES ($1,$2,$3,$4,ARRAY['view','edit']::text[],$5,$6)", [randomUUID(), organizationId, staffId, participantId, ceo.id, grantReason]);
  await database.query("INSERT INTO mentoring.ceo_protections (organization_id,resource_id,protected_by_staff_id,protected_revision,field_paths,reason) VALUES ($1,$2,$3,1,ARRAY['manualColor']::text[],$4)", [organizationId, participantId, ceo.id, protectionReason]);
  for (const [action, reason] of [["set_access_grant", grantReason], ["set_ceo_protection", protectionReason], ["assign_participant", null]]) {
    const operationId = randomUUID();
    await database.query("INSERT INTO mentoring.operations (organization_id,actor_id,operation_id,payload_hash,response) VALUES ($1,$2,$3,$4,$5::jsonb)", [organizationId, ceo.id, operationId, "0".repeat(64), JSON.stringify({ ok: true, operationId, acceptance: "accepted", replayed: false, participantId })]);
    await database.query("INSERT INTO mentoring.audit (id,organization_id,actor_id,operation_id,action,participant_id,details) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)", [randomUUID(), organizationId, ceo.id, operationId, action, participantId, JSON.stringify({ reason })]);
  }

  await t.test("same authorized participant has role-specific metadata in actual repository snapshots", async () => {
    for (const actor of [ceo, coordinator, mentor]) {
      const snapshot = await getWorkspace(actor.authUserId, actor.email);
      const view = snapshot.participants.find((entry) => entry.participant.id === participantId);
      assert.ok(view, "Each role is authorized to view the exact same participant.");
      const serialized = JSON.stringify(snapshot);
      if (actor === ceo) {
        assert.equal(view.accessGrants.length, 3);
        assert.ok(view.accessGrants.every((grant) => grant.reason === grantReason));
        assert.equal(view.protectionStates[0].reason, protectionReason);
        for (const action of ["set_access_grant", "set_ceo_protection", "assign_participant"]) assert.ok(view.authorityHistory.some((entry) => entry.action === action));
        assert.ok(serialized.includes(grantReason));
        assert.ok(serialized.includes(protectionReason));
      } else {
        assert.deepEqual(view.accessGrants.map((grant) => grant.staffId), [actor.id], "Other staff members' grants must stay private.");
        assert.ok(view.accessGrants.every((grant) => grant.reason == null), "Even a person's own grant must not disclose the CEO reason.");
        assert.ok(view.protectionStates.every((protection) => protection.reason == null));
        assert.equal(serialized.includes(grantReason), false, "Grant reasons cannot leak through another snapshot field.");
        assert.equal(serialized.includes(protectionReason), false, "Protection reasons cannot leak through another snapshot field.");
        if (actor === mentor) assert.deepEqual(view.authorityHistory, []);
        else assert.deepEqual(view.authorityHistory.map((entry) => entry.action), ["assign_participant"], "Coordinator history retains assignment evidence but excludes grant/protection administration.");
      }
    }
  });

  await t.test("an unassigned coordinator creator cannot replay an update receipt after CEO deletion", async () => {
    accepted(await run(coordinator, { type: "create_participant", operationId: ownUnassignedId, fields: { displayName: `בדיקת יוצר ${runId}` } }));
    const beforeDeletion = { type: "update_participant", operationId: randomUUID(), participantId: ownUnassignedId, expectedVersion: 1, fields: { profileNotes: "עדכון מקורי לפני מחיקה" } };
    accepted(await run(coordinator, beforeDeletion));
    accepted(await run(ceo, { type: "delete_participant", operationId: randomUUID(), participantId: ownUnassignedId, expectedVersion: 2, reason: "מחיקת בדיקת יוצר" }));
    const replay = await run(coordinator, beforeDeletion);
    assert.equal(replay.ok, false);
    assert.equal(replay.error.code, "forbidden");
    assert.equal((await getWorkspace(coordinator.authUserId, coordinator.email)).participants.some((entry) => entry.participant.id === ownUnassignedId), false);
    const persisted = (await database.query("SELECT deleted_at,version FROM mentoring.participants WHERE organization_id=$1 AND id=$2", [organizationId, ownUnassignedId])).rows[0];
    assert.ok(persisted.deleted_at);
    assert.equal(persisted.version, 3);
    assert.equal((await database.query("SELECT count(*)::int AS count FROM mentoring.operations WHERE organization_id=$1 AND actor_id=$2 AND operation_id=$3", [organizationId, coordinator.id, beforeDeletion.operationId])).rows[0].count, 1, "The original receipt stays preserved without authorizing replay.");
  });
});
