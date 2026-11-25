import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { buildTransferRequestEmailContent, transferRequestEmailSender } from "../../../lib/mentoring/features/transfers/email.ts";
import { ORGANIZATION_ID, serverFailure } from "../../../lib/mentoring/server/db.ts";
import * as http from "../../../lib/mentoring/server/http.ts";

const sampleJob = {
  transferRequestId: "11111111-1111-4111-8111-111111111162",
  recipientEmail: "coord-a@example.org",
  recipientName: "שרה <רכזת>",
  requesterName: "רחל & שות׳",
  participantName: 'דינה "כהן"',
};

test("buildTransferRequestEmailContent builds branded RTL Hebrew notification and escapes user strings", () => {
  const content = buildTransferRequestEmailContent(sampleJob);
  assert.match(content.subject, /בקשת העברת שיוך חדשה/);
  assert.match(content.text, /רחל & שות׳/);
  assert.match(content.text, /דינה "כהן"/);
  assert.match(content.text, /\/staff\/transfers/);
  assert.doesNotMatch(content.html, /<רכזת>/);
  assert.match(content.html, /&lt;רכזת&gt;/);
  assert.match(content.html, /&amp; שות׳/);
  assert.match(content.html, /&quot;כהן&quot;/);
});

test("transferRequestEmailSender handles disabled flag, missing key, Resend acceptance, 429 retry, and 4xx failure", async (t) => {
  assert.equal(transferRequestEmailSender({ MENTORING_TRANSFER_EMAIL_ENABLED: "false", RESEND_API_KEY: "key" }), null);
  assert.equal(transferRequestEmailSender({}), null);

  const calls = [];
  let mockResponse = () => new Response(JSON.stringify({ id: "email_abc123" }), { status: 200, headers: { "Content-Type": "application/json" } });
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url, init });
    return mockResponse();
  });

  const sender = transferRequestEmailSender({ RESEND_API_KEY: "re_test_123" });
  assert.equal(typeof sender, "function");

  const okResult = await sender(sampleJob);
  assert.deepEqual(okResult, { status: "accepted", providerId: "email_abc123" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers["Idempotency-Key"], `transfer-request/${sampleJob.transferRequestId}`);

  mockResponse = () => new Response("rate limit", { status: 429 });
  assert.deepEqual(await sender(sampleJob), { status: "retry" });

  mockResponse = () => new Response("invalid recipient", { status: 422 });
  assert.deepEqual(await sender(sampleJob), { status: "failed" });
});

function compileRoute(path, requireDependency, environment = process.env) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiledModule = { exports: {} };
  new Function("require", "module", "exports", "process", compiled)(requireDependency, compiledModule, compiledModule.exports, { env: environment });
  return compiledModule.exports;
}

test("the command route schedules transfer email dispatch after a new request_participant_transfer commits, never on replay or failure", async () => {
  const operationId = randomUUID();
  const transferRequestId = randomUUID();
  const value = {
    type: "request_participant_transfer",
    operationId,
    participantId: randomUUID(),
    targetMentorId: randomUUID(),
    note: "בקשה",
  };
  let result = { ok: true, operationId, acceptance: "accepted", replayed: false, transferRequestId };
  const scheduled = [];
  const dispatched = [];

  const route = compileRoute("../../../app/api/mentoring/commands/route.ts", (specifier) => {
    if (specifier === "next/server") return { after: (run) => scheduled.push(run) };
    if (specifier.endsWith("/auth")) return { getVerifiedIdentity: async () => ({ userId: "coord-b", verifiedEmail: null, passwordEnabled: true }) };
    if (specifier.endsWith("/commands")) return { executeCommand: async () => result };
    if (specifier.endsWith("/db")) return { ORGANIZATION_ID, serverFailure };
    if (specifier.endsWith("/http")) return http;
    if (specifier.endsWith("/staff-onboarding")) return { dispatchStaffOnboardingEmails: async () => undefined };
    if (specifier.endsWith("/staff-onboarding-email")) return { staffOnboardingSender: () => null };
    if (specifier.endsWith("/staff-messages/dispatcher")) return { runStaffSmsDispatcher: async () => undefined };
    if (specifier.endsWith("/transfers/email")) {
      return {
        transferRequestEmailSender: () => "mock-sender",
        dispatchTransferRequestEmails: async (sender, id) => dispatched.push({ sender, id }),
      };
    }
    throw new Error(`Unexpected import: ${specifier}`);
  });

  const post = () => route.POST(new Request("https://staff.example/api/mentoring/commands", {
    method: "POST",
    headers: { origin: "https://staff.example", "Content-Type": "application/json", "X-Mentoring-Account": "coord-b" },
    body: JSON.stringify(value),
  }));

  const response = await post();
  assert.equal(response.status, 200);
  assert.equal(scheduled.length, 1);
  await scheduled.pop()();
  assert.deepEqual(dispatched, [{ sender: "mock-sender", id: transferRequestId }]);

  // Replayed request must not reschedule email dispatch
  result = { ...result, replayed: true };
  await post();
  assert.equal(scheduled.length, 0);

  // Failed request must not schedule email dispatch
  result = { ok: false, error: { code: "forbidden", message: "אין הרשאה" } };
  assert.equal((await post()).status, 403);
  assert.equal(scheduled.length, 0);
});
