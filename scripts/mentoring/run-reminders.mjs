import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

// Native TypeScript resolution for this local development CLI only. This is
// production source execution, never a substituted database or provider layer.
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

async function run() {
  if (process.argv.includes("--help")) {
    console.log("Usage: node --conditions=react-server --experimental-strip-types scripts/mentoring/run-reminders.mjs --development --staff-id UUID\nEvaluates the existing development database in bounded pages. Does not send SMS. Hosted recurring execution remains unconfigured.");
    return;
  }
  const args = process.argv.slice(2);
  if (args.length !== 3 || args[0] !== "--development" || args[1] !== "--staff-id" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(args[2])) throw new Error("Use --development --staff-id UUID; no other mode is supported.");
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") throw new Error("This CLI is restricted to development.");
  const envFile = new URL("../../.env.local", import.meta.url);
  if (existsSync(envFile)) loadEnvFile(envFile);
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") throw new Error("This CLI is restricted to development.");
  if (!process.execArgv.includes("--conditions=react-server")) throw new Error("Use --conditions=react-server.");
  const { getDatabasePool, ORGANIZATION_ID, withTransaction } = await import("../../lib/mentoring/server/db.ts");
  const { staffFromRow } = await import("../../lib/mentoring/server/repository.ts");
  const { evaluateReminders } = await import("../../lib/mentoring/features/reminders/server.ts");
  const { expireReminderLeases } = await import("../../lib/mentoring/features/reminders/dispatcher.ts");
  try {
    const actor = await withTransaction(async (client) => {
      const result = await client.query("SELECT * FROM mentoring.memberships WHERE organization_id=$1 AND id=$2 AND active=true AND role IN ('ceo','coordinator')", [ORGANIZATION_ID, args[2]]);
      if (!result.rows[0]) throw new Error("A currently active management membership is required.");
      return staffFromRow(result.rows[0]);
    });
    let cursor = null;
    let scanned = 0;
    let planned = 0;
    let pages = 0;
    do {
      const page = await withTransaction((client) => evaluateReminders(client, actor, new Date().toISOString(), cursor));
      scanned += page.scanned; planned += page.planned; cursor = page.nextCursor; pages += 1;
      // Protect a local invocation from an unbounded changing data set.
      if (pages >= 500 && cursor) throw new Error("Evaluation page bound reached; rerun the development scan.");
    } while (cursor);
    const expired = await withTransaction((client) => expireReminderLeases(client, actor.organizationId, new Date().toISOString()));
    console.log(JSON.stringify({ scanned, planned, expiredLeases: expired, delivery: "not_attempted_by_evaluation_cli", hostedScheduler: "not_configured" }));
  } finally { await getDatabasePool().end(); }
}

run().catch(() => { console.error("Reminder evaluation failed. Check development configuration, migration 006 and active management membership; no SMS was sent."); process.exitCode = 1; });
