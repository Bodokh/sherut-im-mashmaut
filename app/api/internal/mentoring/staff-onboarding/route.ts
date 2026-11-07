import { timingSafeEqual } from "node:crypto";
import { dispatchStaffOnboardingEmails } from "../../../../../lib/mentoring/server/staff-onboarding";
import { staffOnboardingSender } from "../../../../../lib/mentoring/server/staff-onboarding-email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const headers = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response(null, { status: 503, headers });
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return new Response(null, { status: 401, headers });
  }

  if (process.env.MENTORING_STAFF_ONBOARDING_EMAIL_ENABLED !== "true") return new Response(null, { status: 204, headers });
  const send = staffOnboardingSender();
  if (!send) return new Response(null, { status: 503, headers });
  try {
    await dispatchStaffOnboardingEmails(send);
    return new Response(null, { status: 204, headers });
  } catch {
    console.error("Staff onboarding email queue could not be processed.");
    return new Response(null, { status: 503, headers });
  }
}

export function HEAD() {
  return new Response(null, { status: 405, headers: { ...headers, Allow: "GET" } });
}
