import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import "../server/typescript-loader.mjs";

const enabled = process.env.MENTORING_INTEGRATION_TESTS === "1";

// Opt-in only. Fixtures live in a fresh organization inside one rolled-back
// transaction; this test never changes the application's existing settings.
test("PostgreSQL oversight versions, protection, history and scope", { skip: !enabled, timeout: 30_000 }, async (t) => {
  assert.notEqual(process.env.NODE_ENV, "production");
  assert.ok(process.env.MENTORING_DATABASE_URL, "An explicitly configured migrated development database is required.");
  const { handleOversightCommand, loadOversightExtras } = await import("../../../lib/mentoring/features/oversight/server.ts");
  const { DEFAULT_ORGANIZATION_POLICY } = await import("../../../lib/mentoring/features/oversight/contracts.ts");
  const database = new Pool({ connectionString: process.env.MENTORING_DATABASE_URL_UNPOOLED ?? process.env.MENTORING_DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
  const client = await database.connect();
  try {
    const ready = await client.query("SELECT to_regclass('mentoring.organization_settings') IS NOT NULL AND to_regclass('mentoring.monthly_review_history') IS NOT NULL AS ready");
    assert.equal(ready.rows[0].ready, true, "Migration 005 is required; this test does not apply migrations.");
    await client.query("BEGIN");
    const organizationId = randomUUID();
    await client.query("INSERT INTO mentoring.organizations (id,name) VALUES ($1,'oversight rollback test')", [organizationId]);
    const now = "2026-10-26T12:00:00Z";
    const actor = async (role) => {
      const id = randomUUID();
      await client.query("INSERT INTO mentoring.memberships (id,organization_id,display_name,role) VALUES ($1,$2,$3,$4)", [id, organizationId, `oversight ${role}`, role]);
      return { id, organizationId, role, active: true, version: 1, displayName: `oversight ${role}`, authUserId: id, email: null, phone: null, coordinatorId: null, smsMuted: false };
    };
    const ceo = await actor("ceo"), coordinatorA = await actor("coordinator"), coordinatorB = await actor("coordinator"), mentor = await actor("mentor");
    const audit = [];
    const run = (actor, command) => handleOversightCommand({ client, actor, now, view: null,
      success: (cmd) => ({ ok: true, operationId: cmd.operationId, replayed: false, acceptance: "accepted" }),
      failure: (code, message, field) => ({ ok: false, error: { code, message, field } }),
      audit: async (cmd, _participantId, details) => { audit.push({ type: cmd.type, details }); },
      refreshReminders: async () => undefined,
    }, { operationId: randomUUID(), ...command });
    const save = (scopeStaffId, expectedVersion, summary = "Observed narrative", reviewed = true) => ({ type: "save_monthly_review", month: "2026-10", scopeStaffId, expectedVersion, summary, reviewed });
    await t.test("settings are CEO-only, compare versions and retain attributed history", async () => {
      const change = { type: "update_organization_settings", expectedVersion: 1, settings: { ...DEFAULT_ORGANIZATION_POLICY, offlineLeaseHours: 8 }, reason: "Approved device policy" };
      assert.equal((await run(coordinatorA, change)).error.code, "forbidden");
      assert.equal((await run(ceo, change)).ok, true);
      assert.equal((await run(ceo, change)).error.code, "conflict");
      const extras = await loadOversightExtras(client, mentor, now);
      assert.equal(extras.settings.version, 2);
      assert.equal(extras.settings.offlineLeaseHours, 8);
      assert.equal(extras.settings.updatedBy, ceo.id);
      assert.deepEqual(extras.monthlyReviews, []);
      const history = await client.query("SELECT version,updated_by,reason FROM mentoring.organization_settings_history WHERE organization_id=$1", [organizationId]);
      assert.equal(history.rows.length, 1);
      assert.equal(history.rows[0].updated_by, ceo.id);
    });
    await t.test("coordinators write only their own team, stale updates preserve accepted text", async () => {
      assert.equal((await run(mentor, save(mentor.id, null))).error.code, "forbidden");
      assert.equal((await run(coordinatorA, save(null, null))).error.code, "forbidden");
      assert.equal((await run(coordinatorA, save(coordinatorB.id, null))).error.code, "forbidden");
      assert.equal((await run(coordinatorA, save(coordinatorA.id, null))).ok, true);
      assert.equal((await run(coordinatorB, save(coordinatorB.id, null, "Other team narrative"))).ok, true);
      assert.equal((await run(coordinatorA, save(coordinatorA.id, null, "Stale text"))).error.code, "conflict");
      const extras = await loadOversightExtras(client, coordinatorA, now);
      assert.equal(extras.monthlyReviews.length, 1);
      assert.equal(extras.monthlyReviews[0].summary, "Observed narrative");
      assert.equal(extras.monthlyReviews[0].scopeStaffId, coordinatorA.id);
    });
    await t.test("CEO edits protect the exact review and preserve each narrative revision", async () => {
      assert.equal((await run(ceo, save(coordinatorA.id, 1, "CEO narrative"))).ok, true);
      assert.equal((await run(coordinatorA, save(coordinatorA.id, 2, "Overwrite"))).error.code, "ceo_protected");
      assert.equal((await run(ceo, save(null, null, "Organization narrative"))).ok, true);
      const extras = await loadOversightExtras(client, ceo, now);
      assert.equal(extras.monthlyReviews.length, 3);
      const own = extras.monthlyReviews.find((review) => review.scopeStaffId === coordinatorA.id);
      assert.equal(own.ceoProtected, true);
      assert.equal(own.summary, "CEO narrative");
      assert.equal(own.version, 2);
      assert.deepEqual(own.history.map((entry) => entry.summary), ["CEO narrative", "Observed narrative"]);
      assert.equal(own.history[0].updatedBy, ceo.id);
      assert.equal(audit.filter((entry) => entry.type === "save_monthly_review").length, 4);
    });
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
    await database.end();
  }
});
