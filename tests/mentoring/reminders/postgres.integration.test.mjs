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
      for (const table of ["reminder_attempts", "reminder_jobs", "contacts", "appointments", "assignments", "grants", "participants", "resource_ids", "organization_settings", "memberships"]) await client.query(`DELETE FROM mentoring.${table} WHERE organization_id=$1`, [organizationId]);
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
    await database.query("INSERT INTO mentoring.appointments(id,organization_id,participant_id,mentor_id,scheduled_at) VALUES($1,$2,$3,$4,$5)", [randomUUID(), organizationId, id, mentorId, tomorrow]);
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
    assert.equal((await database.query("SELECT appointment_reminder_minutes_before FROM mentoring.organization_settings WHERE organization_id=$1", [organizationId])).rows[0].appointment_reminder_minutes_before, 4320);
    assert.equal(Number((await database.query("SELECT count(*) FROM mentoring.reminder_jobs WHERE organization_id=$1 AND participant_id=$2", [organizationId, id])).rows[0].count), 6);
    const extras = await transaction((client) => loadReminderExtras(client, coordinator, [id]));
    assert.equal(extras.reminders.length, 6);
    assert.deepEqual([...new Set(extras.reminders.map((item) => item.recipientStaffId))].sort(), [mentor.id, coordinator.id].sort());
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
    assert.ok(claim.message.includes("+972529999999"));
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

  await t.test("legacy all-staff policies and view grants cannot deliver to an unrelated mentor", async (context) => {
    const previousAudience = (await database.query("SELECT reminder_audience FROM mentoring.organization_settings WHERE organization_id=$1", [organizationId])).rows[0].reminder_audience;
    await database.query("UPDATE mentoring.organization_settings SET reminder_audience='all_staff' WHERE organization_id=$1", [organizationId]);
    try {
      for (const [label, grant] of [["no grant", null], ["active grant", { active: true, expiresAt: null }], ["expired grant", { active: true, expiresAt: now }], ["inactive grant", { active: false, expiresAt: null }]]) {
        await context.test(label, async () => {
          const id = await fixture();
          if (grant) await database.query("INSERT INTO mentoring.grants(id,organization_id,staff_id,participant_id,actions,active,expires_at) VALUES($1,$2,$3,$4,ARRAY['view'],$5,$6)", [randomUUID(), organizationId, outsider.id, id, grant.active, grant.expiresAt]);
          assert.equal(await job(id, outsider.id), undefined, "New planning is limited to the assigned team even with a saved all-staff policy.");
          const source = await job(id);
          const legacyId = randomUUID();
          await database.query(`INSERT INTO mentoring.reminder_jobs
            (id,organization_id,participant_id,recipient_staff_id,kind,occurrence_key,generation,scheduled_at,reference_at,state,last_evaluated_by,created_at,updated_at)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,$11,$11)`,
          [legacyId, organizationId, id, outsider.id, source.kind, source.occurrence_key, source.generation, source.scheduled_at, source.reference_at, ceo.id, now]);
          assert.equal(await transaction((client) => claimReminder(client, ceo, legacyId, now, accepted)), null, "An old queued audience cannot bypass current recipient responsibility.");
          assert.equal((await stateFor(legacyId)).state, "cancelled");
          assert.equal(Number((await database.query("SELECT count(*) FROM mentoring.reminder_attempts WHERE organization_id=$1 AND job_id=$2", [organizationId, legacyId])).rows[0].count), 0);
          const claim = await transaction((client) => claimReminder(client, ceo, source.id, now, accepted));
          assert.ok(claim, "Rejecting unrelated recipients must preserve delivery to the assigned mentor.");
          assert.equal(claim.recipient, mentor.phone);
          assert.ok(claim.message.includes("+972529999999"));
          assert.equal(claim.message.includes("PRIVATE"), false);
          await transaction((client) => recordReminderResult(client, claim, { state: "provider_accepted", providerReference: "test-responsible-access" }, now));
          await pause(id);
        });
      }
    } finally {
      await database.query("UPDATE mentoring.organization_settings SET reminder_audience=$2 WHERE organization_id=$1", [organizationId, previousAudience]);
    }
  });

  await t.test("weekly cycles deduplicate, skip missed runs without bursts, ignore no-answer and reset on a completed report", async () => {
    const id = await fixture();
    const anchor = "2030-10-01T07:00:00.000Z";
    const delayed = "2030-11-01T09:00:00.000Z";
    const rebuild = (time) => transaction((client) => rebuildParticipantReminders(client, organizationId, id, ceo.id, null, time, accepted));
    const current = () => database.query("SELECT * FROM mentoring.reminder_jobs WHERE organization_id=$1 AND participant_id=$2 AND kind='seven_day_overdue' AND state IN ('pending','blocked') ORDER BY recipient_staff_id", [organizationId, id]);
    await transaction((client) => complete(client, id, anchor));
    await rebuild(delayed);
    const latest = (await current()).rows;
    assert.equal(latest.length, 2, "Each responsible recipient gets only the latest due week after four missed runs");
    assert.equal(latest.every((row) => row.scheduled_at.toISOString() === "2030-10-29T08:00:00.000Z"), true, "The local wall clock remains 10:00 after Israel's DST change");
    for (const row of latest) {
      const claim = await transaction((client) => claimReminder(client, ceo, row.id, delayed, accepted));
      assert.ok(claim);
      await transaction((client) => recordReminderResult(client, claim, { state: "provider_accepted", providerReference: `weekly-proof-${row.recipient_staff_id}` }, delayed));
      assert.equal(await transaction((client) => claimReminder(client, ceo, row.id, delayed, accepted)), null);
    }
    await rebuild("2030-11-02T10:00:00.000Z");
    assert.equal((await current()).rows.length, 0, "An accepted occurrence cannot resend within the same week");
    const noAnswer = randomUUID();
    await database.query("INSERT INTO mentoring.resource_ids(id,organization_id,kind) VALUES($1,$2,'contact')", [noAnswer, organizationId]);
    await database.query("INSERT INTO mentoring.contacts(id,organization_id,participant_id,actor_id,method,outcome,occurred_at,received_at) VALUES($1,$2,$3,$4,'phone','no_answer',$5,$5)", [noAnswer, organizationId, id, mentor.id, "2030-11-02T09:00:00Z"]);
    await rebuild("2030-11-02T10:00:00.000Z");
    assert.equal((await current()).rows.length, 0, "No-answer does not create a fresh cycle or duplicate accepted notices");
    await rebuild("2030-11-05T08:00:00.000Z");
    const nextWeek = (await current()).rows;
    assert.equal(nextWeek.length, 2);
    assert.equal(nextWeek.every((row) => row.scheduled_at.toISOString() === "2030-11-05T08:00:00.000Z"), true);
    assert.equal(nextWeek.some((row) => latest.some((previous) => previous.occurrence_key === row.occurrence_key)), false);
    await transaction((client) => complete(client, id, "2030-11-05T09:00:00.000Z"));
    await rebuild("2030-11-05T09:00:00.000Z");
    for (const row of nextWeek) {
      assert.equal((await stateFor(row.id)).state, "cancelled");
      assert.equal(await transaction((client) => claimReminder(client, ceo, row.id, "2030-11-05T09:00:00.000Z", accepted)), null, "A stale weekly claim cannot survive the completed report");
    }
    const fresh = (await current()).rows;
    assert.equal(fresh.length, 2);
    assert.equal(fresh.every((row) => row.scheduled_at.toISOString() === "2030-11-12T09:00:00.000Z"), true, "The new completed report starts a fresh seven-day cycle");
    assert.equal(await transaction((client) => claimReminder(client, ceo, fresh[0].id, "2030-11-12T08:59:59.999Z", accepted)), null);
    assert.ok(await transaction((client) => claimReminder(client, ceo, fresh[0].id, "2030-11-12T09:00:00.000Z", accepted)));
    assert.equal(Number((await database.query("SELECT count(*) FROM mentoring.reminder_attempts WHERE organization_id=$1 AND participant_id=$2", [organizationId, id])).rows[0].count), 3);
    await pause(id);
  });

  await t.test("notes-only report revisions retain prior delivery keys and cannot duplicate a weekly external effect", async (context) => {
    for (const outcome of ["dispatching", "provider_accepted", "delivered", "uncertain", "failed"]) {
      await context.test(outcome, async () => {
        const id = await fixture();
        const anchor = new Date(Date.parse(now) - 10 * 86_400_000).toISOString();
        const contactId = await transaction((client) => complete(client, id, anchor));
        const queued = (await database.query("SELECT * FROM mentoring.reminder_jobs WHERE organization_id=$1 AND participant_id=$2 AND recipient_staff_id=$3 AND kind='seven_day_overdue' AND state='pending'", [organizationId, id, mentor.id])).rows[0];
        const claim = await transaction((client) => claimReminder(client, ceo, queued.id, now, accepted));
        assert.ok(claim);
        if (outcome !== "dispatching") await transaction((client) => recordReminderResult(client, claim, { state: outcome, ...(["provider_accepted", "delivered"].includes(outcome) ? { providerReference: `revision-proof-${outcome}` } : {}) }, now));
        const jobBefore = await stateFor(queued.id);
        const attemptsBefore = (await database.query("SELECT * FROM mentoring.reminder_attempts WHERE organization_id=$1 AND job_id=$2 ORDER BY id", [organizationId, queued.id])).rows;
        await database.query("UPDATE mentoring.contacts SET revision=revision+1,notes='Notes corrected without changing the contact time' WHERE organization_id=$1 AND id=$2", [organizationId, contactId]);
        await database.query("UPDATE mentoring.participants SET version=version+1 WHERE organization_id=$1 AND id=$2", [organizationId, id]);
        await transaction((client) => rebuildParticipantReminders(client, organizationId, id, ceo.id, null, now, accepted));
        assert.deepEqual(await stateFor(queued.id), jobBefore, "Known/uncertain/failed delivery evidence and its legacy key are never rekeyed");
        assert.deepEqual((await database.query("SELECT * FROM mentoring.reminder_attempts WHERE organization_id=$1 AND job_id=$2 ORDER BY id", [organizationId, queued.id])).rows, attemptsBefore);
        assert.equal(Number((await database.query("SELECT count(*) FROM mentoring.reminder_jobs WHERE organization_id=$1 AND participant_id=$2 AND recipient_staff_id=$3 AND kind='seven_day_overdue' AND state IN ('pending','blocked')", [organizationId, id, mentor.id])).rows[0].count), 0, "Correcting notes cannot create a second job for that same contact week");
        assert.equal(await transaction((client) => claimReminder(client, ceo, queued.id, now, accepted)), null);
        await transaction((client) => rebuildParticipantReminders(client, organizationId, id, ceo.id, null, new Date(Date.parse(now) + 7 * 86_400_000).toISOString(), accepted));
        assert.equal(Number((await database.query("SELECT count(*) FROM mentoring.reminder_jobs WHERE organization_id=$1 AND participant_id=$2 AND recipient_staff_id=$3 AND kind='seven_day_overdue' AND state='pending'", [organizationId, id, mentor.id])).rows[0].count), 1, "The next weekly occurrence still becomes available");
        // Finish this deliberately unsent test claim so a later organization-
        // wide lease-expiry test observes only the claim it creates itself.
        if (outcome === "dispatching") await transaction((client) => recordReminderResult(client, claim, { state: "failed" }, now));
        await pause(id);
      });
    }
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

  await t.test("CEOs are excluded and account activity, phone, and lifecycle are rechecked at claim", async () => {
    const id = await fixture();
    const legacySource = await job(id);
    await database.query(`INSERT INTO mentoring.reminder_jobs
      (id,organization_id,participant_id,recipient_staff_id,kind,occurrence_key,generation,scheduled_at,reference_at,state,last_evaluated_by,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$4,$10,$10)`,
    [randomUUID(), organizationId, id, ceo.id, legacySource.kind, legacySource.occurrence_key, legacySource.generation, legacySource.scheduled_at, legacySource.reference_at, now]);
    const ceoJob = await job(id, ceo.id);
    await database.query("UPDATE mentoring.memberships SET sms_muted=false,version=version+1 WHERE organization_id=$1 AND id=$2", [organizationId, ceo.id]);
    assert.equal(await transaction((client) => claimReminder(client, ceo, ceoJob.id, now, accepted)), null);
    assert.equal((await job(id, ceo.id)).state, "cancelled");
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
