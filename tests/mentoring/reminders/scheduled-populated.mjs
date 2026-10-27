// Explicitly opt-in, populated development-only route integration. This file is
// not part of the unit runner. Root must grant an exclusive database window.
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import "../server/typescript-loader.mjs";

createRequire(import.meta.url)("next/dist/server/node-environment-baseline");
const ROOT = new URL("../../../", import.meta.url);
const ORGANIZATION = "11111111-1111-4111-8111-111111111111";
const QA_ACTOR = "15906dea-3538-46ab-ab2f-9ec651d15474";
const QA_EMAIL = "mentoring-owner+clerk_test@example.com";
const QA_AUTH_USER = "user_3LEdW1ZzcasOTeiCSsfxGV7UZTJ";
const TABLES = [
  "resource_ids", "organization_settings_history", "monthly_reviews", "monthly_review_history",
  "reminder_jobs", "reminder_attempts", "contact_revisions", "review_events", "appointment_history",
  "manual_color_history", "participants", "assignments", "contacts", "appointments", "reviews",
  "grants", "ceo_protections", "operations", "conflicts", "audit", "outbox",
];
const SEED_TABLES = ["memberships", "resource_ids", "participants", "assignments", "appointments"];
const SOURCE_FILES = [
  "lib/mentoring/features/reminders/scheduled.ts", "lib/mentoring/features/reminders/dispatcher.ts",
  "app/api/internal/mentoring/reminders/route.ts", "lib/mentoring/features/reminders/server.ts",
  "lib/mentoring/features/reminders/transport.ts", "lib/mentoring/features/reminders/policy.ts",
  "lib/mentoring/features/oversight/server.ts", "lib/mentoring/features/oversight/contracts.ts", "lib/mentoring/domain/index.ts",
  "lib/mentoring/server/db.ts", "lib/mentoring/server/repository.ts",
  "tests/mentoring/reminders/scheduled-populated.mjs",
];
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const ensure = (condition, message) => assert.ok(condition, message);

async function hashes() {
  return Object.fromEntries(await Promise.all(SOURCE_FILES.map(async (name) => [name, createHash("sha256").update(await readFile(new URL(name, ROOT))).digest("hex")])));
}

async function counters(client) {
  const parts = TABLES.map((table) => `SELECT '${table}' AS name,count(*)::int AS count FROM mentoring.${table} WHERE organization_id=$1`);
  parts.push("SELECT 'other_memberships' AS name,count(*)::int AS count FROM mentoring.memberships WHERE organization_id=$1 AND id<>$2");
  return Object.fromEntries((await client.query(`${parts.join(" UNION ALL ")} ORDER BY name`, [ORGANIZATION, QA_ACTOR])).rows.map((row) => [row.name, row.count]));
}

async function baselineRows(client, lock = false) {
  const members = (await client.query(`SELECT * FROM mentoring.memberships WHERE organization_id=$1 AND id=$2${lock ? " FOR SHARE" : ""}`, [ORGANIZATION, QA_ACTOR])).rows;
  const settings = (await client.query(`SELECT * FROM mentoring.organization_settings WHERE organization_id=$1${lock ? " FOR SHARE" : ""}`, [ORGANIZATION])).rows;
  const actor = members[0];
  ensure(members.length === 1 && actor.id === QA_ACTOR && actor.auth_user_id === QA_AUTH_USER
    && actor.email === QA_EMAIL && actor.active === true && actor.role === "ceo" && actor.version === 6,
  "Original approved development CEO version6 is required.");
  ensure(settings.length === 1 && settings[0].version === 1 && settings[0].overdue_reminders_enabled === true
    && settings[0].overdue_repeat_hours === null, "Original settings version1 without repeating-overdue intervals is required.");
  return { actor, settings: settings[0] };
}

