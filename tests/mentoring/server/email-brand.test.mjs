import assert from "node:assert/strict";
import { test } from "node:test";
import { emailButton, renderBrandedEmail } from "../../../lib/email/brand.ts";

test("branded mail retains a readable identity and message with images disabled", () => {
  const hebrew = renderBrandedEmail({ language: "he", category: "צוות הליווי", title: "הזמנה לצוות", body: "<p>ברוכים הבאים</p>" });
  assert.match(hebrew, /<html lang="he" dir="rtl">/);
  assert.match(hebrew, /<img[^>]+src="https:\/\/www\.imashmaut\.co\.il\/images\/logo-mark\.png"/);
  assert.match(hebrew, /<h1[^>]*>הזמנה לצוות<\/h1>/);
  assert.match(hebrew.replace(/<img[^>]*>/g, ""), /שירות עם משמעות/);
  assert.match(hebrew, /<p>ברוכים הבאים<\/p>/);

  const english = renderBrandedEmail({ language: "en", category: "Staff account", title: "Verification code", body: "<p>{{otp_code}}</p>" });
  assert.match(english, /<html lang="en" dir="ltr">/);
  assert.match(english, /Service with Meaning/);
  assert.match(english, /<p>{{otp_code}}<\/p>/);
});

test("email titles, labels, and button attributes cannot introduce markup", () => {
  const mail = renderBrandedEmail({ language: "en", category: "<b>Category</b>", title: "<img onerror=bad>", body: "" });
  assert.match(mail, /&lt;b&gt;Category&lt;\/b&gt;/);
  assert.doesNotMatch(mail, /<img onerror=/);
  const button = emailButton('https://example.org/?x="test"&y=1', "<b>Continue</b>");
  assert.match(button, /href="https:\/\/example\.org\/\?x=&quot;test&quot;&amp;y=1"/);
  assert.match(button, /&lt;b&gt;Continue&lt;\/b&gt;/);
});
