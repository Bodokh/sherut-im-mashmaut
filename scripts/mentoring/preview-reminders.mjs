import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

// Native TypeScript resolution for this local development CLI only.
registerHooks({ resolve(specifier, context, nextResolve) {
  try { return nextResolve(specifier, context); }
  catch (error) {
    if (!specifier.startsWith(".") || !context.parentURL?.startsWith("file:") || !["ERR_MODULE_NOT_FOUND", "ERR_UNSUPPORTED_DIR_IMPORT"].includes(error.code)) throw error;
    const unresolved = new URL(specifier, context.parentURL);
    for (const suffix of [".ts", "/index.ts"]) {
      const candidate = new URL(`${unresolved.href}${suffix}`);
      if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate.href, context);
    }
    throw error;
  }
} });

const USAGE = `Usage: node --conditions=react-server --experimental-strip-types scripts/mentoring/preview-reminders.mjs --development [--at ISO_TIME] [--due-only] [--json] [--include-personal-data]

Dry run of the SMS reminders (3 days before, on the scheduled day, overdue) that
mentors and coordinators would receive. Reads the development database in a
READ ONLY transaction, never loads an SMS transport and never sends anything.
Recipients are the participant's assigned mentor and coordinator only; the CEO is
never a recipient. Mentee names and phones are redacted unless
--include-personal-data is given. --at simulates a different current time.`;

async function run() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) { console.log(USAGE); return; }
  const known = new Set(["--development", "--due-only", "--json", "--include-personal-data"]);
  const unknown = args.filter((arg, index) => !known.has(arg) && arg !== "--at" && args[index - 1] !== "--at");
  if (!args.includes("--development") || unknown.length) throw new Error(`Unsupported arguments.\n${USAGE}`);
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") throw new Error("This CLI is restricted to development.");
  const envFile = new URL("../../.env.local", import.meta.url);
  if (existsSync(envFile)) loadEnvFile(envFile);
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") throw new Error("This CLI is restricted to development.");
  if (!process.execArgv.includes("--conditions=react-server")) throw new Error("Use --conditions=react-server.");
  const atIndex = args.indexOf("--at");
  const now = atIndex === -1 ? new Date().toISOString() : new Date(args[atIndex + 1] ?? "").toISOString();

  const { getDatabasePool, ORGANIZATION_ID } = await import("../../lib/mentoring/server/db.ts");
  const { loadParticipant, staffFromRow } = await import("../../lib/mentoring/server/repository.ts");
  const { getOrganizationSettings } = await import("../../lib/mentoring/features/oversight/server.ts");
  const { previewReminders } = await import("../../lib/mentoring/features/reminders/preview.ts");
  const pool = getDatabasePool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const settings = await getOrganizationSettings(client, ORGANIZATION_ID, now);
    const staff = (await client.query("SELECT * FROM mentoring.memberships WHERE organization_id=$1 ORDER BY id", [ORGANIZATION_ID])).rows.map(staffFromRow);
    const ids = (await client.query(`SELECT p.id FROM mentoring.participants p
      WHERE p.organization_id=$1 AND p.deleted_at IS NULL AND p.lifecycle='active'
        AND EXISTS (SELECT 1 FROM mentoring.assignments a WHERE a.organization_id=p.organization_id AND a.participant_id=p.id AND a.ended_at IS NULL)
      ORDER BY p.id`, [ORGANIZATION_ID])).rows.map((row) => String(row.id));
    const views = [];
    for (const id of ids) { const view = await loadParticipant(client, ORGANIZATION_ID, id); if (view) views.push(view); }
    await client.query("ROLLBACK");
    let entries = previewReminders(views, staff, settings, now, { redactPersonalData: !args.includes("--include-personal-data") });
    if (args.includes("--due-only")) entries = entries.filter((entry) => entry.due);
    if (args.includes("--json")) { console.log(JSON.stringify({ now, delivery: "never_attempted_by_preview", count: entries.length, entries }, null, 2)); return; }
    console.log(`Reminder preview at ${now} (no SMS is sent): ${entries.length} message(s) for ${views.length} active participant(s).`);
    for (const entry of entries) {
      console.log(`- ${entry.due ? "DUE" : "upcoming"} ${entry.scheduledAt} [${entry.label}] -> ${entry.recipientRole} ${entry.recipientName} (${entry.destination ?? `skipped: ${entry.skippedReason}`})\n    ${entry.message}`);
    }
  } finally {
    try { await client.query("ROLLBACK"); } catch { /* connection already closed */ }
    client.release();
    await pool.end();
  }
}

run().catch((error) => { console.error(`Reminder preview failed: ${error instanceof Error ? error.message : "unknown error"}. No SMS was sent.`); process.exitCode = 1; });
