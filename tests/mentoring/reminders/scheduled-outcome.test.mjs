import assert from "node:assert/strict";
import test from "node:test";
import "../server/typescript-loader.mjs";

// A broken dependency seam must fail before opening a real database pool.
delete process.env.MENTORING_DATABASE_URL;

const { ORGANIZATION_ID } = await import("../../../lib/mentoring/server/db.ts");
const { runScheduledReminders } = await import("../../../lib/mentoring/features/reminders/scheduled.ts");
const { runDispatcher, recordReminderResult } = await import("../../../lib/mentoring/features/reminders/dispatcher.ts");
const { rebuildParticipantReminders } = await import("../../../lib/mentoring/features/reminders/server.ts");

const id = (part) => `44444444-4444-4444-8444-${String(part).padStart(12, "0")}`;
const actorId = id(1);
const mentorId = id(2);
const participantId = id(3);
const now = "2026-10-26T12:00:00.000Z";

/**
 * This is an isolated transactional row model, not a PostgreSQL substitute or
 * provider acceptance claim. Actual production claim/rebuild/result functions
 * execute their queries; the model supplies fixture rows and atomic rollback.
 */
function fixture({ singleOccurrence = false } = {}) {
  const actor = { id: actorId, organization_id: ORGANIZATION_ID, auth_user_id: "synthetic-ceo", role: "ceo", active: true,
    display_name: "Synthetic CEO", phone: null, email: null, coordinator_id: null, sms_muted: true, version: 1 };
  const mentor = { ...actor, id: mentorId, auth_user_id: "synthetic-mentor", role: "mentor", display_name: "Synthetic mentor",
    phone: "0501234567", sms_muted: false };
  const participant = { id: participantId, organization_id: ORGANIZATION_ID, display_name: "Synthetic participant", phone: null,
    service_type: "national", service_place: null, service_role: null, profile_notes: null, lifecycle: "active", version: 1,
    created_at: "2026-10-01T12:00:00Z", created_by: actorId, deleted_at: null, deleted_by: null, deletion_reason: null,
    deleted_previous_lifecycle: null, manual_color: null, manual_color_at: null };
  const assignment = { id: id(4), organization_id: ORGANIZATION_ID, participant_id: participantId, mentor_id: mentorId,
    // Retained coordinator responsibility means demotion alone does not make
    // the ordinary dispatcher deny this participant. The scheduled caller must
    // enforce its stricter CEO ceiling before any subsequent claim.
    coordinator_id: actorId, assigned_at: "2026-10-18T12:00:00Z", followup_anchor_at: "2026-10-18T12:00:00Z", version: 1 };
  const appointment = { id: id(5), organization_id: ORGANIZATION_ID, participant_id: participantId, mentor_id: mentorId,
    scheduled_at: "2026-10-26T11:00:00Z", version: 1, source_contact_id: null, is_current: true };
  const settings = { organization_id: ORGANIZATION_ID, version: 1, offline_lease_hours: 24, reminder_audience: "responsible_team",
    appointment_reminder_minutes_before: 0, overdue_reminders_enabled: !singleOccurrence, overdue_repeat_hours: null, updated_at: now, updated_by: null };
  let jobs = new Map();
  let attempts = new Map();
  let inTransaction = false;
  let nextJob = 100;
  const copy = (value) => structuredClone(value);
  const rows = (value) => ({ rows: copy(value), rowCount: value.length });
  const client = { query: async (original, values = []) => {
    const sql = original.replace(/\s+/g, " ").trim();
    if (sql.startsWith("SELECT clock_timestamp()")) return rows([{ now }]);
    if (sql.startsWith("SELECT") && sql.includes("FROM mentoring.memberships")) {
      if (values.length === 1) return rows([actor, mentor]);
      const member = [actor, mentor].find((entry) => entry.organization_id === values[0] && entry.id === values[1]);
      const allowed = member && (!/active\s*=\s*true/i.test(sql) || member.active)
        && (!/role\s*=\s*'ceo'/i.test(sql) || member.role === "ceo")
        && (!/role\s+IN/i.test(sql) || ["ceo", "coordinator"].includes(member.role));
      return rows(allowed ? [member] : []);
    }
    if (sql.startsWith("SELECT j.id FROM mentoring.reminder_jobs j")) {
      assert.equal(values[0], ORGANIZATION_ID);
      assert.equal(values[3], actorId);
      return rows(!actor.active || actor.role !== "ceo" ? [] : [...jobs.values()]
        .filter((job) => ["pending", "blocked"].includes(job.state) && Date.parse(job.scheduled_at) <= Date.parse(values[1]))
        .sort((left, right) => Date.parse(left.scheduled_at) - Date.parse(right.scheduled_at) || left.id.localeCompare(right.id))
        .slice(0, values[2]).map((job) => ({ id: job.id })));
    }
    if (sql.startsWith("SELECT p.id FROM mentoring.participants p JOIN mentoring.reminder_jobs")) {
      const job = jobs.get(values[1]);
      return rows(job && job.organization_id === values[0] ? [{ id: job.participant_id }] : []);
    }
    if (sql.startsWith("SELECT") && sql.includes("FROM mentoring.participants WHERE")) return rows(values[0] === ORGANIZATION_ID && values[1] === participantId ? [participant] : []);
    if (sql.startsWith("SELECT") && sql.includes("FROM mentoring.assignments")) return rows([assignment]);
    if (sql.startsWith("SELECT") && sql.includes("FROM mentoring.appointments")) return rows([appointment]);
    if (sql.startsWith("SELECT") && /FROM mentoring\.(contacts|reviews|ceo_protections)/.test(sql)) return rows([]);
    if (sql.startsWith("SELECT") && sql.includes("FROM mentoring.organization_settings")) return rows([settings]);
    if (sql.startsWith("SELECT id,participant_id FROM mentoring.reminder_jobs")) return rows([...jobs.values()].filter((job) => job.state === "dispatching" && Date.parse(job.lease_expires_at) <= Date.parse(values[1])));
    if (sql.startsWith("SELECT") && sql.includes("FROM mentoring.reminder_jobs WHERE")) {
      const job = jobs.get(values[1]);
      return rows(job && job.organization_id === values[0] ? [job] : []);
    }
    if (sql.startsWith("SELECT coalesce(max(attempt_number)")) return rows([{ number: [...attempts.values()].filter((attempt) => attempt.job_id === values[1]).length + 1 }]);
    if (sql.startsWith("INSERT INTO mentoring.reminder_jobs")) {
      const [organization_id, participant_id, recipient_staff_id, kind, occurrence_key, generation, scheduled_at, reference_at, state, reason] = values;
      let job = [...jobs.values()].find((entry) => entry.organization_id === organization_id && entry.participant_id === participant_id
        && entry.recipient_staff_id === recipient_staff_id && entry.occurrence_key === occurrence_key);
      if (!job) { job = { id: id(nextJob++), organization_id, participant_id, recipient_staff_id, occurrence_key }; jobs.set(job.id, job); }
      if (!job.state || ["pending", "blocked", "cancelled"].includes(job.state)) Object.assign(job, { kind, generation, scheduled_at, reference_at, state, reason });
      return rows([]);
    }
    if (sql.startsWith("UPDATE mentoring.reminder_jobs SET state='cancelled'")) {
      const keys = new Set(values[3]);
      for (const job of jobs.values()) if (job.participant_id === values[1] && ["pending", "blocked"].includes(job.state)
        && !keys.has(`${job.recipient_staff_id}|${job.occurrence_key}`)) Object.assign(job, { state: "cancelled", reason: "superseded" });
      return rows([]);
    }
    if (sql.startsWith("INSERT INTO mentoring.reminder_attempts")) {
      const [attemptId, organization_id, job_id, participant_id, claim_token, attempt_number, claimed_at, lease_expires_at, provider] = values;
      attempts.set(attemptId, { id: attemptId, organization_id, job_id, participant_id, claim_token, attempt_number, claimed_at,
        lease_expires_at, provider, state: "dispatching", provider_reference: null });
      return rows([]);
    }
    if (sql.startsWith("UPDATE mentoring.reminder_jobs SET state='dispatching'")) {
      Object.assign(jobs.get(values[1]), { state: "dispatching", reason: null, claim_token: values[2], lease_expires_at: values[3] });
      return rows([]);
    }
    if (sql.startsWith("UPDATE mentoring.reminder_attempts SET state=$5")) {
      const attempt = [...attempts.values()].find((entry) => entry.organization_id === values[0] && entry.job_id === values[1]
        && entry.claim_token === values[2] && entry.provider === values[3]);
      if (!attempt) return rows([]);
      Object.assign(attempt, { state: values[4], provider_reference: values[5] ?? attempt.provider_reference, reason: values[6], finished_at: values[7] });
      return rows([{ id: attempt.id }]);
    }
    if (sql.startsWith("UPDATE mentoring.reminder_jobs SET state=$4")) {
      const job = jobs.get(values[1]);
      if (job && job.organization_id === values[0] && job.claim_token === values[2]) Object.assign(job, { state: values[3], reason: values[4] });
      return rows([]);
    }
    throw new Error(`Unsupported isolated fixture query: ${sql}`);
  } };
  return {
    transaction: async (work) => {
      assert.equal(inTransaction, false, "provider and transaction phases must not nest");
      const beforeJobs = copy(jobs);
      const beforeAttempts = copy(attempts);
      inTransaction = true;
      try { return await work(client); }
      catch (error) { jobs = beforeJobs; attempts = beforeAttempts; throw error; }
      finally { inTransaction = false; }
    },
    changeActor: (changes) => { assert.equal(inTransaction, false, "unit provider effect is outside database work"); Object.assign(actor, changes); },
    changeJob: (jobId, changes) => Object.assign(jobs.get(jobId), changes),
    changeAttempt: (attemptId, changes) => Object.assign(attempts.get(attemptId), changes),
    get jobs() { return copy([...jobs.values()]); },
    get attempts() { return copy([...attempts.values()]); },
  };
}

