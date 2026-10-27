import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import type { StaffProfile } from "../../contracts";
import { ORGANIZATION_ID, withTransaction } from "../../server/db";
import { staffFromRow } from "../../server/repository";
import { runDispatcher } from "./dispatcher";
import { evaluateReminders, type ReminderTransaction } from "./server";

const MAX_SCAN_PAGES = 5;
const SCAN_BUDGET_MS = 20_000;
const ACTOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type DeliveryOutcome = "provider_accepted" | "delivered" | "failed" | "uncertain";
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
};

export interface ScheduledReminderResult {
  readonly state: "completed" | "delivery_blocked" | "scan_incomplete";
  readonly scanned: number;
  readonly planned: number;
  readonly pages: number;
  /** Evaluation pagination only; the bounded delivery batch may leave jobs. */
  readonly scanComplete: boolean;
  /** Whether evaluation remains; this is not a delivery-queue drain flag. */
  readonly more: boolean;
  readonly deliveryBlocked: boolean;
  readonly considered: number;
  readonly claimed: number;
  readonly outcomes: Readonly<Record<DeliveryOutcome, number>>;
  readonly hostedSchedulerConfigured: false;
}

interface ScheduledDependencies {
  readonly transaction: ReminderTransaction;
  readonly evaluate: typeof evaluateReminders;
  readonly dispatch: typeof runDispatcher;
  readonly clock: () => number;
  readonly now: () => string;
}

function count(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid scheduled aggregate.");
  return value;
}

function publicResult(result: ScheduledReminderResult): ScheduledReminderResult {
  if (!["completed", "delivery_blocked", "scan_incomplete"].includes(result.state)
    || typeof result.scanComplete !== "boolean" || typeof result.more !== "boolean"
    || typeof result.deliveryBlocked !== "boolean") throw new Error("Invalid scheduled result.");
  // Reconstruct the public contract: future internal fields and provider keys
  // must never become an authenticated HTTP data export by object spreading.
  return {
    state: result.state,
    scanned: count(result.scanned), planned: count(result.planned), pages: count(result.pages),
    scanComplete: result.scanComplete, more: result.more, deliveryBlocked: result.deliveryBlocked,
    considered: count(result.considered), claimed: count(result.claimed),
    outcomes: {
      provider_accepted: count(result.outcomes.provider_accepted ?? 0),
      delivered: count(result.outcomes.delivered ?? 0),
      failed: count(result.outcomes.failed ?? 0),
      uncertain: count(result.outcomes.uncertain ?? 0),
    },
    // An implemented caller is not evidence of a configured hosted schedule.
    hostedSchedulerConfigured: false,
  };
}

async function currentCeo(client: PoolClient, actorId: string, lock: boolean): Promise<StaffProfile> {
  const result = await client.query(`SELECT * FROM mentoring.memberships
    WHERE organization_id=$1 AND id=$2 AND active=true AND role='ceo'${lock ? " FOR SHARE" : ""}`, [ORGANIZATION_ID, actorId]);
  const row = result.rows[0];
  if (!row || row.organization_id !== ORGANIZATION_ID || row.id !== actorId || row.active !== true || row.role !== "ceo") {
    throw new Error("Scheduled actor unavailable.");
  }
  return staffFromRow(row);
}

