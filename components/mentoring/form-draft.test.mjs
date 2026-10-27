import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { reconcileStoredDraft } from "./draft-state.ts";
import { createHookRuntime } from "./test-hook-runtime.mjs";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = readFileSync(new URL("./form-draft.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
const empty = { displayName: "", profileNotes: "", baseVersion: null };

function deferred() {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function mountDraft(workspace, initial = empty, key = "participant-profile:new") {
  const runtime = createHookRuntime();
  let currentWorkspace = workspace;
  let currentInitial = initial;
  const compiledModule = { exports: {} };
  new Function("require", "module", "exports", compiled)((id) => {
    if (id === "react") return runtime.react;
    if (id === "@/lib/mentoring/workspace-client") return { useWorkspace: () => currentWorkspace };
    if (id === "./draft-state") return { reconcileStoredDraft };
    if (id === "lucide-react" || id === "@/components/staff/ui/button") return {};
    return require(id);
  }, compiledModule, compiledModule.exports);
  runtime.mount(() => compiledModule.exports.useFormDraft(key, currentInitial));
  return {
    get result() { return runtime.result; },
    flush: () => runtime.flush(),
    changeWorkspace(next, nextInitial = currentInitial) { currentWorkspace = next; currentInitial = nextInitial; runtime.rerender(); },
    unmount: () => runtime.unmount(),
  };
}

function storageFixture(initialDocument = null) {
  let document = structuredClone(initialDocument);
  const calls = { reads: [], writes: [], clears: [], submits: [] };
  let read = async () => structuredClone(document);
  let submit = async (command) => ({ ok: true, operationId: command.operationId, acceptance: "accepted", replayed: false, participantId: command.operationId });
  return {
    calls,
    get document() { return structuredClone(document); },
    readWith(callback) { read = callback; },
    submitWith(callback) { submit = callback; },
    workspace(draftScopeKey = "account-A:membership-A:authority-1") {
      // Every call intentionally creates new function identities, as the real
      // provider does when the authorized participant set changes.
      return {
        draftScopeKey,
        async readDraft(key) { calls.reads.push(key); return read(key); },
        async writeDraft(key, value) { calls.writes.push({ key, value: structuredClone(value) }); document = structuredClone(value); },
        async clearDraft(key) { calls.clears.push(key); document = null; },
        async submit(command) { calls.submits.push(structuredClone(command)); return submit(command); },
      };
    },
  };
}

test("accepted creation does not rehydrate or resurrect its prepared draft when workspace callbacks change", async () => {
  const fixture = storageFixture();
  const receipt = deferred();
  fixture.submitWith(async (command) => { await receipt.promise; return { ok: true, operationId: command.operationId, acceptance: "accepted", replayed: false, participantId: command.operationId }; });
  const workspace = fixture.workspace();
  const form = mountDraft(workspace);
  await form.flush();
  assert.equal(form.result.hydrated, true);
  form.result.update({ ...empty, displayName: "חניכה ראשונה", profileNotes: "פרטים שנשמרו" });
  await form.flush();
  const activeForm = form.result;
  const payload = { type: "create_participant", fields: { displayName: activeForm.value.displayName, profileNotes: activeForm.value.profileNotes } };
  const saving = (async () => {
    const operationId = await activeForm.prepare(payload);
    const result = await workspace.submit({ ...payload, operationId });
    await activeForm.clear();
    return result;
  })();
  await form.flush();
  assert.ok(fixture.document.intent);
  assert.equal(fixture.calls.submits.length, 1);
  const writesBeforeRefresh = fixture.calls.writes.length;
  form.changeWorkspace(fixture.workspace());
  await form.flush();
  assert.equal(fixture.calls.reads.length, 1, "a wider prepared workspace is not another form mount or draft recovery");
  assert.equal(fixture.calls.writes.length, writesBeforeRefresh, "callback changes alone must not resave the prepared envelope");
  receipt.resolve();
  const accepted = await saving;
  await form.flush();
  assert.equal(accepted.acceptance, "accepted");
  assert.equal(fixture.document, null);
  assert.equal(fixture.calls.submits.length, 1);
  assert.equal(form.result.recovered, null);
  form.unmount();

  const fresh = mountDraft(fixture.workspace());
  await fresh.flush();
  assert.deepEqual(fresh.result.value, empty);
  assert.equal(fresh.result.recovered, null);
  assert.equal(fresh.result.hydrated, true);
  fresh.result.update({ ...empty, displayName: "חניכה שנייה" });
  await fresh.flush();
  assert.equal(fixture.document.value.displayName, "חניכה שנייה");
  assert.equal(fixture.document.intent, null);
  assert.equal(fixture.calls.submits.length, 1, "a fresh new form must not replay its previously accepted creation");
  fresh.unmount();
});

for (const acceptance of ["accepted", "queued"]) {
  test(`a prepared ${acceptance} save survives a real remount and reconciles its exact immutable identity`, async () => {
    const operationId = crypto.randomUUID();
    const payload = { type: "create_participant", fields: { displayName: "נשמרה לפני נפילת החיבור" } };
    const stored = { kind: "mentoring-form-draft-v1", value: { ...empty, displayName: payload.fields.displayName }, intent: { operationId, signature: JSON.stringify(payload) } };
    const fixture = storageFixture(stored);
    fixture.submitWith(async (command) => ({ ok: true, operationId: command.operationId, acceptance, replayed: true, participantId: operationId }));
    const form = mountDraft(fixture.workspace());
    await form.flush();
    assert.deepEqual(fixture.calls.submits, [{ ...payload, operationId }]);
    assert.equal(form.result.recovered.operationId, operationId);
    assert.equal(form.result.recovered.acceptance, acceptance);
    assert.equal(form.result.recovered.replayed, true);
    assert.deepEqual(form.result.value, stored.value);
    assert.equal(fixture.document.intent.operationId, operationId);
    assert.equal(fixture.calls.writes.length, 0, "successful reconciliation does not invent a new draft or intent");
    form.changeWorkspace(fixture.workspace());
    await form.flush();
    assert.equal(fixture.calls.submits.length, 1, "the recovered result remains until explicit review, without callback-driven replay");
    form.unmount();
  });
}

test("an uncertain saved operation keeps editing locked and retries the same prepared identity", async () => {
  const operationId = crypto.randomUUID();
  const payload = { type: "create_participant", fields: { displayName: "בקשה עם אישור שאבד" } };
  const stored = { kind: "mentoring-form-draft-v1", value: { ...empty, displayName: payload.fields.displayName }, intent: { operationId, signature: JSON.stringify(payload) } };
  const fixture = storageFixture(stored);
  fixture.submitWith(async () => ({ ok: false, error: { code: "unavailable", message: "החיבור נקטע" } }));
  const form = mountDraft(fixture.workspace());
  await form.flush();
  assert.equal(form.result.hydrated, false);
  assert.equal(form.result.status, "load_error");
  assert.deepEqual(fixture.document, stored);
  await assert.rejects(form.result.prepare(payload), /hydration/i);
  fixture.submitWith(async (command) => ({ ok: true, operationId: command.operationId, acceptance: "accepted", replayed: true, participantId: operationId }));
  form.result.retry();
  await form.flush();
  assert.equal(form.result.recovered.operationId, operationId);
  assert.deepEqual(fixture.calls.submits, [{ ...payload, operationId }, { ...payload, operationId }]);
  assert.equal(fixture.calls.writes.length, 0);
  form.unmount();
});

test("a changed authorization scope cancels a previous identity's in-flight draft hydration", async () => {
  const oldRead = deferred();
  const original = storageFixture();
  original.readWith(async () => oldRead.promise);
  const form = mountDraft(original.workspace("account-A:authority-1"));
  await form.flush();
  assert.equal(form.result.hydrated, false);
  const next = storageFixture();
  const authorizedInitial = { ...empty, displayName: "ברירת מחדל לחשבון החדש" };
  form.changeWorkspace(next.workspace("account-B:authority-1"), authorizedInitial);
  await form.flush();
  assert.equal(form.result.hydrated, true);
  oldRead.resolve({ kind: "mentoring-form-draft-v1", value: { ...empty, displayName: "מידע פרטי מהחשבון הקודם" }, intent: { operationId: crypto.randomUUID(), signature: JSON.stringify({ type: "create_participant", fields: { displayName: "מידע קודם" } }) } });
  await form.flush();
  assert.equal(original.calls.submits.length, 0);
  assert.equal(next.calls.submits.length, 0);
  assert.deepEqual(form.result.value, authorizedInitial);
  assert.equal(form.result.recovered, null);
  form.unmount();
});

test("a new authorization scope immediately hides an already recovered private value even when its own load fails", async () => {
  const operationId = crypto.randomUUID();
  const payload = { type: "create_participant", fields: { displayName: "מידע פרטי בחשבון הראשון" } };
  const stored = { kind: "mentoring-form-draft-v1", value: { ...empty, displayName: payload.fields.displayName }, intent: { operationId, signature: JSON.stringify(payload) } };
  const original = storageFixture(stored);
  original.submitWith(async () => ({ ok: true, operationId, acceptance: "accepted", replayed: true, participantId: operationId }));
  const form = mountDraft(original.workspace("account-A:authority-1"));
  await form.flush();
  assert.equal(form.result.hydrated, true);
  assert.equal(form.result.value.displayName, payload.fields.displayName);
  assert.equal(form.result.recovered.operationId, operationId);

  const nextRead = deferred();
  const next = storageFixture();
  next.readWith(async () => nextRead.promise);
  form.changeWorkspace(next.workspace("account-B:authority-1"), empty);
  assert.equal(form.result.hydrated, false);
  assert.deepEqual(form.result.value, empty, "the previous recovered fields must not flash during another account's pending load");
  assert.equal(form.result.recovered, null, "the previous receipt must not appear as this account's recovered save");
  await form.flush();
  nextRead.reject(new Error("local storage is unavailable"));
  await form.flush();
  assert.equal(form.result.status, "load_error");
  assert.equal(form.result.hydrated, false);
  assert.deepEqual(form.result.value, empty);
  assert.equal(form.result.recovered, null);
  assert.deepEqual(original.document, stored, "hiding another account's value does not destroy its original immutable intent");
  assert.equal(original.calls.submits.length, 1);
  assert.equal(next.calls.submits.length, 0);
  form.unmount();
});
