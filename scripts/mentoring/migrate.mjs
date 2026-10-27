import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import pg from "pg";

const projectDirectory = fileURLToPath(new URL("../../", import.meta.url));
const migrationDirectory = path.join(projectDirectory, "db", "mentoring");
const logger = { info() {}, error() {} };
const { loadEnvConfig } = nextEnv;
const { Client } = pg;

class SetupError extends Error {}

function connectionString() {
  loadEnvConfig(projectDirectory, process.env.NODE_ENV !== "production", logger);
  const value = process.env.MENTORING_DATABASE_URL_UNPOOLED;
  if (!value) throw new SetupError("MENTORING_DATABASE_URL_UNPOOLED is required.");
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new SetupError("The unpooled database URL is invalid.");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new SetupError("The database URL must use the PostgreSQL protocol.");
  }
  if (parsed.hostname.includes("-pooler")) {
    throw new SetupError("Migrations require the direct database URL, without -pooler.");
  }
  return value;
}

async function run() {
  if (process.argv.includes("--help")) {
    console.log("Usage: node scripts/mentoring/migrate.mjs\nLoads .env.local and applies db/mentoring/*.sql using MENTORING_DATABASE_URL_UNPOOLED.");
    return;
  }
  if (process.argv.length > 2) throw new SetupError("This script accepts only --help.");
  const filenames = (await readdir(migrationDirectory))
    .filter((filename) => /^\d{3}_[a-z0-9_]+\.sql$/.test(filename))
    .sort();
  if (filenames.length === 0) throw new SetupError("No mentoring migrations were found.");
  if (new Set(filenames.map((filename) => filename.slice(0, 3))).size !== filenames.length) {
    throw new SetupError("Migration numeric versions must be unique.");
  }
  const migrations = await Promise.all(filenames.map(async (filename) => {
    const sql = await readFile(path.join(migrationDirectory, filename), "utf8");
    return { filename, sql, checksum: createHash("sha256").update(sql).digest("hex") };
  }));
  const client = new Client({
    connectionString: connectionString(),
    connectionTimeoutMillis: 15000,
    application_name: "mentoring-migrate",
  });
  let connected = false;
  let locked = false;
  let transaction = false;
  try {
    await client.connect();
    connected = true;
    await client.query("SET statement_timeout = '120s'");
    await client.query("SET lock_timeout = '30s'");
    await client.query("SELECT pg_advisory_lock(602617869, 1)");
    locked = true;
    await client.query("BEGIN");
    transaction = true;
    await client.query(`
      CREATE SCHEMA IF NOT EXISTS mentoring;
      CREATE TABLE IF NOT EXISTS mentoring.schema_migrations (
        version text PRIMARY KEY,
        checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const applied = await client.query("SELECT version, checksum FROM mentoring.schema_migrations ORDER BY version");
    const byFilename = new Map(migrations.map((migration) => [migration.filename, migration]));
    for (const row of applied.rows) {
      const migration = byFilename.get(row.version);
      if (!migration) throw new SetupError("The database contains a migration missing from this checkout.");
      if (migration.checksum !== row.checksum) {
        throw new SetupError(`Applied migration ${migration.filename} has changed; add a new migration instead.`);
      }
    }
    const appliedVersions = new Set(applied.rows.map((row) => row.version));
    const pending = migrations.filter((migration) => !appliedVersions.has(migration.filename));
    const latestApplied = applied.rows.at(-1)?.version;
    if (latestApplied && pending.some((migration) => migration.filename < latestApplied)) {
      throw new SetupError("An unapplied migration precedes the latest applied version.");
    }
    for (const migration of pending) {
      await client.query(migration.sql);
      await client.query(
        "INSERT INTO mentoring.schema_migrations (version, checksum) VALUES ($1, $2)",
        [migration.filename, migration.checksum],
      );
    }
    await client.query("COMMIT");
    transaction = false;
    console.log(pending.length === 0
      ? "Mentoring schema is up to date."
      : `Applied ${pending.length} mentoring migration(s): ${pending.map((migration) => migration.filename).join(", ")}`);
  } catch (error) {
    if (transaction) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(602617869, 1)").catch(() => {});
    if (connected) await client.end().catch(() => {});
  }
}

run().catch((error) => {
  const sqlState = typeof error?.code === "string" && /^[0-9A-Z]{5}$/.test(error.code) ? ` (SQLSTATE ${error.code})` : "";
  console.error(error instanceof SetupError ? error.message : `Mentoring migration failed${sqlState}. No credentials were logged.`);
  process.exitCode = 1;
});