/** No synthetic system membership, selected tenant or user-session authority. */
export async function runScheduledReminders(actorId: string, overrides: Partial<ScheduledDependencies> = {}): Promise<ScheduledReminderResult> {
  if (!ACTOR_ID.test(actorId)) throw new Error("Scheduled actor unavailable.");
  const configuredActorId = actorId.toLowerCase();
  const transaction = overrides.transaction ?? withTransaction;
  const evaluate = overrides.evaluate ?? evaluateReminders;
  const dispatch = overrides.dispatch ?? runDispatcher;
  const clock = overrides.clock ?? (() => performance.now());
  const now = overrides.now ?? (() => new Date().toISOString());
  const started = clock();
  const actor = await transaction((client) => currentCeo(client, configuredActorId, true));
  const checkedTransaction: ReminderTransaction = (run) => transaction(async (client) => {
    await currentCeo(client, configuredActorId, false);
    const result = await run(client);
    // Check again before commit. Locking after the work preserves the existing
    // participant -> membership lock order. A concurrent demotion rolls back
    // this phase instead of silently converting it into a coordinator scan.
    await currentCeo(client, configuredActorId, true);
    return result;
  });
  let scanned = 0;
  let planned = 0;
  let pages = 0;
  let cursor: string | null = null;
  const cursors = new Set<string>();
  const partial = (): ScheduledReminderResult => publicResult({
    state: "scan_incomplete", scanned, planned, pages, scanComplete: false, more: true,
    deliveryBlocked: true, considered: 0, claimed: 0,
    outcomes: { provider_accepted: 0, delivered: 0, failed: 0, uncertain: 0 }, hostedSchedulerConfigured: false,
  });
  // The existing evaluator is a transactional page of at most 200 records.
  // Elapsed time is checked between pages; it cannot interrupt a page already
  // in progress. Larger workloads need a verified durable continuation design.
  while (pages < MAX_SCAN_PAGES && clock() - started < SCAN_BUDGET_MS) {
    const page = await checkedTransaction((client) => evaluate(client, actor, now(), cursor));
    scanned = count(scanned + count(page.scanned));
    planned = count(planned + count(page.planned));
    pages += 1;
    if (page.nextCursor === null) {
      const result = await dispatch({ actor, transaction: checkedTransaction, resultTransaction: transaction, now, limit: 5, timeoutMs: 10_000 });
      // Do not report a completed privileged run after authority loss. Known
      // effects have already been preserved through their immutable claims.
      await transaction((client) => currentCeo(client, configuredActorId, true));
      return publicResult({
        state: result.blocked ? "delivery_blocked" : "completed", scanned, planned, pages,
        scanComplete: true, more: false, deliveryBlocked: result.blocked,
        considered: result.considered, claimed: result.claimed,
        outcomes: {
          provider_accepted: result.outcomes.provider_accepted ?? 0,
          delivered: result.outcomes.delivered ?? 0,
          failed: result.outcomes.failed ?? 0,
          uncertain: result.outcomes.uncertain ?? 0,
        }, hostedSchedulerConfigured: false,
      });
    }
    if (!page.nextCursor || cursors.has(page.nextCursor)) return partial();
    cursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  return partial();
}

interface ScheduledHandlerOptions {
  readonly secret: () => string | undefined;
  readonly actorId: () => string | undefined;
  readonly run?: (actorId: string) => Promise<ScheduledReminderResult>;
}

function stateResponse(state: "not_configured" | "unauthorized" | "invalid_request" | "unavailable", status: number): Response {
  return Response.json({ state, hostedSchedulerConfigured: false }, { status, headers: PRIVATE_HEADERS });
}

export function createScheduledReminderHandler(options: ScheduledHandlerOptions): (request: Request) => Promise<Response> {
  return async (request) => {
    // Next otherwise derives HEAD from GET. Neither HEAD nor another method
    // may read configuration, resolve a membership or execute a reminder phase.
    if (request.method !== "GET") return new Response(null, { status: 405, headers: { ...PRIVATE_HEADERS, Allow: "GET" } });
    try {
      const secret = options.secret();
      if (!secret || !secret.trim()) return stateResponse("not_configured", 503);
      const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
      const received = createHash("sha256").update(request.headers.get("authorization") ?? "").digest();
      if (!timingSafeEqual(expected, received)) return stateResponse("unauthorized", 401);
      // The host supplies all scope and actor configuration. Query parameters
      // cannot select a tenant, membership, cursor, recipient or dispatch size.
      if (new URL(request.url).search) return stateResponse("invalid_request", 400);
      const actorId = options.actorId();
      if (!actorId || !ACTOR_ID.test(actorId)) return stateResponse("not_configured", 503);
      const result = publicResult(await (options.run ?? runScheduledReminders)(actorId));
      return Response.json(result, { status: result.state === "completed" ? 200 : 503, headers: PRIVATE_HEADERS });
    } catch {
      // Database/provider/configuration errors can contain credentials or PII.
      return stateResponse("unavailable", 503);
    }
  };
}
