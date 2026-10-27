import assert from "node:assert/strict";
import test from "node:test";
import { authErrorFields, authErrorMessage, validateAuthInput } from "../../../components/staff/auth/auth-validation.ts";

test("login and recovery require a valid bounded email without rejecting existing short passwords", () => {
  for (const identifier of ["", "   ", "name", "name@", "name@example", "name @example.org", `${"a".repeat(250)}@example.org`]) {
    assert.ok(validateAuthInput({ stage: "password", identifier, password: "old" }).identifier);
    assert.ok(validateAuthInput({ stage: "recovery-email", identifier }).identifier);
  }
  assert.deepEqual(validateAuthInput({ stage: "password", identifier: " staff@example.org ", password: "old" }), {});
  assert.deepEqual(validateAuthInput({ stage: "google-account", password: "old" }), {}, "Google account linking retains the provider's identifier.");
});

test("new password and signup enforce the existing 15 character policy with clear bounds", () => {
  for (const stage of ["signup", "new-password"]) {
    for (const password of ["", " ".repeat(15), "a".repeat(14), "a".repeat(513)]) {
      assert.ok(validateAuthInput({ stage, identifier: "staff@example.org", password }).password);
    }
    for (const password of ["a".repeat(15), "a".repeat(512)]) {
      assert.deepEqual(validateAuthInput({ stage, identifier: "staff@example.org", password }), {});
    }
  }
  assert.match(validateAuthInput({ stage: "password", identifier: "staff@example.org", password: " " }).password, /סיסמה/);
});

test("OTP requires six digits while backup codes retain their provider format", () => {
  for (const stage of ["verification", "recovery-code"]) {
    for (const code of ["", "12345", "1234567", "12345a", "12 345"]) {
      assert.match(validateAuthInput({ stage, factor: "email_code", code }).code, /שש הספרות/);
    }
    assert.deepEqual(validateAuthInput({ stage, factor: "totp", code: "123456" }), {});
  }
  assert.ok(validateAuthInput({ stage: "verification", factor: "backup_code", code: " " }).code);
  assert.ok(validateAuthInput({ stage: "verification", factor: "backup_code", code: "a".repeat(129) }).code);
  assert.deepEqual(validateAuthInput({ stage: "verification", factor: "backup_code", code: " abcd-efgh-1234 " }), {});
  assert.deepEqual(validateAuthInput({ stage: "google-verification" }), {});
});

test("known provider failures explain credentials, codes, blocked email, Google, security and rate limits", () => {
  const cases = [
    ["form_password_incorrect", /שחזור סיסמה/],
    ["form_identifier_not_found", /כתובת הדוא״ל או הסיסמה/],
    ["form_code_incorrect", /הקוד אינו תקין/],
    ["verification_expired", /קוד חדש/],
    ["form_password_pwned", /ייחודית/],
    ["form_password_pwned__sign_in", /שחזור סיסמה/],
    ["form_email_address_blocked", /אושרה/],
    ["captcha_unavailable", /לרענן/],
    ["oauth_access_denied", /בוטלה/],
    ["external_account_not_found", /Google/],
    ["too_many_requests", /להמתין/],
    ["network_error", /חיבור לאינטרנט/],
  ];
  for (const [code, pattern] of cases) {
    assert.match(authErrorMessage({ errors: [{ code, message: "PRIVATE PROVIDER MESSAGE" }] }), pattern, code);
  }
  assert.match(authErrorMessage({ errors: [], status: 429 }), /להמתין/);
});

test("provider field metadata maps safe localized inline messages and unknown internals never appear", () => {
  const error = { errors: [
    { code: "form_param_format_invalid", meta: { paramName: "email_address" }, message: "PRIVATE EMAIL" },
    { code: "form_password_pwned", meta: { param_name: "password" }, longMessage: "PRIVATE PASSWORD" },
  ] };
  const fields = authErrorFields(error);
  assert.match(fields.identifier, /דוא״ל תקינה/);
  assert.match(fields.password, /ייחודית/);
  assert.match(authErrorFields({ code: "verification_expired" }).code, /קוד חדש/);
  const unknown = { code: "new_provider_failure", message: "INTERNAL HOST AND REQUEST ID" };
  assert.match(authErrorMessage(unknown), /לפנות להנהלה/);
  assert.doesNotMatch(authErrorMessage(unknown), /INTERNAL|new_provider_failure/);
  assert.deepEqual(authErrorFields(unknown), {});
  assert.match(authErrorMessage(new TypeError("Failed to fetch private hostname")), /חיבור לאינטרנט/);
  assert.doesNotMatch(authErrorMessage(new Error("SECRET")), /SECRET/);
});
