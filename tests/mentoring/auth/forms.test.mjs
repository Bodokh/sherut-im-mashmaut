import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as authValidation from "../../../components/staff/auth/auth-validation.ts";
import * as contactValidation from "../../../lib/contact-validation.ts";
import { he } from "../../../i18n/dictionaries/he.ts";
import { en } from "../../../i18n/dictionaries/en.ts";

// Execute the production handlers with isolated React state and provider/fetch
// doubles. These tests never create accounts, send codes or deliver messages.
function harness(path, providers = {}) {
  const state = [];
  let cursor = 0;
  const cooldown = { seconds: 0, restart() { this.seconds = 30; } };
  const jsx = (type, props) => ({ type, props });
  const react = {
    useState(initial) {
      const slot = cursor++;
      if (!(slot in state)) state[slot] = initial;
      return [state[slot], (next) => { state[slot] = typeof next === "function" ? next(state[slot]) : next; }];
    },
    useRef(initial) { const slot = cursor++; return state[slot] ??= { current: initial }; },
  };
  const source = readFileSync(new URL(`../../../components/${path}.tsx`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)((id) => {
    if (id === "react") return react;
    if (id === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
    if (id === "@clerk/nextjs") return { useAuth: () => ({ isLoaded: true, isSignedIn: false }), ...providers };
    if (id === "./auth-validation") return authValidation;
    if (id === "@/lib/contact-validation") return contactValidation;
    if (id === "@/lib/cn") return { cn: (...values) => values.filter(Boolean).join(" ") };
    if (id === "./auth-controls") return {
      AuthError: "AuthError", CodeField: "CodeField", SignedInActions: "SignedInActions", SubmitButton: "SubmitButton",
      authErrorMessage: authValidation.authErrorMessage, useResendCooldown: () => cooldown,
    };
    if (id === "./auth-frame") return { AuthFrame: "AuthFrame" };
    if (id === "next/link") return { default: "Link" };
    if (id === "lucide-react") return { Info: "Info" };
    if (id.startsWith("@/components/staff/ui/")) return new Proxy({}, { get: (_target, key) => key });
    throw new Error(`Unexpected dependency: ${id}`);
  }, loaded, loaded.exports);
  return { cooldown, render(name, props) { cursor = 0; return loaded.exports[name](props); } };
}

function elements(tree) {
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(elements)];
}
const find = (tree, type, name) => elements(tree).find((item) => item.type === type && (!name || item.props.name === name));
const submit = (tree, currentTarget) => find(tree, "form").props.onSubmit({ preventDefault() {}, currentTarget });
const change = (tree, name, value) => find(tree, "Input", name).props.onChange({ target: { value } });
const button = (tree, text) => elements(tree).find((item) => item.type === "Button" && item.props.children === text);

test("login validates fields accessibly before contacting Clerk", async () => {
  const view = harness("staff/auth/sign-in-form", { useSignIn: () => ({ signIn: { password() { assert.fail("Invalid fields must stay local."); } }, fetchStatus: "idle" }) });
  await submit(view.render("SignInForm"));
  let tree = view.render("SignInForm");
  for (const name of ["email", "password"]) {
    const input = find(tree, "Input", name);
    assert.equal(input.props["aria-invalid"], true);
    assert.ok(elements(tree).find((item) => item.type === "FieldError" && item.props.id === input.props["aria-describedby"]));
  }
  assert.match(find(tree, "AuthError").props.message, /השדות המסומנים/);
  change(tree, "email", "staff@example.org");
  tree = view.render("SignInForm");
  assert.equal(find(tree, "Input", "email").props["aria-invalid"], false);
  assert.equal(find(tree, "Input", "email").props.value, "staff@example.org");
});

test("login retains credentials after network loss and suppresses duplicate submissions", async () => {
  const calls = [];
  let finish;
  const signIn = { password(params) { calls.push(params); return new Promise((resolve) => { finish = resolve; }); } };
  const view = harness("staff/auth/sign-in-form", { useSignIn: () => ({ signIn, fetchStatus: "idle" }) });
  let tree = view.render("SignInForm");
  change(tree, "email", " staff@example.org ");
  change(tree, "password", "existing pass");
  tree = view.render("SignInForm");
  const pending = submit(tree);
  await submit(tree);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { identifier: "staff@example.org", password: "existing pass" });
  assert.equal(find(view.render("SignInForm"), "Input", "password").props.disabled, true);
  finish({ error: { code: "network_error", message: "PRIVATE HOST" } });
  await pending;
  tree = view.render("SignInForm");
  assert.equal(find(tree, "Input", "password").props.value, "existing pass");
  assert.equal(find(tree, "Input", "password").props.disabled, false);
  assert.match(find(tree, "AuthError").props.message, /חיבור לאינטרנט/);
  assert.doesNotMatch(find(tree, "AuthError").props.message, /PRIVATE HOST/);
});

