import assert from "node:assert/strict";
import { test } from "node:test";
import { staffOnboardingSender } from "../../../lib/mentoring/server/staff-onboarding-email.ts";

const enabled = { MENTORING_STAFF_ONBOARDING_EMAIL_ENABLED: "true", RESEND_API_KEY: "re_synthetic_test" };
const job = { staffId: "11111111-1111-4111-8111-111111111112", recipientEmail: "staff@example.test" };

test("staff welcome mail requires explicit enablement and a Resend key", () => {
  assert.equal(staffOnboardingSender({ RESEND_API_KEY: enabled.RESEND_API_KEY }), null);
  assert.equal(staffOnboardingSender({ MENTORING_STAFF_ONBOARDING_EMAIL_ENABLED: "true" }), null);
});

test("staff welcome mail directs password setup to the staff signup page and reuses its provider key", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url, key: new Headers(options.headers).get("Idempotency-Key"), body: JSON.parse(options.body) });
    return Response.json({ id: "mail-test-1" });
  });
  const send = staffOnboardingSender(enabled);
  assert.deepEqual(await send(job), { status: "accepted", providerId: "mail-test-1" });
  assert.deepEqual(await send(job), { status: "accepted", providerId: "mail-test-1" });
  assert.deepEqual(requests[0], requests[1]);
  const { url, key, body } = requests[0];
  assert.equal(url, "https://api.resend.com/emails");
  assert.equal(key, `staff-onboarding/${job.staffId}`);
  assert.deepEqual(body.to, [job.recipientEmail]);
  assert.match(body.from, /notifications@imashmaut\.co\.il/);
  assert.match(body.text, /https:\/\/staff\.imashmaut\.co\.il\/signup/);
  assert.match(body.html, /<img\b[^>]*src="https:\/\/www\.imashmaut\.co\.il\/images\/logo-mark\.png"/i);
  assert.match(body.html, /dir="rtl"/);
  assert.match(body.html, /<a\b(?=[^>]*href="https:\/\/staff\.imashmaut\.co\.il\/signup")(?=[^>]*style="[^"]*background(?:-color)?:\s*#102d40)[^>]*>/i);
  assert.match(body.html, /href="https:\/\/staff\.imashmaut\.co\.il\/login"/);
  assert.match(body.text, /סיסמה/);
  assert.doesNotMatch(body.text, new RegExp(job.staffId));
});

test("staff welcome mail retries transient failures and rejects permanent provider errors", async (t) => {
  const responses = [
    new Error("network lost"),
    Response.json({ name: "concurrent_idempotent_requests" }, { status: 409 }),
    Response.json({ name: "invalid_idempotent_request" }, { status: 409 }),
    Response.json({ name: "rate_limit_exceeded" }, { status: 429 }),
    Response.json({ name: "internal_server_error" }, { status: 500 }),
    Response.json({ name: "validation_error" }, { status: 403 }),
    Response.json({}),
  ];
  t.mock.method(globalThis, "fetch", async () => {
    const response = responses.shift();
    if (response instanceof Error) throw response;
    return response;
  });
  const send = staffOnboardingSender(enabled);
  for (const status of ["retry", "retry", "failed", "retry", "retry", "failed", "retry"]) {
    assert.deepEqual(await send(job), { status });
  }
});
