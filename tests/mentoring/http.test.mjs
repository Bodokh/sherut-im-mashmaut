import assert from "node:assert/strict";
import test from "node:test";
import { accountBindingFailure, readCommandBody, failureStatus } from "../../lib/mentoring/server/http.ts";

const request = (body, headers = {}) => new Request("https://staff.example/api/mentoring/commands", {
  method: "POST", body, headers: { origin: "https://staff.example", "content-type": "application/json", ...headers },
});

test("commands require same-origin JSON, including when Origin is missing", async () => {
  for (const headers of [{ origin: "https://attacker.example" }, { origin: "" }, { "sec-fetch-site": "cross-site" }]) {
    assert.equal((await readCommandBody(request("{}", headers))).error.code, "forbidden");
  }
  assert.equal((await readCommandBody(request("{}", { "content-type": "text/plain" }))).error.code, "validation");
  assert.deepEqual(await readCommandBody(request('{"type":"example"}')), { ok: true, value: { type: "example" } });
});

test("oversized or malformed command bodies fail before parsing or authentication", async () => {
  assert.equal((await readCommandBody(request('"' + "x".repeat(256 * 1024) + '"'))).ok, false);
  assert.equal((await readCommandBody(request('{"broken":'))).ok, false);
});

test("permission, concurrency, and configuration failures preserve distinct HTTP outcomes", () => {
  const status = (code) => failureStatus({ ok: false, error: { code, message: "failure" } });
  assert.equal(status("not_authenticated"), 401);
  assert.equal(status("forbidden"), 403);
  assert.equal(status("ceo_protected"), 409);
  assert.equal(status("not_configured"), 503);
});

test("queued intent cannot be submitted with another tab's authenticated identity", () => {
  const captured = request("{}", { "X-Mentoring-Account": "user_A" });
  assert.equal(accountBindingFailure(captured, "user_A"), null);
  assert.equal(accountBindingFailure(captured, "user_B").error.code, "not_authenticated");
  assert.equal(accountBindingFailure(request("{}"), "user_A").error.code, "not_authenticated");
  assert.equal(accountBindingFailure(captured, "").error.code, "not_authenticated");
});
