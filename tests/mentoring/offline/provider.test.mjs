import assert from "node:assert/strict";
import { registerHooks, createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createHookRuntime } from "../../../components/mentoring/test-hook-runtime.mjs";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && context.parentURL?.includes("/lib/mentoring/") && !/\.[a-z]+$/i.test(specifier)) {
    try { return nextResolve(`${specifier}.ts`, context); } catch { /* Preserve installed module resolution. */ }
  }
  return nextResolve(specifier, context);
} });
const root = fileURLToPath(new URL("../../../", import.meta.url));
const require = createRequire(`${root}/package.json`);
const ts = require("typescript");
const offline = await import("../../../lib/mentoring/offline.ts");
const source = readFileSync(`${root}/lib/mentoring/workspace-client.tsx`, "utf8");

function contextRenderer(state, auth) {
  const runtime = createHookRuntime();
  let currentAuth = auth;
  const react = {
    ...runtime.react,
    createContext: () => ({ Provider: "workspace-provider" }),
    useSyncExternalStore: () => state,
    useEffect: () => {},
  };
  const compiledModule = { exports: {} };
  new Function("require", "module", "exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText)(
    (id) => id === "react" ? react : id === "@clerk/nextjs" ? { useAuth: () => currentAuth } : id === "./offline" ? offline : require(id),
    compiledModule, compiledModule.exports,
  );
  runtime.mount(() => compiledModule.exports.WorkspaceProvider({ children: null }));
  return {
    get value() { return runtime.result.props.value; },
    render(nextAuth) { currentAuth = nextAuth; runtime.rerender(); return runtime.result.props.value; },
  };
}
function exposedContext(state, auth) { return contextRenderer(state, auth).value; }

function stateWithPrivateSnapshot(loading = false) {
  const actor = { id: "staff_A", authUserId: "account_A", organizationId: "org", role: "ceo", active: true, version: 1, displayName: "private identity" };
  return {
    snapshot: { actor, participants: [{ participant: { id: "participant_private", version: 1 } }], staff: [], conflicts: [] },
    loading, error: { code: "conflict", message: "private previous-account failure" }, connection: "online", isOnline: true,
    pendingCount: 2, localFailures: [{ command: { notes: "private pending text" } }], recoveryVaults: [{ id: "private_vault" }],
    recoveredDrafts: [{ value: { notes: "private recovered text" } }], draftScopeKey: "private-scope",
  };
}

function assertPrivateFieldsMasked(exposed) {
  assert.equal(exposed.snapshot, null);
  assert.equal(exposed.pendingCount, 0);
  assert.deepEqual(exposed.localFailures, []);
  assert.deepEqual(exposed.recoveryVaults, []);
  assert.deepEqual(exposed.recoveredDrafts, []);
  assert.equal(exposed.draftScopeKey, "locked");
}

test("loaded Clerk without a user exposes a terminal sign-in state and synchronously masks previous private context", () => {
  for (const userId of [null, undefined]) {
    const exposed = exposedContext(stateWithPrivateSnapshot(), { isLoaded: true, userId });
    assertPrivateFieldsMasked(exposed);
    assert.equal(exposed.loading, false, "a completed unauthenticated state must not become a permanent skeleton");
    assert.equal(exposed.error?.code, "not_authenticated");
    assert.notEqual(exposed.error?.message, "private previous-account failure");
  }
});

test("the first loaded signed-out render is terminal before controller effects run", () => {
  const state = { ...stateWithPrivateSnapshot(true), snapshot: null, error: null };
  const exposed = exposedContext(state, { isLoaded: true, userId: null });
  assertPrivateFieldsMasked(exposed);
  assert.equal(exposed.loading, false);
  assert.equal(exposed.error?.code, "not_authenticated");
});

test("a different loaded identity stays synchronously private while its own workspace is being authorized", () => {
  const exposed = exposedContext(stateWithPrivateSnapshot(), { isLoaded: true, userId: "account_B" });
  assertPrivateFieldsMasked(exposed);
  assert.equal(exposed.loading, true);
  assert.equal(exposed.error, null, "a previous identity's error text must stay private too");
});

test("memoized context updates between a different loaded account and signed-out without waiting for controller effects", () => {
  const renderer = contextRenderer(stateWithPrivateSnapshot(), { isLoaded: true, userId: "account_B" });
  assert.equal(renderer.value.loading, true);
  const signedOut = renderer.render({ isLoaded: true, userId: null });
  assertPrivateFieldsMasked(signedOut);
  assert.equal(signedOut.loading, false);
  assert.equal(signedOut.error?.code, "not_authenticated");
  const differentAccount = renderer.render({ isLoaded: true, userId: "account_B" });
  assertPrivateFieldsMasked(differentAccount);
  assert.equal(differentAccount.loading, true);
  assert.equal(differentAccount.error, null);
});

test("unloaded Clerk retains the existing authorized offline-lease context path", () => {
  const state = { ...stateWithPrivateSnapshot(), connection: "offline", isOnline: false, error: null };
  const exposed = exposedContext(state, { isLoaded: false, userId: undefined });
  assert.equal(exposed.snapshot, state.snapshot);
  assert.equal(exposed.loading, false);
  assert.equal(exposed.pendingCount, state.pendingCount);
  assert.equal(exposed.recoveredDrafts, state.recoveredDrafts);
  assert.equal(exposed.draftScopeKey, state.draftScopeKey);
});

test("the matching loaded identity retains controller loading and terminal membership failures", () => {
  const state = stateWithPrivateSnapshot();
  assert.equal(exposedContext(state, { isLoaded: true, userId: "account_A" }).snapshot, state.snapshot);
  const denied = { ...state, snapshot: null, error: { code: "not_staff", message: "current membership is inactive" }, loading: false };
  const exposed = exposedContext(denied, { isLoaded: true, userId: "account_A" });
  assert.equal(exposed.loading, false);
  assert.equal(exposed.error, denied.error);
});