async function seededModel(options) {
  const model = fixture(options);
  const transport = { provider: "unit-only", credentialsConfigured: true, sendingEnabled: true,
    send: async () => { throw new Error("The seed phase must never send"); } };
  await model.transaction((client) => rebuildParticipantReminders(client, ORGANIZATION_ID, participantId, actorId, null, now, transport));
  assert.equal(model.jobs.length, options?.singleOccurrence ? 1 : 2);
  assert.equal(model.jobs.every((job) => job.state === "pending"), true);
  return model;
}

test("known external acceptance survives scheduler actor loss without authorizing new work", async (context) => {
  for (const changes of [{ active: false }, { role: "coordinator" }]) for (const singleOccurrence of [false, true]) {
    await context.test(`${changes.active === false ? "revocation" : "demotion"}, ${singleOccurrence ? "final authority check" : "next claim"}`, async () => {
      const model = await seededModel({ singleOccurrence });
      let sends = 0;
      let sentJob;
      const transport = { provider: "unit-only", credentialsConfigured: true, sendingEnabled: true,
        send: async (input) => {
          sends += 1;
          assert.equal(sends, 1);
          assert.equal(input.recipient, "+972501234567");
          assert.equal(model.attempts.length, 1, "the real claim committed before the external effect");
          const attempt = model.attempts[0];
          sentJob = attempt.job_id;
          assert.equal(input.idempotencyKey, `mentoring-reminder:${sentJob}`);
          assert.equal(model.jobs.find((job) => job.id === sentJob).state, "dispatching");
          model.changeActor(changes);
          return { state: "provider_accepted", providerReference: "unit-known-acceptance" };
        } };
      await assert.rejects(runScheduledReminders(actorId, {
        transaction: model.transaction, clock: () => 0, now: () => now,
        evaluate: async () => ({ scanned: 1, planned: model.jobs.length, nextCursor: null }),
        dispatch: (options) => runDispatcher({ ...options, transport }),
      }), { message: "Scheduled actor unavailable." }, "lost CEO authority cannot be reported as a completed scheduler run");
      assert.equal(sends, 1);
      const attempt = model.attempts[0];
      const acceptedJob = model.jobs.find((job) => job.id === sentJob);
      assert.equal(acceptedJob.state, "provider_accepted", "known external acceptance must not be rolled back by later actor loss");
      assert.equal(attempt.state, "provider_accepted");
      assert.equal(attempt.provider_reference, "unit-known-acceptance");
      assert.equal(attempt.provider, "unit-only");
      assert.equal(attempt.claim_token, acceptedJob.claim_token);
      assert.equal(model.attempts.length, 1);
      const remaining = model.jobs.filter((job) => job.id !== sentJob);
      assert.equal(remaining.length, singleOccurrence ? 0 : 1);
      assert.equal(remaining.every((job) => job.state === "pending" && job.claim_token === undefined), true);
    });
  }
});

