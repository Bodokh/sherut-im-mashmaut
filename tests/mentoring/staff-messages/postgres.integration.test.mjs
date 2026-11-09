import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import "../server/typescript-loader.mjs";

const enabled = process.env.MENTORING_INTEGRATION_TESTS === "1";

test("manual staff SMS keeps recipient authority and a single durable handoff", { skip: !enabled, timeout: 120_000 }, async (t) => {
  assert.notEqual(process.env.NODE_ENV, "production");
  assert.notEqual(process.env.VERCEL_ENV, "production");
  assert.ok(process.execArgv.includes("--conditions=react-server"));
  assert.ok(process.env.MENTORING_DATABASE_URL);
  const { staffFromRow } = await import("../../../lib/mentoring/server/repository.ts");
  const { createStaffSmsBatch, loadStaffSmsBatches } = await import("../../../lib/mentoring/features/staff-messages/server.ts");
  const { claimStaffSms, expireStaffSmsLeases, recordStaffSmsResult, runStaffSmsDispatcher } = await import("../../../lib/mentoring/features/staff-messages/dispatcher.ts");
  const database = new Pool({ connectionString: process.env.MENTORING_DATABASE_URL_UNPOOLED ?? process.env.MENTORING_DATABASE_URL, max: 5 });
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const now = new Date().toISOString();
  const accepted = { provider: "test_only", credentialsConfigured: true, sendingEnabled: true, async send() { return { state: "provider_accepted", providerReference: `test-${randomUUID()}` }; } };

  async function transaction(run) {
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout='5s'");
      const result = await run(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }
  t.after(async () => {
    try {
      await transaction(async (client) => {
        for (const table of ["staff_sms_deliveries", "staff_sms_batches", "operations", "memberships"]) {
          await client.query(`DELETE FROM mentoring.${table} WHERE organization_id=ANY($1::uuid[])`, [[organizationId, otherOrganizationId]]);
        }
        await client.query("DELETE FROM mentoring.organizations WHERE id=ANY($1::uuid[])", [[organizationId, otherOrganizationId]]);
      });
    } finally { await database.end(); }
  });
  assert.ok((await database.query("SELECT to_regclass('mentoring.staff_sms_deliveries') AS name")).rows[0].name, "Apply migration 010 to the isolated development database first.");
  await database.query("INSERT INTO mentoring.organizations(id,name) VALUES($1,'Manual SMS integration fixture'),($2,'Other manual SMS fixture')", [organizationId, otherOrganizationId]);

  async function member(role = "mentor", phone = "0501234567", overrides = {}) {
    const id = randomUUID();
    return staffFromRow((await database.query(`INSERT INTO mentoring.memberships(id,organization_id,display_name,role,phone,active,sms_muted)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [id, overrides.organizationId ?? organizationId, `Fixture ${role} ${id.slice(0, 8)}`, role, phone, overrides.active ?? true, overrides.smsMuted ?? false])).rows[0]);
  }
  async function batch(actor, recipients, transport = accepted) {
    const command = { type: "send_staff_sms", operationId: randomUUID(), message: "בדיקת צוות", recipients: recipients.map((staff) => ({ staffId: staff.id, expectedVersion: staff.version })).sort((a, b) => a.staffId.localeCompare(b.staffId)) };
    return transaction(async (client) => {
      const result = await createStaffSmsBatch(client, actor, command, now, transport);
      await client.query("INSERT INTO mentoring.operations(organization_id,actor_id,operation_id,payload_hash,response) VALUES($1,$2,$3,$4,$5::jsonb)", [actor.organizationId, actor.id, command.operationId, "0".repeat(64), JSON.stringify({ ok: true, staffSmsBatchId: result.batchId })]);
      return result;
    });
  }
  async function deliveries(batchId) {
    return (await database.query("SELECT * FROM mentoring.staff_sms_deliveries WHERE organization_id=$1 AND batch_id=$2 ORDER BY id", [organizationId, batchId])).rows;
  }
  async function delivery(id) {
    return (await database.query("SELECT * FROM mentoring.staff_sms_deliveries WHERE organization_id=$1 AND id=$2", [organizationId, id])).rows[0];
  }
  const isDomainFailure = (error) => ["forbidden", "validation", "conflict", "unavailable"].includes(error?.code);

  await t.test("creation validates current CEO, current recipient versions, scope, preferences and transport", async () => {
    const ceo = await member("ceo");
    const mentor = await member();
    await assert.rejects(batch(mentor, [mentor]), isDomainFailure);
    await database.query("UPDATE mentoring.memberships SET active=false,version=version+1 WHERE id=$1", [ceo.id]);
    await assert.rejects(batch(ceo, [mentor]), isDomainFailure);
    const currentCeo = await member("ceo");
    const stale = await member();
    await database.query("UPDATE mentoring.memberships SET phone='0521234567',version=version+1 WHERE id=$1", [stale.id]);
    const ineligible = [stale, await member("mentor", "not a phone"), await member("mentor", null), await member("mentor", "0501234567", { active: false }), await member("ceo", "0501234567", { smsMuted: true }), await member("mentor", "0501234567", { organizationId: otherOrganizationId })];
    for (const recipient of ineligible) await assert.rejects(batch(currentCeo, [recipient]), isDomainFailure);
    for (const transport of [null, { ...accepted, sendingEnabled: false }, { ...accepted, credentialsConfigured: false }]) await assert.rejects(batch(currentCeo, [mentor], transport), isDomainFailure);
    assert.equal((await database.query("SELECT count(*) FROM mentoring.staff_sms_batches WHERE organization_id=$1", [organizationId])).rows[0].count, "0");
  });

  await t.test("shared normalized numbers create one delivery and diagnostics stay CEO-only", async () => {
    const ceo = await member("ceo");
    const first = await member("mentor", "050-123-4567");
    const second = await member("coordinator", "+972501234567");
    const result = await batch(ceo, [first, second]);
    assert.equal(result.recipientCount, 2);
    assert.equal(result.deliveryCount, 1);
    const [queued] = await deliveries(result.batchId);
    assert.deepEqual([...queued.recipient_staff_ids].sort(), [first.id, second.id].sort());
    const diagnostics = await transaction((client) => loadStaffSmsBatches(client, ceo));
    const view = diagnostics.find((item) => item.id === result.batchId);
    assert.equal(view.message, "בדיקת צוות");
    assert.equal(view.recipientCount, 2);
    assert.deepEqual([...view.deliveries[0].recipientStaffIds].sort(), [first.id, second.id].sort());
    assert.deepEqual(await transaction((client) => loadStaffSmsBatches(client, second)), []);
    await database.query("UPDATE mentoring.memberships SET active=false WHERE id=$1", [first.id]);
    const claim = await transaction((client) => claimStaffSms(client, organizationId, queued.id, now, accepted));
    assert.ok(claim, "One still-eligible originally selected account retains the shared destination.");
    assert.equal(claim.recipient, "+972501234567");
    await transaction((client) => recordStaffSmsResult(client, claim, { state: "provider_accepted", providerReference: "shared-test" }, now));
    assert.equal((await delivery(queued.id)).state, "provider_accepted");
  });

  await t.test("a changed phone, muted recipient or revoked sender cancels without rerouting", async () => {
    for (const change of ["phone", "mute", "sender"]) {
      const ceo = await member("ceo");
      const recipient = await member("ceo", "0521234567");
      const result = await batch(ceo, [recipient]);
      const [queued] = await deliveries(result.batchId);
      if (change === "phone") await database.query("UPDATE mentoring.memberships SET phone='0531234567',version=version+1 WHERE id=$1", [recipient.id]);
      if (change === "mute") await database.query("UPDATE mentoring.memberships SET sms_muted=true,version=version+1 WHERE id=$1", [recipient.id]);
      if (change === "sender") await database.query("UPDATE mentoring.memberships SET role='mentor',version=version+1 WHERE id=$1", [ceo.id]);
      assert.equal(await transaction((client) => claimStaffSms(client, organizationId, queued.id, now, accepted)), null);
      assert.equal((await delivery(queued.id)).state, "cancelled");
    }
  });

  await t.test("simultaneous claims permit one handoff and late acceptance survives sender revocation", async () => {
    const ceo = await member("ceo");
    const recipient = await member();
    const result = await batch(ceo, [recipient]);
    const [queued] = await deliveries(result.batchId);
    const claims = await Promise.all([transaction((client) => claimStaffSms(client, organizationId, queued.id, now, accepted)), transaction((client) => claimStaffSms(client, organizationId, queued.id, now, accepted))]);
    assert.equal(claims.filter(Boolean).length, 1);
    const claim = claims.find(Boolean);
    await database.query("UPDATE mentoring.memberships SET active=false,version=version+1 WHERE id=$1", [ceo.id]);
    await transaction((client) => recordStaffSmsResult(client, { ...claim, claimToken: randomUUID() }, { state: "provider_accepted", providerReference: "wrong-token" }, now));
    assert.equal((await delivery(queued.id)).state, "dispatching");
    await transaction((client) => recordStaffSmsResult(client, claim, { state: "provider_accepted", providerReference: "late-accepted" }, now));
    assert.equal((await delivery(queued.id)).state, "provider_accepted");
    await transaction((client) => recordStaffSmsResult(client, claim, { state: "uncertain" }, now));
    assert.equal((await delivery(queued.id)).state, "provider_accepted", "Known acceptance must not regress.");
    await transaction((client) => recordStaffSmsResult(client, claim, { state: "delivered", providerReference: "Bearer-secret" }, now));
    const preserved = await delivery(queued.id);
    assert.equal(preserved.state, "provider_accepted", "An untrusted delivery reference cannot erase known acceptance.");
    assert.equal(preserved.provider_reference, "late-accepted");
  });

  await t.test("dispatch commits its claim before the provider and never resends an unknown timeout", async () => {
    const ceo = await member("ceo");
    const recipient = await member();
    const result = await batch(ceo, [recipient]);
    const [queued] = await deliveries(result.batchId);
    let sends = 0;
    let providerObserved = null;
    const timeoutTransport = { ...accepted, async send(input) {
      sends += 1;
      providerObserved = { recipient: input.recipient, state: (await delivery(queued.id)).state };
      return new Promise(() => {});
    } };
    const outcome = await runStaffSmsDispatcher({ organizationId, batchId: result.batchId, transport: timeoutTransport, transaction, now: () => now, timeoutMs: 1_000 });
    assert.equal(outcome.claimed, 1);
    assert.equal(sends, 1);
    assert.deepEqual(providerObserved, { recipient: "+972501234567", state: "dispatching" }, "Provider observes the committed claim from a separate connection.");
    assert.equal((await delivery(queued.id)).state, "uncertain");
    await runStaffSmsDispatcher({ organizationId, batchId: result.batchId, transport: timeoutTransport, transaction, now: () => now, timeoutMs: 50 });
    assert.equal(sends, 1);
  });

  await t.test("interrupted pending work recovers while expired committed claims never resend", async () => {
    const ceo = await member("ceo");
    const recipient = await member();
    const pending = await batch(ceo, [recipient]);
    let sends = 0;
    const transport = { ...accepted, async send() { sends += 1; return { state: "provider_accepted", providerReference: "recovered-pending" }; } };
    await runStaffSmsDispatcher({ organizationId, batchId: pending.batchId, transport, transaction, now: () => now });
    assert.equal(sends, 1);
    const interrupted = await batch(ceo, [recipient]);
    const [queued] = await deliveries(interrupted.batchId);
    const claim = await transaction((client) => claimStaffSms(client, organizationId, queued.id, now, accepted));
    assert.ok(claim);
    const claimed = await delivery(queued.id);
    const expiredAt = new Date(new Date(claimed.lease_expires_at).getTime() + 1).toISOString();
    assert.equal(await transaction((client) => expireStaffSmsLeases(client, organizationId, expiredAt)), 1);
    assert.equal((await delivery(queued.id)).state, "uncertain");
    await runStaffSmsDispatcher({ organizationId, batchId: interrupted.batchId, transport, transaction, now: () => expiredAt });
    assert.equal(sends, 1);
    await transaction((client) => recordStaffSmsResult(client, claim, { state: "provider_accepted", providerReference: "accepted-after-lease" }, expiredAt));
    assert.equal((await delivery(queued.id)).state, "provider_accepted");
  });
});
