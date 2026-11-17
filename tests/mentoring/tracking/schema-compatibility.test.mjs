import assert from "node:assert/strict";
import test from "node:test";
import { loadTrackingCards, handleTrackingCommand } from "../../../lib/mentoring/features/tracking/server.ts";
import { handleAuthorityCommand } from "../../../lib/mentoring/features/authority/server.ts";

const actor = { id: "11111111-1111-4111-8111-111111111112", organizationId: "11111111-1111-4111-8111-111111111111", role: "ceo", active: true };
const subjectId = "11111111-1111-4111-8111-111111111113";
function database(cards, reports) {
  const queries = [];
  return {
    queries,
    async query(sql) {
      queries.push(sql);
      if (sql.includes("to_regclass")) return { rows: [{ cards, reports }] };
      if (/mentoring\.tracking_cards\b/.test(sql) && !cards || /mentoring\.tracking_reports\b/.test(sql) && !reports) {
        throw Object.assign(new Error("missing tracking table"), { code: "42P01" });
      }
      if (sql.startsWith("SELECT id FROM mentoring.memberships")) return { rows: [{ id: subjectId }] };
      if (sql.includes("FROM mentoring.memberships") && sql.includes("FOR SHARE")) return { rows: [{ id: subjectId, coordinator_id: actor.id }] };
      return { rows: [], rowCount: 1 };
    },
  };
}
function context(client, identity = actor) {
  return {
    client, actor: identity, now: "2026-11-17T16:00:00Z",
    view: { participant: { id: subjectId, organizationId: actor.organizationId, displayName: "Test participant", version: 1 } },
    failure: (code, message) => ({ ok: false, error: { code, message } }),
    success: () => ({ ok: true }), audit: async () => {},
  };
}

for (const [cards, reports] of [[false, false], [true, false], [false, true]]) {
  test(`unavailable tracking schema (${cards}/${reports}) leaves the workspace readable`, async () => {
    const client = database(cards, reports);
    assert.equal(await loadTrackingCards(client, actor, [subjectId]), undefined);
    assert.equal(client.queries.some((sql) => /\bFROM mentoring\.tracking_/.test(sql)), false);
  });
  test(`unavailable tracking schema (${cards}/${reports}) refuses writes before side effects`, async () => {
    const client = database(cards, reports);
    const command = { type: "record_tracking_report", subject: { kind: "mentor", staffId: subjectId }, method: "phone", outcome: "completed", occurredAt: "2026-11-17T15:00:00Z", notes: "A report" };
    assert.equal((await handleTrackingCommand(context(client), command)).error.code, "not_configured");
    assert.equal(client.queries.some((sql) => /^(INSERT|UPDATE|DELETE)/.test(sql)), false);
  });
}

test("ready tracking schema retains an empty result and is rechecked on a later request", async () => {
  assert.deepEqual(await loadTrackingCards(database(true, true), actor, [subjectId]), []);
  assert.equal(await loadTrackingCards(database(false, false), actor, [subjectId]), undefined);
});

test("unauthorized mentors never inspect the tracking schema", async () => {
  const client = database(false, false);
  const mentor = { ...actor, role: "mentor" };
  assert.equal(await loadTrackingCards(client, mentor, [subjectId]), undefined);
  assert.equal((await handleTrackingCommand(context(client, mentor), { type: "record_tracking_report" })).error.code, "forbidden");
  assert.deepEqual(client.queries, []);
});

test("unexpected schema-query errors still propagate", async () => {
  const problem = new Error("database unavailable");
  await assert.rejects(loadTrackingCards({ query: async () => { throw problem; } }, actor, [subjectId]), (error) => error === problem);
});

for (const [cards, reports] of [[false, false], [true, true], [true, false], [false, true]]) {
  test(`permanent deletion handles tracking schema ${cards}/${reports} without dropping retained data`, async () => {
    const client = database(cards, reports);
    const command = { type: "permanently_delete_participant", participantId: subjectId, expectedVersion: 1, confirmationName: "Test participant" };
    const result = await handleAuthorityCommand(context(client), command);
    if (cards !== reports) {
      assert.equal(result.error.code, "not_configured");
      assert.equal(client.queries.some((sql) => sql.startsWith("DELETE")), false);
    } else {
      assert.equal(result.ok, true);
      assert.equal(client.queries.some((sql) => sql.startsWith("DELETE FROM mentoring.tracking_cards")), cards);
      assert.equal(client.queries.some((sql) => sql.startsWith("DELETE FROM mentoring.participants")), true);
    }
  });
}
