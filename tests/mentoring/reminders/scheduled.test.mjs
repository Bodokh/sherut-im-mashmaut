import assert from "node:assert/strict";
import test from "node:test";
import "../server/typescript-loader.mjs";

// This test file runs in its own Node test process. If production code ever
// ignores the injected transaction, fail closed before opening a real pool.
delete process.env.MENTORING_DATABASE_URL;

const { createScheduledReminderHandler, runScheduledReminders } = await import("../../../lib/mentoring/features/reminders/scheduled.ts");
const { ORGANIZATION_ID } = await import("../../../lib/mentoring/server/db.ts");

const actorId = "22222222-2222-4222-8222-222222222222";
const cursorId = (number) => `33333333-3333-4333-8333-${String(number).padStart(12, "0")}`;
const secret = "scheduled-unit-test-secret-only";
const now = () => "2026-10-26T12:00:00.000Z";
const emptyOutcomes = () => ({ provider_accepted: 0, delivered: 0, failed: 0, uncertain: 0 });
const completed = (overrides = {}) => ({
  state: "completed", scanned: 3, planned: 8, pages: 2, scanComplete: true, more: false,
  deliveryBlocked: false, considered: 2, claimed: 1,
  outcomes: { ...emptyOutcomes(), provider_accepted: 1 }, hostedSchedulerConfigured: false,
  ...overrides,
});
const request = (authorization = `Bearer ${secret}`, suffix = "", method = "GET") => new Request(`https://example.test/api/internal/mentoring/reminders${suffix}`, {
  method, headers: authorization === undefined ? {} : { Authorization: authorization },
});

function database(initial = {}) {
  let member = { id: actorId, organization_id: ORGANIZATION_ID, role: "ceo", active: true,
    auth_user_id: "synthetic-auth", display_name: "Synthetic CEO", email: null, phone: null,
    coordinator_id: null, sms_muted: false, version: 1, ...initial };
  let commits = 0;
  let rollbacks = 0;
  let transactions = 0;
  let leases = 0;
  const queries = [];
  const client = { query: async (sql, values = []) => {
    queries.push(sql);
    if (sql.includes("mentoring.memberships")) {
      assert.equal(values[0], ORGANIZATION_ID, "scheduled work is fixed to the server organization");
      assert.equal(values[1], actorId, "scheduled work uses only the configured membership");
      const matching = member && member.id === values[1] && member.organization_id === values[0]
        && (!/active\s*=\s*true/i.test(sql) || member.active)
        && (!/role\s*=\s*'ceo'/i.test(sql) || member.role === "ceo")
        && (!/role\s+IN/i.test(sql) || ["ceo", "coordinator"].includes(member.role));
      return { rows: matching ? [{ ...member }] : [], rowCount: matching ? 1 : 0 };
    }
    if (sql.includes("mentoring.reminder_jobs") && sql.includes("state='dispatching'")) {
      leases += 1;
      return { rows: [], rowCount: 0 };
    }
    throw new Error("Unexpected delivery or database work in scheduled test");
  } };
  return {
    transaction: async (work) => {
      transactions += 1;
      try { const result = await work(client); commits += 1; return result; }
      catch (error) { rollbacks += 1; throw error; }
    },
    change: (changes) => { member = member ? { ...member, ...changes } : changes; },
    remove: () => { member = null; },
    get stats() { return { commits, rollbacks, transactions, leases, queries: [...queries] }; },
  };
}

test("HEAD and unsupported methods cannot consult configuration or start scheduled work", async () => {
  const calls = [];
  const handler = createScheduledReminderHandler({
    secret: () => { calls.push("secret"); return secret; },
    actorId: () => { calls.push("actor"); return actorId; },
    run: async () => { calls.push("run"); return completed(); },
  });
  for (const method of ["HEAD", "POST", "OPTIONS"]) {
    const response = await handler(request(`Bearer ${secret}`, "", method));
    assert.equal(response.status, 405);
    assert.match(response.headers.get("allow"), /GET/);
    assert.match(response.headers.get("cache-control"), /private.*no-store/);
    if (method === "HEAD") assert.equal(await response.text(), "");
  }
  assert.deepEqual(calls, []);
});

