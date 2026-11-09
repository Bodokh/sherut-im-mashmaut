import assert from "node:assert/strict";
import { createRequire, registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const require = createRequire(`${root}/package.json`);
require("fake-indexeddb/auto");
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && context.parentURL?.includes("/lib/mentoring/") && !/\.[a-z]+$/i.test(specifier)) {
    try { return nextResolve(`${specifier}.ts`, context); } catch { /* Preserve installed module resolution. */ }
  }
  return nextResolve(specifier, context);
} });
const offline = await import("../../../lib/mentoring/offline.ts");
const staffHost = await import("../../../lib/staff-host.ts");
const ts = require("typescript");
const loaded = { exports: {} };
const source = `${readFileSync(`${root}/lib/mentoring/workspace-client.tsx`, "utf8")}\nexports.Controller = WorkspaceController;`;
new Function("require", "module", "exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText)(
  (id) => id === "./offline" ? offline : id === "@clerk/nextjs" ? {} : id === "@/lib/staff-host" ? staffHost : require(id), loaded, loaded.exports,
);
const Controller = loaded.exports.Controller;
const storage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};
globalThis.window = Object.assign(new EventTarget(), { localStorage: storage(), sessionStorage: storage() });
let cookie = "";
globalThis.document = { get cookie() { return cookie; }, set cookie(value) { cookie = value.split(";")[0]; } };
globalThis.location = { protocol: "https:" };
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: true } });

function snapshot(account = "A", role = "ceo") {
  const now = Date.now();
  const actor = { id: `staff_${account}`, authUserId: account, organizationId: `org_${account}`, role, active: true, version: 1, displayName: "Admin", email: null, phone: null, coordinatorId: null, smsMuted: false };
  return { actor, staff: [actor, { ...actor, id: "staff_other", role: "mentor", authUserId: "other", phone: "+972501234567" }], participants: [], conflicts: [], serverTime: new Date(now - 100).toISOString(), offlineValidUntil: new Date(now + 3_600_000).toISOString(), capabilities: { smsConfigured: true, smsSendingEnabled: true } };
}
const command = () => ({ type: "send_staff_sms", operationId: crypto.randomUUID(), message: "Staff SMS check", recipients: [{ staffId: "staff_other", expectedVersion: 1 }] });
const accepted = (operationId) => Response.json({ ok: true, operationId, acceptance: "accepted", replayed: false, staffSmsBatchId: operationId });
async function prepared(t, role = "ceo") {
  navigator.onLine = true;
  await offline.mentoringOfflineStore.clear();
  globalThis.fetch = async () => Response.json(snapshot("A", role));
  const controller = new Controller();
  t.after(() => controller.dispose());
  await controller.updateAuth(true, "A");
  assert.equal(controller.getSnapshot().snapshot.actor.authUserId, "A");
  return controller;
}
async function assertNoQueuedSms(controller) {
  const session = await offline.mentoringOfflineStore.readSession("A");
  if (session) assert.deepEqual(await offline.mentoringOfflineStore.operations(session.scope), []);
  assert.equal(await offline.mentoringOfflineStore.unsyncedCount(), 0);
  assert.equal(controller.getSnapshot().pendingCount, 0);
}

test("offline direct and generic SMS submissions never enter the durable queue", async (t) => {
  const controller = await prepared(t);
  navigator.onLine = false;
  controller.offline();
  let posts = 0;
  globalThis.fetch = async () => { ++posts; throw new Error("offline SMS must not post"); };
  for (const submit of [controller.submitOnline, controller.submit]) {
    const result = await submit(command());
    assert.equal(result.ok, false);
  }
  assert.equal(posts, 0);
  await assertNoQueuedSms(controller);
});

test("online SMS requires a currently loaded CEO identity", async (t) => {
  const coordinator = await prepared(t, "coordinator");
  let posts = 0;
  globalThis.fetch = async () => { ++posts; throw new Error("non-CEO SMS must not post"); };
  assert.equal((await coordinator.submitOnline(command())).ok, false);
  assert.equal(posts, 0);
  await assertNoQueuedSms(coordinator);
  coordinator.dispose();

  const controller = await prepared(t);
  navigator.onLine = false;
  await controller.updateAuth(false, undefined);
  navigator.onLine = true;
  globalThis.fetch = async () => { ++posts; throw new Error("unverified identity must not post"); };
  assert.equal((await controller.submitOnline(command())).ok, false);
  assert.equal(posts, 0);
  await assertNoQueuedSms(controller);
});

