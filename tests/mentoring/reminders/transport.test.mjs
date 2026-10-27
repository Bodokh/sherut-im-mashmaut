import assert from "node:assert/strict";
import test from "node:test";
import "../server/typescript-loader.mjs";

const { configuredReminderTransport, transportBlockedReason, safeProviderReference, validProviderName } = await import("../../../lib/mentoring/features/reminders/transport.ts");
const { invokeReminderTransport, runDispatcher } = await import("../../../lib/mentoring/features/reminders/dispatcher.ts");

const claim = {
  organizationId: "org-1", jobId: "job-1", attemptId: "attempt-1", claimToken: "claim-1",
  recipient: "+972501234567", message: "תזכורת לקשר עם חניכה: 26.10.2026 14:00.",
  provider: "test-only", idempotencyKey: "mentoring-reminder:job-1",
};
const actor = { id: "ceo-1", organizationId: "org-1", role: "ceo", active: true, version: 1,
  authUserId: "auth-1", displayName: "ניהול", phone: null, email: null, coordinatorId: null, smsMuted: false };
const transport = (overrides = {}) => ({ provider: "test-only", credentialsConfigured: true, sendingEnabled: true,
  send: async () => ({ state: "provider_accepted", providerReference: "sms-123" }), ...overrides });

test("production registry has no delivery fallback and reports each missing capability explicitly", () => {
  assert.equal(configuredReminderTransport({}), null);
  assert.equal(transportBlockedReason(null), "missing_sms_provider");
  assert.equal(transportBlockedReason(transport({ credentialsConfigured: false })), "missing_sms_credentials");
  assert.equal(transportBlockedReason(transport({ sendingEnabled: false })), "sending_disabled");
  assert.equal(transportBlockedReason(transport()), null);
});

test("provider acceptance and delivery require an opaque validated provider reference", async () => {
  for (const state of ["provider_accepted", "delivered"]) {
    let calls = 0;
    const configured = transport({ send: async (input) => {
      calls += 1;
      assert.equal(input.recipient, claim.recipient);
      assert.equal(input.message, claim.message);
      assert.equal(input.idempotencyKey, claim.idempotencyKey);
      assert.ok(input.signal instanceof AbortSignal);
      return { state, providerReference: "sms_123:part-1" };
    } });
    assert.deepEqual(await invokeReminderTransport(configured, claim), { state, providerReference: "sms_123:part-1" });
    assert.equal(calls, 1);
    for (const providerReference of [undefined, null, "", "accepted, please retry later", "sk_live_DO_NOT_PERSIST", "https://example.test/message/id"]) {
      assert.deepEqual(await invokeReminderTransport(transport({ send: async () => ({ state, providerReference }) }), claim), { state: "uncertain" });
    }
  }
});

test("explicit rejection is failed, while unrecognized or malformed provider responses stay uncertain", async () => {
  assert.deepEqual(await invokeReminderTransport(transport({ send: async () => ({ state: "failed", providerReference: "reject-12" }) }), claim), { state: "failed", providerReference: "reject-12" });
  assert.deepEqual(await invokeReminderTransport(transport({ send: async () => ({ state: "failed", providerReference: "Authorization: secret" }) }), claim), { state: "failed" });
  for (const result of [null, undefined, {}, { state: "sent", providerReference: "provider-1" }, { state: "retry", providerReference: "provider-1" }]) {
    assert.deepEqual(await invokeReminderTransport(transport({ send: async () => result }), claim), { state: "uncertain" });
  }
  assert.deepEqual(await invokeReminderTransport(transport({ send: async () => ({ state: "uncertain", providerReference: "pending-12" }) }), claim), { state: "uncertain", providerReference: "pending-12" });
});

test("thrown provider errors expose no narrative and invoke send once without retry", async () => {
  let calls = 0;
  const result = await invokeReminderTransport(transport({ send: async () => {
    calls += 1;
    throw new Error("SECRET credential and participant narrative must not escape");
  } }), claim);
  assert.deepEqual(result, { state: "uncertain" });
  assert.equal(calls, 1);
  assert.doesNotMatch(JSON.stringify(result), /SECRET|credential|narrative/);
});