test("missing secret or invalid exact Bearer authorization performs zero actor and run calls", async () => {
  let actorReads = 0;
  let runs = 0;
  const options = { actorId: () => { actorReads += 1; return actorId; }, run: async () => { runs += 1; return completed(); } };
  const missing = await createScheduledReminderHandler({ ...options, secret: () => undefined })(request());
  assert.equal(missing.status, 503);
  const handler = createScheduledReminderHandler({ ...options, secret: () => secret });
  assert.equal((await handler(new Request("https://example.test/api/internal/mentoring/reminders"))).status, 401);
  for (const authorization of ["", "Bearer wrong", `bearer ${secret}`, `Basic ${secret}`, `Bearer  ${secret}`, `Bearer ${secret}extra`, `Bearer ${"é".repeat(secret.length)}`]) {
    const response = await handler(request(authorization));
    assert.equal(response.status, 401);
    assert.match(response.headers.get("cache-control"), /private.*no-store/);
    assert.doesNotMatch(await response.text(), new RegExp(secret));
  }
  assert.equal(actorReads, 0);
  assert.equal(runs, 0);
});

test("request selectors and absent or malformed configured membership cannot reach the runner", async () => {
  let actorReads = 0;
  let runs = 0;
  const handler = createScheduledReminderHandler({ secret: () => secret,
    actorId: () => { actorReads += 1; return actorId; }, run: async () => { runs += 1; return completed(); } });
  assert.equal((await handler(request(`Bearer ${secret}`, "?organizationId=other&actorId=other&cursor=other"))).status, 400);
  assert.equal(actorReads, 0);
  for (const value of [undefined, "", "not-a-membership", "22222222-2222-4222-8222-222222222222?private=1"]) {
    const response = await createScheduledReminderHandler({ secret: () => secret, actorId: () => value,
      run: async () => { runs += 1; return completed(); } })(request());
    assert.equal(response.status, 503);
  }
  assert.equal(runs, 0);
});

test("successful response exposes only fixed aggregate fields and current hosted status", async () => {
  const result = completed();
  const handler = createScheduledReminderHandler({ secret: () => secret, actorId: () => actorId,
    run: async (configuredActor) => {
      assert.equal(configuredActor, actorId);
      return { ...result, hostedSchedulerConfigured: true, participantName: "PRIVATE narrative", jobId: "PRIVATE-id",
        outcomes: { ...result.outcomes, "PRIVATE provider error": 12 } };
    } });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /private.*no-store/);
  assert.deepEqual(await response.json(), result);
});

test("blocked delivery and unfinished evaluation are HTTP failures with truthful aggregate state", async () => {
  for (const result of [completed({ state: "delivery_blocked", deliveryBlocked: true, considered: 0, claimed: 0, outcomes: emptyOutcomes() }),
    completed({ state: "scan_incomplete", scanComplete: false, more: true, deliveryBlocked: true, considered: 0, claimed: 0, outcomes: emptyOutcomes() })]) {
    const response = await createScheduledReminderHandler({ secret: () => secret, actorId: () => actorId, run: async () => result })(request());
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), result);
  }
});

test("exceptions and invalid aggregates expose no engine, SQL or provider narratives", async () => {
  for (const run of [async () => { throw new Error("PRIVATE secret SQL phone provider narrative"); },
    async () => completed({ scanned: Number.NaN }), async () => completed({ outcomes: { ...emptyOutcomes(), failed: -1 } })]) {
    const response = await createScheduledReminderHandler({ secret: () => secret, actorId: () => actorId, run })(request());
    assert.equal(response.status, 503);
    const body = await response.text();
    assert.doesNotMatch(body, /PRIVATE|secret|SQL|phone|provider narrative|NaN/);
    assert.equal(JSON.parse(body).hostedSchedulerConfigured, false);
  }
});

test("evaluation follows all internal pages and dispatches once through the guarded transaction", async () => {
  const db = database();
  const cursors = [];
  let dispatches = 0;
  const result = await runScheduledReminders(actorId, { transaction: db.transaction, clock: () => 0, now,
    evaluate: async (client, actor, timestamp, cursor) => {
      assert.equal(typeof client.query, "function");
      assert.equal(actor.id, actorId);
      assert.equal(actor.role, "ceo");
      assert.equal(actor.organizationId, ORGANIZATION_ID);
      assert.equal(timestamp, now());
      cursors.push(cursor);
      return cursor === null ? { scanned: 2, planned: 5, nextCursor: cursorId(1) } : { scanned: 1, planned: 3, nextCursor: null };
    }, dispatch: async (options) => {
      dispatches += 1;
      assert.equal(options.actor.id, actorId);
      assert.equal(options.limit, 5);
      assert.equal(options.timeoutMs, 10000);
      assert.equal(options.now(), now());
      assert.equal(await options.transaction(async () => "guarded"), "guarded");
      return { considered: 2, claimed: 1, blocked: false, outcomes: { provider_accepted: 1, privateNarrative: 100 } };
    } });
  assert.deepEqual(cursors, [null, cursorId(1)]);
  assert.equal(dispatches, 1);
  assert.deepEqual(result, completed());
  assert.equal(db.stats.rollbacks, 0);
});

