import assert from "node:assert/strict";
import { test } from "node:test";
import { GET, HEAD } from "../../../app/api/internal/mentoring/staff-onboarding/route.ts";

const endpoint = "https://example.test/api/internal/mentoring/staff-onboarding";

test("staff onboarding cron requires its exact secret and rejects HEAD without dispatching", async (t) => {
  t.mock.method(globalThis, "fetch", () => assert.fail("request must not contact the email provider"));
  const secret = process.env.CRON_SECRET;
  const enabled = process.env.MENTORING_STAFF_ONBOARDING_EMAIL_ENABLED;
  t.after(() => {
    if (secret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = secret;
    if (enabled === undefined) delete process.env.MENTORING_STAFF_ONBOARDING_EMAIL_ENABLED;
    else process.env.MENTORING_STAFF_ONBOARDING_EMAIL_ENABLED = enabled;
  });
  process.env.CRON_SECRET = "synthetic_test_cron_secret";
  delete process.env.MENTORING_STAFF_ONBOARDING_EMAIL_ENABLED;
  for (const authorization of [undefined, "Bearer wrong", "bearer synthetic_test_cron_secret"]) {
    const response = await GET(new Request(endpoint, { headers: authorization ? { authorization } : {} }));
    assert.equal(response.status, 401);
    assert.match(response.headers.get("cache-control"), /no-store/);
  }
  assert.equal(HEAD().status, 405);
  const authorized = new Request(endpoint, { headers: { authorization: "Bearer synthetic_test_cron_secret" } });
  assert.equal((await GET(authorized)).status, 503);
  delete process.env.CRON_SECRET;
  assert.equal((await GET(authorized)).status, 503);
});
