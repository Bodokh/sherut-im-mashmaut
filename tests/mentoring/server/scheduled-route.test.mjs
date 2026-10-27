import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import "./typescript-loader.mjs";

// Fail closed even if a future guard regression reaches the default runner.
// This mutation is isolated to this test process and never reads the value.
delete process.env.MENTORING_DATABASE_URL;
const require = createRequire(import.meta.url);
// The native runner does not boot Next's server. Initialize the installed
// runtime baseline before linking its request context and the real DB adapter.
require("next/dist/server/node-environment-baseline");
const { NextRequest } = require("next/server");
const { unstable_doesMiddlewareMatch: doesProxyMatch } = require("next/experimental/testing/server");
const scheduled = await import("../../../lib/mentoring/features/reminders/scheduled.ts");

function loadRoute(environment, run) {
  const source = readFileSync(new URL("../../../app/api/internal/mentoring/reminders/route.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiledModule = { exports: {} };
  new Function("require", "module", "exports", "process", compiled)((specifier) => {
    if (specifier.endsWith("/reminders/scheduled")) return run ? {
      createScheduledReminderHandler: (options) => scheduled.createScheduledReminderHandler({ ...options, run }),
    } : scheduled;
    throw new Error(`Unexpected route dependency: ${specifier}`);
  }, compiledModule, compiledModule.exports, { env: environment });
  return compiledModule.exports;
}

test("actual scheduled route fails closed and explicit HEAD never reads configuration", async () => {
  let reads = 0;
  const environment = new Proxy({}, { get() { reads += 1; throw new Error("HEAD must not read configuration"); } });
  const route = loadRoute(environment);
  assert.equal(typeof route.HEAD, "function");
  const response = await route.HEAD(new NextRequest("https://example.test/api/internal/mentoring/reminders", { method: "HEAD" }));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(await response.text(), "");
  assert.equal(reads, 0);
});

test("actual scheduled GET requires only its Bearer secret before actor or database work", async () => {
  let actorReads = 0;
  const environment = { CRON_SECRET: "scheduled-unit-secret" };
  Object.defineProperty(environment, "MENTORING_REMINDER_ACTOR_ID", { get() { actorReads += 1; throw new Error("must not inspect actor before auth"); } });
  const route = loadRoute(environment);
  for (const authorization of [undefined, "Bearer wrong-secret", "Basic scheduled-unit-secret"]) {
    const headers = authorization ? { authorization } : {};
    const response = await route.GET(new NextRequest("https://example.test/api/internal/mentoring/reminders", { headers }));
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await response.json(), { state: "unauthorized", hostedSchedulerConfigured: false });
  }
  assert.equal(actorReads, 0);
  const missingSecret = loadRoute({});
  const response = await missingSecret.GET(new NextRequest("https://example.test/api/internal/mentoring/reminders"));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { state: "not_configured", hostedSchedulerConfigured: false });
});

test("actual scheduled GET wires the configured membership only after authenticating", async () => {
  const actorId = "22222222-2222-4222-8222-222222222222";
  const called = [];
  const aggregate = {
    state: "delivery_blocked", scanned: 0, planned: 0, pages: 1, scanComplete: true, more: false,
    deliveryBlocked: true, considered: 0, claimed: 0,
    outcomes: { provider_accepted: 0, delivered: 0, failed: 0, uncertain: 0 }, hostedSchedulerConfigured: false,
  };
  // Only the external runner boundary is replaced; actual route environment
  // wiring, auth, input rejection and public projection remain under test.
  const route = loadRoute({ CRON_SECRET: "scheduled-unit-secret", MENTORING_REMINDER_ACTOR_ID: actorId }, async (id) => {
    called.push(id);
    return aggregate;
  });
  const response = await route.GET(new NextRequest("https://example.test/api/internal/mentoring/reminders", { headers: { authorization: "Bearer scheduled-unit-secret" } }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), aggregate);
  assert.deepEqual(called, [actorId]);
});

test("installed Next matcher leaves scheduled Bearer authentication outside the Clerk API path", () => {
  const source = readFileSync(new URL("../../../proxy.ts", import.meta.url), "utf8");
  const parsed = ts.createSourceFile("proxy.ts", source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  const declaration = parsed.statements.flatMap((statement) => ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : [])
    .find((item) => item.name.getText(parsed) === "config");
  assert.ok(declaration?.initializer, "proxy must export its real static matcher configuration");
  const compiled = ts.transpileModule(`export default ${declaration.initializer.getText(parsed)}`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const compiledModule = { exports: {} };
  new Function("module", "exports", compiled)(compiledModule, compiledModule.exports);
  const config = compiledModule.exports.default;
  for (const url of ["/api/internal/mentoring/reminders", "/api/internal/mentoring/reminders?actor=untrusted"]) {
    assert.equal(doesProxyMatch({ config, nextConfig: {}, url }), false, url);
  }
  assert.equal(doesProxyMatch({ config, nextConfig: {}, url: "/api/mentoring/workspace" }), true);
  assert.equal(doesProxyMatch({ config, nextConfig: {}, url: "/__clerk/v1/client" }), true);
});
