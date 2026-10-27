import pg from "pg";
import {
  assertProductionEnvironment, executePreapproval, loadMigrations,
  parseBootstrapArguments, productionConnectionConfig, readApprovalFile, safeFailure,
} from "./production-owner-preapproval.mjs";

// This separate first-only production procedure never loads .env.local, changes
// development mappings, creates Clerk users, sends invites or exposes an HTTP API.
async function run() {
  const input=parseBootstrapArguments(process.argv.slice(2));
  if (!input) {
    console.log("Usage: NODE_ENV=production node scripts/mentoring/bootstrap-production-owners.mjs --production --approval-file /absolute/private/approval.json [--apply]\nRead-only preflight is the default. Requires MENTORING_PRODUCTION_DATABASE_URL (direct, independently verified Neon target) and MENTORING_PRODUCTION_CLERK_PUBLISHABLE_KEY. Apply only creates the explicitly approved initial unbound-email CEO memberships on a fresh migrated database; existing memberships are never promoted, reactivated or rebound. Exact unchanged initial replay is a no-op.");
    return;
  }
  assertProductionEnvironment(process.env);
  const manifest=await readApprovalFile(input.approvalFile);
  const configuration=productionConnectionConfig(process.env,manifest);
  const migrations=await loadMigrations();
  const client=new pg.Client(configuration);
  try {
    await client.connect();
    console.log(JSON.stringify(await executePreapproval(client,manifest,migrations,{apply:input.apply})));
  } finally { await client.end().catch(()=>{}); }
}

run().catch(error=>{ console.error(JSON.stringify(safeFailure(error))); process.exitCode=1; });
