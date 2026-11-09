import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Client } from "pg";
import "../server/typescript-loader.mjs";

const connectionString = process.env.MENTORING_REMINDER_MIGRATION_TEST_URL;

test("reminder migration preserves delivery evidence and dual reminders deduplicate across policy changes", { skip: !connectionString }, async () => {
  assert.notEqual(process.env.NODE_ENV, "production");
  const target = new URL(connectionString);
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname), "Migration proof requires a disposable local database");
  assert.equal(target.pathname, "/mentoring_reminder_migration_test");
  const client = new Client({ connectionString });
  await client.connect();
  try {
    assert.equal((await client.query("SELECT to_regnamespace('mentoring') AS schema")).rows[0].schema, null, "Use an empty disposable database");
    await client.query("BEGIN");
    const migration = (filename) => readFile(new URL(`../../../db/mentoring/${filename}`, import.meta.url), "utf8");
    for (const filename of ["001_initial.sql", "002_resource_namespace.sql", "003_contacts.sql", "004_authority.sql", "005_oversight.sql", "006_reminders.sql", "007_staff_onboarding.sql", "008_staff_onboarding_resend.sql"]) await client.query(await migration(filename));
    const { staffFromRow } = await import("../../../lib/mentoring/server/repository.ts");
    const { rebuildParticipantReminders } = await import("../../../lib/mentoring/features/reminders/server.ts");
    const { claimReminder, recordReminderResult } = await import("../../../lib/mentoring/features/reminders/dispatcher.ts");
    const organizationId = "11111111-1111-4111-8111-111111111111";
    const now = "2030-11-09T08:00:00.000Z";
    const scheduledAt = "2030-11-09T09:00:00.000Z";
    async function member(role) {
      return staffFromRow((await client.query("INSERT INTO mentoring.memberships(id,organization_id,display_name,role,phone) VALUES($1,$2,$3,$3,'0501234567') RETURNING *", [randomUUID(), organizationId, role])).rows[0]);
    }
    const ceo = await member("ceo");
    const coordinator = await member("coordinator");
    const mentor = await member("mentor");
    const participantId = randomUUID();
    const appointmentId = randomUUID();
    await client.query("INSERT INTO mentoring.resource_ids(id,organization_id,kind) VALUES($1,$2,'participant')", [participantId, organizationId]);
    await client.query("INSERT INTO mentoring.participants(id,organization_id,display_name,created_by) VALUES($1,$2,'Migration fixture',$3)", [participantId, organizationId, ceo.id]);
    await client.query("INSERT INTO mentoring.assignments(id,organization_id,participant_id,mentor_id,coordinator_id,assigned_at,followup_anchor_at) VALUES($1,$2,$3,$4,$5,$6,$6)", [randomUUID(), organizationId, participantId, mentor.id, coordinator.id, now]);
    await client.query("INSERT INTO mentoring.appointments(id,organization_id,participant_id,mentor_id,scheduled_at) VALUES($1,$2,$3,$4,$5)", [appointmentId, organizationId, participantId, mentor.id, scheduledAt]);
    const legacyKey = JSON.stringify(["appointment", appointmentId, 1]);
    const advanceKey = JSON.stringify(["appointment", appointmentId, 1, "advance"]);
    const legacyJobId = randomUUID();
    const sameDayJobId = randomUUID();
    const claimToken = randomUUID();
    const attemptId = randomUUID();
    async function insertJob(id, recipient, key, scheduled, state = "pending", token = null) {
      await client.query(`INSERT INTO mentoring.reminder_jobs(id,organization_id,participant_id,recipient_staff_id,kind,occurrence_key,generation,scheduled_at,reference_at,last_evaluated_by,state,claim_token,lease_expires_at,created_at,updated_at)
        VALUES($1,$2,$3,$4,'appointment',$5,'legacy-generation',$6,$7,$8,$9,$10,CASE WHEN $10::uuid IS NULL THEN NULL ELSE $11::timestamptz END,$12,$12)`,
      [id, organizationId, participantId, recipient, key, scheduled, scheduledAt, ceo.id, state, token, "2030-11-09T08:01:00Z", now]);
    }
    await insertJob(legacyJobId, mentor.id, legacyKey, "2030-11-09T07:30:00Z", "provider_accepted", claimToken);
    await insertJob(sameDayJobId, coordinator.id, legacyKey, scheduledAt);
    const historicalId = randomUUID();
    await insertJob(historicalId, mentor.id, "history-not-json", "2030-11-09T07:30:00Z", "cancelled");
    await client.query(`INSERT INTO mentoring.reminder_attempts(id,organization_id,job_id,participant_id,claim_token,attempt_number,state,claimed_at,lease_expires_at,finished_at,provider,generation,scheduled_at,reference_at,recipient_version,claimed_by_staff_id,provider_reference)
      VALUES($1,$2,$3,$4,$5,1,'provider_accepted',$6,'2030-11-09T08:01:00Z',$6,'test-only','legacy-generation','2030-11-09T07:30:00Z',$7,1,$8,'legacy-provider-reference')`, [attemptId, organizationId, legacyJobId, participantId, claimToken, now, scheduledAt, ceo.id]);
    const attemptBefore = (await client.query("SELECT * FROM mentoring.reminder_attempts WHERE id=$1", [attemptId])).rows[0];

    await client.query(await migration("009_appointment_reminder_timing.sql"));
    assert.equal((await client.query("SELECT appointment_reminder_minutes_before FROM mentoring.organization_settings")).rows[0].appointment_reminder_minutes_before, 0, "Migration preserves the saved policy");
    assert.deepEqual((await client.query("SELECT id,occurrence_key,state,claim_token FROM mentoring.reminder_jobs WHERE id=$1", [legacyJobId])).rows[0], { id: legacyJobId, occurrence_key: advanceKey, state: "provider_accepted", claim_token: claimToken });
    assert.equal((await client.query("SELECT occurrence_key FROM mentoring.reminder_jobs WHERE id=$1", [sameDayJobId])).rows[0].occurrence_key, legacyKey);
    assert.equal((await client.query("SELECT occurrence_key FROM mentoring.reminder_jobs WHERE id=$1", [historicalId])).rows[0].occurrence_key, "history-not-json");
    assert.deepEqual((await client.query("SELECT * FROM mentoring.reminder_attempts WHERE id=$1", [attemptId])).rows[0], attemptBefore);
    await client.query("SAVEPOINT invalid_policy");
    await assert.rejects(client.query("UPDATE mentoring.organization_settings SET appointment_reminder_minutes_before=4321"), { code: "23514" });
    await client.query("ROLLBACK TO SAVEPOINT invalid_policy");
    await client.query("UPDATE mentoring.organization_settings SET appointment_reminder_minutes_before=4320,overdue_reminders_enabled=false,version=2");
    const transport = { provider: "test-only", credentialsConfigured: true, sendingEnabled: true, send() { assert.fail("The database proof must never send an SMS"); } };
    const rebuild = () => rebuildParticipantReminders(client, organizationId, participantId, ceo.id, null, now, transport);
    await rebuild();
    await rebuild();
    const jobs = (await client.query("SELECT * FROM mentoring.reminder_jobs WHERE participant_id=$1 AND occurrence_key=ANY($2::text[])", [participantId, [legacyKey, advanceKey]])).rows;
    assert.equal(jobs.length, 6, "One advance and one scheduled-day job for each of three staff recipients");
    assert.equal(jobs.find((job) => job.id === legacyJobId).state, "provider_accepted");
    assert.equal(jobs.find((job) => job.id === sameDayJobId).occurrence_key, legacyKey);
    assert.equal(await claimReminder(client, ceo, legacyJobId, now, transport), null, "A migrated accepted advance reminder cannot resend");
    const dayJob = jobs.find((job) => job.recipient_staff_id === mentor.id && job.occurrence_key === legacyKey);
    assert.equal(await claimReminder(client, ceo, dayJob.id, now, transport), null);
    const dayClaim = await claimReminder(client, ceo, dayJob.id, scheduledAt, transport);
    assert.ok(dayClaim, "Advance acceptance does not suppress the scheduled-day reminder");
    await recordReminderResult(client, dayClaim, { state: "provider_accepted", providerReference: "day-provider-reference" }, scheduledAt);
    for (const minutes of [0, 90, 4320]) {
      await client.query("UPDATE mentoring.organization_settings SET appointment_reminder_minutes_before=$1,version=version+1", [minutes]);
      await rebuild();
      assert.equal(await claimReminder(client, ceo, dayJob.id, scheduledAt, transport), null);
      assert.equal(await claimReminder(client, ceo, legacyJobId, scheduledAt, transport), null);
    }
    assert.equal((await client.query("SELECT count(*)::int AS count FROM mentoring.reminder_attempts")).rows[0].count, 2);
    assert.deepEqual((await client.query("SELECT * FROM mentoring.reminder_attempts WHERE id=$1", [attemptId])).rows[0], attemptBefore);
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});
