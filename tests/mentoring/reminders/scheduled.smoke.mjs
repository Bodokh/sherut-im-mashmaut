// Opt-in, empty-development-organization smoke. No fixtures, role changes,
// provider credentials, hosted configuration or cleanup writes are introduced.
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { loadEnvFile } from "node:process";
import "../server/typescript-loader.mjs";

// Match the actual Next server's Node context when invoking its route directly.
createRequire(import.meta.url)("next/dist/server/node-environment-baseline");
const ROOT = new URL("../../../", import.meta.url);
const ORGANIZATION = "11111111-1111-4111-8111-111111111111";
const QA_ACTOR = "15906dea-3538-46ab-ab2f-9ec651d15474";
const QA_EMAIL = "mentoring-owner+clerk_test@example.com";
const QA_AUTH_USER = "user_3LEdW1ZzcasOTeiCSsfxGV7UZTJ";
const DATA_TABLES = [
  "resource_ids", "organization_settings_history", "monthly_reviews", "monthly_review_history",
  "reminder_jobs", "reminder_attempts", "contact_revisions", "review_events", "appointment_history",
  "manual_color_history", "participants", "assignments", "contacts", "appointments", "reviews",
  "grants", "ceo_protections", "operations", "conflicts", "audit", "outbox",
];
const SOURCE_FILES = [
  "lib/mentoring/features/reminders/scheduled.ts", "lib/mentoring/features/reminders/dispatcher.ts",
  "app/api/internal/mentoring/reminders/route.ts", "lib/mentoring/features/reminders/server.ts",
  "lib/mentoring/server/db.ts", "lib/mentoring/server/repository.ts",
];

async function sourceHashes() {
  return Object.fromEntries(await Promise.all(SOURCE_FILES.map(async (name) => [name, createHash("sha256").update(await readFile(new URL(name, ROOT))).digest("hex")])));
}

async function snapshot(withTransaction) {
  return withTransaction(async (client) => {
    const members = (await client.query("SELECT * FROM mentoring.memberships WHERE organization_id=$1 ORDER BY id", [ORGANIZATION])).rows;
    const actor = members[0];
    assert.ok(members.length === 1 && actor.id === QA_ACTOR && actor.auth_user_id === QA_AUTH_USER
      && actor.email === QA_EMAIL && actor.active === true && actor.role === "ceo" && actor.version === 6,
    "The original approved development CEO baseline is required.");
    const settingsRows = (await client.query("SELECT * FROM mentoring.organization_settings WHERE organization_id=$1", [ORGANIZATION])).rows;
    assert.ok(settingsRows.length === 1 && settingsRows[0].version === 1, "Original settings version1 is required.");
    const parts = DATA_TABLES.map((table) => `SELECT '${table}' AS name,count(*)::int AS count FROM mentoring.${table} WHERE organization_id=$1`);
    parts.push("SELECT 'other_memberships' AS name,count(*)::int AS count FROM mentoring.memberships WHERE organization_id=$1 AND id<>$2");
    const counts = Object.fromEntries((await client.query(parts.join(" UNION ALL "), [ORGANIZATION, QA_ACTOR])).rows.map((row) => [row.name, row.count]));
    assert.ok(Object.keys(counts).length === 22 && Object.values(counts).every((value) => value === 0), "All22 development data counters must be zero; do not run alongside browser fixtures.");
    return { counts, members, settings: settingsRows[0] };
  }, { repeatableRead: true });
}

async function run() {
  assert.ok(process.argv.slice(2).join(" ") === "--development-empty-only" && process.env.MENTORING_SCHEDULED_SMOKE === "approved", "Explicit empty-development smoke approval is required.");
  assert.ok(process.execArgv.includes("--conditions=react-server"), "Use the server runtime condition.");
  assert.ok(process.env.NODE_ENV !== "production" && process.env.VERCEL_ENV !== "production", "Production is forbidden.");
  loadEnvFile(new URL(".env.local", ROOT));
  assert.ok(process.env.NODE_ENV !== "production" && (!process.env.VERCEL_ENV || process.env.VERCEL_ENV === "development"), "Development only.");
  assert.ok(process.env.MENTORING_NEON_PROJECT_ID === "round-firefly-59684866" && process.env.CLERK_SECRET_KEY?.startsWith("sk_test_"), "Approved development resources only.");
  const beforeHashes = await sourceHashes();
  const { getDatabasePool, withTransaction } = await import("../../../lib/mentoring/server/db.ts");
  const { configuredReminderTransport } = await import("../../../lib/mentoring/features/reminders/transport.ts");
  assert.ok(configuredReminderTransport() === null, "A real provider must remain unconfigured for this smoke.");
  try {
    const before = await snapshot(withTransaction);
    // Process-local test authentication only. Do not read/print/persist a prior
    // value or modify .env.local, the preview server, or any provider account.
    const localBearer = randomBytes(32).toString("hex");
    process.env.CRON_SECRET = localBearer;
    process.env.MENTORING_REMINDER_ACTOR_ID = QA_ACTOR;
    const { GET, HEAD } = await import("../../../app/api/internal/mentoring/reminders/route.ts");
    const target = "http://localhost/api/internal/mentoring/reminders";
    const head = await HEAD(new Request(target, { method: "HEAD" }));
    assert.ok(head.status === 405 && await head.text() === "", "HEAD must not dispatch.");
    const unauthorized = await GET(new Request(target));
    assert.ok(unauthorized.status === 401, "Missing Bearer must be rejected.");
    const response = await GET(new Request(target, { headers: { authorization: `Bearer ${localBearer}` } }));
    const result = await response.json();
    const expected = {
      state: "delivery_blocked", scanned: 0, planned: 0, pages: 1, scanComplete: true, more: false,
      deliveryBlocked: true, considered: 0, claimed: 0,
      outcomes: { provider_accepted: 0, delivered: 0, failed: 0, uncertain: 0 }, hostedSchedulerConfigured: false,
    };
    assert.ok(response.status === 503 && response.headers.get("cache-control") === "private, no-store", "Blocked delivery must be explicit and private.");
    assert.ok(JSON.stringify(result) === JSON.stringify(expected), "Only the exact empty blocked aggregate may be returned.");
    const after = await snapshot(withTransaction);
    assert.ok(JSON.stringify(after) === JSON.stringify(before), "All original membership/settings rows and22 zero counters must remain identical.");
    const afterHashes = await sourceHashes();
    assert.ok(JSON.stringify(afterHashes) === JSON.stringify(beforeHashes), "Source changed during this smoke; evidence is not frozen.");
    console.log(JSON.stringify({
      status: "passed", actualRouteAndRuntime: true, result,
      zeroCountersBefore: 22, zeroCountersAfter: 22,
      approvedQaMembershipUnchanged: true, membershipVersion: 6, settingsVersion: 1,
      providerRegistryNull: true, claims: 0, sends: 0, sourceHashes: beforeHashes,
    }));
  } finally {
    // This separate CLI process owns its own lazy pool; the HTTP route never
    // closes the shared preview/hosted pool.
    await getDatabasePool().end();
  }
}

run().catch(() => {
  console.error("Empty development scheduled smoke failed. No fixture cleanup or data repair was attempted; preserve state for review.");
  process.exitCode = 1;
});
