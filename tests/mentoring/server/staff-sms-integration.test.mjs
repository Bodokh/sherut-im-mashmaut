import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { parseCommand, commandHash } from "../../../lib/mentoring/server/validation.ts";
import { executeCommand } from "../../../lib/mentoring/server/commands.ts";
import { getDatabasePool, ORGANIZATION_ID, serverFailure } from "../../../lib/mentoring/server/db.ts";
import * as http from "../../../lib/mentoring/server/http.ts";
import { createScheduledStaffSmsHandler } from "../../../lib/mentoring/features/staff-messages/scheduled.ts";

const actorId = randomUUID();
const staffId = randomUUID();
const now = "2026-11-09T14:00:00.000Z";
const command = (overrides = {}) => ({ type: "send_staff_sms", operationId: randomUUID(), message: "הודעה לצוות", recipients: [{ staffId, expectedVersion: 2 }], ...overrides });

test("staff SMS schema accepts only reviewed staff IDs and a bounded message", () => {
  const original = command();
  assert.deepEqual(parseCommand(original), { ok: true, command: original });
  assert.equal(parseCommand(command({ message: "  שלום  " })).command.message, "שלום");
  for (const overrides of [{ message: " " }, { message: "א".repeat(1001) }, { recipients: [] }, { recipients: [{ staffId }] }, { recipients: [{ staffId, expectedVersion: 0 }] }, { recipients: [{ staffId, expectedVersion: 2, phone: "+972501234567" }] }, { phone: "+972501234567" }, { organizationId: randomUUID() }]) {
    assert.equal(parseCommand(command(overrides)).ok, false, JSON.stringify(overrides));
  }
  const recipient = { staffId, expectedVersion: 2 };
  assert.equal(parseCommand(command({ recipients: [recipient, recipient] })).ok, false);
  const sorted = [staffId, actorId].sort().map((id) => ({ staffId: id, expectedVersion: 2 }));
  assert.equal(parseCommand(command({ recipients: sorted })).ok, true);
  assert.equal(parseCommand(command({ recipients: [...sorted].reverse() })).ok, false);
});

