import assert from "node:assert/strict";
import test from "node:test";
import { handleTransferCommand, loadWorkspaceTransfers } from "../../../lib/mentoring/features/transfers/server.ts";
import { transferSchemaState } from "../../../lib/mentoring/features/transfers/database-schema.ts";
import { handleAuthorityCommand } from "../../../lib/mentoring/features/authority/server.ts";

const orgId = "11111111-1111-4111-8111-111111111111";
const coordinator = { id: "11111111-1111-4111-8111-111111111112", organizationId: orgId, role: "coordinator", active: true };
const ceo = { ...coordinator, id: "11111111-1111-4111-8111-111111111119", role: "ceo" };
const mentor = { ...coordinator, id: "11111111-1111-4111-8111-111111111118", role: "mentor" };
const participantId = "11111111-1111-4111-8111-111111111113";
const targetMentorId = "11111111-1111-4111-8111-111111111114";

function database(requests, emails) {
  const queries = [];
  return {
    queries,
    async query(sql) {
      queries.push(sql);
      if (sql.includes("mentoring.transfer_requests") && sql.includes("to_regclass")) {
        return { rows: [{ requests, emails }] };
      }
      if (sql.includes("mentoring.tracking_cards") && sql.includes("to_regclass")) {
        return { rows: [{ cards: true, reports: true }] };
      }
      if ((/\bmentoring\.transfer_requests\b/.test(sql) && !requests) || (/\bmentoring\.transfer_request_emails\b/.test(sql) && !emails)) {
        throw Object.assign(new Error("missing transfer table"), { code: "42P01" });
      }
      return { rows: [], rowCount: 1 };
    },
  };
}

function context(client, identity = coordinator) {
  return {
    client,
    actor: identity,
    now: "2026-11-25T09:00:00Z",
    operationId: "11111111-1111-4111-8111-111111111199",
    view: {
      participant: { id: participantId, organizationId: orgId, displayName: "דינה", version: 1, lifecycle: "active", deletedAt: null },
      assignment: null,
      protections: [],
    },
    failure: (code, message, extra = {}) => ({ ok: false, error: { code, message, ...extra } }),
    success: (extra = {}) => ({ ok: true, ...extra }),
    audit: async () => {},
    refreshReminders: async () => {},
  };
}

test("transferSchemaState classifies absent, partial, and ready schemas accurately", async () => {
  assert.equal(await transferSchemaState(database(false, false)), "absent");
  assert.equal(await transferSchemaState(database(true, false)), "partial");
  assert.equal(await transferSchemaState(database(false, true)), "partial");
  assert.equal(await transferSchemaState(database(true, true)), "ready");
});

for (const [requests, emails] of [[false, false], [true, false], [false, true]]) {
  test(`unavailable transfer schema (${requests}/${emails}) leaves the workspace readable`, async () => {
    const client = database(requests, emails);
    const loaded = await loadWorkspaceTransfers(client, coordinator);
    assert.deepEqual(loaded, { transferRequests: [], transferableParticipants: [] });
    assert.equal(client.queries.some((sql) => /\bFROM mentoring\.transfer_/.test(sql)), false);
  });

  test(`unavailable transfer schema (${requests}/${emails}) refuses transfer writes cleanly`, async () => {
    const client = database(requests, emails);
    const command = {
      type: "request_participant_transfer",
      operationId: "11111111-1111-4111-8111-111111111199",
      participantId,
      targetMentorId,
    };
    const result = await handleTransferCommand(context(client, coordinator), command);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "not_configured");
    assert.equal(client.queries.some((sql) => /^(INSERT|UPDATE|DELETE)/.test(sql)), false);
  });
}

test("ready transfer schema queries requests + directory for coordinators and skips directory query for CEO", async () => {
  const coordClient = database(true, true);
  assert.deepEqual(await loadWorkspaceTransfers(coordClient, coordinator), {
    transferRequests: [],
    transferableParticipants: [],
  });
  assert.equal(coordClient.queries.some((sql) => sql.includes("assignment_protected")), true);

  const ceoClient = database(true, true);
  assert.deepEqual(await loadWorkspaceTransfers(ceoClient, ceo), {
    transferRequests: [],
    transferableParticipants: [],
  });
  assert.equal(ceoClient.queries.some((sql) => sql.includes("assignment_protected")), false);
});

test("mentors never query transfer schema and are denied transfer commands immediately", async () => {
  const client = database(false, false);
  assert.deepEqual(await loadWorkspaceTransfers(client, mentor), {});
  const result = await handleTransferCommand(context(client, mentor), {
    type: "request_participant_transfer",
    operationId: "11111111-1111-4111-8111-111111111199",
    participantId,
    targetMentorId,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "forbidden");
  assert.deepEqual(client.queries, []);
});

for (const [requests, emails] of [[false, false], [true, true], [true, false], [false, true]]) {
  test(`permanent deletion handles transfer schema ${requests}/${emails} without dropping retained data`, async () => {
    const client = database(requests, emails);
    const command = {
      type: "permanently_delete_participant",
      operationId: "11111111-1111-4111-8111-111111111199",
      participantId,
      expectedVersion: 1,
      confirmationName: "דינה",
      reason: "בדיקה",
    };
    const result = await handleAuthorityCommand(context(client, ceo), command);
    if (requests !== emails) {
      assert.equal(result.ok, false);
      assert.equal(result.error.code, "not_configured");
      assert.equal(client.queries.some((sql) => sql.startsWith("DELETE")), false);
    } else {
      assert.equal(result.ok, true);
      assert.equal(client.queries.some((sql) => sql.startsWith("DELETE FROM mentoring.transfer_requests")), requests);
      assert.equal(client.queries.some((sql) => sql.startsWith("DELETE FROM mentoring.transfer_request_emails")), emails);
      assert.equal(client.queries.some((sql) => sql.startsWith("DELETE FROM mentoring.participants")), true);
    }
  });
}
