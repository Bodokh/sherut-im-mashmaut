import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import test from "node:test";
import { Pool } from "pg";
import "../server/typescript-loader.mjs";

const enabled = process.env.MENTORING_INTEGRATION_TESTS === "1";

test("durable reminder claims honor current contact/account scope and retain truthful external outcomes", { skip: !enabled, timeout: 120_000 }, async (t) => {
  assert.notEqual(process.env.NODE_ENV, "production");
  assert.ok(process.execArgv.includes("--conditions=react-server"));
  const envFile = new URL("../../../.env.local", import.meta.url);
  if (!process.env.MENTORING_DATABASE_URL && existsSync(envFile)) loadEnvFile(envFile);
  assert.notEqual(process.env.VERCEL_ENV, "production");
  assert.ok(process.env.MENTORING_DATABASE_URL);
  const { staffFromRow } = await import("../../../lib/mentoring/server/repository.ts");
  const { rebuildParticipantReminders, loadReminderExtras, evaluateReminders } = await import("../../../lib/mentoring/features/reminders/server.ts");
  const { claimReminder, recordReminderResult, expireReminderLeases, runDispatcher, invokeReminderTransport, reconcileReminder } = await import("../../../lib/mentoring/features/reminders/dispatcher.ts");
  const database = new Pool({ connectionString: process.env.MENTORING_DATABASE_URL_UNPOOLED ?? process.env.MENTORING_DATABASE_URL, max: 5 });
  const organizationId = randomUUID();
  const now = new Date().toISOString();
  const tomorrow = new Date(Date.parse(now) + 86_400_000).toISOString();
  // Test transports exist only in this opt-in test; production registry is empty.
  const accepted = { provider: "test_only", credentialsConfigured: true, sendingEnabled: true, async send() { return { state: "provider_accepted", providerReference: `test-${randomUUID()}` }; } };
  async function transaction(run) {
    const client = await database.connect();
    try { await client.query("BEGIN"); await client.query("SET LOCAL lock_timeout='5s'"); const result = await run(client); await client.query("COMMIT"); return result; }
    catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  t.after(async () => {
    // One isolated organization and exact generated IDs; never wildcard-delete
    // records from the development organization or any other test suite.
    try { await transaction(async (client) => {
      for (const table of ["reminder_attempts", "reminder_jobs", "contacts", "appointments", "assignments", "participants", "resource_ids", "organization_settings", "memberships"]) await client.query(`DELETE FROM mentoring.${table} WHERE organization_id=$1`, [organizationId]);
      await client.query("DELETE FROM mentoring.organizations WHERE id=$1", [organizationId]);
    }); } finally { await database.end(); }
  });
  assert.ok((await database.query("SELECT to_regclass('mentoring.reminder_attempts') AS name")).rows[0].name, "Root must apply migration 006 to the existing development database first.");
  await database.query("INSERT INTO mentoring.organizations(id,name) VALUES($1,'Isolated reminder integration fixture')", [organizationId]);
  await database.query("INSERT INTO mentoring.organization_settings(organization_id) VALUES($1)", [organizationId]);
  async function member(role, phone = "+972501234567") {
    const id = randomUUID();
    return staffFromRow((await database.query("INSERT INTO mentoring.memberships(id,organization_id,display_name,role,phone) VALUES($1,$2,$3,$4,$5) RETURNING *", [id, organizationId, `Fixture ${role}`, role, phone])).rows[0]);
  }
  const coordinator = await member("coordinator");
  const mentor = await member("mentor");
  const ceo = await member("ceo");
  const outsider = await member("mentor");
  async function fixture({ mentorId = mentor.id, coordinatorId = coordinator.id } = {}) {
    const id = randomUUID();
    await database.query("INSERT INTO mentoring.resource_ids(id,organization_id,kind) VALUES($1,$2,'participant')", [id, organizationId]);
    await database.query("INSERT INTO mentoring.participants(id,organization_id,display_name,phone,profile_notes,created_by) VALUES($1,$2,'Reminder fixture','0529999999','PRIVATE narrative must not enter reminders',$3)", [id, organizationId, ceo.id]);
    await database.query("INSERT INTO mentoring.assignments(id,organization_id,participant_id,mentor_id,coordinator_id,assigned_at,followup_anchor_at) VALUES($1,$2,$3,$4,$5,$6,$6)", [randomUUID(), organizationId, id, mentorId, coordinatorId, new Date(Date.parse(now) - 10 * 86_400_000).toISOString()]);
    await database.query("INSERT INTO mentoring.appointments(id,organization_id,participant_id,mentor_id,scheduled_at) VALUES($1,$2,$3,$4,$5)", [randomUUID(), organizationId, id, mentorId, new Date(Date.parse(now) - 2 * 86_400_000).toISOString()]);
    await transaction((client) => rebuildParticipantReminders(client, organizationId, id, ceo.id, null, now, accepted));
    return id;
  }
  async function job(participantId, recipient = mentor.id, kind = "seven_day_overdue") {
    return (await database.query("SELECT * FROM mentoring.reminder_jobs WHERE organization_id=$1 AND participant_id=$2 AND recipient_staff_id=$3 AND kind=$4 ORDER BY created_at,id", [organizationId, participantId, recipient, kind])).rows[0];
  }
  async function stateFor(jobId) { return (await database.query("SELECT * FROM mentoring.reminder_jobs WHERE organization_id=$1 AND id=$2", [organizationId, jobId])).rows[0]; }
  async function complete(client, participantId, occurredAt = now) {
    const contactId = randomUUID();
    await client.query("SELECT id FROM mentoring.participants WHERE organization_id=$1 AND id=$2 FOR UPDATE", [organizationId, participantId]);
    await client.query("INSERT INTO mentoring.resource_ids(id,organization_id,kind) VALUES($1,$2,'contact')", [contactId, organizationId]);
    await client.query("INSERT INTO mentoring.contacts(id,organization_id,participant_id,actor_id,method,outcome,occurred_at,received_at) VALUES($1,$2,$3,$4,'phone','completed',$5,$5)", [contactId, organizationId, participantId, mentor.id, occurredAt]);
    await client.query("UPDATE mentoring.participants SET version=version+1 WHERE organization_id=$1 AND id=$2", [organizationId, participantId]);
    await rebuildParticipantReminders(client, organizationId, participantId, ceo.id, null, now, accepted);
    return contactId;
  }
  async function pause(participantId) {
    await transaction(async (client) => { await client.query("UPDATE mentoring.participants SET lifecycle='paused',version=version+1 WHERE organization_id=$1 AND id=$2", [organizationId, participantId]); await rebuildParticipantReminders(client, organizationId, participantId, ceo.id, null, now, accepted); });
  }

  await t.test("dedup, scoped diagnostics, missing integration, and no invented delivery", async () => {
    const id = await fixture();
    await transaction((client) => rebuildParticipantReminders(client, organizationId, id, ceo.id, null, now, accepted));
    assert.equal(Number((await database.query("SELECT count(*) FROM mentoring.reminder_jobs WHERE organization_id=$1 AND participant_id=$2", [organizationId, id])).rows[0].count), 6);
    const extras = await transaction((client) => loadReminderExtras(client, coordinator, [id]));
    assert.equal(extras.reminders.length, 6);
    assert.equal(extras.reminderReadiness.smsProviderConfigured, false);
    assert.equal(extras.reminderReadiness.smsCredentialsConfigured, false);
    assert.equal(extras.reminderReadiness.smsSendingEnabled, false);
    assert.equal(JSON.stringify(extras).includes("PRIVATE"), false);
    assert.equal(JSON.stringify(extras).includes("0529999999"), false);
    assert.equal((await transaction((client) => loadReminderExtras(client, outsider, [id]))).reminders.length, 0);
    assert.equal((await runDispatcher({ actor: ceo, transaction, now: () => now })).blocked, true);
    assert.equal(Number((await database.query("SELECT count(*) FROM mentoring.reminder_attempts WHERE organization_id=$1", [organizationId])).rows[0].count), 0);
    await pause(id);
  });

  await t.test("two dispatchers claim exactly one attempt and acceptance differs from delivery", async () => {
    const id = await fixture();
    const queued = await job(id);
    const claims = await Promise.all([transaction((client) => claimReminder(client, ceo, queued.id, now, accepted)), transaction((client) => claimReminder(client, ceo, queued.id, now, accepted))]);
    assert.equal(claims.filter(Boolean).length, 1);
    const claim = claims.find(Boolean);
    assert.equal(claim.recipient, mentor.phone);
    assert.equal(claim.message.includes("PRIVATE"), false);
    const generationBefore = (await stateFor(queued.id)).generation;
    await database.query("UPDATE mentoring.participants SET version=version+1 WHERE organization_id=$1 AND id=$2", [organizationId, id]);
    await transaction((client) => rebuildParticipantReminders(client, organizationId, id, ceo.id, null, tomorrow, accepted));
    assert.equal((await stateFor(queued.id)).generation, generationBefore, "In-flight validation evidence is immutable.");
    assert.equal((await database.query("SELECT generation FROM mentoring.reminder_attempts WHERE organization_id=$1 AND claim_token=$2", [organizationId, claim.claimToken])).rows[0].generation, generationBefore);
    await transaction((client) => recordReminderResult(client, claim, { state: "provider_accepted", providerReference: "test-accepted" }, now));
    assert.equal((await job(id)).state, "provider_accepted");
    await transaction((client) => rebuildParticipantReminders(client, organizationId, id, ceo.id, null, tomorrow, accepted));
    assert.equal(await transaction((client) => claimReminder(client, ceo, queued.id, tomorrow, accepted)), null);
    await transaction((client) => recordReminderResult(client, claim, { state: "delivered", providerReference: "test-accepted" }, tomorrow));
    assert.equal((await job(id)).state, "delivered");
    assert.equal(Number((await database.query("SELECT count(*) FROM mentoring.reminder_attempts WHERE organization_id=$1 AND job_id=$2", [organizationId, queued.id])).rows[0].count), 1);
    await pause(id);
  });

  await t.test("contact committed before a waiting claim cancels stale overdue occurrence", async () => {
    const id = await fixture();
    const queued = await job(id);
    const contactClient = await database.connect();
    try {
      await contactClient.query("BEGIN");
      await contactClient.query("SELECT id FROM mentoring.participants WHERE organization_id=$1 AND id=$2 FOR UPDATE", [organizationId, id]);
      const receivedClock = (await contactClient.query("SELECT clock_timestamp() AS now")).rows[0].now.toISOString();
      const capturedBeforeContact = new Date(Date.parse(receivedClock) - 1000).toISOString();
      let resolved = false;
      const waitingClaim = transaction((client) => claimReminder(client, ceo, queued.id, capturedBeforeContact, accepted)).then((claim) => { resolved = true; return claim; });
      await complete(contactClient, id, receivedClock);
      assert.equal(resolved, false, "Claim cannot pass a participant whose contact transaction owns the lock.");
      await contactClient.query("COMMIT");
      assert.equal(await waitingClaim, null);
      assert.equal((await stateFor(queued.id)).state, "cancelled");
    } finally { await contactClient.query("ROLLBACK"); contactClient.release(); }
    await pause(id);
  });

  await t.test("contact after durable claim preserves the in-flight evidence", async () => {
    const id = await fixture();
    const queued = await job(id);
    const claim = await transaction((client) => claimReminder(client, ceo, queued.id, now, accepted));
    assert.ok(claim);
    await transaction((client) => complete(client, id));
    assert.equal((await stateFor(queued.id)).state, "dispatching");
    await transaction((client) => recordReminderResult(client, claim, { state: "provider_accepted", providerReference: "test-inflight" }, now));
    assert.equal((await stateFor(queued.id)).state, "provider_accepted");
    await pause(id);
  });

  await t.test("timeout and expired lease become uncertain and never automatically resend", async () => {
    const id = await fixture();
    const queued = await job(id);
    const claim = await transaction((client) => claimReminder(client, ceo, queued.id, now, accepted));
    let sends = 0;
    const timeoutTransport = { ...accepted, async send() { sends += 1; return new Promise(() => {}); } };
    const result = await invokeReminderTransport(timeoutTransport, claim, 5);
    await transaction((client) => recordReminderResult(client, claim, result, now));
    assert.equal((await job(id)).state, "uncertain");
    assert.equal(await transaction((client) => claimReminder(client, ceo, queued.id, tomorrow, accepted)), null);
    assert.equal(sends, 1);
    const other = await job(id, coordinator.id);
    await transaction((client) => claimReminder(client, ceo, other.id, now, accepted));
    assert.equal(await transaction((client) => expireReminderLeases(client, organizationId, tomorrow)), 1);
    assert.equal((await job(id, coordinator.id)).state, "uncertain");
    assert.equal(await transaction((client) => claimReminder(client, ceo, other.id, tomorrow, accepted)), null);
    let reconciliationLookups = 0;
    const reconciliation = { ...accepted, async send() { assert.fail("Reconciliation must never send."); }, async reconcile() { reconciliationLookups += 1; return { state: "delivered", providerReference: "test-found" }; } };
    assert.equal(await reconcileReminder({ actor: ceo, jobId: queued.id, transport: reconciliation, transaction, now: () => tomorrow }), true);
    assert.equal(reconciliationLookups, 1);
    assert.equal((await job(id)).state, "delivered");
    await pause(id);
  });

  await t.test("current CEO mute, account activity, phone, and lifecycle are rechecked at claim", async () => {
    const id = await fixture();
    const ceoJob = await job(id, ceo.id);
    await database.query("UPDATE mentoring.memberships SET sms_muted=true,version=version+1 WHERE organization_id=$1 AND id=$2", [organizationId, ceo.id]);
    assert.equal(await transaction((client) => claimReminder(client, ceo, ceoJob.id, now, accepted)), null);
    assert.equal((await job(id, ceo.id)).state, "cancelled");
    await database.query("UPDATE mentoring.memberships SET sms_muted=false,version=version+1 WHERE organization_id=$1 AND id=$2", [organizationId, ceo.id]);
    await database.query("UPDATE mentoring.memberships SET phone='invalid',version=version+1 WHERE organization_id=$1 AND id=$2", [organizationId, mentor.id]);
    const mentorJob = await job(id);
    assert.equal(await transaction((client) => claimReminder(client, ceo, mentorJob.id, now, accepted)), null);
    assert.equal((await job(id)).reason, "invalid_staff_phone");
    await database.query("UPDATE mentoring.memberships SET active=false WHERE organization_id=$1 AND id=$2", [organizationId, coordinator.id]);
    const coordinatorJob = await job(id, coordinator.id);
    assert.equal(await transaction((client) => claimReminder(client, ceo, coordinatorJob.id, now, accepted)), null);
    await database.query("UPDATE mentoring.memberships SET active=true WHERE organization_id=$1 AND id=$2", [organizationId, coordinator.id]);
    await database.query("UPDATE mentoring.memberships SET phone='+972501234567' WHERE organization_id=$1 AND id=$2", [organizationId, mentor.id]);
    await pause(id);
    assert.equal(await transaction((client) => claimReminder(client, ceo, mentorJob.id, now, accepted)), null);
    const evaluated = await transaction((client) => evaluateReminders(client, coordinator, now));
    assert.ok(evaluated.scanned > 0);
    await assert.rejects(() => transaction((client) => evaluateReminders(client, mentor, now)), /סריקת תזכורות/);
  });

  await t.test("earlier out-of-scope and invalid-phone rows cannot starve a coordinator batch", async () => {
    const otherCoordinator = await member("coordinator");
    const outside = await fixture({ coordinatorId: otherCoordinator.id });
    const badPhoneMentor = await member("mentor", "invalid");
    const invalid = await fixture({ mentorId: badPhoneMentor.id });
    // Other recipients in this fixture are cancelled to isolate the durable
    // missing-phone candidates without inventing accepted provider evidence.
    await database.query("UPDATE mentoring.reminder_jobs SET state='cancelled',reason='superseded' WHERE organization_id=$1 AND participant_id=$2 AND recipient_staff_id<>$3", [organizationId, invalid, badPhoneMentor.id]);
    await database.query("UPDATE mentoring.reminder_jobs SET scheduled_at='1970-01-01T00:00Z' WHERE organization_id=$1 AND participant_id=ANY($2::uuid[])", [organizationId, [outside, invalid]]);
    const valid = await fixture();
    let sends = 0;
    const transport = { ...accepted, async send() { sends += 1; return { state: "provider_accepted", providerReference: "test-no-starvation" }; } };
    const result = await runDispatcher({ actor: coordinator, transport, transaction, now: () => now, limit: 1 });
    assert.equal(result.considered, 1);
    assert.equal(result.claimed, 1);
    assert.equal(sends, 1);
    const latest = await database.query("SELECT participant_id FROM mentoring.reminder_attempts WHERE organization_id=$1 AND provider_reference='test-no-starvation'", [organizationId]);
    assert.equal(latest.rows[0].participant_id, valid);
    await pause(outside); await pause(invalid); await pause(valid);
  });

  await t.test("bounded completed history never hides unresolved reminders from the offline snapshot", async () => {
    const id = await fixture();
    const queued = await job(id);
    const claim = await transaction((client) => claimReminder(client, ceo, queued.id, now, accepted));
    const rejection = await invokeReminderTransport({ ...accepted, async send() { return { state: "failed" }; } }, claim);
    await transaction((client) => recordReminderResult(client, claim, rejection, now));
    await database.query(`INSERT INTO mentoring.reminder_jobs(id,organization_id,participant_id,recipient_staff_id,kind,occurrence_key,generation,scheduled_at,reference_at,last_evaluated_by,state,reason,created_at,updated_at)
      SELECT gen_random_uuid(),$1,$2,$3,'appointment','history-'||n,'test-history',$5,$5,$4,'cancelled','superseded',$5,$6 FROM generate_series(1,205) n`, [organizationId, id, mentor.id, ceo.id, now, tomorrow]);
    const extras = await transaction((client) => loadReminderExtras(client, coordinator, [id]));
    assert.equal(extras.reminderReadiness.diagnosticsTruncated, true);
    assert.equal(extras.reminders.filter((item) => item.state === "pending").length, 5);
    assert.equal(extras.reminders.filter((item) => item.state === "failed").length, 1);
    assert.equal(extras.reminders.filter((item) => item.state === "cancelled").length, 200);
    assert.equal(extras.reminders.length, 206);
    await pause(id);
  });
});
