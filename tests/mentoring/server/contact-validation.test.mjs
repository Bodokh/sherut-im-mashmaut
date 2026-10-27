import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { Resend } from "resend";
import { normalizePhoneNumber } from "../../../lib/phone.ts";
import { contactSubmissionMessage, validateContactSubmission } from "../../../lib/contact-validation.ts";
import { POST } from "../../../app/api/contact/route.ts";

const valid = { name: " שם מלא ", email: " person@example.org ", phone: "050-123-4567", topic: "פנייה", message: " הודעה תקינה " };

test("phone normalization accepts local and international forms and stores E.164", () => {
  for (const phone of ["0501234567", "050-123-4567", "(050) 123 4567", "+972501234567", "972501234567", "00972501234567", "+972 (0)50-123-4567"]) {
    assert.equal(normalizePhoneNumber(phone), "+972501234567", phone);
  }
  assert.equal(normalizePhoneNumber("03-555-1234"), "+97235551234");
  assert.equal(normalizePhoneNumber("+1 202 555 0123"), "+12025550123");
});

test("empty phone stays optional and invalid or multiple numbers never become a destination", () => {
  for (const phone of [null, undefined, "", "  ", "050", "1234", "+999123456789", "+972000000000", "hello 0501234567", "0501234567 ext 2", "0501234567,0521234567", "0501234567;0521234567", "+972+501234567", "5".repeat(51)]) assert.equal(normalizePhoneNumber(phone), null, String(phone));
});

test("public forms trim values and normalize the optional phone before submission", () => {
  const { values, errors } = validateContactSubmission(valid);
  assert.deepEqual(errors, {});
  assert.deepEqual(values, { name: "שם מלא", email: "person@example.org", phone: "+972501234567", topic: "פנייה", message: "הודעה תקינה" });
  assert.deepEqual(validateContactSubmission({ ...valid, phone: "", topic: "" }).errors, {});
});

test("every public field enforces its format and boundaries with localized actionable errors", () => {
  for (const [field, invalids] of Object.entries({ name: ["", " ", "a", "a".repeat(101)], email: ["", " ", "bad", "a@b", `${"a".repeat(250)}@b.co`], phone: ["abc", "050", "0".repeat(51)], topic: ["a".repeat(101)], message: ["", " ", "1234", "a".repeat(5001)] })) {
    for (const value of invalids) {
      const he = validateContactSubmission({ ...valid, [field]: value }, "he").errors;
      const en = validateContactSubmission({ ...valid, [field]: value }, "en").errors;
      assert.ok(he[field], `${field}: ${JSON.stringify(value.slice(0, 20))}`);
      assert.match(he[field], /[\u0590-\u05ff]/);
      assert.ok(en[field]);
      assert.doesNotMatch(en[field], /[\u0590-\u05ff]/);
    }
  }
  assert.deepEqual(validateContactSubmission({ ...valid, name: "a".repeat(100), topic: "a".repeat(100), message: "a".repeat(5000) }).errors, {});
});

test("public error codes always resolve to safe useful localized messages", () => {
  for (const code of ["invalid_submission", "submission_too_large", "429", "network", "email_service_unavailable", "email_send_failed", "Error SQL token=secret"]) {
    assert.match(contactSubmissionMessage(code), /[\u0590-\u05ff]/);
    assert.ok(contactSubmissionMessage(code, "en").length > 20);
    assert.doesNotMatch(contactSubmissionMessage(code), /SQL|secret|token=/);
  }
});

test("public API returns per-field errors without contacting the mail provider", async () => {
  const response = await POST(new Request("http://localhost/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...valid, name: "", email: "bad", phone: "050", message: "x", locale: "en" }) }));
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error, "invalid_submission");
  assert.deepEqual(Object.keys(body.fieldErrors), ["name", "email", "phone", "message"]);
  assert.match(body.fieldErrors.phone, /valid phone/);
});

test("public API rejects wrong content type, malformed JSON, oversized submissions and honors honeypot", async () => {
  assert.equal((await POST(new Request("http://localhost/api/contact", { method: "POST", body: "abc" }))).status, 415);
  assert.equal((await POST(new Request("http://localhost/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }))).status, 400);
  assert.equal((await POST(new Request("http://localhost/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: " ".repeat(12001) }))).status, 413);
  assert.equal((await POST(new Request("http://localhost/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ website: "bot" }) }))).status, 200);
});

test("accepted team email stays successful if courtesy confirmation is rejected or throws", async () => {
  const originalKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "re_synthetic_test_not_a_real_key";
  const emailPrototype = Object.getPrototypeOf(new Resend(process.env.RESEND_API_KEY).emails);
  const logging = mock.method(console, "error", () => {});
  try {
    for (const failure of ["returned", "thrown"]) {
      let calls = 0;
      const sending = mock.method(emailPrototype, "send", async () => {
        if (++calls === 1) return { data: { id: "synthetic-team-message" }, error: null };
        if (failure === "thrown") throw new Error("synthetic confirmation transport failure");
        return { data: null, error: { message: "synthetic confirmation rejection" } };
      });
      try {
        const response = await POST(new Request("http://localhost/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(valid) }));
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { success: true });
        assert.equal(calls, 2);
      } finally { sending.mock.restore(); }
    }
  } finally {
    logging.mock.restore();
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
  }
});
