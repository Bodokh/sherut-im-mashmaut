import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// Exercise the real components' handlers with isolated hook state, without
// calling Google, creating Clerk accounts, or changing staff records.
function componentHarness(file, clerkHooks) {
  const state = [];
  let cursor = 0;
  let effects = [];
  const react = {
    useState(initial) {
      const slot = cursor++;
      if (!(slot in state)) state[slot] = initial;
      return [state[slot], (next) => { state[slot] = typeof next === "function" ? next(state[slot]) : next; }];
    },
    useRef(initial) {
      const slot = cursor++;
      return state[slot] ??= { current: initial };
    },
    useEffect(effect) { effects.push(effect); },
  };
  const jsx = (type, props) => ({ type, props });
  const source = readFileSync(new URL(`../../../components/staff/auth/${file}.tsx`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)((id) => {
    if (id === "react") return react;
    if (id === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
    if (id === "@clerk/nextjs") return clerkHooks;
    if (id === "./auth-controls") return {
      AuthError: "AuthError", CodeField: "CodeField", SignedInActions: "SignedInActions", SubmitButton: "SubmitButton",
      authErrorMessage: () => "provider error",
      useResendCooldown: () => ({ seconds: 0, restart() {} }),
    };
    if (id === "next/link") return { default: "Link" };
    if (id === "./auth-frame") return { AuthFrame: "AuthFrame" };
    if (id.startsWith("@/components/staff/ui/")) return new Proxy({}, { get: (_target, key) => key });
    throw new Error(`Unexpected dependency: ${id}`);
  }, loaded, loaded.exports);
  return {
    render(name, props) { cursor = 0; effects = []; return loaded.exports[name](props); },
    async flushEffects() { for (const effect of effects) effect(); await new Promise(setImmediate); },
  };
}

function elements(tree) {
  if (!tree || typeof tree !== "object") return [];
  const children = [tree.props?.children].flat(Infinity);
  return [tree, ...children.flatMap(elements)];
}

function signInHarness(overrides = {}, auth = { isLoaded: true, isSignedIn: false }) {
  const calls = [];
  const signIn = {
    status: null,
    reset() { calls.push("reset"); },
    async sso(params) { calls.push(params); return { error: null }; },
    ...overrides,
  };
  return {
    ...componentHarness("sign-in-form", {
      useAuth: () => auth,
      useSignIn: () => ({ signIn, errors: { fields: {} }, fetchStatus: "idle" }),
    }), calls, signIn,
  };
}

test("Google starts a sign-in with fixed destinations without requiring password fields", async () => {
  const harness = signInHarness();
  const tree = harness.render("SignInForm");
  const button = elements(tree).find((item) => item.type === "Button" && item.props.onClick?.name === "signInWithGoogle");
  assert.equal(button.props.type, "button");
  assert.equal(button.props.disabled, false);
  await button.props.onClick();
  assert.deepEqual(harness.calls, ["reset", {
    strategy: "oauth_google", redirectUrl: "/staff", redirectCallbackUrl: "/staff/login/google-callback", oidcPrompt: "select_account",
  }]);
});

test("Google is unavailable before Clerk loads and hidden for signed-in users", async () => {
  const harness = signInHarness({}, { isLoaded: false, isSignedIn: false });
  const button = elements(harness.render("SignInForm")).find((item) => item.props.onClick?.name === "signInWithGoogle");
  assert.equal(button.props.disabled, true);
  await button.props.onClick();
  assert.deepEqual(harness.calls, []);
  const signedIn = signInHarness({}, { isLoaded: true, isSignedIn: true });
  assert.equal(elements(signedIn.render("SignInForm")).some((item) => item.props.onClick?.name === "signInWithGoogle"), false);
});

test("Google provider failures leave a recoverable login error", async () => {
  for (const sso of [async () => ({ error: { code: "oauth_access_denied" } }), async () => { throw new Error("network"); }]) {
    const harness = signInHarness({ sso });
    await elements(harness.render("SignInForm")).find((item) => item.props.onClick?.name === "signInWithGoogle").props.onClick();
    const tree = harness.render("SignInForm");
    assert.equal(elements(tree).find((item) => item.type === "AuthError").props.message, "provider error");
    assert.equal(elements(tree).find((item) => item.props.onClick?.name === "signInWithGoogle").props.disabled, false);
  }
});

test("callback forbids signup transfer and retains verification routes", async () => {
  const calls = [];
  const clerk = { loaded: false, async handleRedirectCallback(params) { calls.push(params); } };
  const harness = componentHarness("google-sign-in-callback", { useClerk: () => clerk });
  harness.render("GoogleSignInCallback");
  await harness.flushEffects();
  assert.equal(calls.length, 0);
  clerk.loaded = true;
  harness.render("GoogleSignInCallback");
  await harness.flushEffects();
  harness.render("GoogleSignInCallback");
  await harness.flushEffects();
  assert.equal(calls.length, 1, "Repeated effects must not reprocess the OAuth callback.");
  assert.equal(calls[0].transferable, false, "An unknown Google email must never transfer into account creation.");
  assert.equal(calls[0].reloadResource, "signIn");
  assert.equal(calls[0].signInUrl, "/staff/login?google=unavailable");
  assert.equal(calls[0].signUpUrl, calls[0].signInUrl);
  assert.equal(calls[0].continueSignUpUrl, calls[0].signInUrl);
  assert.equal(calls[0].firstFactorUrl, "/staff/login?google=verify-account");
  for (const key of ["secondFactorUrl", "resetPasswordUrl"]) assert.equal(calls[0][key], "/staff/login?google=continue");
  assert.equal(calls[0].signInForceRedirectUrl, "/staff");
});

test("callback failures stop loading and offer a return to login", async () => {
  const harness = componentHarness("google-sign-in-callback", {
    useClerk: () => ({ loaded: true, async handleRedirectCallback() { throw new Error("callback expired"); } }),
  });
  harness.render("GoogleSignInCallback");
  await harness.flushEffects();
  const nodes = elements(harness.render("GoogleSignInCallback"));
  assert.equal(nodes.some((item) => item.type === "Spinner"), false);
  assert.equal(nodes.find((item) => item.type === "AuthError").props.message, "provider error");
  assert.equal(nodes.find((item) => item.type === "Button").props.render.props.href, "/staff/login");
});

test("unknown Google emails explain the existing-account requirement", () => {
  const tree = signInHarness().render("SignInForm", { googleResult: "unavailable" });
  assert.match(elements(tree).find((item) => item.type === "AuthError").props.message, /חשבון צוות קיים/);
});

test("Google continuation keeps email verification and password-reset requirements", async () => {
  const sent = [];
  const harness = signInHarness({
    status: "needs_second_factor",
    supportedSecondFactors: [{ strategy: "email_code" }],
    secondFactorVerification: {},
    mfa: { async sendEmailCode() { sent.push("code"); return { error: null }; } },
  });
  const tree = harness.render("SignInForm", { googleResult: "continue" });
  assert.equal(elements(tree).some((item) => item.type === "Input"), false);
  await elements(tree).find((item) => item.type === "form").props.onSubmit({ preventDefault() {} });
  assert.deepEqual(sent, ["code"]);
  assert.equal(elements(harness.render("SignInForm")).some((item) => item.type === "CodeField"), true);

  const reset = signInHarness({ status: "needs_new_password" });
  await elements(reset.render("SignInForm", { googleResult: "continue" })).find((item) => item.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(elements(reset.render("SignInForm")).find((item) => item.type === "Input").props.autoComplete, "new-password");
});

test("Google account-link verification resumes the pending sign-in with the existing password", async () => {
  const passwords = [];
  const harness = signInHarness({
    status: "needs_first_factor",
    identifier: "staff@example.org",
    async password(params) { passwords.push(params); return { error: { code: "form_password_incorrect" } }; },
  });
  let tree = harness.render("SignInForm", { googleResult: "verify-account" });
  assert.match(elements(tree).find((item) => item.type === "AuthError").props.message, /נדרש אימות/);
  const email = elements(tree).find((item) => item.type === "Input" && item.props.name === "email");
  assert.equal(email.props.value, "staff@example.org");
  assert.equal(email.props.readOnly, true);
  elements(tree).find((item) => item.type === "Input" && item.props.name === "password").props.onChange({ target: { value: "existing password" } });
  tree = harness.render("SignInForm", { googleResult: "verify-account" });
  await elements(tree).find((item) => item.type === "form").props.onSubmit({ preventDefault() {} });
  assert.deepEqual(passwords, [{ password: "existing password" }], "Use the pending provider identifier rather than replacing it.");
  assert.deepEqual(harness.calls, [], "Account-link verification must not reset the pending Google attempt.");
});
