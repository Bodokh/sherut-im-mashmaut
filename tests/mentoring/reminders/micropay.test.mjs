import assert from "node:assert/strict";
import test from "node:test";
import "../server/typescript-loader.mjs";

const { createMicropayTransport } = await import("../../../lib/mentoring/features/reminders/micropay.ts");
const { configuredReminderTransport, transportBlockedReason } = await import("../../../lib/mentoring/features/reminders/transport.ts");
const { invokeReminderTransport } = await import("../../../lib/mentoring/features/reminders/dispatcher.ts");

const configuration = { token: "synthetic-micropay-token-not-real", sender: "SHERUT", sendingEnabled: true };
const environment = { MENTORING_SMS_PROVIDER: "micropay", MENTORING_MICROPAY_TOKEN: configuration.token,
  MENTORING_MICROPAY_SENDER: configuration.sender, MENTORING_SMS_SENDING_ENABLED: "true" };
const input = (overrides = {}) => ({ recipient: "+972501234567", message: "תזכורת לקשר עם חניכה: 27.10.2026 14:00.",
  idempotencyKey: "mentoring-reminder:synthetic-job", signal: new AbortController().signal, ...overrides });
const response = (body, options = {}) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, ...options });
const accepted = { status: 1, message: "OK", data: { taskId: "34556", remoteIP: "192.0.2.1" } };

test("Micropay sends one UTF-8 JSON request with one staff phone and no invented deduplication field", async () => {
  const calls = [];
  const transport = createMicropayTransport(configuration, async (...args) => { calls.push(args); return response(accepted); });
  const request = input();
  assert.deepEqual(await transport.send(request), { state: "provider_accepted", providerReference: "34556" });
  assert.equal(transport.provider, "micropay");
  assert.equal(transport.credentialsConfigured, true);
  assert.equal(transport.sendingEnabled, true);
  assert.equal(transport.reconcile, undefined);
  assert.equal(calls.length, 1);
  const [url, init] = calls[0];
  assert.equal(url, "https://www.micropay.co.il/extApi/scheduleSms.php");
  assert.equal(init.method, "POST");
  assert.equal(init.redirect, "error");
  assert.equal(init.cache, "no-store");
  assert.equal(init.credentials, "omit");
  assert.equal(init.signal, request.signal);
  assert.match(new Headers(init.headers).get("content-type"), /application\/json/);
  assert.deepEqual(JSON.parse(init.body), { token: configuration.token, from: "SHERUT", msg: request.message, list: "972501234567" });
  assert.doesNotMatch(init.body, /idempotency|synthetic-job|validate|post|schedule|pid/);
  assert.doesNotMatch(JSON.stringify(transport), /synthetic-micropay-token/);
});

test("registry requires explicit Micropay selection and exact send enablement", () => {
  for (const selected of [undefined, "", "MICROPAY", "other", "micropay "]) {
    assert.equal(configuredReminderTransport({ ...environment, MENTORING_SMS_PROVIDER: selected }), null);
  }
  for (const enabled of [undefined, "", "false", "TRUE", "1", " true"]) {
    const transport = configuredReminderTransport({ ...environment, MENTORING_SMS_SENDING_ENABLED: enabled });
    assert.equal(transport.credentialsConfigured, true);
    assert.equal(transportBlockedReason(transport), "sending_disabled");
  }
  const transport = configuredReminderTransport(environment);
  assert.equal(transport.provider, "micropay");
  assert.equal(transportBlockedReason(transport), null);
});

test("missing or unsafe token and sender configuration remains blocked and cannot issue a request", async () => {
  for (const overrides of [{ token: undefined }, { token: "" }, { token: "has whitespace" }, { token: "x".repeat(513) },
    { sender: undefined }, { sender: "" }, { sender: "שירות" }, { sender: "a".repeat(12) }, { sender: "bad,field" },
    { sender: "12" }, { sender: "1".repeat(16) }]) {
    let calls = 0;
    const transport = createMicropayTransport({ ...configuration, ...overrides }, async () => { calls += 1; return response(accepted); });
    assert.equal(transportBlockedReason(transport), "missing_sms_credentials");
    assert.deepEqual(await transport.send(input()), { state: "failed" });
    assert.equal(calls, 0);
  }
  let calls = 0;
  const disabled = createMicropayTransport({ ...configuration, sendingEnabled: false }, async () => { calls += 1; return response(accepted); });
  assert.deepEqual(await disabled.send(input()), { state: "failed" });
  assert.equal(calls, 0);
});

test("valid text senders and already-verified numeric sender shapes are accepted without verifying or calling them", () => {
  for (const sender of ["AB", "Service 123", "A+B*", "12345678901", "972501234567"]) {
    assert.equal(createMicropayTransport({ ...configuration, sender }).credentialsConfigured, true);
  }
});

test("recipient validation excludes lists, other countries and non-staff-mobile destinations", async () => {
  for (const recipient of ["", "0501234567,0507654321", "0501234567;0507654321", "foo@example.test", "+12025550123", "035555555", "0501234567&pid=1"]) {
    let calls = 0;
    const transport = createMicropayTransport(configuration, async () => { calls += 1; return response(accepted); });
    assert.deepEqual(await transport.send(input({ recipient })), { state: "failed" });
    assert.equal(calls, 0);
  }
});

test("empty and oversized messages cannot reach the provider", async () => {
  for (const message of ["", "  \n ", "x".repeat(1001)]) {
    let calls = 0;
    const transport = createMicropayTransport(configuration, async () => { calls += 1; return response(accepted); });
    assert.deepEqual(await transport.send(input({ message })), { state: "failed" });
    assert.equal(calls, 0);
  }
});

