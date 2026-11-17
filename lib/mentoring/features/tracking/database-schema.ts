import "server-only";

import type { PoolClient } from "pg";

/** Check before querying optional tables: a missing relation aborts PostgreSQL transactions. */
export async function trackingSchemaState(client: PoolClient): Promise<"absent" | "partial" | "ready"> {
  const result = await client.query(`SELECT
    to_regclass('mentoring.tracking_cards') IS NOT NULL AS cards,
    to_regclass('mentoring.tracking_reports') IS NOT NULL AS reports`);
  const cards = result.rows[0]?.cards === true;
  const reports = result.rows[0]?.reports === true;
  return cards && reports ? "ready" : cards || reports ? "partial" : "absent";
}