async function emptySnapshot(transaction) {
  return transaction(async (client) => {
    const original = await baselineRows(client);
    const counts = await counters(client);
    ensure(Object.keys(counts).length === 22 && Object.values(counts).every((value) => value === 0), "An exclusive empty development database window is required.");
    return { ...original, counts };
  }, { repeatableRead: true });
}

async function fixtureRows(client, fixture, lock = false) {
  const rows = {};
  for (const table of SEED_TABLES) {
    const ids = table === "memberships" ? fixture.staffIds : table === "assignments" ? fixture.assignmentIds
      : table === "appointments" ? fixture.appointmentIds : fixture.participantIds;
    rows[table] = (await client.query(`SELECT * FROM mentoring.${table} WHERE organization_id=$1 AND id=ANY($2::uuid[]) ORDER BY id${lock ? " FOR UPDATE" : ""}`, [ORGANIZATION, ids])).rows;
  }
  return rows;
}

async function allJobs(client, lock = false) {
  return (await client.query(`SELECT * FROM mentoring.reminder_jobs WHERE organization_id=$1 ORDER BY id${lock ? " FOR UPDATE" : ""}`, [ORGANIZATION])).rows;
}

function assertBlockedJobs(jobs, fixture, original) {
  const recipients = new Set([fixture.mentorId, ...(original.actor.sms_muted ? [] : [QA_ACTOR])]);
  ensure(jobs.length === recipients.size * 2, "Only the active assigned participant may produce appointment and overdue jobs.");
  ensure(new Set(jobs.map((row) => `${row.participant_id}|${row.recipient_staff_id}|${row.occurrence_key}`)).size === jobs.length, "Canonical reminder occurrences must be unique.");
  for (const recipient of recipients) {
    const own = jobs.filter((row) => row.recipient_staff_id === recipient);
    ensure(own.length === 2 && own.some((row) => row.kind === "appointment") && own.some((row) => row.kind === "seven_day_overdue"), "Each responsible recipient needs the expected two canonical occurrences.");
  }
  for (const row of jobs) {
    ensure(row.participant_id === fixture.activeId && recipients.has(row.recipient_staff_id)
      && row.last_evaluated_by === QA_ACTOR && row.last_evaluated_operation_id === null
      && row.state === "blocked" && row.claim_token === null && row.lease_expires_at === null
      && ["missing_sms_provider", "invalid_staff_phone"].includes(row.reason), "Reminder state or attribution is not the expected blocked fixture state.");
    if (row.recipient_staff_id === fixture.mentorId) ensure(row.reason === "missing_sms_provider", "Valid synthetic staff phone must remain blocked by the missing real provider.");
  }
  return jobs.length;
}

async function seed(transaction, fixture, original) {
  return transaction(async (client) => {
    ensure(same(await baselineRows(client, true), { actor: original.actor, settings: original.settings }), "Preexisting rows changed before fixture setup.");
    ensure(Object.values(await counters(client)).every((value) => value === 0), "The empty database window ended before setup.");
    await client.query(`INSERT INTO mentoring.memberships(id,organization_id,display_name,email,phone,role,active)
      VALUES($1,$2,$3,$4,$5,'mentor',true),($6,$2,$7,$8,NULL,'ceo',false)`, [fixture.mentorId, ORGANIZATION,
      `${fixture.marker} mentor`, `${fixture.marker}-mentor@example.invalid`, "+972500000000", fixture.inactiveCeoId,
      `${fixture.marker} inactive CEO`, `${fixture.marker}-inactive@example.invalid`]);
    for (const [index, id] of fixture.participantIds.entries()) {
      await client.query("INSERT INTO mentoring.resource_ids(id,organization_id,kind) VALUES($1,$2,'participant')", [id, ORGANIZATION]);
      await client.query(`INSERT INTO mentoring.participants(id,organization_id,display_name,phone,profile_notes,lifecycle,created_by)
        VALUES($1,$2,$3,'0529999999',$4,$5,$6)`, [id, ORGANIZATION, `${fixture.marker} participant ${index}`,
        `${fixture.marker} PRIVATE synthetic narrative`, id === fixture.pausedId ? "paused" : "active", QA_ACTOR]);
    }
    const assignedAt = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const appointmentAt = new Date(Date.now() - 2 * 86_400_000).toISOString();
    for (const [index, participantId] of [fixture.activeId, fixture.pausedId].entries()) {
      await client.query(`INSERT INTO mentoring.assignments(id,organization_id,participant_id,mentor_id,assigned_at,followup_anchor_at)
        VALUES($1,$2,$3,$4,$5,$5)`, [fixture.assignmentIds[index], ORGANIZATION, participantId, fixture.mentorId, assignedAt]);
      await client.query(`INSERT INTO mentoring.appointments(id,organization_id,participant_id,mentor_id,scheduled_at)
        VALUES($1,$2,$3,$4,$5)`, [fixture.appointmentIds[index], ORGANIZATION, participantId, fixture.mentorId, appointmentAt]);
    }
    return fixtureRows(client, fixture);
  });
}