test("acceptance requires the exact success envelope and a positive numeric task ID", async () => {
  for (const taskId of ["34556", 34556, "9".repeat(20)]) {
    const transport = createMicropayTransport(configuration, async () => response({ status: 1, message: "OK", data: { taskId } }));
    assert.deepEqual(await transport.send(input()), { state: "provider_accepted", providerReference: String(taskId) });
  }
  for (const body of [null, [], {}, { status: "1", message: "OK", data: { taskId: "1" } },
    { status: 1, message: "ok", data: { taskId: "1" } }, { status: 1, message: "OK" },
    ...[undefined, null, "", "0", 0, -1, 1.2, Number.MAX_SAFE_INTEGER + 1, "sk_secret", "https://example.test/key", "123 456", "9".repeat(21)].map(taskId => ({ status: 1, message: "OK", data: { taskId } }))]) {
    const transport = createMicropayTransport(configuration, async () => response(body));
    assert.deepEqual(await transport.send(input()), { state: "uncertain" });
  }
});

test("only explicit parameter rejection is failed and provider narratives never escape", async () => {
  const transport = createMicropayTransport(configuration, async () => response({ status: 0, message: "ERROR",
    data: { description: "SECRET token, participant and phone narrative", remoteIP: "192.0.2.1" } }));
  const result = await transport.send(input());
  assert.deepEqual(result, { state: "failed" });
  assert.doesNotMatch(JSON.stringify(result), /SECRET|participant|phone|remoteIP|192/);
  for (const body of [{ status: 0, message: "ERROR", data: { taskId: "123" } }, { status: 0, message: "unknown" }, { status: -1, message: "ERROR" }]) {
    const uncertain = createMicropayTransport(configuration, async () => response(body));
    assert.deepEqual(await uncertain.send(input()), { state: "uncertain" });
  }
});

test("HTTP errors, redirects, malformed JSON and invalid UTF-8 are uncertain without retries", async () => {
  const cases = [() => response(accepted, { status: 500 }), () => response(accepted, { status: 302 }),
    () => new Response("not JSON"), () => new Response(new Uint8Array([0xff, 0xfe])),
    () => { throw new Error("SECRET provider request failed"); }];
  for (const makeResponse of cases) {
    let calls = 0;
    const transport = createMicropayTransport(configuration, async () => { calls += 1; return makeResponse(); });
    const result = await transport.send(input());
    assert.deepEqual(result, { state: "uncertain" });
    assert.equal(calls, 1);
    assert.doesNotMatch(JSON.stringify(result), /SECRET/);
  }
});

test("response reading is bounded even without an honest content length", async () => {
  // These are otherwise valid acceptances. Removing the byte cap would turn
  // the missing/lying Content-Length cases into incorrectly accepted sends.
  const oversizedAcceptance = JSON.stringify({ ...accepted, ignored: "x".repeat(8192) });
  for (const makeResponse of [() => new Response(oversizedAcceptance),
    () => response(accepted, { headers: { "content-length": "1000000000" } }),
    () => new Response(oversizedAcceptance, { headers: { "content-length": "1" } })]) {
    let calls = 0;
    const transport = createMicropayTransport(configuration, async () => { calls += 1; return makeResponse(); });
    assert.deepEqual(await transport.send(input()), { state: "uncertain" });
    assert.equal(calls, 1);
  }
});

test("unread response bytes are cancelled after a decoding failure", async () => {
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([0xff])); },
    cancel() { cancelled = true; } });
  const transport = createMicropayTransport(configuration, async () => new Response(stream));
  assert.deepEqual(await transport.send(input()), { state: "uncertain" });
  assert.equal(cancelled, true);
});

test("an already-aborted request is uncertain and never reaches the provider", async () => {
  let calls = 0;
  const controller = new AbortController();
  controller.abort();
  const transport = createMicropayTransport(configuration, async () => { calls += 1; return response(accepted); });
  assert.deepEqual(await transport.send(input({ signal: controller.signal })), { state: "uncertain" });
  assert.equal(calls, 0);
});

test("abort during a provider handoff remains uncertain with exactly one attempt", async () => {
  let calls = 0;
  const controller = new AbortController();
  const transport = createMicropayTransport(configuration, async (_url, { signal }) => {
    calls += 1;
    assert.equal(signal, controller.signal);
    controller.abort();
    throw new DOMException("Synthetic provider abort", "AbortError");
  });
  assert.deepEqual(await transport.send(input({ signal: controller.signal })), { state: "uncertain" });
  assert.equal(calls, 1);
});

test("the dispatcher timeout bounds a stalled adapter response body and never retries", async () => {
  let calls = 0;
  let observedSignal;
  const transport = createMicropayTransport(configuration, async (_url, { signal }) => {
    calls += 1;
    observedSignal = signal;
    return new Response(new ReadableStream({ start(controller) {
      signal.addEventListener("abort", () => controller.error(new DOMException("Synthetic body abort", "AbortError")), { once: true });
    } }));
  });
  const claim = { ...input(), organizationId: "synthetic-org", jobId: "synthetic-job", attemptId: "synthetic-attempt",
    claimToken: "synthetic-claim", provider: "micropay" };
  assert.deepEqual(await invokeReminderTransport(transport, claim, 5), { state: "uncertain" });
  assert.equal(observedSignal.aborted, true);
  assert.equal(calls, 1);
});
