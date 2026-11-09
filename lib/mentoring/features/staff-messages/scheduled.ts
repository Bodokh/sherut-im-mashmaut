import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { ORGANIZATION_ID } from "../../server/db";
import { privateHeaders } from "../../server/http";
import { runStaffSmsDispatcher } from "./dispatcher";

interface ScheduledStaffSmsOptions {
  readonly secret: () => string | undefined;
  readonly run?: typeof runStaffSmsDispatcher;
}

function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Invalid dispatch aggregate.");
  return value;
}

export function createScheduledStaffSmsHandler(options: ScheduledStaffSmsOptions): (request: Request) => Promise<Response> {
  const state = (value: string, status: number) => Response.json({ state: value }, { status, headers: privateHeaders });
  return async (request) => {
    if (request.method !== "GET") return new Response(null, { status: 405, headers: { ...privateHeaders, Allow: "GET" } });
    try {
      const secret = options.secret();
      if (!secret?.trim()) return state("not_configured", 503);
      const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
      const received = createHash("sha256").update(request.headers.get("authorization") ?? "").digest();
      if (!timingSafeEqual(expected, received)) return state("unauthorized", 401);
      if (new URL(request.url).search) return state("invalid_request", 400);
      const result = await (options.run ?? runStaffSmsDispatcher)({ organizationId: ORGANIZATION_ID, limit: 5, timeoutMs: 10_000 });
      if (typeof result.blocked !== "boolean") throw new Error("Invalid dispatch aggregate.");
      return Response.json({
        state: result.blocked ? "delivery_blocked" : "completed",
        considered: count(result.considered), claimed: count(result.claimed),
        outcomes: {
          provider_accepted: count(result.outcomes.provider_accepted ?? 0),
          delivered: count(result.outcomes.delivered ?? 0),
          failed: count(result.outcomes.failed ?? 0),
          uncertain: count(result.outcomes.uncertain ?? 0),
          cancelled: count(result.outcomes.cancelled ?? 0),
        },
      }, { status: result.blocked ? 503 : 200, headers: privateHeaders });
    } catch {
      return state("unavailable", 503);
    }
  };
}