async function cleanup(transaction, fixture, original, seededRows) {
  return transaction(async (client) => {
    ensure(same(await baselineRows(client, true), { actor: original.actor, settings: original.settings }), "Preexisting rows changed; refuse cleanup instead of repairing them.");
    const current = await fixtureRows(client, fixture, true);
    ensure(same(current, seededRows), "Fixture source rows changed unexpectedly; preserve them for review.");
    ensure(current.memberships.length === 2 && current.memberships.every((row) => row.auth_user_id === null && row.display_name.startsWith(fixture.marker))
      && current.participants.length === 3 && current.participants.every((row) => row.created_by === QA_ACTOR && row.display_name.startsWith(fixture.marker)), "Fixture attribution is not proven.");
    const jobs = await allJobs(client, true);
    ensure(jobs.every((row) => fixture.participantIds.includes(row.participant_id)
      && [QA_ACTOR, fixture.mentorId].includes(row.recipient_staff_id) && row.last_evaluated_by === QA_ACTOR
      && row.state === "blocked" && row.claim_token === null && row.lease_expires_at === null), "Unexpected reminder evidence must not be deleted.");
    const counts = await counters(client);
    const expected = { resource_ids: 3, participants: 3, assignments: 2, appointments: 2, reminder_jobs: jobs.length, other_memberships: 2 };
    ensure(Object.entries(counts).every(([table, value]) => value === (expected[table] ?? 0)), "External rows or reminder attempts exist; refuse cleanup.");
    // Exact counts plus exact-owned row sets exclude external references in
    // every currently populated table. Foreign keys remain an atomic backstop.
    for (const [table, ids] of [["reminder_jobs", jobs.map((row) => row.id)], ["appointments", fixture.appointmentIds],
      ["assignments", fixture.assignmentIds], ["participants", fixture.participantIds],
      ["resource_ids", fixture.participantIds], ["memberships", fixture.staffIds]]) {
      const removed = await client.query(`DELETE FROM mentoring.${table} WHERE organization_id=$1 AND id=ANY($2::uuid[]) RETURNING id`, [ORGANIZATION, ids]);
      ensure(removed.rows.length === ids.length, "Exact fixture deletion was not confirmed.");
    }
    ensure(Object.values(await counters(client)).every((value) => value === 0), "Cleanup did not return all data counters to zero.");
    ensure(same(await baselineRows(client), { actor: original.actor, settings: original.settings }), "Original rows did not remain identical.");
  });
}

