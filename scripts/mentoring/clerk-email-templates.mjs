import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { emailButton, emailColors, emailPanel, emailParagraph, renderBrandedEmail } from "../../lib/email/brand.ts";

const category = "Account security";
const productName = "Service with Meaning";
const { ink, line, muted } = emailColors;
const linkStyle = `color:${ink};text-decoration:underline`;

function codeMessage(instructions) {
  return [
    emailParagraph(instructions),
    emailPanel(`<p dir="ltr" style="margin:0;text-align:center;color:${ink};font-family:Menlo,Consolas,monospace;font-size:36px;font-weight:bold;letter-spacing:.12em;line-height:1.25;">{{otp_code}}</p>`),
    emailParagraph("To protect your account, do not share this code."),
    emailPanel(`<strong>Didn't request this?</strong><br>This code was requested from <strong>{{requested_from}}</strong> at <strong>{{requested_at}}</strong>. If you didn't make this request, you can safely ignore this email.`),
  ].join("");
}

function deviceDetail(label, value) {
  return `<tr>
    <th scope="row" width="34%" align="left" valign="top" style="padding:7px 12px 7px 0;border-bottom:1px solid ${line};color:${muted};font-weight:normal;">${label}</th>
    <td valign="top" style="padding:7px 0;border-bottom:1px solid ${line};color:${ink};font-weight:bold;">${value}</td>
  </tr>`;
}

function newDeviceMessage() {
  const details = [
    `{{#if sign_in_method}}${deviceDetail("Sign in type", "{{sign_in_method}}")}{{/if}}`,
    deviceDetail("Device", "{{browser_name}} on {{operating_system}}"),
    deviceDetail("Location", "{{location}}"),
    deviceDetail("IP", "{{ip_address}}"),
    deviceDetail("Time", "{{session_created_at}}"),
  ].join("");
  return [
    emailParagraph(`A new device just signed in to your ${productName} account. If you don't recognize this device, please check your account for any unauthorized activity, and also make sure that the sign in type used is secure.`),
    emailPanel(`<table width="100%" cellspacing="0" cellpadding="0" border="0" aria-label="Sign-in details" style="width:100%;border-collapse:collapse;">${details}</table>`),
    "{{#if revoke_session_url}}",
    emailParagraph("<strong>Don't recognize this activity?</strong><br>To immediately sign out of this device click the button below."),
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding-bottom:12px">${emailButton("{{revoke_session_url}}", "Sign out of this device")}</td></tr></table>`,
    emailParagraph(`If you're having trouble with the above button, <a href="{{revoke_session_url}}" style="${linkStyle}">click here</a>.`),
    "{{/if}}",
    "{{#if support_email}}",
    emailParagraph(`If you have any questions or need any help, please reach out to <a href="mailto:{{support_email}}" style="${linkStyle}">{{support_email}}</a> as soon as possible.`),
    "{{/if}}",
  ].join("");
}

function passwordChangedMessage() {
  return [
    `{{#if greeting_name}}${emailParagraph("Hi {{greeting_name}},")}{{/if}}`,
    emailParagraph("This is an automatic notification to inform you that the password belonging to {{primary_email_address}} has been changed."),
    emailPanel("<strong>Didn't request this?</strong><br>If you did not make this change, please reach out to an administrator for support."),
  ].join("");
}

/** Render Clerk drafts. Sender and delivery settings are managed separately in Clerk. */
export function clerkEmailTemplates() {
  return [
    { slug: "verification_code", subject: "{{otp_code}} is your verification code", title: "Verification code", body: codeMessage("Enter the following verification code when prompted.") },
    { slug: "reset_password_code", subject: "{{otp_code}} is your reset password code", title: "Reset password code", body: codeMessage("Enter the following code when prompted.") },
    { slug: "new_device_sign_in", subject: `New device signed in to your ${productName} account`, title: "New sign in to your account", body: newDeviceMessage() },
    { slug: "password_changed", subject: `Your ${productName} password has been changed`, title: "Password change", body: passwordChangedMessage() },
  ].map(({ slug, subject, title, body }) => ({
    slug,
    subject,
    body: renderBrandedEmail({ language: "en", category, title, body }),
  }));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const directory = process.argv[2];
  if (!directory || process.argv.length !== 3) {
    console.error("Usage: node --experimental-strip-types --import ./tests/mentoring/server/typescript-loader.mjs scripts/mentoring/clerk-email-templates.mjs <draft-directory>");
    process.exitCode = 1;
  } else {
    await mkdir(directory, { recursive: true });
    await Promise.all(clerkEmailTemplates().flatMap(({ slug, subject, body }) => [
      writeFile(resolve(directory, `${slug}.html`), body, { mode: 0o600 }),
      writeFile(resolve(directory, `${slug}.json`), `${JSON.stringify({ subject, body }, null, 2)}\n`, { mode: 0o600 }),
    ]));
    console.log(`Wrote four Clerk email drafts and JSON payloads to ${resolve(directory)}.`);
  }
}
