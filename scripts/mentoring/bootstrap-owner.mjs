import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import pg from "pg";

const organizationId = "11111111-1111-4111-8111-111111111111";
const projectDirectory = fileURLToPath(new URL("../../", import.meta.url));
const { loadEnvConfig } = nextEnv;
const { Client } = pg;

class SetupError extends Error {}

function readArguments() {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        help: { type: "boolean" },
        development: { type: "boolean" },
        role: { type: "string" },
        email: { type: "string" },
        name: { type: "string" },
        phone: { type: "string" },
        "auth-user-id": { type: "string" },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch {
    throw new SetupError("Invalid arguments. Run with --help for usage.");
  }
  if (values.help) return null;
  if (!values.development || values.role !== "ceo") {
    throw new SetupError("Explicit --development and --role ceo are required.");
  }
  const email = values.email?.trim().toLowerCase();
  const name = values.name?.trim();
  const phone = values.phone?.trim() || null;
  const authUserId = values["auth-user-id"]?.trim() || null;
  if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new SetupError("A valid --email is required.");
  }
  if (!name || name.length > 200) throw new SetupError("--name must contain 1 to 200 characters.");
  if (phone && phone.length > 40) throw new SetupError("--phone must contain at most 40 characters.");
  if (authUserId && !/^user_[a-zA-Z0-9]{1,195}$/.test(authUserId)) {
    throw new SetupError("--auth-user-id must be a Clerk user ID.");
  }
  return { email, name, phone, authUserId };
}

function connectionString() {
  loadEnvConfig(projectDirectory, true, { info() {}, error() {} });
  if (process.env.NODE_ENV === "production" || (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "development")) {
    throw new SetupError("The owner bootstrap is restricted to local development.");
  }
  const value = process.env.MENTORING_DATABASE_URL_UNPOOLED;
  if (!value) throw new SetupError("MENTORING_DATABASE_URL_UNPOOLED is required.");
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new SetupError("The unpooled database URL is invalid.");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || parsed.hostname.includes("-pooler")) {
    throw new SetupError("The bootstrap requires a direct PostgreSQL URL, without -pooler.");
  }
  return value;
}

async function run() {
  const input = readArguments();
  if (!input) {
    console.log("Usage: node scripts/mentoring/bootstrap-owner.mjs --development --role ceo --email owner@example.org --name 'Owner name' [--auth-user-id user_...] [--phone +972...]\nCreates one explicitly preapproved CEO membership in the development database. A verified matching email binds the account at sign-in if no Clerk user ID is supplied. Existing memberships are never modified or reactivated.");
    return;
  }
  const client = new Client({
    connectionString: connectionString(),
    connectionTimeoutMillis: 15000,
    application_name: "mentoring-bootstrap-owner",
  });
  let connected = false;
  let transaction = false;
  try {
    await client.connect();
    connected = true;
    await client.query("BEGIN");
    transaction = true;
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SET LOCAL lock_timeout = '15s'");
    await client.query("SELECT pg_advisory_xact_lock(602617869, 2)");
    const organization = await client.query("SELECT id FROM mentoring.organizations WHERE id = $1 FOR UPDATE", [organizationId]);
    if (organization.rowCount !== 1) throw new SetupError("Apply the mentoring migrations before bootstrapping the owner.");
    const existing = await client.query(`
      SELECT id, organization_id, email, auth_user_id, role, active
      FROM mentoring.memberships
      WHERE (organization_id = $1 AND lower(email) = $2)
         OR ($3::text IS NOT NULL AND auth_user_id = $3)
      FOR UPDATE
    `, [organizationId, input.email, input.authUserId]);
    if (existing.rowCount) {
      const row = existing.rows[0];
      if (existing.rowCount !== 1 || row.organization_id !== organizationId || row.email !== input.email ||
          !row.active || row.role !== "ceo" || (input.authUserId && row.auth_user_id !== input.authUserId)) {
        throw new SetupError("An existing membership differs from this request. No membership was changed.");
      }
      await client.query("COMMIT");
      transaction = false;
      console.log("The approved CEO membership already exists. No membership was changed.");
      return;
    }
    await client.query(`
      INSERT INTO mentoring.memberships
        (id, organization_id, auth_user_id, email, display_name, phone, role, active)
      VALUES ($1, $2, $3, $4, $5, $6, 'ceo', true)
    `, [randomUUID(), organizationId, input.authUserId, input.email, input.name, input.phone]);
    await client.query("COMMIT");
    transaction = false;
    console.log("Created the explicitly approved development CEO membership. No participant records were added.");
  } catch (error) {
    if (transaction) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    if (connected) await client.end().catch(() => {});
  }
}

run().catch((error) => {
  const sqlState = typeof error?.code === "string" && /^[0-9A-Z]{5}$/.test(error.code) ? ` (SQLSTATE ${error.code})` : "";
  console.error(error instanceof SetupError ? error.message : `Owner bootstrap failed${sqlState}. No credentials were logged.`);
  process.exitCode = 1;
});