test("raw result persistence still enforces the original claim token and provider", async (context) => {
  for (const mismatch of ["claim_token", "provider"]) await context.test(mismatch, async () => {
    const model = await seededModel({ singleOccurrence: true });
    let sends = 0;
    const transport = { provider: "unit-only", credentialsConfigured: true, sendingEnabled: true,
      send: async () => { sends += 1; return { state: "provider_accepted", providerReference: "unit-original" }; } };
    // Establish a real committed claim and result first, then use that immutable
    // claim identity to attempt a mismatched result through the actual writer.
    await runDispatcher({ actor: { id: actorId, organizationId: ORGANIZATION_ID }, transport,
      transaction: model.transaction, now: () => now });
    assert.equal(sends, 1);
    const attempt = model.attempts[0];
    const job = model.jobs[0];
    const claim = { organizationId: ORGANIZATION_ID, jobId: job.id, claimToken: attempt.claim_token, provider: attempt.provider };
    if (mismatch === "claim_token") claim.claimToken = "different-claim";
    else claim.provider = "different-provider";
    await model.transaction((client) => recordReminderResult(client, claim, { state: "delivered", providerReference: "must-not-replace" }, now));
    assert.equal(model.jobs[0].state, "provider_accepted");
    assert.equal(model.attempts[0].state, "provider_accepted");
    assert.equal(model.attempts[0].provider_reference, "unit-original");
  });
});