test("missing, inactive, foreign or non-CEO membership cannot evaluate or dispatch", async () => {
  for (const changes of [{ role: "coordinator" }, { role: "mentor" }, { active: false }, { organization_id: cursorId(9) }, null]) {
    const db = database(changes ?? {});
    if (changes === null) db.remove();
    let work = 0;
    await assert.rejects(runScheduledReminders(actorId, { transaction: db.transaction, clock: () => 0, now,
      evaluate: async () => { work += 1; return { scanned: 0, planned: 0, nextCursor: null }; },
      dispatch: async () => { work += 1; return { considered: 0, claimed: 0, blocked: false, outcomes: {} }; } }), { message: "Scheduled actor unavailable." });
    assert.equal(work, 0);
  }
});

test("demotion during an evaluation rolls back that phase and cannot reach dispatch", async () => {
  const db = database();
  let dispatches = 0;
  await assert.rejects(runScheduledReminders(actorId, { transaction: db.transaction, clock: () => 0, now,
    evaluate: async () => { db.change({ role: "coordinator" }); return { scanned: 1, planned: 1, nextCursor: null }; },
    dispatch: async () => { dispatches += 1; return { considered: 0, claimed: 0, blocked: false, outcomes: {} }; } }), { message: "Scheduled actor unavailable." });
  assert.equal(db.stats.rollbacks, 1);
  assert.equal(dispatches, 0);
});

test("dispatcher transaction boundaries also reject a membership revoked after scanning", async () => {
  const db = database();
  let deliveryWork = 0;
  await assert.rejects(runScheduledReminders(actorId, { transaction: db.transaction, clock: () => 0, now,
    evaluate: async () => ({ scanned: 0, planned: 0, nextCursor: null }),
    dispatch: async (options) => {
      db.change({ active: false });
      return options.transaction(async () => { deliveryWork += 1; return { considered: 0, claimed: 0, blocked: false, outcomes: {} }; });
    } }), { message: "Scheduled actor unavailable." });
  assert.equal(deliveryWork, 0);
  assert.equal(db.stats.rollbacks, 1);
});

test("the page ceiling reports incomplete rather than dispatching a partial organization scan", async () => {
  const db = database();
  let evaluations = 0;
  let dispatches = 0;
  const result = await runScheduledReminders(actorId, { transaction: db.transaction, clock: () => 0, now,
    evaluate: async () => { evaluations += 1; return { scanned: 200, planned: 1, nextCursor: cursorId(evaluations) }; },
    dispatch: async () => { dispatches += 1; return { considered: 0, claimed: 0, blocked: false, outcomes: {} }; } });
  assert.equal(evaluations, 5);
  assert.equal(dispatches, 0);
  assert.equal(result.state, "scan_incomplete");
  assert.equal(result.scanComplete, false);
  assert.equal(result.more, true);
  assert.equal(result.scanned, 1000);
  assert.equal(result.pages, 5);
  assert.equal(result.claimed, 0);
});

test("elapsed budget and repeated cursors stop safely without pretending evaluation completed", async () => {
  for (const mode of ["time", "cursor"]) {
    const db = database();
    let elapsed = 0;
    let evaluations = 0;
    let dispatches = 0;
    const result = await runScheduledReminders(actorId, { transaction: db.transaction, clock: () => elapsed, now,
      evaluate: async () => { evaluations += 1; if (mode === "time") elapsed = 20001; return { scanned: 200, planned: 0, nextCursor: cursorId(1) }; },
      dispatch: async () => { dispatches += 1; return { considered: 0, claimed: 0, blocked: false, outcomes: {} }; } });
    assert.equal(result.state, "scan_incomplete");
    assert.equal(result.more, true);
    assert.equal(result.scanComplete, false);
    assert.equal(evaluations, mode === "time" ? 1 : 2);
    assert.equal(dispatches, 0);
  }
});

test("the real unconfigured dispatcher performs lease maintenance but no claim or delivery", async () => {
  const db = database();
  const result = await runScheduledReminders(actorId, { transaction: db.transaction, clock: () => 0, now,
    evaluate: async () => ({ scanned: 0, planned: 0, nextCursor: null }) });
  assert.equal(result.state, "delivery_blocked");
  assert.equal(result.scanComplete, true);
  assert.equal(result.deliveryBlocked, true);
  assert.equal(result.considered, 0);
  assert.equal(result.claimed, 0);
  assert.deepEqual(result.outcomes, emptyOutcomes());
  assert.equal(result.hostedSchedulerConfigured, false);
  assert.equal(db.stats.leases, 1);
  assert.equal(db.stats.queries.some((sql) => /INSERT|UPDATE|DELETE/.test(sql)), false);
});
