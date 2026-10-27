import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import "../server/typescript-loader.mjs";

const serverEnabled = process.execArgv.includes("--conditions=react-server");
const organizationId = randomUUID();
const participantId = randomUUID();
const staffId = randomUUID();
const actor = { id: randomUUID(), organizationId, role: "ceo", active: true, version: 1 };
const view = { participant: { id: participantId, organizationId, version: 7, lifecycle: "active" }, assignment: { id: randomUUID(), followupAnchorAt: "2026-10-01T10:00:00Z" }, nextAppointment: { id: randomUUID(), scheduledAt: "2026-10-08T10:00:00Z" }, contacts: [], protections: [] };
const command = (type, fields = {}) => ({ type, operationId: randomUUID(), participantId, expectedVersion: 7, reason: "בדיקת סמכות", ...fields });
const deletion = { deleted_at: null, deleted_by: null, deletion_reason: null, deleted_previous_lifecycle: null };

function context(overrides = {}, select = () => [], deletionState = deletion) {
  const queries = [];
  const audits = [];
  const protections = [];
  const reminders = [];
  return {
    actor, view, now: "2026-10-26T10:00:00Z", queries, audits, protections, reminders,
    client: { query: async (sql, values) => { queries.push({ sql, values }); return { rows: sql.startsWith("SELECT deleted_at") ? [deletionState] : select(sql, values), rowCount: 1 }; } },
    failure: (code, message, field) => ({ ok: false, error: { code, message, ...(field ? { field } : {}) } }),
    success: (input, id) => ({ ok: true, operationId: input.operationId, replayed: false, acceptance: "accepted", ...(id ? { participantId: id } : {}) }),
    audit: async (...args) => { audits.push(args); },
    protect: async (...args) => { protections.push(args); },
    refreshReminders: async (...args) => { reminders.push({ args, priorQueries: [...queries] }); },
    ...overrides,
  };
}

test("authority handler verifies current CEO role before reading or mutating records", { skip: !serverEnabled }, async () => {
  const { handleAuthorityCommand } = await import("../../../lib/mentoring/features/authority/server.ts");
  for (const identity of [{ ...actor, role: "mentor" }, { ...actor, role: "coordinator" }, { ...actor, active: false }]) {
    const ctx = context({ actor: identity });
    const result = await handleAuthorityCommand(ctx, command("delete_participant"));
    assert.equal(result.error.code, "forbidden");
    assert.equal(ctx.queries.length, 0);
    assert.equal(ctx.audits.length, 0);
  }
});

test("stale or cross-organization authority requests cannot mutate a loaded record", { skip: !serverEnabled }, async () => {
  const { handleAuthorityCommand } = await import("../../../lib/mentoring/features/authority/server.ts");
  for (const [ctx, input, expected] of [
    [context(), command("delete_participant", { expectedVersion: 6 }), "conflict"],
    [context({ view: { ...view, participant: { ...view.participant, organizationId: randomUUID() } } }), command("delete_participant"), "not_found"],
    [context({ view: null }), command("delete_participant"), "not_found"],
  ]) {
    assert.equal((await handleAuthorityCommand(ctx, input)).error.code, expected);
    assert.equal(ctx.queries.length, 0);
  }
});

test("mentor approval and inactive-target grants are denied before permission writes", { skip: !serverEnabled }, async () => {
  const { handleAuthorityCommand } = await import("../../../lib/mentoring/features/authority/server.ts");
  for (const target of [{ id: staffId, active: true, role: "mentor" }, { id: staffId, active: false, role: "coordinator" }]) {
    const ctx = context({}, (sql) => sql.includes("mentoring.memberships") ? [target] : []);
    const result = await handleAuthorityCommand(ctx, command("set_access_grant", { staffId, expectedGrantVersion: null, actions: ["view", "approve"], expiresAt: null }));
    assert.equal(result.ok, false);
    assert.equal(ctx.queries.some(({ sql }) => /^(INSERT|UPDATE)/.test(sql)), false);
  }
});

test("grant expiry uses the database clock after waiting for target and grant locks", { skip: !serverEnabled }, async () => {
  const { handleAuthorityCommand } = await import("../../../lib/mentoring/features/authority/server.ts");
  const ctx = context({}, (sql) => {
    if (sql.includes("mentoring.memberships")) return [{ id: staffId, active: true, role: "mentor" }];
    if (sql === "SELECT clock_timestamp() AS now") return [{ now: "2026-10-26T10:01:00Z" }];
    return [];
  });
  const input = command("set_access_grant", { staffId, expectedGrantVersion: null, actions: ["view", "edit"], expiresAt: "2026-10-26T10:00:30Z" });
  assert.ok(Date.parse(ctx.now) < Date.parse(input.expiresAt), "The pre-lock context clock would incorrectly permit this grant.");
  const result = await handleAuthorityCommand(ctx, input);
  assert.equal(result.error.code, "validation");
  assert.equal(result.error.field, "expiresAt");
  assert.equal(ctx.queries.some(({ sql }) => /^(INSERT|UPDATE)/.test(sql)), false);
  assert.equal(ctx.audits.length, 0);
  assert.equal(ctx.reminders.length, 0);
});

test("resource-specific protection allowlists reject contact fields on a participant", { skip: !serverEnabled }, async () => {
  const { handleAuthorityCommand } = await import("../../../lib/mentoring/features/authority/server.ts");
  const ctx = context();
  const result = await handleAuthorityCommand(ctx, command("set_ceo_protection", { resourceId: participantId, expectedProtectionVersion: null, active: true, fieldPaths: ["notes"] }));
  assert.equal(result.error.code, "validation");
  assert.equal(result.error.field, "fieldPaths");
  assert.equal(ctx.queries.some(({ sql }) => /^(INSERT|UPDATE)/.test(sql)), false);
});