test("unknown outcomes never queue or automatically resend; an explicit retry preserves the intent", async (t) => {
  for (const outcome of ["network", "truncated", "wrong_id", "queued", "server_error"]) {
    await t.test(outcome, async (subtest) => {
      const controller = await prepared(subtest);
      const intent = command();
      const posted = [];
      globalThis.fetch = async (_url, options) => {
        if (!options?.method) return Response.json(snapshot());
        assert.equal(options.headers["X-Mentoring-Account"], "A");
        posted.push(JSON.parse(options.body));
        if (outcome === "network") throw new Error("connection interrupted");
        if (outcome === "truncated") return { ok: true, status: 200, json: async () => { throw new SyntaxError("truncated"); } };
        if (outcome === "wrong_id") return accepted(crypto.randomUUID());
        if (outcome === "queued") return Response.json({ ok: true, operationId: intent.operationId, acceptance: "queued", replayed: false });
        return Response.json({ ok: false, error: { code: "unavailable", message: "server interrupted" } }, { status: 503 });
      };
      const result = await controller.submitOnline(intent);
      assert.equal(result.ok, false);
      assert.equal(result.error.code, "unavailable");
      await controller.refresh();
      assert.deepEqual(posted, [intent], "refresh must never replay a manual SMS");
      await assertNoQueuedSms(controller);
      globalThis.fetch = async (_url, options) => {
        if (!options?.method) return Response.json(snapshot());
        assert.equal(options.headers["X-Mentoring-Account"], "A");
        posted.push(JSON.parse(options.body));
        return accepted(intent.operationId);
      };
      const retried = await controller.submitOnline(intent);
      assert.equal(retried.ok && retried.acceptance, "accepted");
      assert.deepEqual(posted, [intent, intent]);
      await controller.refresh();
      await assertNoQueuedSms(controller);
    });
  }
});

test("account changes cancel a waiting SMS and suppress an old response", async (t) => {
  const controller = await prepared(t);
  let account = "A";
  let posts = 0;
  let releaseQueue;
  controller.submitTask = new Promise((resolve) => { releaseQueue = resolve; });
  globalThis.fetch = async (_url, options) => {
    if (!options?.method) return Response.json(snapshot(account));
    ++posts;
    return accepted(JSON.parse(options.body).operationId);
  };
  const waiting = controller.submitOnline(command());
  account = "B";
  await controller.updateAuth(true, "B");
  releaseQueue();
  assert.equal((await waiting).ok, false);
  assert.equal(posts, 0);
  assert.equal((await controller.submitOnline(command(), "A")).ok, false);
  assert.equal(posts, 0, "callbacks bound to A cannot send as B");

  account = "A";
  await controller.updateAuth(true, "A");
  let started;
  let releaseResponse;
  const postStarted = new Promise((resolve) => { started = resolve; });
  const responseGate = new Promise((resolve) => { releaseResponse = resolve; });
  const intent = command();
  globalThis.fetch = async (_url, options) => {
    if (!options?.method) return Response.json(snapshot(account));
    ++posts;
    started();
    await responseGate;
    return accepted(intent.operationId);
  };
  const inflight = controller.submitOnline(intent);
  await postStarted;
  account = "B";
  await controller.updateAuth(true, "B");
  releaseResponse();
  assert.equal((await inflight).ok, false, "A's receipt must not be exposed to B");
  assert.equal(controller.getSnapshot().snapshot.actor.authUserId, "B");
  assert.equal(posts, 1);
  assert.equal(await offline.mentoringOfflineStore.unsyncedCount(), 0);
});

test("authentication failures close local access without leaving an SMS to resend", async (t) => {
  for (const status of [401, 403]) {
    await t.test(String(status), async (subtest) => {
      const controller = await prepared(subtest);
      globalThis.fetch = async () => new Response("", { status });
      const result = await controller.submitOnline(command());
      assert.equal(result.ok, false);
      assert.equal(controller.getSnapshot().snapshot, null);
      await assertNoQueuedSms(controller);
    });
  }
});
