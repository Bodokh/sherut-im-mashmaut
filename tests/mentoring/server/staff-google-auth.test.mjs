import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as authValidation from "../../../components/staff/auth/auth-validation.ts";
import { identityInTransaction, requireIdentity } from "../../../lib/mentoring/server/repository.ts";
import { serverFailure } from "../../../lib/mentoring/server/db.ts";
import { privateFailure } from "../../../lib/mentoring/server/http.ts";

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
    if (id === "./auth-validation") return authValidation;
    if (id === "./auth-controls") return {
      AuthError: "AuthError", CodeField: "CodeField", SignedInActions: "SignedInActions", SubmitButton: "SubmitButton",
      authErrorMessage: () => "provider error",
      useResendCooldown: () => ({ seconds: 0, restart() {} }),
    };
    if (id === "next/link") return { default: "Link" };
    if (id === "lucide-react") return { Info: "Info" };
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

test("callback permits a first Google identity to complete signup at /staff and retains verification routes", async () => {
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
  assert.equal(calls[0].transferable, true, "A preapproved staff member may not have a Clerk account yet.");
  assert.equal(calls[0].reloadResource, "signIn");
  assert.equal(calls[0].signInUrl, "/staff/login?google=unavailable");
  assert.equal(calls[0].signUpUrl, "/staff/signup");
  assert.equal(calls[0].continueSignUpUrl, "/staff/signup#/continue", "Missing provider fields must open Clerk's continuation card, not restart signup.");
  assert.equal(calls[0].firstFactorUrl, "/staff/login?google=verify-account");
  for (const key of ["secondFactorUrl", "resetPasswordUrl"]) assert.equal(calls[0][key], "/staff/login?google=continue");
  assert.equal(calls[0].signInForceRedirectUrl, "/staff");
  assert.equal(calls[0].signUpForceRedirectUrl, "/staff", "New Google identities must reach the same server-authorized staff workspace.");
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

test("Google fallback explains staff approval rather than requiring an existing Clerk account", () => {
  const tree = signInHarness().render("SignInForm", { googleResult: "unavailable" });
  const message = elements(tree).find((item) => item.type === "AuthError").props.message;
  assert.match(message, /אושרה/);
  assert.doesNotMatch(message, /חשבון צוות קיים/);
});

test("pending Google signup delegates required fields to Clerk without restarting password signup", () => {
  for (const missingFields of [["first_name"], ["phone_number"], ["legal_accepted"], ["password"]]) {
    const signUp = {
      status: "missing_requirements", missingFields,
      verifications: { externalAccount: { strategy: "oauth_google", status: "verified" } },
      password() { assert.fail("A verified Google signup must not restart the password signup flow."); },
    };
    const harness = componentHarness("sign-up-form", {
      SignUp: "ClerkSignUp",
      useAuth: () => ({ isLoaded: true, isSignedIn: false }),
      useSignUp: () => ({ signUp, errors: { fields: {} }, fetchStatus: "idle" }),
    });
    const tree = harness.render("SignUpForm");
    const signup = elements(tree).find((item) => item.type === "ClerkSignUp");
    assert.ok(signup, `${missingFields[0]} must be handled by Clerk's supported continuation UI.`);
    assert.equal(signup.props.routing, "hash");
    assert.equal(signup.props.forceRedirectUrl, "/staff");
    assert.equal(signup.props.signInForceRedirectUrl, "/staff");
    assert.equal(signup.props.signInUrl, "/staff/login");
    assert.equal(elements(tree).some((item) => item.type === "form"), false);
  }
});

test("password signup continues to use the existing form", () => {
  const harness = componentHarness("sign-up-form", {
    SignUp: "ClerkSignUp",
    useAuth: () => ({ isLoaded: true, isSignedIn: false }),
    useSignUp: () => ({ signUp: { status: null, verifications: { externalAccount: {} } }, errors: { fields: {} }, fetchStatus: "idle" }),
  });
  const nodes = elements(harness.render("SignUpForm"));
  assert.equal(nodes.some((item) => item.type === "ClerkSignUp"), false);
  assert.equal(nodes.some((item) => item.type === "form"), true);
});

test("Clerk keeps ownership of completed Google signup until session activation", () => {
  const auth = { isLoaded: true, isSignedIn: false };
  const signUp = { status: "missing_requirements", verifications: { externalAccount: { strategy: "oauth_google", status: "verified" } } };
  const harness = componentHarness("sign-up-form", {
    SignUp: "ClerkSignUp",
    useAuth: () => auth,
    useSignUp: () => ({ signUp, errors: { fields: {} }, fetchStatus: "idle" }),
  });
  harness.render("SignUpForm");
  signUp.status = "complete";
  assert.equal(elements(harness.render("SignUpForm")).some((item) => item.type === "ClerkSignUp"), true);
  auth.isSignedIn = true;
  const signedIn = elements(harness.render("SignUpForm"));
  assert.equal(signedIn.some((item) => item.type === "ClerkSignUp"), false);
  assert.equal(signedIn.some((item) => item.type === "SignedInActions"), true);
});

test("a first verified Google identity binds only an active preapproved email and preserves its role", async () => {
  const approved = {
    id: "approved-staff", organization_id: "11111111-1111-4111-8111-111111111111",
    auth_user_id: null, display_name: "Approved owner", email: "approved@example.org", phone: null,
    coordinator_id: null, sms_muted: false, role: "ceo", active: true, version: 1,
  };
  const calls = [];
  const client = { async query(sql, params) {
    calls.push({ sql, params });
    if (sql.startsWith("SELECT") && sql.includes("auth_user_id = $2")) return { rows: [] };
    if (sql.startsWith("SELECT") && sql.includes("lower(email) = $2")) {
      assert.match(sql, /auth_user_id IS NULL AND active = true/);
      assert.equal(params[1], approved.email);
      return { rows: [approved] };
    }
    if (sql.startsWith("UPDATE mentoring.memberships")) {
      assert.deepEqual(params.slice(1), [approved.id, "new_google_identity"]);
      assert.match(sql, /auth_user_id IS NULL AND active = true/);
      return { rows: [{ ...approved, auth_user_id: params[2], version: 2 }] };
    }
    assert.fail(`Unexpected SQL: ${sql}`);
  } };
  const actor = await identityInTransaction(client, "new_google_identity", " APPROVED@EXAMPLE.ORG ");
  assert.equal(actor.id, approved.id);
  assert.equal(actor.authUserId, "new_google_identity");
  assert.equal(actor.role, "ceo");
  assert.equal(calls.filter(({ sql }) => sql.startsWith("UPDATE")).length, 1);
  assert.equal(calls.some(({ sql }) => sql.startsWith("INSERT")), false);
});

test("a new Google identity without staff preapproval receives 403 and cannot create membership", async () => {
  const calls = [];
  const client = { async query(sql, params) {
    assert.ok(sql.startsWith("SELECT"), "An unapproved identity must never insert, update or reactivate staff membership.");
    calls.push({ sql, params });
    return { rows: [] };
  } };
  await assert.rejects(requireIdentity(client, "unknown_google_identity", "unknown@example.org"), (error) => {
    const response = privateFailure(serverFailure(error));
    assert.equal(error.code, "not_staff");
    assert.equal(response.status, 403);
    return true;
  });
  assert.equal(calls.length, 2);
  calls.length = 0;
  assert.equal(await identityInTransaction(client, "unverified_google_identity", null), null);
  assert.equal(calls.length, 1, "An unverified primary email cannot query or bind the approved-email membership.");
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
