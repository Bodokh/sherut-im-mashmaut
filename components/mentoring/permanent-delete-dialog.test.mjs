import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { createHookRuntime } from "./test-hook-runtime.mjs";

function elements(tree) {
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(elements)];
}
function text(tree) {
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  return tree && typeof tree === "object" ? [tree.props?.children].flat(Infinity).map(text).join("") : "";
}
function fixture() {
  const actor = { id: "ceo", organizationId: "org", authUserId: "account", role: "ceo", active: true };
  const view = { participant: { id: "participant", organizationId: "org", displayName: "חניכה לדוגמה", version: 7 }, contacts: [] };
  return { actor, view, snapshot: { actor, participants: [view] } };
}
function harness(t, overrides = {}) {
  const initial = fixture();
  const posts = [];
  const routes = [];
  const context = { snapshot: initial.snapshot, isOnline: true, submitOnline: async (command) => { posts.push(command); return { ok: true, acceptance: "accepted", participantId: command.participantId }; }, ...overrides };
  let runtime;
  let key;
  let shell;
  let view = initial.view;
  const react = Object.fromEntries(["useState", "useRef", "useEffect"].map((name) => [name, (...args) => runtime.react[name](...args)]));
  const jsx = (type, props, key) => ({ type, props, key });
  const compiled = ts.transpileModule(readFileSync(new URL("./permanent-delete-dialog.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)((id) => {
    if (id === "react") return react;
    if (id === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
    if (id === "next/navigation") return { useRouter: () => ({ replace: (route) => routes.push(route) }) };
    if (id.endsWith("/workspace-client")) return { useWorkspace: () => context };
    if (id.endsWith("/staff-host")) return { staffPublicPath: (route) => route };
    if (id === "./common") return { InlineError: "InlineError", readableError: (error) => error.message };
    if (id === "lucide-react" || id.startsWith("@/components/staff/ui/")) return new Proxy({}, { get: (_target, name) => name });
    throw new Error(`Unexpected dependency ${id}`);
  }, loaded, loaded.exports);
  function render(next = {}, nextView = view) {
    Object.assign(context, next); view = nextView;
    shell = loaded.exports.PermanentDeleteDialog({ view });
    if (!shell) { runtime?.unmount(); runtime = null; key = undefined; return; }
    if (!runtime || shell.key !== key) { runtime?.unmount(); runtime = createHookRuntime(); key = shell.key; runtime.mount(() => shell.type(shell.props)); }
    else runtime.rerender();
  }
  render();
  t.after(() => runtime?.unmount());
  const find = (predicate) => elements(runtime?.result).find(predicate);
  const button = (label) => find((element) => element.type === "Button" && text(element) === label);
  return {
    posts, routes, context, render, find, button,
    get tree() { return runtime?.result ?? null; },
    unmount() { runtime?.unmount(); },
    async flush() { await runtime?.flush(); },
    async open() { button("מחיקה לצמיתות").props.onClick(); await runtime.flush(); },
    async fill(name = initial.view.participant.displayName, reason = "הסרת כרטיס כפול") { find((element) => element.type === "Input").props.onChange({ target: { value: name } }); find((element) => element.type === "Textarea").props.onChange({ target: { value: reason } }); await runtime.flush(); },
    async confirm() { button("אישור מחיקה לצמיתות").props.onClick(); await runtime.flush(); },
  };
}

test("permanent deletion is restricted to accepted active CEO and matching organization", (t) => {
  for (const changes of [{ role: "mentor" }, { role: "coordinator" }, { active: false }, { organizationId: "foreign" }]) {
    const current = fixture(); current.snapshot.actor = { ...current.actor, ...changes };
    assert.equal(harness(t, { snapshot: current.snapshot }).tree, null);
  }
});

test("confirmation requires the exact current name and a nonempty reason before any deletion", async (t) => {
  const view = harness(t); await view.open();
  assert.equal(view.button("אישור מחיקה לצמיתות").props.disabled, true);
  await view.fill("שם אחר"); await view.confirm(); assert.equal(view.posts.length, 0);
  await view.fill("חניכה לדוגמה", " "); await view.confirm(); assert.equal(view.posts.length, 0);
  await view.fill(); await view.confirm();
  assert.equal(view.posts.length, 1);
  assert.deepEqual({ ...view.posts[0], operationId: "generated" }, { type: "permanently_delete_participant", operationId: "generated", participantId: "participant", expectedVersion: 7, confirmationName: "חניכה לדוגמה", reason: "הסרת כרטיס כפול" });
  assert.deepEqual(view.routes, ["/staff/participants"]);
});

test("offline and pending participant work prevent opening and submission", async (t) => {
  const view = harness(t); await view.open(); await view.fill(); view.render({ isOnline: false });
  assert.equal(view.button("אישור מחיקה לצמיתות").props.disabled, true);
  await view.confirm(); assert.equal(view.posts.length, 0);
  view.find((element) => element.type === "Dialog").props.onOpenChange(false); await view.flush();
  assert.equal(view.button("מחיקה לצמיתות").props.disabled, true);
  await view.open(); assert.equal(view.find((element) => element.type === "Dialog").props.open, false);
  const pending = fixture(); pending.view.participant.localPending = true;
  view.render({ snapshot: pending.snapshot, isOnline: true }, pending.view);
  assert.equal(view.button("מחיקה לצמיתות").props.disabled, true);
});

test("uncertain outcome freezes the intent and explicit retry sends the same ID and payload", async (t) => {
  const commands = [];
  const view = harness(t, { submitOnline: async (command) => { commands.push(command); return commands.length === 1 ? { ok: false, error: { code: "unavailable", message: "Unknown outcome" } } : { ok: true, acceptance: "accepted", participantId: command.participantId }; } });
  await view.open(); await view.fill(); await view.confirm();
  assert.equal(view.find((element) => element.type === "Input").props.disabled, true);
  assert.equal(view.find((element) => element.type === "Textarea").props.disabled, true);
  view.find((element) => element.type === "Dialog").props.onOpenChange(false); await view.flush();
  view.button("בדיקת בקשת המחיקה").props.onClick(); await view.flush();
  view.button("בדיקת המחיקה באותו מזהה").props.onClick(); await view.flush();
  assert.equal(commands.length, 2); assert.deepEqual(commands[1], commands[0]); assert.equal(view.routes.length, 1);
});

test("double clicks submit once and controller-invalidated identity outcomes do not navigate", async (t) => {
  let done;
  const commands = [];
  const view = harness(t, { submitOnline: (command) => { commands.push(command); return new Promise((resolve) => { done = resolve; }); } });
  await view.open(); await view.fill();
  const confirm = view.button("אישור מחיקה לצמיתות"); confirm.props.onClick(); confirm.props.onClick();
  assert.equal(commands.length, 1);
  const next = fixture(); next.snapshot.actor = { ...next.actor, id: "other", authUserId: "other-account" };
  view.render({ snapshot: next.snapshot });
  done({ ok: false, error: { code: "not_authenticated", message: "Identity changed" } }); await view.flush();
  assert.deepEqual(view.routes, []); assert.equal(view.find((element) => element.type === "Dialog").props.open, false);
  assert.equal(view.find((element) => element.type === "Input").props.value, "");
});

test("accepted purge still leaves the removed card route after cache cleanup unmounts its controls", async (t) => {
  let done;
  const view = harness(t, { submitOnline: () => new Promise((resolve) => { done = resolve; }) });
  await view.open(); await view.fill(); await view.confirm();
  view.unmount();
  done({ ok: true, acceptance: "accepted", participantId: "participant" }); await view.flush();
  assert.deepEqual(view.routes, ["/staff/participants"]);
});

test("an accepted response does not override navigation away from the participant", async (t) => {
  const previousWindow = globalThis.window;
  globalThis.window = { location: { pathname: "/staff/participants/participant" } };
  t.after(() => { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; });
  let done;
  const view = harness(t, { submitOnline: () => new Promise((resolve) => { done = resolve; }) });
  await view.open(); await view.fill(); await view.confirm(); view.unmount();
  globalThis.window.location.pathname = "/staff/team";
  done({ ok: true, acceptance: "accepted", participantId: "participant" }); await view.flush();
  assert.deepEqual(view.routes, []);
});

test("a definitive rejection requires an explicitly reopened review and explains the next step", async (t) => {
  const view = harness(t, { submitOnline: async () => ({ ok: false, error: { code: "conflict", message: "The participant changed" } }) });
  await view.open(); await view.fill(); await view.confirm();
  assert.equal(view.button("אישור מחיקה לצמיתות").props.disabled, true);
  assert.match(text(view.tree), /לבדוק את הכרטיס העדכני ולפתוח שוב/);
  view.button("סגירה ובדיקה מחדש").props.onClick(); await view.flush(); await view.open(); await view.fill();
  assert.equal(view.button("אישור מחיקה לצמיתות").props.disabled, false);
});

test("changing record data requires confirming the latest name and version", async (t) => {
  const view = harness(t); await view.open(); await view.fill();
  const next = fixture(); next.view.participant = { ...next.view.participant, displayName: "שם מעודכן", version: 8 };
  view.render({ snapshot: next.snapshot }, next.view);
  assert.equal(view.button("אישור מחיקה לצמיתות").props.disabled, true);
  await view.confirm(); assert.equal(view.posts.length, 0);
  view.find((element) => element.type === "Dialog").props.onOpenChange(false); await view.flush();
  await view.open();
  await view.fill("שם מעודכן"); await view.confirm(); assert.equal(view.posts[0].expectedVersion, 8);
});

test("a concurrent report cannot silently rebase an already typed destructive confirmation", async (t) => {
  const view = harness(t); await view.open(); await view.fill();
  const next = fixture(); next.view.participant.version = 8;
  view.render({ snapshot: next.snapshot }, next.view);
  assert.equal(view.button("אישור מחיקה לצמיתות").props.disabled, true);
  await view.confirm(); assert.equal(view.posts.length, 0, "The matching name must not authorize deletion of an unseen later version.");
  view.find((element) => element.type === "Dialog").props.onOpenChange(false); await view.flush();
  await view.open(); assert.equal(view.find((element) => element.type === "Input").props.value, "");
  await view.fill(); await view.confirm(); assert.equal(view.posts[0].expectedVersion, 8);
});
