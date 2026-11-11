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

function snapshot(account = "A", role = "ceo", deleted = false) {
  const now = Date.now();
  const actor = { id: `staff_${account}`, authUserId: account, organizationId: `org_${account}`, role, active: true, version: 1, displayName: "Admin", email: null, phone: null, coordinatorId: null, smsMuted: false };
  const card = (id) => ({ participant: { id, organizationId: actor.organizationId, displayName: id === "p" ? "חניכה" : "אחרת", phone: null, serviceType: null, servicePlace: null, serviceRole: null, profileNotes: null, lifecycle: "active", version: 1, createdAt: new Date(now).toISOString() }, assignment: null, nextAppointment: null, manualColor: null, manualColorAt: null, contacts: [], reviews: [], protections: [] });
  return { actor, staff: [actor], participants: deleted ? [card("other")] : [card("p"), card("other")], conflicts: [], ...(deleted ? { permanentlyDeletedParticipantIds: ["p"] } : {}), serverTime: new Date(now - 100).toISOString(), offlineValidUntil: new Date(now + 3_600_000).toISOString(), capabilities: { smsConfigured: false, smsSendingEnabled: false } };
}
const command = () => ({ type: "permanently_delete_participant", operationId: crypto.randomUUID(), participantId: "p", expectedVersion: 1, reason: "מחיקה לפי בקשה", confirmationName: "חניכה" });
const accepted = (intent) => Response.json({ ok: true, operationId: intent.operationId, participantId: intent.participantId, acceptance: "accepted", replayed: false });
async function prepared(t, role = "ceo") {
  navigator.onLine = true;
  await offline.mentoringOfflineStore.clear();
  globalThis.fetch = async () => Response.json(snapshot("A", role));
  const controller = new Controller();
  t.after(() => controller.dispose());
  await controller.updateAuth(true, "A");
  return controller;
}

test("permanent deletion is online-only through both submit surfaces and never queues", async (t) => {
  const controller = await prepared(t);
  navigator.onLine = false;
  controller.offline();
  let posts = 0;
  globalThis.fetch = async () => { ++posts; throw new Error("offline"); };
  assert.equal((await controller.submitOnline(command())).error.code, "unavailable");
  assert.equal((await controller.submit(command())).error.code, "unavailable");
  assert.equal(posts, 0);
  const session = await offline.mentoringOfflineStore.readSession("A");
  assert.deepEqual(await offline.mentoringOfflineStore.operations(session.scope), []);
});

test("current non-CEO cannot submit a permanent delete even with a copied intent", async (t) => {
  const controller = await prepared(t, "mentor");
  let posts = 0;
  globalThis.fetch = async () => { ++posts; throw new Error("must not send"); };
  assert.equal((await controller.submitOnline(command())).error.code, "forbidden");
  assert.equal(posts, 0);
});

test("accepted permanent deletion clears the current device before resolving and preserves unrelated drafts", async (t) => {
  const controller = await prepared(t);
  await controller.writeDraft("A", "contact:other", { notes: "keep" });
  const intent = command();
  let posts = 0;
  globalThis.fetch = async (_url, options) => {
    if (!options?.method) return Response.json(snapshot("A", "ceo", true));
    ++posts;
    assert.deepEqual(JSON.parse(options.body), intent);
    return accepted(intent);
  };
  const result = await controller.submitOnline(intent);
  assert.equal(result.ok, true);
  assert.equal(posts, 1);
  assert.deepEqual(controller.getSnapshot().snapshot.participants.map((view) => view.participant.id), ["other"]);
  assert.deepEqual(await controller.readDraft("A", "contact:other"), { notes: "keep" });
  assert.equal(controller.getSnapshot().pendingCount, 0);
});

test("lost-response deletion requires explicit same-intent retry and rejects a mismatched accepted card", async (t) => {
  const controller = await prepared(t);
  const intent = command();
  const sent = [];
  globalThis.fetch = async (_url, options) => {
    if (!options?.method) return Response.json(snapshot("A", "ceo", sent.length >= 3));
    sent.push(JSON.parse(options.body));
    if (sent.length === 1) throw new Error("lost response");
    if (sent.length === 2) return accepted({ ...intent, participantId: "different" });
    return accepted(intent);
  };
  assert.equal((await controller.submitOnline(intent)).error.code, "unavailable");
  assert.equal(controller.getSnapshot().snapshot.participants.some((view) => view.participant.id === "p"), true);
  assert.equal((await controller.submitOnline(intent)).error.code, "unavailable");
  assert.equal(controller.getSnapshot().snapshot.participants.some((view) => view.participant.id === "p"), true);
  assert.equal((await controller.submitOnline(intent)).ok, true);
  assert.deepEqual(sent, [intent, intent, intent]);
});

test("local card drafts block permanent deletion before POST and an unknown SMS result has clear guidance", async (t) => {
  const controller = await prepared(t);
  await controller.writeDraft("A", "contact:p", { notes: "not saved" });
  let posts = 0;
  globalThis.fetch = async () => { ++posts; return Response.json({ ok: false, error: { code: "conflict", field: "reminderDelivery", message: "server narrative must not be surfaced" } }, { status: 409 }); };
  const result = await controller.submitOnline(command());
  assert.equal(result.error.code, "conflict");
  assert.match(result.error.message, /עבודה מקומית/);
  assert.equal(posts, 0);
  await controller.clearDraft("A", "contact:p");
  const blocked = await controller.submitOnline(command());
  assert.match(blocked.error.message, /ספק המסרונים/);
  assert.doesNotMatch(blocked.error.message, /server narrative/);
});

test("a local cleanup failure after central deletion locks residual private data", async (t) => {
  const controller = await prepared(t);
  const original = offline.mentoringOfflineStore.purgeParticipant;
  offline.mentoringOfflineStore.purgeParticipant = async () => { throw new Error("IndexedDB failure"); };
  t.after(() => { offline.mentoringOfflineStore.purgeParticipant = original; });
  globalThis.fetch = async (_url, options) => options?.method ? accepted(JSON.parse(options.body)) : Response.json(snapshot());
  const result = await controller.submitOnline(command());
  assert.equal(result.error.code, "unavailable");
  assert.equal(controller.getSnapshot().snapshot, null);
  assert.equal(offline.isMentoringOfflineAccessPrepared(), false);
});

test("identity change during accepted cleanup never locks or navigates the replacement account", async (t) => {
  const controller = await prepared(t);
  const original = offline.mentoringOfflineStore.purgeParticipant;
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  let finish;
  const gate = new Promise((resolve) => { finish = resolve; });
  offline.mentoringOfflineStore.purgeParticipant = async (...args) => { entered(); await gate; return original(...args); };
  t.after(() => { offline.mentoringOfflineStore.purgeParticipant = original; });
  globalThis.fetch = async (_url, options) => options?.method ? accepted(JSON.parse(options.body)) : Response.json(snapshot("B"));
  const pending = controller.submitOnline(command());
  await started;
  await controller.updateAuth(true, "B");
  finish();
  assert.equal((await pending).error.code, "not_authenticated");
  assert.equal(controller.getSnapshot().snapshot.actor.authUserId, "B");
  assert.equal(offline.isMentoringOfflineAccessPrepared(), true);
});