test("provider timeout aborts the signal, returns uncertain, and never retries even after late acceptance", async () => {
  let calls = 0;
  let observedSignal;
  let acceptLate;
  const configured = transport({ send: (input) => {
    calls += 1;
    observedSignal = input.signal;
    return new Promise((resolve) => { acceptLate = resolve; });
  } });
  const result = await invokeReminderTransport(configured, claim, 5);
  assert.deepEqual(result, { state: "uncertain" });
  assert.equal(observedSignal.aborted, true);
  assert.equal(calls, 1);
  acceptLate({ state: "provider_accepted", providerReference: "late-acceptance" });
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.deepEqual(result, { state: "uncertain" });
});

test("a transport rejecting on abort is also uncertain and is called once", async () => {
  let calls = 0;
  const result = await invokeReminderTransport(transport({ send: ({ signal }) => {
    calls += 1;
    return new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true }));
  } }), claim, 5);
  assert.deepEqual(result, { state: "uncertain" });
  assert.equal(calls, 1);
});

test("safe references reject provider narratives, URLs and known credential token prefixes", () => {
  for (const value of [null, undefined, 123, {}, "", "has spaces", "line\nbreak", "אישור", "a".repeat(201),
    "Bearer-secret", "Basic-secret", "sk_live_secret", "rk_secret", "pk_secret", "api_key_secret", "api-key-secret", "token-secret",
    "https://provider.test/messages/message-1", "https://user:secret@provider.test/id", "ref?api_key=secret", "Authorization:secret=credential"]) {
    assert.equal(safeProviderReference(value), null, `must reject ${String(value)}`);
  }
  for (const value of ["message-123", "SM1234567890abcdef", "opaque_id.012", "message:ref/part-1", "a".repeat(200)]) assert.equal(safeProviderReference(value), value);
});

test("provider names allow short opaque adapter names only", () => {
  for (const name of ["sms-provider", "Provider_1", "a".repeat(60)]) assert.equal(validProviderName(name), true);
  for (const name of ["", "provider with narrative", "https://provider.test", "provider\nname", "שם", "a".repeat(61)]) assert.equal(validProviderName(name), false);
});

test("reconciliation invokes only the read-only lookup and preserves its original idempotency key", async () => {
  let sends = 0;
  const lookups = [];
  const configured = transport({ send: async () => { sends += 1; throw new Error("reconcile must never send"); },
    reconcile: async (input) => {
      lookups.push(input);
      return { state: "delivered", providerReference: "message-accepted" };
    } });
  assert.deepEqual(await invokeReminderTransport(configured, claim, 50, "message-accepted"), { state: "delivered", providerReference: "message-accepted" });
  assert.equal(sends, 0);
  assert.equal(lookups.length, 1);
  assert.equal(lookups[0].idempotencyKey, claim.idempotencyKey);
  assert.equal(lookups[0].providerReference, "message-accepted");
  assert.ok(lookups[0].signal instanceof AbortSignal);
  await invokeReminderTransport(configured, claim, 50, null);
  assert.equal(lookups[1].providerReference, null);
  assert.equal(sends, 0);
});

test("an adapter without read-only lookup leaves reconciliation uncertain and never sends", async () => {
  let sends = 0;
  const result = await invokeReminderTransport(transport({ send: async () => { sends += 1; return { state: "provider_accepted", providerReference: "would-send" }; } }), claim, 50, null);
  assert.deepEqual(result, { state: "uncertain" });
  assert.equal(sends, 0);
});

test("blocked dispatcher performs only lease maintenance and never enters delivery work", async () => {
  for (const configuration of [undefined, null, { credentialsConfigured: false }, { sendingEnabled: false }, { provider: "invalid provider" }]) {
    let sends = 0;
    let transactions = 0;
    const configured = configuration == null ? configuration : transport({ ...configuration, send: async () => { sends += 1; throw new Error("blocked adapter must not send"); } });
    // This unit double supplies no business rows. It checks the externally
    // observable blocked boundary, independently of SQL statement contents.
    const transaction = async (work) => { transactions += 1; return work({ query: async () => ({ rows: [], rowCount: 0 }) }); };
    const result = await runDispatcher({ actor, transport: configured, transaction, now: () => "2026-10-26T12:00:00Z" });
    assert.deepEqual(result, { considered: 0, claimed: 0, outcomes: {}, blocked: true });
    assert.equal(sends, 0);
    assert.equal(transactions, 1);
  }
});
