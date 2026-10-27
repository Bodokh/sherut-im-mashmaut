import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { commandHash } from "../../../lib/mentoring/server/validation.ts";
import { executeCommand } from "../../../lib/mentoring/server/commands.ts";
import { getDatabasePool, ORGANIZATION_ID } from "../../../lib/mentoring/server/db.ts";

// A transaction double exercises the actual command boundary without a provider
// or database. Receipt keys and authorization queries are checked explicitly.
process.env.MENTORING_DATABASE_URL = "postgres://unused:unused@localhost/unused";
const pool = getDatabasePool();
const originalConnect = pool.connect;
const actorId = randomUUID();
const participantId = randomUUID();
const now = "2026-10-27T08:00:00.000Z";
let actor;
let receipt;
let queriedReceipt;
let writes;

function reset(role = "ceo") {
  actor = { id: actorId, organization_id: ORGANIZATION_ID, auth_user_id: "staff", display_name: "Staff", role, active: true, version: 1 };
  receipt = null;
  queriedReceipt = false;
  writes = [];
}
const client = {
  async query(sql, params = []) {
    if (/^(BEGIN|COMMIT|ROLLBACK|SET LOCAL)/.test(sql)) return { rows: [], rowCount: 0 };
    if (sql.includes("FROM mentoring.memberships WHERE organization_id = $1 AND auth_user_id")) return { rows: actor && params[1] === actor.auth_user_id ? [actor] : [] };
    if (sql.includes("FROM mentoring.participants WHERE organization_id = $1 AND id = $2")) return { rows: [{ id: participantId, organization_id: ORGANIZATION_ID, display_name: "P", lifecycle: "active", version: 1, created_at: now, created_by: randomUUID() }] };
    if (/FROM mentoring\.(assignments|appointments|contacts|reviews|ceo_protections|grants)/.test(sql)) return { rows: [] };
    if (sql.includes("clock_timestamp() AS now")) return { rows: [{ now }] };
    if (sql.includes("FROM mentoring.operations")) {
      queriedReceipt = true;
      assert.deepEqual(params, [ORGANIZATION_ID, actorId, receipt?.operationId ?? params[2]]);
      return { rows: receipt && params[2] === receipt.operationId ? [receipt] : [] };
    }
    writes.push(sql);
    throw new Error(`Unexpected write or query: ${sql}`);
  },
  release() {},
};
pool.connect = async () => client;
test.after(() => { pool.connect = originalConnect; });
const run = (command, user = "staff") => executeCommand(user, null, command);
function acceptedReceipt(command) {
  receipt = { operationId: command.operationId, payload_hash: commandHash(command), response: { ok: true, operationId: command.operationId, acceptance: "accepted", replayed: false } };
}

for (const type of ["create_participant", "update_participant", "create_staff", "update_staff"]) {
  test(`legacy ${type} retries retain trimmed raw and invalid phone receipts`, async () => {
    for (const phone of ["0501234567", "not-a-phone", ""]) {
      reset();
      const operationId = randomUUID();
      const fields = type === "create_staff" ? { displayName: "Staff", email: "staff@example.org", role: "mentor", coordinatorId: null, phone } : { phone };
      const command = { type, operationId, fields, ...(type === "update_participant" ? { participantId, expectedVersion: 1 } : {}), ...(type === "update_staff" ? { staffId: randomUUID(), expectedVersion: 1 } : {}) };
      acceptedReceipt(command);
      const response = await run({ ...command, fields: { ...fields, phone: `  ${phone}  ` } });
      assert.equal(response.ok, true, JSON.stringify(response));
      assert.equal(response.replayed, true);
      assert.deepEqual(writes, []);
      const changed = await run({ ...command, fields: { ...fields, phone: "0501234568" } });
      assert.equal(changed.error?.code, "conflict");
    }
  });
}

test("invalid new phone is rejected without creating a receipt", async () => {
  reset();
  const response = await run({ type: "create_participant", operationId: randomUUID(), fields: { phone: "bad" } });
  assert.equal(response.error?.code, "validation");
  assert.equal(queriedReceipt, true);
  assert.deepEqual(writes, []);
});

test("receipt comparison preserves non-phone payload identity and current normalized retries", async () => {
  reset();
  const operationId = randomUUID();
  const command = { type: "create_participant", operationId, fields: { displayName: "שרה", phone: "+972501234567" } };
  acceptedReceipt(command);
  assert.equal((await run({ ...command, fields: { ...command.fields, phone: "050-123-4567" } })).replayed, true);
  const changed = await run({ ...command, fields: { ...command.fields, displayName: "רחל" } });
  assert.equal(changed.error?.code, "conflict");
  assert.deepEqual(writes, []);
});

test("legacy receipt cannot bypass identity, role or current participant scope", async () => {
  reset();
  const create = { type: "create_participant", operationId: randomUUID(), fields: { phone: "bad" } };
  acceptedReceipt(create);
  assert.equal((await run(create, "different-user")).error?.code, "not_staff");
  assert.equal(queriedReceipt, false);
  actor.active = false;
  assert.equal((await run(create)).error?.code, "not_staff");
  reset("mentor");
  acceptedReceipt(create);
  assert.equal((await run(create)).error?.code, "forbidden");
  assert.equal(queriedReceipt, false);
  const update = { type: "update_participant", operationId: randomUUID(), participantId, expectedVersion: 1, fields: { phone: "bad" } };
  acceptedReceipt(update);
  assert.equal((await run(update)).error?.code, "forbidden");
  assert.equal(queriedReceipt, false);
  assert.deepEqual(writes, []);
});
