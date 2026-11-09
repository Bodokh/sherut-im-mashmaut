import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { createHookRuntime } from "../../components/mentoring/test-hook-runtime.mjs";

function elements(tree) {
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(elements)];
}
function text(tree) {
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  return tree && typeof tree === "object" ? [tree.props?.children].flat(Infinity).map(text).join("") : "";
}
function snapshot() {
  const actor = { id: "ceo", organizationId: "org", authUserId: "account", displayName: "Daniel", role: "ceo", active: true, version: 1, phone: "0501234567", smsMuted: false };
  const member = (id, fields = {}) => ({ ...actor, id, authUserId: id, displayName: id, role: "mentor", phone: "0521234567", ...fields });
  return { actor, staff: [actor, member("z-mentor"), member("a-shared"), member("missing", { phone: null }), member("invalid", { phone: "123" }), member("muted", { role: "ceo", smsMuted: true }), member("pending", { localPending: true }), member("inactive", { active: false })], participants: [], conflicts: [], staffSmsBatches: [] };
}
const normalize = (value) => /^05\d{8}$/.test(value ?? "") ? `+972${value.slice(1)}` : null;

function harness(t, initial = {}) {
  let runtime;
  let scopeKey;
  let shell;
  const posts = [];
  const props = { snapshot: snapshot(), isOnline: true, refresh: async () => {}, submitOnline: async (command) => { posts.push(command); return { ok: true, operationId: command.operationId, replayed: false, acceptance: "accepted", staffSmsBatchId: command.operationId }; }, ...initial };
  const react = Object.fromEntries(["useState", "useRef", "useEffect"].map((name) => [name, (...args) => runtime.react[name](...args)]));
  const jsx = (type, props, key) => ({ type, props, key });
  const compiled = ts.transpileModule(readFileSync(new URL("../../components/mentoring/staff-sms-composer.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)((id) => {
    if (id === "react") return react;
    if (id === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
    if (id.endsWith("/policy")) return { normalizeStaffMobile: normalize };
    if (id === "./format") return { formatDateTime: (value) => value };
    if (id === "./common") return {
      roleNames: { ceo: "מנכ״ל", coordinator: "רכז/ת", mentor: "חונך/ת" }, InlineError: "InlineError", readableError: (error) => error.message,
      useCommandIntent() {
        const current = react.useRef(null);
        return { operationId(payload) { const signature = JSON.stringify(payload); if (current.current?.signature !== signature) current.current = { signature, operationId: crypto.randomUUID() }; return current.current.operationId; }, clear() { current.current = null; } };
      },
    };
    if (id === "lucide-react" || id.startsWith("@/components/staff/ui/")) return new Proxy({}, { get: (_target, name) => name });
    throw new Error(`Unexpected dependency ${id}`);
  }, loaded, loaded.exports);
  function render(next = {}) {
    Object.assign(props, next);
    shell = loaded.exports.StaffSmsComposer(props);
    if (!shell) { runtime?.unmount(); runtime = null; scopeKey = undefined; return; }
    if (!runtime || shell.key !== scopeKey) {
      runtime?.unmount(); runtime = createHookRuntime(); scopeKey = shell.key;
      runtime.mount(() => shell.type(shell.props));
    } else runtime.rerender();
  }
  render();
  t.after(() => runtime?.unmount());
  const find = (predicate) => elements(runtime?.result).find(predicate);
  const button = (name) => find((item) => ["Button", "AlertDialogAction", "AlertDialogCancel"].includes(item.type) && text(item).includes(name));
  return {
    props, posts, render, button, find,
    get tree() { return runtime?.result ?? null; },
    get checkboxes() { return elements(runtime?.result).filter((item) => item.type === "input"); },
    async flush() { await runtime?.flush(); },
    async fill() {
      find((item) => item.type === "Textarea").props.onChange({ target: { value: "Staff check" } });
      find((item) => item.props["aria-label"] === "בחירת כל הנמענים הזמינים").props.onChange({ target: { checked: true } });
      await runtime.flush();
    },
    async review() { button("בדיקת ההודעה והנמענים").props.onClick(); await runtime.flush(); },
    async confirm() { button("שליחת SMS").props.onClick({ preventDefault() {} }); await runtime.flush(); },
  };
}

test("composer is available only to an active CEO", (t) => {
  for (const fields of [{ role: "mentor" }, { role: "coordinator" }, { active: false }]) {
    const current = snapshot(); current.actor = { ...current.actor, ...fields };
    assert.equal(harness(t, { snapshot: current }).tree, null);
  }
});

test("select all includes only available staff and review deduplicates shared phones before any send", async (t) => {
  const view = harness(t);
  assert.equal(view.checkboxes.length, 8, "inactive staff are omitted, unavailable active staff remain visible");
  assert.equal(view.checkboxes.filter((item) => item.props.disabled).length, 4);
  await view.fill(); await view.review();
  assert.equal(view.posts.length, 0);
  const dialog = view.find((item) => item.type === "AlertDialogContent");
  assert.match(text(dialog), /3 אנשי צוות יקבלו הודעה ב־2 מספרי טלפון/);
  assert.match(text(dialog), /Staff check/);
  await view.confirm();
  assert.equal(view.posts.length, 1);
  assert.deepEqual(view.posts[0].recipients, [{ staffId: "a-shared", expectedVersion: 1 }, { staffId: "ceo", expectedVersion: 1 }, { staffId: "z-mentor", expectedVersion: 1 }]);
  assert.equal(view.posts[0].message, "Staff check");
  assert.equal(Object.hasOwn(view.posts[0], "phone"), false, "destinations are resolved on the server");
});

test("cancel returns to editing without sending", async (t) => {
  const view = harness(t); await view.fill(); await view.review();
  view.find((item) => item.type === "AlertDialog").props.onOpenChange(false);
  await view.flush();
  assert.equal(view.posts.length, 0);
  assert.equal(view.find((item) => item.type === "Textarea").props.value, "Staff check");
  assert.equal(view.find((item) => item.type === "Textarea").props.disabled, false);
});

test("changed recipient versions invalidate the frozen review", async (t) => {
  const view = harness(t); await view.fill(); await view.review();
  const changed = structuredClone(view.props.snapshot); changed.staff[1].version += 1;
  view.render({ snapshot: changed }); await view.flush();
  assert.equal(view.button("שליחת SMS").props.disabled, true);
  await view.confirm();
  assert.equal(view.posts.length, 0);
});

test("offline state prevents opening or confirming a send and never queues", async (t) => {
  const view = harness(t); await view.fill(); view.render({ isOnline: false });
  await view.review();
  assert.equal(view.find((item) => item.type === "AlertDialog").props.open, false);
  view.render({ isOnline: true }); await view.review(); view.render({ isOnline: false });
  assert.equal(view.button("שליחת SMS").props.disabled, true);
  await view.confirm(); assert.equal(view.posts.length, 0);
});

test("unknown outcome locks the frozen intent and an explicit check reuses its operation ID", async (t) => {
  const commands = [];
  const view = harness(t, { submitOnline: async (command) => {
    commands.push(command);
    return commands.length === 1 ? { ok: false, error: { code: "unavailable", message: "Unknown outcome" } } : { ok: true, operationId: command.operationId, acceptance: "accepted", staffSmsBatchId: command.operationId };
  } });
  await view.fill(); await view.review(); await view.confirm();
  assert.equal(view.find((item) => item.type === "Textarea").props.disabled, true);
  view.button("בדיקה ושליחה באותו מזהה").props.onClick({ preventDefault() {} }); await view.flush();
  assert.equal(commands.length, 2); assert.deepEqual(commands[1], commands[0]);
  assert.equal(view.find((item) => item.type === "Textarea").props.value, "");
});

test("double clicks send once and identity changes discard prior drafts and late responses", async (t) => {
  let resolve;
  const commands = [];
  const view = harness(t, { submitOnline: (command) => { commands.push(command); return new Promise((done) => { resolve = done; }); } });
  await view.fill(); await view.review();
  const action = view.button("שליחת SMS"); action.props.onClick({ preventDefault() {} }); action.props.onClick({ preventDefault() {} });
  assert.equal(commands.length, 1);
  const next = snapshot(); next.actor = { ...next.actor, id: "other-ceo", authUserId: "other-account" };
  view.render({ snapshot: next });
  resolve({ ok: true, operationId: commands[0].operationId, acceptance: "accepted", staffSmsBatchId: commands[0].operationId }); await view.flush();
  assert.equal(view.find((item) => item.type === "Textarea").props.value, "");
  assert.equal(view.find((item) => item.type === "AlertDialog").props.open, false);
  assert.equal(text(view.tree).includes("בקשת השליחה התקבלה"), false);
});

test("a history refresh cannot unlock a composer while its prior request is pending", async (t) => {
  let resolve;
  let command;
  const view = harness(t, { submitOnline: (intent) => { command = intent; return new Promise((done) => { resolve = done; }); } });
  await view.fill(); await view.review(); await view.confirm();
  const current = structuredClone(view.props.snapshot);
  current.staffSmsBatches = [{ id: command.operationId }];
  view.render({ snapshot: current });
  assert.equal(view.button("המשך להודעה חדשה").props.disabled, true);
  view.button("המשך להודעה חדשה").props.onClick(); await view.flush();
  assert.equal(view.find((item) => item.type === "Textarea").props.disabled, true);
  resolve({ ok: true, operationId: command.operationId, acceptance: "accepted", staffSmsBatchId: command.operationId }); await view.flush();
  assert.equal(view.find((item) => item.type === "Textarea").props.disabled, false);
});
