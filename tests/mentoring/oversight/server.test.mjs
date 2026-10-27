import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import "../server/typescript-loader.mjs";

const { handleOversightCommand, loadOversightExtras } = await import("../../../lib/mentoring/features/oversight/server.ts");
const { DEFAULT_ORGANIZATION_POLICY } = await import("../../../lib/mentoring/features/oversight/contracts.ts");
const org = randomUUID(), coordinatorId = randomUUID();
const member = (role) => ({ id: role === "coordinator" ? coordinatorId : randomUUID(), organizationId: org, role, active: true, version: 1, displayName: role });
function context(actor, respond = () => ({ rows: [] })) {
  const queries = [], audits = [];
  return { actor, now: "2026-10-26T12:00:00Z", view: null, queries, audits,
    client: { query: async (sql, args) => { queries.push({ sql, args }); return respond(sql, args); } },
    failure: (code, message, field) => ({ ok: false, error: { code, message, field } }),
    success: (command) => ({ ok: true, operationId: command.operationId, replayed: false, acceptance: "accepted" }),
    audit: async (...args) => { audits.push(args); }, refreshReminders: async () => undefined,
  };
}
const monthly = (scopeStaffId, expectedVersion = null) => ({ type: "save_monthly_review", operationId: randomUUID(), month: "2026-10", scopeStaffId, expectedVersion, summary: "Narrative", reviewed: true });

test("non-management and another team's summary are denied before database access", async () => {
  for (const [actor, command] of [[member("mentor"), monthly(coordinatorId)], [member("coordinator"), monthly(null)], [member("coordinator"), monthly(randomUUID())], [{ ...member("ceo"), active: false }, monthly(null)]]) {
    const ctx = context(actor);
    assert.equal((await handleOversightCommand(ctx, command)).error.code, "forbidden");
    assert.equal(ctx.queries.length, 0);
    assert.equal(ctx.audits.length, 0);
  }
  const ctx = context(member("coordinator"));
  assert.equal((await handleOversightCommand(ctx, { type: "update_organization_settings", operationId: randomUUID(), expectedVersion: 1, settings: DEFAULT_ORGANIZATION_POLICY, reason: "Policy" })).error.code, "forbidden");
  assert.equal(ctx.queries.length, 0);
});

test("CEO-protected monthly text cannot be overwritten by an otherwise authorized coordinator", async () => {
  const ctx = context(member("coordinator"), (sql) => {
    if (sql.includes("FROM mentoring.memberships")) return { rows: [{ id: coordinatorId }] };
    if (sql.includes("FROM mentoring.monthly_reviews")) return { rows: [{ id: randomUUID(), version: 2, summary: "CEO narrative", ceo_protected: true }] };
    return { rows: [] };
  });
  assert.equal((await handleOversightCommand(ctx, monthly(coordinatorId, 2))).error.code, "ceo_protected");
  assert.equal(ctx.queries.some((query) => /^(UPDATE|INSERT|DELETE)/.test(query.sql)), false);
  assert.equal(ctx.audits.length, 0);
});

test("a stale month version cannot change narrative or append history", async () => {
  const ctx = context(member("ceo"), (sql) => sql.includes("FROM mentoring.monthly_reviews") ? { rows: [{ id: randomUUID(), version: 2, summary: "Accepted", ceo_protected: true }] } : { rows: [] });
  assert.equal((await handleOversightCommand(ctx, monthly(null, 1))).error.code, "conflict");
  assert.equal(ctx.queries.some((query) => /^(UPDATE|INSERT|DELETE)/.test(query.sql)), false);
  assert.equal(ctx.audits.length, 0);
});

test("mentor extras query only operational settings and never monthly narratives", async () => {
  const ctx = context(member("mentor"));
  const extras = await loadOversightExtras(ctx.client, ctx.actor, ctx.now);
  assert.deepEqual(extras.monthlyReviews, []);
  assert.equal(extras.settings.updatedBy, null);
  assert.equal(ctx.queries.length, 1);
  assert.equal(ctx.queries[0].args[0], org);
  assert.equal(ctx.queries.some((query) => query.sql.includes("monthly")), false);
});