test("recovery validates OTP, preserves expired codes and only clears codes after successful resend", async () => {
  const calls = [];
  let sendError = null;
  const signIn = {
    status: "needs_new_password", reset() {}, async create(params) { calls.push(params); return { error: null }; },
    resetPasswordEmailCode: {
      async sendCode() { calls.push("send"); return { error: sendError }; },
      async verifyCode(params) { calls.push(params); return { error: { code: "verification_expired" } }; },
    },
  };
  const view = harness("staff/auth/sign-in-form", { useSignIn: () => ({ signIn, fetchStatus: "idle" }) });
  let tree = view.render("SignInForm");
  change(tree, "email", "staff@example.org");
  button(tree, "שכחת את הסיסמה?").props.onClick();
  await submit(view.render("SignInForm"));
  tree = view.render("SignInForm");
  assert.ok(find(tree, "CodeField"));
  await submit(tree);
  assert.match(find(view.render("SignInForm"), "CodeField").props.error, /שש הספרות/);
  assert.equal(calls.length, 2, "An incomplete code must not reach the provider.");
  find(tree, "CodeField").props.onChange("123456");
  await submit(view.render("SignInForm"));
  tree = view.render("SignInForm");
  assert.equal(find(tree, "CodeField").props.value, "123456");
  assert.match(find(tree, "CodeField").props.error, /קוד חדש/);
  view.cooldown.seconds = 0;
  sendError = { code: "network_error" };
  await button(view.render("SignInForm"), "שליחת קוד חדש").props.onClick();
  assert.equal(find(view.render("SignInForm"), "CodeField").props.value, "123456");
  sendError = null;
  await button(view.render("SignInForm"), "שליחת קוד חדש").props.onClick();
  assert.equal(find(view.render("SignInForm"), "CodeField").props.value, "");
  assert.equal(view.cooldown.seconds, 30);
  assert.equal(elements(view.render("SignInForm")).find((item) => item.props.onClick?.name === "resend").props.disabled, true);
});

test("TOTP can switch to backup code with an explicit required error", async () => {
  const signIn = { status: "needs_second_factor", supportedSecondFactors: [{ strategy: "totp" }, { strategy: "backup_code" }], reset() {} };
  const view = harness("staff/auth/sign-in-form", { useSignIn: () => ({ signIn, fetchStatus: "idle" }) });
  await submit(view.render("SignInForm", { googleResult: "continue" }));
  button(view.render("SignInForm"), "שימוש בקוד גיבוי").props.onClick();
  await submit(view.render("SignInForm"));
  const tree = view.render("SignInForm");
  const input = find(tree, "Input", "backup-code");
  assert.equal(input.props["aria-invalid"], true);
  assert.match(input.props["aria-describedby"], /backup-code-error/);
  assert.match(elements(tree).find((item) => item.props.id === "backup-code-error").props.children, /קודי הגיבוי/);
});

test("signup validates password policy and keeps input after provider rejection", async () => {
  const calls = [];
  const signUp = { verifications: { externalAccount: {} }, async password(params) { calls.push(params); return { error: { code: "form_password_pwned" } }; } };
  const view = harness("staff/auth/sign-up-form", { useSignUp: () => ({ signUp, fetchStatus: "idle" }) });
  let tree = view.render("SignUpForm");
  change(tree, "email", "staff@example.org");
  change(tree, "password", "short");
  await submit(view.render("SignUpForm"));
  tree = view.render("SignUpForm");
  assert.equal(calls.length, 0);
  assert.match(elements(tree).find((item) => item.props.id === "signup-password-error").props.children, /15/);
  change(tree, "password", "a long secret phrase");
  await submit(view.render("SignUpForm"));
  tree = view.render("SignUpForm");
  assert.equal(calls.length, 1);
  assert.equal(find(tree, "Input", "password").props.value, "a long secret phrase");
  assert.match(elements(tree).find((item) => item.props.id === "signup-password-error").props.children, /ייחודית/);
});

