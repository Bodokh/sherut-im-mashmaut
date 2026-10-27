import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import pg from "pg";

if (process.env.MENTORING_QA_WRITES !== "approved") throw new Error("Explicit development fixture cleanup approval is required.");
if (process.env.NODE_ENV === "production" || (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "development")) throw new Error("Production cleanup is prohibited.");
if (!process.env.MENTORING_DATABASE_URL) loadEnvFile(new URL("../../../.env.local", import.meta.url));
assert.ok(process.env.CLERK_SECRET_KEY?.startsWith("sk_test_"));
assert.equal(process.env.MENTORING_NEON_PROJECT_ID, "round-firefly-59684866");
const file = process.argv[2];
if (!file) throw new Error("Pass the exact test-run recovery manifest path.");
const manifest = JSON.parse(await readFile(file, "utf8"));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
assert.match(manifest.runId, /^[0-9a-f]{8}$/);
assert.match(manifest.actorId, uuid);
for (const name of ["participantIds", "staffIds", "resourceIds", "operationIds"]) {
  assert.ok(Array.isArray(manifest[name]));
  for (const id of manifest[name]) assert.match(id, uuid);
}
const { runId, actorId, participantIds, staffIds, resourceIds, operationIds } = manifest;
const org = "11111111-1111-4111-8111-111111111111";
const database = new pg.Client({ connectionString: process.env.MENTORING_DATABASE_URL_UNPOOLED ?? process.env.MENTORING_DATABASE_URL, connectionTimeoutMillis: 10_000 });
await database.connect();
try {
  await database.query("BEGIN");
  const owner = await database.query("SELECT email FROM mentoring.memberships WHERE organization_id=$1 AND id=$2 FOR UPDATE", [org, actorId]);
  assert.equal(owner.rows[0]?.email, "mentoring-owner+clerk_test@example.com");
  const ownedParticipants = await database.query("SELECT id,created_by,display_name FROM mentoring.participants WHERE organization_id=$1 AND id=ANY($2::uuid[]) FOR UPDATE", [org, participantIds]);
  for (const row of ownedParticipants.rows) {
    assert.equal(row.created_by, actorId);
    assert.equal(row.display_name, `בדיקת דפדפן ${runId} חניכה`);
  }
  const ownedStaff = await database.query("SELECT id,auth_user_id,display_name FROM mentoring.memberships WHERE organization_id=$1 AND id=ANY($2::uuid[]) FOR UPDATE", [org, staffIds]);
  for (const row of ownedStaff.rows) {
    assert.equal(row.auth_user_id, null);
    assert.ok(row.display_name === `בדיקת דפדפן ${runId} רכזת` || row.display_name === `בדיקת דפדפן ${runId} חונכת`);
    assert.notEqual(row.id, actorId);
  }
  const ownedResources = await database.query("SELECT r.id,r.kind,p.created_by,p.display_name,c.participant_id FROM mentoring.resource_ids r LEFT JOIN mentoring.participants p ON p.organization_id=r.organization_id AND p.id=r.id LEFT JOIN mentoring.contacts c ON c.organization_id=r.organization_id AND c.id=r.id WHERE r.organization_id=$1 AND r.id=ANY($2::uuid[]) FOR UPDATE OF r", [org, resourceIds]);
  for (const row of ownedResources.rows) {
    if (row.kind === "participant") { assert.equal(row.created_by, actorId); assert.equal(row.display_name, `בדיקת דפדפן ${runId} חניכה`); }
    else assert.ok(ownedParticipants.rows.some((participant) => participant.id === row.participant_id));
  }
  await database.query("DELETE FROM mentoring.outbox WHERE organization_id=$1 AND participant_id=ANY($2::uuid[])", [org, participantIds]);
  await database.query("DELETE FROM mentoring.audit WHERE organization_id=$1 AND actor_id=$2 AND operation_id=ANY($3::uuid[])", [org, actorId, operationIds]);
  await database.query("DELETE FROM mentoring.conflicts WHERE organization_id=$1 AND participant_id=ANY($2::uuid[])", [org, participantIds]);
  await database.query("DELETE FROM mentoring.reviews WHERE organization_id=$1 AND contact_id IN (SELECT id FROM mentoring.contacts WHERE organization_id=$1 AND participant_id=ANY($2::uuid[]))", [org, participantIds]);
  await database.query("DELETE FROM mentoring.ceo_protections WHERE organization_id=$1 AND resource_id=ANY($2::uuid[])", [org, resourceIds]);
  for (const table of ["grants", "appointments", "contacts", "assignments"]) await database.query(`DELETE FROM mentoring.${table} WHERE organization_id=$1 AND participant_id=ANY($2::uuid[])`, [org, participantIds]);
  await database.query("DELETE FROM mentoring.participants WHERE organization_id=$1 AND id=ANY($2::uuid[])", [org, participantIds]);
  await database.query("DELETE FROM mentoring.resource_ids WHERE organization_id=$1 AND id=ANY($2::uuid[])", [org, resourceIds]);
  await database.query("DELETE FROM mentoring.operations WHERE organization_id=$1 AND actor_id=$2 AND operation_id=ANY($3::uuid[])", [org, actorId, operationIds]);
  await database.query("DELETE FROM mentoring.memberships WHERE organization_id=$1 AND id=ANY($2::uuid[])", [org, staffIds]);
  await database.query("COMMIT");
  console.log(JSON.stringify({ cleanup: "passed", runId, removedParticipants: ownedParticipants.rowCount, removedStaff: ownedStaff.rowCount, approvedQACeoPreserved: true }));
} catch {
  await database.query("ROLLBACK").catch(() => {});
  throw new Error("Fixture ownership checks or cleanup failed. No partial cleanup was committed.");
} finally { await database.end(); }
