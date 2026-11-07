import assert from "node:assert/strict";
import test from "node:test";
import { clerkEmailTemplates } from "../../../scripts/mentoring/clerk-email-templates.mjs";

test("Clerk drafts retain code subjects and security variables and use the public name in notice subjects", () => {
  const templates = Object.fromEntries(clerkEmailTemplates().map((template) => [template.slug, template]));
  assert.deepEqual(Object.keys(templates), ["verification_code", "reset_password_code", "new_device_sign_in", "password_changed"]);
  assert.equal(templates.verification_code.subject, "{{otp_code}} is your verification code");
  assert.equal(templates.reset_password_code.subject, "{{otp_code}} is your reset password code");
  assert.equal(templates.new_device_sign_in.subject, "New device signed in to your Service with Meaning account");
  assert.equal(templates.password_changed.subject, "Your Service with Meaning password has been changed");

  for (const slug of ["verification_code", "reset_password_code"]) {
    assert.match(templates[slug].body, /\{\{otp_code\}\}/);
    assert.match(templates[slug].body, /\{\{requested_from\}\}.*\{\{requested_at\}\}/s);
    assert.match(templates[slug].body, /do not share this code/i);
  }
  assert.match(templates.password_changed.body, /\{\{#if greeting_name\}\}.*\{\{greeting_name\}\}.*\{\{\/if\}\}/s);
  assert.match(templates.password_changed.body, /\{\{primary_email_address\}\}/);
});

test("the new-device draft keeps the sign-out action, fallback and optional support address", () => {
  const { body } = clerkEmailTemplates().find((template) => template.slug === "new_device_sign_in");
  const revokeSection = body.match(/\{\{#if revoke_session_url\}\}([\s\S]*?)\{\{\/if\}\}/)?.[1];
  assert.ok(revokeSection);
  assert.equal([...revokeSection.matchAll(/href="\{\{revoke_session_url\}\}"/g)].length, 2);
  assert.match(body, /\{\{#if support_email\}\}.*href="mailto:\{\{support_email\}\}".*\{\{\/if\}\}/s);
  for (const variable of ["sign_in_method", "browser_name", "operating_system", "location", "ip_address", "session_created_at"]) {
    assert.ok(body.includes(`{{${variable}}}`), variable);
  }
});