test("new-password recovery validates locally and retains the new password after rejection", async () => {
  const passwords = [];
  const signIn = { status: "needs_new_password", resetPasswordEmailCode: { async submitPassword(params) { passwords.push(params); return { error: { code: "form_new_password_matches_current" } }; } } };
  const view = harness("staff/auth/sign-in-form", { useSignIn: () => ({ signIn, fetchStatus: "idle" }) });
  await submit(view.render("SignInForm", { googleResult: "continue" }));
  let tree = view.render("SignInForm");
  change(tree, "password", "short");
  await submit(view.render("SignInForm"));
  assert.equal(passwords.length, 0);
  tree = view.render("SignInForm");
  assert.match(elements(tree).find((item) => item.props.id === "staff-password-error").props.children, /15/);
  change(tree, "password", "a long secret phrase");
  await submit(view.render("SignInForm"));
  tree = view.render("SignInForm");
  assert.deepEqual(passwords, [{ password: "a long secret phrase", signOutOfOtherSessions: true }]);
  assert.equal(find(tree, "Input", "password").props.value, "a long secret phrase");
  assert.match(elements(tree).find((item) => item.props.id === "staff-password-error").props.children, /חדשה ושונה/);
});

test("signup validates its verification code and preserves it through failed resends", async () => {
  const codes = [];
  let sendError = null;
  const signUp = {
    async password() { return { error: null }; },
    verifications: {
      externalAccount: {},
      async sendEmailCode() { return { error: sendError }; },
      async verifyEmailCode(params) { codes.push(params); return { error: { code: "form_code_incorrect" } }; },
    },
  };
  const view = harness("staff/auth/sign-up-form", { useSignUp: () => ({ signUp, fetchStatus: "idle" }) });
  let tree = view.render("SignUpForm");
  change(tree, "email", "staff@example.org");
  change(tree, "password", "a long secret phrase");
  await submit(view.render("SignUpForm"));
  tree = view.render("SignUpForm");
  await submit(tree);
  assert.equal(codes.length, 0);
  assert.match(find(view.render("SignUpForm"), "CodeField").props.error, /שש הספרות/);
  find(tree, "CodeField").props.onChange("123456");
  await submit(view.render("SignUpForm"));
  assert.deepEqual(codes, [{ code: "123456" }]);
  assert.match(find(view.render("SignUpForm"), "CodeField").props.error, /אינו תקין/);
  view.cooldown.seconds = 0;
  sendError = { code: "network_error" };
  button(view.render("SignUpForm"), "שליחת קוד חדש").props.onClick();
  await new Promise(setImmediate);
  assert.equal(find(view.render("SignUpForm"), "CodeField").props.value, "123456");
  sendError = null;
  button(view.render("SignUpForm"), "שליחת קוד חדש").props.onClick();
  await new Promise(setImmediate);
  assert.equal(find(view.render("SignUpForm"), "CodeField").props.value, "");
  assert.equal(view.cooldown.seconds, 30);
});

test("completed authentication retries session activation without reusing credentials or a consumed code", async () => {
  for (const [name, path, hook] of [["SignInForm", "staff/auth/sign-in-form", "useSignIn"], ["SignUpForm", "staff/auth/sign-up-form", "useSignUp"]]) {
    let attempts = 0;
    const resource = {
      status: "complete", verifications: { externalAccount: {} },
      password() { assert.fail("Completed authentication must not submit a password again."); },
      async finalize() { attempts += 1; return { error: { code: "network_error" } }; },
    };
    const view = harness(path, { [hook]: () => ({ [name === "SignInForm" ? "signIn" : "signUp"]: resource, fetchStatus: "idle" }) });
    await submit(view.render(name));
    const tree = view.render(name);
    assert.match(find(tree, "AuthError").props.message, /חיבור לאינטרנט/);
    await submit(tree);
    assert.equal(attempts, 2);
  }
});