test("pause and deletion cancel unsent reminders while retaining anchor and appointment history", { skip: !serverEnabled }, async () => {
  const { handleAuthorityCommand } = await import("../../../lib/mentoring/features/authority/server.ts");
  for (const input of [command("set_participant_lifecycle", { lifecycle: "paused" }), command("delete_participant")]) {
    const ctx = context();
    assert.equal((await handleAuthorityCommand(ctx, input)).ok, true);
    assert.equal(ctx.queries.some(({ sql }) => /^(UPDATE|DELETE|INSERT).*mentoring\.(assignments|appointments|contacts)\b/.test(sql)), false);
    const cancellation = ctx.queries.find(({ sql }) => sql.startsWith("UPDATE mentoring.outbox"));
    assert.match(cancellation.sql, /status IN \('blocked','pending'\)/);
    assert.equal(ctx.reminders.length, 1);
    assert.deepEqual(ctx.reminders[0].args, [participantId]);
    assert.ok(ctx.reminders[0].priorQueries.some(({ sql }) => sql.startsWith("UPDATE mentoring.participants")), "Rebuild uses the changed lifecycle or tombstone.");
    assert.ok(ctx.reminders[0].priorQueries.some(({ sql }) => sql.startsWith("UPDATE mentoring.outbox")), "Legacy unsent intents are cancelled before canonical jobs are rebuilt.");
    assert.deepEqual(ctx.protections, input.type === "set_participant_lifecycle" ? [[participantId, 8, ["lifecycle"]]] : []);
    assert.equal(ctx.audits.length, 1);
    assert.equal(view.assignment.followupAnchorAt, "2026-10-01T10:00:00Z");
    assert.equal(view.nextAppointment.scheduledAt, "2026-10-08T10:00:00Z");
  }
});

test("delete and restore retain whole, selected and inactive CEO protection metadata", { skip: !serverEnabled }, async () => {
  const { handleAuthorityCommand } = await import("../../../lib/mentoring/features/authority/server.ts");
  const metadata = [
    { organizationId, resourceId: participantId, protectedByStaffId: actor.id, protectedRevision: 4, active: true, fieldPaths: null, version: 3, reason: "הגנת רשומה שלמה", unlockedByStaffId: null, unlockedAt: null },
    { organizationId, resourceId: participantId, protectedByStaffId: actor.id, protectedRevision: 5, active: true, fieldPaths: ["manualColor"], version: 4, reason: "הגנה על צבע בלבד", unlockedByStaffId: null, unlockedAt: null },
    { organizationId, resourceId: participantId, protectedByStaffId: actor.id, protectedRevision: 6, active: false, fieldPaths: null, version: 5, reason: "הסרה מפורשת", unlockedByStaffId: actor.id, unlockedAt: "2026-10-25T10:00:00Z" },
  ];
  for (const protection of metadata) {
    for (const type of ["delete_participant", "restore_participant"]) {
      const protectedView = { ...view, protections: protection.active ? [protection] : [], protectionStates: [protection] };
      const before = structuredClone(protectedView);
      const tombstone = type === "restore_participant" ? { deleted_at: "2026-10-25T12:00:00Z", deleted_by: actor.id, deletion_reason: "מחיקה הפיכה", deleted_previous_lifecycle: "active" } : deletion;
      const ctx = context({ view: protectedView }, () => [], tombstone);
      assert.equal((await handleAuthorityCommand(ctx, command(type))).ok, true);
      assert.deepEqual(ctx.protections, [], "Tombstone changes must not invoke automatic protection.");
      assert.equal(ctx.queries.some(({ sql }) => /\bmentoring\.ceo_protections\b/.test(sql)), false, "Protection rows are not read or rewritten by deletion or restoration.");
      assert.deepEqual(protectedView, before, "Existing protection scope, revision, version and unlock evidence stay unchanged.");
      assert.equal(ctx.reminders.length, 1);
      assert.equal(ctx.audits.length, 1);
    }
  }
});

test("staff role changes cannot demote CEO or strand current owners", { skip: !serverEnabled }, async () => {
  const { handleAuthorityCommand } = await import("../../../lib/mentoring/features/authority/server.ts");
  const input = { operationId: randomUUID(), type: "update_staff", staffId, expectedVersion: 3, fields: { role: "coordinator", coordinatorId: null } };
  const ceo = context({}, (sql) => sql.includes("mentoring.memberships") ? [{ id: staffId, role: "ceo", active: true, version: 3, coordinator_id: null }] : []);
  assert.equal((await handleAuthorityCommand(ceo, input)).error.code, "forbidden");
  const owner = context({}, (sql) => {
    if (sql.startsWith("SELECT * FROM mentoring.memberships")) return [{ id: staffId, role: "mentor", active: true, version: 3, coordinator_id: null }];
    if (sql.startsWith("SELECT EXISTS")) return [{ mentor_owner: true, coordinator_owner: false, staff_owner: false, appointment_owner: false, approval_owner: false }];
    return [];
  });
  assert.equal((await handleAuthorityCommand(owner, input)).error.code, "conflict");
  for (const ctx of [ceo, owner]) assert.equal(ctx.queries.some(({ sql }) => sql.startsWith("UPDATE mentoring.memberships")), false);
});