async function run() {
  ensure(process.argv.slice(2).join(" ") === "--development-populated-only" && process.env.MENTORING_SCHEDULER_POPULATED === "approved"
    && process.env.MENTORING_QA_WRITES === "approved", "Explicit populated development fixture approval is required.");
  ensure(process.execArgv.includes("--conditions=react-server"), "Use the server runtime condition.");
  ensure(process.env.NODE_ENV !== "production" && process.env.VERCEL_ENV !== "production", "Production is forbidden.");
  loadEnvFile(new URL(".env.local", ROOT));
  ensure(process.env.NODE_ENV !== "production" && (!process.env.VERCEL_ENV || process.env.VERCEL_ENV === "development")
    && process.env.MENTORING_NEON_PROJECT_ID === "round-firefly-59684866" && process.env.CLERK_SECRET_KEY?.startsWith("sk_test_"), "Approved development resources only.");
  const runId = randomUUID();
  const directory = `/tmp/mentoring-scheduler-populated/${runId}`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const save = (name, value) => writeFile(`${directory}/${name}.json`, JSON.stringify(value, null, 2), { mode: 0o600, flag: "wx" });
  const fixture = { marker: `scheduled-populated-${runId.slice(0, 8)}`, mentorId: randomUUID(), inactiveCeoId: randomUUID(),
    activeId: randomUUID(), pausedId: randomUUID(), unassignedId: randomUUID(), assignmentIds: [randomUUID(), randomUUID()], appointmentIds: [randomUUID(), randomUUID()] };
  fixture.staffIds = [fixture.mentorId, fixture.inactiveCeoId];
  fixture.participantIds = [fixture.activeId, fixture.pausedId, fixture.unassignedId];
  const report = { status: "failed", stage: "preflight", providerRegistryNull: false, cleanupConfirmed: false };
  const sourceBefore = await hashes();
  const { getDatabasePool, withTransaction } = await import("../../../lib/mentoring/server/db.ts");
  const { configuredReminderTransport } = await import("../../../lib/mentoring/features/reminders/transport.ts");
  let original;
  let seededRows;
  let failure = false;
  try {
    const schema = await withTransaction(async (client) => (await client.query(`SELECT
      to_regclass('mentoring.resource_ids') IS NOT NULL AS resource_namespace,
      to_regclass('mentoring.contact_revisions') IS NOT NULL AS contact_history,
      to_regclass('mentoring.review_events') IS NOT NULL AS reviews,
      to_regclass('mentoring.organization_settings_history') IS NOT NULL AS oversight,
      to_regclass('mentoring.reminder_jobs') IS NOT NULL AS jobs,
      to_regclass('mentoring.reminder_attempts') IS NOT NULL AS attempts,
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='mentoring' AND table_name='participants' AND column_name='deleted_at') AS lifecycle,
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='mentoring' AND table_name='appointments' AND column_name='is_current') AS appointments`)).rows[0]);
    ensure(Object.values(schema).every((value) => value === true), "Required migrations001–006 must already be applied.");
    ensure(configuredReminderTransport() === null, "The actual SMS provider registry must remain empty.");
    report.providerRegistryNull = true;
    original = await emptySnapshot(withTransaction);
    await save("recovery-before-seed", { stage: "before_seed", organizationId: ORGANIZATION, fixture, original, sourceBefore });
    report.stage = "fixture_setup";
    seededRows = await seed(withTransaction, fixture, original);
    await save("recovery-seed-committed", { stage: "seed_committed", organizationId: ORGANIZATION, fixture, original, seededRows, sourceBefore });
    report.stage = "route_integration";
    const localBearer = randomBytes(32).toString("hex");
    process.env.CRON_SECRET = localBearer;
    process.env.MENTORING_REMINDER_ACTOR_ID = QA_ACTOR;
    const { GET, HEAD } = await import("../../../app/api/internal/mentoring/reminders/route.ts");
    const target = "http://localhost/api/internal/mentoring/reminders";
    const request = () => new Request(target, { headers: { authorization: `Bearer ${localBearer}` } });
    ensure((await HEAD(new Request(target, { method: "HEAD" }))).status === 405 && (await GET(new Request(target))).status === 401, "Method and secret gates must reject before evaluation.");
    ensure((await withTransaction((client) => allJobs(client))).length === 0, "Unauthenticated requests must not plan populated records.");
    const planned = 2 * (original.actor.sms_muted ? 1 : 2);
    const expected = { state: "delivery_blocked", scanned: 3, planned, pages: 1, scanComplete: true, more: false,
      deliveryBlocked: true, considered: 0, claimed: 0, outcomes: { provider_accepted: 0, delivered: 0, failed: 0, uncertain: 0 }, hostedSchedulerConfigured: false };
    let firstJobs;
    for (let index = 0; index < 2; index += 1) {
      ensure(configuredReminderTransport() === null, "A configured provider is forbidden in this harness.");
      const response = await GET(request());
      const result = await response.json();
      ensure(response.status === 503 && response.headers.get("cache-control") === "private, no-store" && same(result, expected), "Populated route must return only the truthful blocked aggregate.");
      const jobs = await withTransaction((client) => allJobs(client));
      assertBlockedJobs(jobs, fixture, original);
      const stable = (rows) => rows.map((row) => { const copy = { ...row }; delete copy.updated_at; return copy; });
      if (index === 0) firstJobs = jobs;
      else ensure(same(stable(firstJobs), stable(jobs)), "Repeated planning must retain every canonical job identity and payload.");
    }
    report.result = expected;
    report.canonicalJobs = planned;
    report.repeatPreservedJobIdentity = true;
    report.pausedAndUnassignedExcluded = true;
    report.stage = "authority_integration";
    const beforeRejected = await withTransaction((client) => allJobs(client));
    for (const actorId of [fixture.mentorId, fixture.inactiveCeoId, randomUUID()]) {
      process.env.MENTORING_REMINDER_ACTOR_ID = actorId;
      const response = await GET(request());
      ensure(response.status === 503 && same(await response.json(), { state: "unavailable", hostedSchedulerConfigured: false }), "Only a currently active CEO may scan the organization.");
      ensure(same(await withTransaction((client) => allJobs(client)), beforeRejected), "Rejected authority must not alter existing planned jobs.");
    }
    report.rejectedNonCeoInactiveAndMissingActor = true;
    const counts = await withTransaction(counters);
    ensure(counts.reminder_attempts === 0 && configuredReminderTransport() === null, "No claims, provider handoff or delivery may occur.");
    report.claims = 0;
    report.sends = 0;
    report.stage = "checks_complete";
  } catch {
    failure = true;
    report.failureStage = report.stage;
  } finally {
    try {
      if (seededRows) await cleanup(withTransaction, fixture, original, seededRows);
      if (original) {
        ensure(same(await emptySnapshot(withTransaction), original), "Full original rows and all22 counters must be restored exactly.");
        report.cleanupConfirmed = true;
        report.zeroCountersBefore = 22;
        report.zeroCountersAfter = 22;
        report.originalMembershipAndSettingsUnchanged = true;
        report.membershipVersion = 6;
        report.settingsVersion = 1;
      }
    } catch {
      failure = true;
      report.cleanupConfirmed = false;
      report.failureStage = "cleanup";
    }
    try {
      const sourceAfter = await hashes();
      report.sourceHashesStable = same(sourceAfter, sourceBefore);
      report.sourceHashes = sourceBefore;
      if (!report.sourceHashesStable) { failure = true; report.failureStage = "source_integrity"; }
    } catch { failure = true; report.sourceHashesStable = false; report.failureStage = "source_integrity"; }
    try { await getDatabasePool().end(); report.ownPoolClosed = true; }
    catch { failure = true; report.ownPoolClosed = false; report.failureStage = "pool_close"; }
    if (!failure) { report.status = "passed"; report.stage = "complete"; }
    await save("report", report);
    console.log(JSON.stringify(report));
  }
  if (failure) throw new Error("Populated scheduled integration was not confirmed; preserve its private recovery manifest and review exact-owned fixtures without repairing preexisting rows.");
}

run().catch(() => {
  console.error("Populated scheduled development integration failed. No raw rows, credentials or provider errors are exposed; do not repair preexisting data.");
  process.exitCode = 1;
});
