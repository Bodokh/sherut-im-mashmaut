import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Client } from "pg";

const connectionString = process.env.MENTORING_PERMISSIONS_MIGRATION_TEST_URL;

test("explicit protection migration reconciles supported automatic locks without deleting history", { skip: !connectionString, timeout: 30_000 }, async () => {
  assert.notEqual(process.env.NODE_ENV, "production");
  const target = new URL(connectionString);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname), "Use a disposable local database.");
  assert.ok(["/mentoringqa", "/mentoring_permissions_migration_test"].includes(target.pathname), "Use the dedicated permissions migration test database.");
  const client = new Client({ connectionString, connectionTimeoutMillis: 5_000, query_timeout: 15_000 });
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(client.connectionParameters.host), "Connection-string options must not override the local host guard.");
  assert.ok(["mentoringqa", "mentoring_permissions_migration_test"].includes(client.connectionParameters.database), "Connection-string options must not override the dedicated database guard.");
  await client.connect();
  try {
    await client.query("BEGIN");
    const baseline = await client.query("SELECT count(*)::int AS count FROM mentoring.participants");
    assert.equal(baseline.rows[0].count, 0, "Reserve an empty migrated 001–011 participant baseline.");
    const organizationId = "11111111-1111-4111-8111-111111111111";
    const ceo = randomUUID();
    const otherCeo = randomUUID();
    const at = "2026-11-11T10:00:00.000Z";
    await client.query("INSERT INTO mentoring.memberships(id,organization_id,display_name,role) VALUES($1,$3,'Protection migration CEO','ceo'),($2,$3,'Prior protection CEO','ceo')", [ceo, otherCeo, organizationId]);
    async function card(name) {
      const id = randomUUID();
      const contactId = randomUUID();
      await client.query("INSERT INTO mentoring.resource_ids(id,organization_id,kind) VALUES($1,$3,'participant'),($2,$3,'contact')", [id, contactId, organizationId]);
      await client.query("INSERT INTO mentoring.participants(id,organization_id,display_name,created_by,version) VALUES($1,$2,$3,$4,7)", [id, organizationId, name, ceo]);
      await client.query("INSERT INTO mentoring.contacts(id,organization_id,participant_id,actor_id,method,outcome,occurred_at,received_at,notes) VALUES($1,$2,$3,$4,'phone','completed',$5,$5,'Retained contact history')", [contactId, organizationId, id, ceo, at]);
      await client.query("INSERT INTO mentoring.contact_revisions(organization_id,contact_id,participant_id,revision,actor_id,method,outcome,occurred_at,received_at,notes,revised_by_staff_id,revised_at,change_kind) SELECT organization_id,id,participant_id,revision,actor_id,method,outcome,occurred_at,received_at,notes,actor_id,received_at,'initial' FROM mentoring.contacts WHERE id=$1", [contactId]);
      return { id, contactId };
    }
    async function lock(resourceId, { reason = null, fields = ["phone", "manualColor"], active = true, version = 9 } = {}) {
      await client.query("INSERT INTO mentoring.ceo_protections(organization_id,resource_id,protected_by_staff_id,protected_revision,active,field_paths,version,reason,created_at,updated_at) VALUES($1,$2,$3,7,$4,$5::text[],$6,$7,$8,$8)", [organizationId, resourceId, ceo, active, fields, version, reason, at]);
    }
    async function audit(cardId, action, details, { actor = ceo, createdAt = at } = {}) {
      await client.query("INSERT INTO mentoring.audit(id,organization_id,actor_id,operation_id,action,participant_id,details,created_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)", [randomUUID(), organizationId, actor, randomUUID(), action, cardId, JSON.stringify(details), createdAt]);
    }
    const auto = await card("Supported automatic locks");
    await lock(auto.id);
    await lock(auto.contactId, { fields: null });
    await audit(auto.id, "update_participant", { fields: ["phone"], version: 7 });
    await audit(auto.id, "record_contact", { contactId: auto.contactId, version: 7 });
    await audit(auto.id, "set_ceo_protection", { conflictId: randomUUID(), outcome: "ceo_protected", authoritativeVersion: 7 });

    const unknown = await card("Unknown origin retained");
    await lock(unknown.id);
    const conflictOnly = await card("Failed protection request is not explicit state");
    await lock(conflictOnly.id);
    await audit(conflictOnly.id, "set_ceo_protection", { conflictId: randomUUID(), outcome: "ceo_protected", authoritativeVersion: 7 });

    const whole = await card("Explicit whole protection restored");
    await lock(whole.id);
    await audit(whole.id, "set_ceo_protection", { resourceId: whole.id, active: true, fieldPaths: null, protectionVersion: 3, reason: "Explicit whole record" }, { actor: otherCeo });
    await audit(whole.id, "update_participant", { fields: ["phone"], version: 7 });

    const fields = await card("Explicit selected fields restored");
    await lock(fields.id);
    await audit(fields.id, "set_ceo_protection", { resourceId: fields.id, active: true, fieldPaths: ["profileNotes"], protectionVersion: 4, reason: "Explicit selected fields" }, { actor: otherCeo });

    const unlocked = await card("Latest explicit unlock ordered by version");
    await lock(unlocked.id);
    const unlockAt = "2026-11-10T10:00:00.000Z";
    await audit(unlocked.id, "set_ceo_protection", { resourceId: unlocked.id, active: true, fieldPaths: null, protectionVersion: 3, reason: "Older version with later timestamp" }, { createdAt: "2026-11-12T10:00:00.000Z" });
    await audit(unlocked.id, "set_ceo_protection", { resourceId: unlocked.id, active: false, fieldPaths: null, protectionVersion: 7, reason: "Latest explicit unlock" }, { actor: otherCeo, createdAt: unlockAt });

    const current = await card("Current explicit row stays untouched");
    await lock(current.id, { reason: "Current explicit protection", fields: null });
    await audit(current.id, "update_participant", { fields: ["phone"], version: 7 });

    const malformed = await card("Ambiguous explicit state preserves all card locks");
    await lock(malformed.id);
    await lock(malformed.contactId, { fields: null });
    await audit(malformed.id, "update_participant", { fields: ["phone"], version: 7 });
    await audit(malformed.id, "record_contact", { contactId: malformed.contactId, version: 7 });
    await audit(malformed.id, "set_ceo_protection", { resourceId: malformed.id, active: true, fieldPaths: null, protectionVersion: "invalid", reason: "Malformed successful-looking event" });

    const invalidLocks = [];
    for (const [name, detailOverrides, contactResource] of [
      ["Invalid unlock fields", { active: false, fieldPaths: ["phone"] }, false],
      ["JSON null active", { active: null }, false],
      ["Missing required reason", { reason: undefined }, false],
      ["Contact fields on participant", { fieldPaths: ["notes"] }, false],
      ["Participant fields on contact", { fieldPaths: ["phone"] }, true],
    ]) {
      const record = await card(name);
      const resourceId = contactResource ? record.contactId : record.id;
      await lock(resourceId);
      await audit(record.id, contactResource ? "record_contact" : "update_participant", { contactId: record.contactId, fields: ["phone"], version: 7 });
      await audit(record.id, "set_ceo_protection", { resourceId, active: true, fieldPaths: null, protectionVersion: 4, reason: "Invalid event retained for review", ...detailOverrides });
      invalidLocks.push(resourceId);
    }
    const pointerSource = await card("Cross-card event source");
    const pointerTarget = await card("Cross-card event must not protect this target");
    await lock(pointerSource.id);
    await lock(pointerTarget.id);
    await audit(pointerTarget.id, "update_participant", { fields: ["phone"], version: 7 });
    await audit(pointerSource.id, "set_ceo_protection", { resourceId: pointerTarget.id, active: true, fieldPaths: null, protectionVersion: 4, reason: "Mismatched card pointer" });

    const rows = async (table, order) => (await client.query(`SELECT * FROM mentoring.${table} ORDER BY ${order}`)).rows;
    const untouchedTables = { audit: "id", contacts: "id", contact_revisions: "contact_id,revision", resource_ids: "id" };
    const history = {};
    for (const [table, order] of Object.entries(untouchedTables)) history[table] = await rows(table, order);
    const beforeLocks = await rows("ceo_protections", "resource_id");
    await client.query(await readFile(new URL("../../../db/mentoring/012_explicit_ceo_protections.sql", import.meta.url), "utf8"));
    const afterLocks = await rows("ceo_protections", "resource_id");
    assert.equal(afterLocks.length, beforeLocks.length, "Protection rows remain as versioned evidence.");
    const before = (id) => beforeLocks.find((row) => row.resource_id === id);
    const after = (id) => afterLocks.find((row) => row.resource_id === id);
    for (const id of [auto.id, auto.contactId]) {
      assert.equal(after(id).active, false);
      assert.equal(after(id).version, before(id).version + 1);
      assert.deepEqual(after(id).field_paths, before(id).field_paths);
    }
    for (const id of [unknown.id, conflictOnly.id, current.id, malformed.id, malformed.contactId, pointerSource.id, ...invalidLocks]) assert.deepEqual(after(id), before(id), "Unclear origin, malformed requests and explicit state are preserved.");
    assert.equal(after(pointerTarget.id).active, false, "An audit with another participant ID cannot restore protection on this card.");
    assert.equal(after(pointerTarget.id).version, 10);
    for (const [record, expectedFields, reason] of [[whole, null, "Explicit whole record"], [fields, ["profileNotes"], "Explicit selected fields"]]) {
      assert.equal(after(record.id).active, true);
      assert.deepEqual(after(record.id).field_paths, expectedFields);
      assert.equal(after(record.id).reason, reason);
      assert.equal(after(record.id).protected_by_staff_id, otherCeo);
      assert.equal(after(record.id).version, 10, "Tokens advance from the current row instead of reverting to historical versions.");
      assert.equal(after(record.id).unlocked_at, null);
    }
    assert.equal(after(unlocked.id).active, false);
    assert.equal(after(unlocked.id).reason, "Latest explicit unlock");
    assert.equal(after(unlocked.id).field_paths, null);
    assert.equal(after(unlocked.id).unlocked_by_staff_id, otherCeo);
    assert.equal(after(unlocked.id).unlocked_at.toISOString(), unlockAt);
    assert.equal(after(unlocked.id).version, 10);
    const changed = new Set([auto.id, whole.id, fields.id, unlocked.id, pointerTarget.id]);
    for (const row of await rows("participants", "id")) assert.equal(row.version, changed.has(row.id) ? 8 : 7, "Each affected card advances once even when multiple resources change.");
    for (const [table, order] of Object.entries(untouchedTables)) assert.deepEqual(await rows(table, order), history[table], `${table} history remains unchanged.`);
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});