process.env.MENTORING_DATABASE_URL = "postgres://unused:unused@localhost/unused";
const pool = getDatabasePool();
const originalConnect = pool.connect;
let actor;
let recipient;
let receipt;
let receiptReads;
let writes;
function reset(role = "ceo") {
  actor = { id: actorId, organization_id: ORGANIZATION_ID, auth_user_id: "sms-admin", display_name: "Admin", role, active: true, version: 1 };
  recipient = { id: staffId, organization_id: ORGANIZATION_ID, display_name: "Staff", role: "mentor", active: true, phone: "+972501234567", sms_muted: false, version: 2 };
  receipt = null;
  receiptReads = 0;
  writes = [];
}
const client = {
  async query(sql, parameters = []) {
    if (/^(BEGIN|COMMIT|ROLLBACK|SET LOCAL)/.test(sql)) return { rows: [], rowCount: 0 };
    if (sql.includes("FROM mentoring.memberships WHERE organization_id = $1 AND auth_user_id")) return { rows: actor && parameters[1] === actor.auth_user_id ? [actor] : [] };
    if (sql.includes("FROM mentoring.memberships WHERE organization_id=$1 AND id=ANY")) return { rows: [actor, recipient] };
    if (sql.includes("clock_timestamp() AS now")) return { rows: [{ now }] };
    if (sql.includes("FROM mentoring.operations")) { receiptReads += 1; return { rows: receipt ? [receipt] : [] }; }
    if (/^INSERT INTO mentoring\.(staff_sms_batches|staff_sms_deliveries|audit|operations)/.test(sql)) {
      writes.push({ sql, parameters });
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected query: ${sql}`);
  },
  release() {},
};
pool.connect = async () => client;
test.after(() => { pool.connect = originalConnect; });

function acceptedReceipt(value) {
  receipt = { payload_hash: commandHash(value), response: { ok: true, operationId: value.operationId, acceptance: "accepted", replayed: false, staffSmsBatchId: value.operationId } };
}

test("manual SMS requires current active CEO authority before reading a prior receipt", async () => {
  for (const role of ["mentor", "coordinator"]) {
    reset(role);
    const value = command();
    acceptedReceipt(value);
    assert.equal((await executeCommand("sms-admin", null, value)).error?.code, "forbidden");
    assert.equal(receiptReads, 0);
  }
  reset();
  actor.active = false;
  assert.equal((await executeCommand("sms-admin", null, command())).error?.code, "not_staff");
  assert.equal(receiptReads, 0);
  assert.deepEqual(writes, []);
});

test("manual SMS replay returns its original batch without revalidating recipients or resending", async () => {
  reset();
  const value = command();
  acceptedReceipt(value);
  recipient.active = false;
  recipient.version += 1;
  const result = await executeCommand("sms-admin", null, value);
  assert.equal(result.replayed, true);
  assert.equal(result.staffSmsBatchId, value.operationId);
  assert.equal((await executeCommand("sms-admin", null, { ...value, message: "שינוי" })).error?.code, "conflict");
  assert.deepEqual(writes, []);
});

test("manual SMS creation commits batch, audit and receipt through the existing envelope", async (t) => {
  t.mock.method(globalThis, "fetch", () => assert.fail("commands must not contact the SMS provider"));
  const keys = ["MENTORING_SMS_PROVIDER", "MENTORING_SMS_SENDING_ENABLED", "MENTORING_MICROPAY_TOKEN", "MENTORING_MICROPAY_SENDER"];
  const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  t.after(() => { for (const key of keys) { if (prior[key] === undefined) delete process.env[key]; else process.env[key] = prior[key]; } });
  process.env.MENTORING_SMS_PROVIDER = "micropay";
  process.env.MENTORING_SMS_SENDING_ENABLED = "true";
  process.env.MENTORING_MICROPAY_TOKEN = "synthetic-unit-token";
  process.env.MENTORING_MICROPAY_SENDER = "TestSender";
  reset();
  const value = command();
  const result = await executeCommand("sms-admin", null, value);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.staffSmsBatchId, value.operationId);
  assert.deepEqual(writes.map((write) => write.sql.match(/^INSERT INTO mentoring\.([a-z_]+)/)[1]), ["staff_sms_batches", "staff_sms_deliveries", "audit", "operations"]);
  const audit = JSON.parse(writes[2].parameters[6]);
  assert.deepEqual(audit, { staffSmsBatchId: value.operationId, recipientCount: 1, deliveryCount: 1 });
  assert.doesNotMatch(JSON.stringify(audit), /הודעה|\+972501234567/);
  reset();
  recipient.version = 3;
  assert.equal((await executeCommand("sms-admin", null, value)).error?.code, "conflict");
  assert.deepEqual(writes, []);
  reset();
  process.env.MENTORING_SMS_SENDING_ENABLED = "false";
  assert.equal((await executeCommand("sms-admin", null, value)).error?.code, "unavailable");
  assert.deepEqual(writes, []);
});

function compileRoute(path, requireDependency, environment = process.env) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiledModule = { exports: {} };
  new Function("require", "module", "exports", "process", compiled)(requireDependency, compiledModule, compiledModule.exports, { env: environment });
  return compiledModule.exports;
}

test("the command route schedules a committed new SMS batch after responding, never a replay or rejection", async () => {
  const value = command();
  let result = { ok: true, operationId: value.operationId, acceptance: "accepted", replayed: false, staffSmsBatchId: value.operationId };
  let calls = 0;
  let verified = { userId: "sms-admin", verifiedEmail: null };
  const scheduled = [];
  const dispatched = [];
  const route = compileRoute("../../../app/api/mentoring/commands/route.ts", (specifier) => {
    if (specifier === "next/server") return { after: (run) => scheduled.push(run) };
    if (specifier.endsWith("/auth")) return { getVerifiedIdentity: async () => verified };
    if (specifier.endsWith("/commands")) return { executeCommand: async () => { calls += 1; return result; } };
    if (specifier.endsWith("/db")) return { ORGANIZATION_ID, serverFailure };
    if (specifier.endsWith("/http")) return http;
    if (specifier.endsWith("/staff-onboarding")) return { dispatchStaffOnboardingEmails: () => assert.fail("not an invite") };
    if (specifier.endsWith("/staff-onboarding-email")) return { staffOnboardingSender: () => assert.fail("not an invite") };
    if (specifier.endsWith("/staff-messages/dispatcher")) return { runStaffSmsDispatcher: async (options) => dispatched.push(options) };
    throw new Error(`Unexpected dependency ${specifier}`);
  });
  const request = (account = "sms-admin") => new Request("https://example.test/api/mentoring/commands", { method: "POST", headers: { origin: "https://example.test", "content-type": "application/json", "X-Mentoring-Account": account }, body: JSON.stringify(value) });
  assert.equal((await route.POST(request())).status, 200);
  assert.equal(scheduled.length, 1);
  assert.deepEqual(dispatched, []);
  await scheduled.shift()();
  assert.deepEqual(dispatched, [{ organizationId: ORGANIZATION_ID, batchId: value.operationId, limit: 5, timeoutMs: 10_000 }]);
  result = { ...result, replayed: true };
  assert.equal((await route.POST(request())).status, 200);
  result = { ok: false, error: { code: "forbidden", message: "אין הרשאה" } };
  assert.equal((await route.POST(request())).status, 403);
  assert.equal((await route.POST(request("other-account"))).status, 401);
  verified = null;
  assert.equal((await route.POST(request())).status, 401);
  assert.equal(calls, 3);
  assert.deepEqual(scheduled, []);
});

test("staff SMS cron rejects HEAD, invalid credentials and query overrides before dispatch", async () => {
  const calls = [];
  const route = compileRoute("../../../app/api/internal/mentoring/staff-messages/route.ts", (specifier) => {
    assert.ok(specifier.endsWith("/staff-messages/scheduled"));
    return { createScheduledStaffSmsHandler: (options) => createScheduledStaffSmsHandler({ ...options, run: async (input) => {
      calls.push(input);
      return { considered: 3, claimed: 2, blocked: false, outcomes: { provider_accepted: 1, uncertain: 1 }, secret: "do-not-export" };
    } }) };
  }, { CRON_SECRET: "unit-cron-secret" });
  const endpoint = "https://example.test/api/internal/mentoring/staff-messages";
  assert.equal((await route.HEAD(new Request(endpoint, { method: "HEAD" }))).status, 405);
  for (const headers of [{}, { authorization: "Bearer wrong" }, { authorization: "bearer unit-cron-secret" }]) assert.equal((await route.GET(new Request(endpoint, { headers }))).status, 401);
  const headers = { authorization: "Bearer unit-cron-secret" };
  assert.equal((await route.GET(new Request(`${endpoint}?batchId=untrusted`, { headers }))).status, 400);
  assert.deepEqual(calls, []);
  const response = await route.GET(new Request(endpoint, { headers }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.deepEqual(await response.json(), { state: "completed", considered: 3, claimed: 2, outcomes: { provider_accepted: 1, delivered: 0, failed: 0, uncertain: 1, cancelled: 0 } });
  assert.deepEqual(calls, [{ organizationId: ORGANIZATION_ID, limit: 5, timeoutMs: 10_000 }]);
});

test("staff SMS cron sanitizes failures and rejects invalid dispatch aggregates", async () => {
  const request = () => new Request("https://example.test/api/internal/mentoring/staff-messages", { headers: { authorization: "Bearer unit-cron-secret" } });
  for (const run of [async () => { throw new Error("sensitive provider failure"); }, async () => ({ considered: -1, claimed: 0, blocked: false, outcomes: {} })]) {
    const response = await createScheduledStaffSmsHandler({ secret: () => "unit-cron-secret", run })(request());
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { state: "unavailable" });
  }
  let reads = 0;
  const head = createScheduledStaffSmsHandler({ secret: () => { reads += 1; throw new Error("must not read config"); } });
  assert.equal((await head(new Request(request(), { method: "HEAD" }))).status, 405);
  assert.equal(reads, 0);
  const missing = await createScheduledStaffSmsHandler({ secret: () => undefined })(request());
  assert.equal(missing.status, 503);
  assert.deepEqual(await missing.json(), { state: "not_configured" });
});