function commentEnvironment(t, values, fetcher) {
  const previous = { FormData: globalThis.FormData, HTMLElement: globalThis.HTMLElement, fetch: globalThis.fetch };
  class FakeInput { focus() { this.focused = true; } }
  const fields = Object.fromEntries(Object.keys(values).map((key) => [key, new FakeInput()]));
  const form = { values, elements: { namedItem: (name) => fields[name] }, resetCount: 0, reset() { this.resetCount += 1; } };
  globalThis.HTMLElement = FakeInput;
  globalThis.FormData = class { constructor(form) { this.form = form; } [Symbol.iterator]() { return Object.entries(this.form.values)[Symbol.iterator](); } };
  globalThis.fetch = fetcher;
  t.after(() => Object.assign(globalThis, previous));
  return { form, fields };
}

test("English comments show localized field errors and focus the first invalid input without fetching", async (t) => {
  const { form, fields } = commentEnvironment(t, { name: " ", email: "invalid", message: "hey", topic: en.comments.topic }, () => assert.fail("Invalid comments must stay local."));
  const view = harness("forms/CommentsForm");
  await submit(view.render("CommentsForm", { copy: en.comments, locale: "en" }), form);
  const tree = view.render("CommentsForm", { copy: en.comments, locale: "en" });
  assert.equal(fields.name.focused, true);
  for (const name of ["name", "email", "message"]) {
    const input = find(tree, name === "message" ? "textarea" : "input", name);
    assert.equal(input.props["aria-invalid"], true);
    assert.match(elements(tree).find((item) => item.props.id === input.props["aria-describedby"]).props.children, /Enter/);
  }
  assert.equal(form.resetCount, 0);
});

test("comments preserve entries on rate limits and network failures and reset only after confirmed success", async (t) => {
  const values = { name: " Commenter ", email: "person@example.org", message: "A useful comment", topic: he.comments.topic, website: "" };
  const requests = [];
  let result = { ok: false, status: 429, async json() { return { error: "PRIVATE PROVIDER ERROR" }; } };
  const { form } = commentEnvironment(t, values, async (_url, options) => { requests.push(JSON.parse(options.body)); if (result instanceof Error) throw result; return result; });
  const view = harness("forms/CommentsForm");
  const render = () => view.render("CommentsForm", { copy: he.comments, locale: "he" });
  await submit(render(), form);
  assert.equal(form.resetCount, 0);
  assert.equal(requests[0].name, "Commenter");
  assert.equal(requests[0].locale, "he");
  let error = elements(render()).find((item) => item.props.role === "alert");
  assert.match(error.props.children, /להמתין/);
  assert.doesNotMatch(error.props.children, /PRIVATE/);
  result = new TypeError("Failed to fetch");
  await submit(render(), form);
  error = elements(render()).find((item) => item.props.role === "alert");
  assert.match(error.props.children, /החיבור/);
  assert.equal(form.resetCount, 0);
  result = { ok: true, status: 200, async json() { return { success: true }; } };
  await submit(render(), form);
  assert.equal(form.resetCount, 1);
  assert.ok(elements(render()).find((item) => item.props.role === "status"));
});

test("comments reject malformed successful responses and suppress a second click while sending", async (t) => {
  let finish;
  let calls = 0;
  const { form } = commentEnvironment(t, { name: "שם מלא", email: "person@example.org", message: "תגובה לאתר", topic: he.comments.topic }, () => { calls += 1; return new Promise((resolve) => { finish = resolve; }); });
  const view = harness("forms/CommentsForm");
  const render = () => view.render("CommentsForm", { copy: he.comments });
  const tree = render();
  const pending = submit(tree, form);
  await submit(tree, form);
  assert.equal(calls, 1);
  assert.equal(find(render(), "input", "name").props.disabled, true);
  finish({ ok: true, status: 200, async json() { throw new Error("Unreadable body"); } });
  await pending;
  assert.equal(form.resetCount, 0);
  assert.equal(find(render(), "input", "name").props.disabled, false);
  assert.match(elements(render()).find((item) => item.props.role === "alert").props.children, /לא התקבל אישור/);
});
