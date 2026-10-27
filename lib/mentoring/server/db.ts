import "server-only";

import { attachDatabasePool } from "@vercel/functions/db-connections";
import { Pool, type PoolClient } from "pg";
import type { ApiErrorCode, ApiFailure } from "../contracts";

export const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";

export class MentoringServerError extends Error {
  readonly code: ApiErrorCode;
  readonly field?: string;

  constructor(code: ApiErrorCode, message: string, field?: string) {
    super(message);
    this.name = "MentoringServerError";
    this.code = code;
    this.field = field;
  }
}

let pool: Pool | undefined;

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.MENTORING_DATABASE_URL);
}

/** The pool is first created on a request, never while Next builds pages. */
export function getDatabasePool(): Pool {
  if (pool) return pool;
  const connectionString = process.env.MENTORING_DATABASE_URL;
  if (!connectionString) throw new MentoringServerError("not_configured", "מסד הנתונים של מערכת הליווי טרם הוגדר.");
  pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
    application_name: "mentoring-staff",
  });
  // Never log the provider error object: it can contain connection details.
  pool.on("error", () => console.error("Mentoring database idle connection failed."));
  attachDatabasePool(pool);
  return pool;
}

export async function withTransaction<T>(
  run: (client: PoolClient) => Promise<T>,
  options: { readonly repeatableRead?: boolean } = {},
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    const client = await getDatabasePool().connect();
    try {
      await client.query(options.repeatableRead ? "BEGIN ISOLATION LEVEL REPEATABLE READ" : "BEGIN");
      await client.query("SET LOCAL statement_timeout = '15s'");
      await client.query("SET LOCAL lock_timeout = '10s'");
      const result = await run(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
      // Retry the entire transaction, including current identity/scope checks.
      // No callback performs external effects; outbox/receipts roll back together.
      if (attempt >= 2 || (code !== "40P01" && code !== "40001")) throw error;
    } finally {
      client.release();
    }
  }
}

export function serverFailure(error: unknown): ApiFailure {
  if (error instanceof MentoringServerError) {
    return { ok: false, error: { code: error.code, message: error.message, ...(error.field ? { field: error.field } : {}) } };
  }
  return { ok: false, error: { code: "unavailable", message: "לא ניתן להשלים את הפעולה כעת. יש לנסות שוב." } };
}
