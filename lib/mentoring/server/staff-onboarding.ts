import "server-only";

import { ORGANIZATION_ID, withTransaction } from "./db";

type OnboardingRecipient = {
  staffId: string;
  recipientEmail: string;
  deliveryId: string;
  kind: "invitation" | "access";
};
type SendOutcome = { status: "accepted"; providerId: string } | { status: "retry" | "failed" };
export type StaffOnboardingSender = (job: OnboardingRecipient) => Promise<SendOutcome>;

type Claim = {
  staff_id: string;
  recipient_email: string;
  delivery_id: string;
  kind: OnboardingRecipient["kind"];
  attempt_count: number;
  status: "queued" | "failed";
};

const retryDelaysMinutes = [1, 5, 15, 60];
const maxAttempts = retryDelaysMinutes.length + 1;
const scheduledBatchSize = 5;

async function claimNext(staffId?: string): Promise<Claim | undefined> {
  return withTransaction(async (client) => {
    const claimed = await client.query<Claim>(`
      WITH candidate AS (
        SELECT email.staff_id,
          email.attempt_count >= $3 OR email.first_attempt_at <= statement_timestamp() - interval '23 hours' AS expired
        FROM mentoring.staff_onboarding_emails email
        JOIN mentoring.memberships member
          ON member.organization_id = email.organization_id AND member.id = email.staff_id
        WHERE email.organization_id = $1 AND ($2::uuid IS NULL OR email.staff_id = $2)
          AND email.status = 'queued' AND email.next_attempt_at <= statement_timestamp()
          AND member.active AND member.email = email.recipient_email
          AND ((email.kind = 'invitation' AND member.auth_user_id IS NULL)
            OR (email.kind = 'access' AND member.auth_user_id IS NOT NULL))
        ORDER BY email.next_attempt_at, email.staff_id
        LIMIT 1
        FOR UPDATE OF email SKIP LOCKED
        FOR SHARE OF member SKIP LOCKED
      )
      UPDATE mentoring.staff_onboarding_emails email
      SET status = CASE WHEN candidate.expired THEN 'failed' ELSE 'queued' END,
          attempt_count = email.attempt_count + CASE WHEN candidate.expired THEN 0 ELSE 1 END,
          first_attempt_at = coalesce(email.first_attempt_at, statement_timestamp()),
          next_attempt_at = statement_timestamp() + interval '2 minutes'
      FROM candidate
      WHERE email.organization_id = $1 AND email.staff_id = candidate.staff_id
      RETURNING email.staff_id, email.recipient_email, coalesce(email.delivery_id, email.staff_id) AS delivery_id,
        email.kind, email.attempt_count, email.status
    `, [ORGANIZATION_ID, staffId ?? null, maxAttempts]);
    return claimed.rows[0];
  });
}

async function dispatchClaim(send: StaffOnboardingSender, claim: Claim): Promise<void> {
  let outcome: SendOutcome;
  try {
    outcome = await send({ staffId: claim.staff_id, recipientEmail: claim.recipient_email, deliveryId: claim.delivery_id, kind: claim.kind });
  } catch {
    // An interrupted provider handoff can safely retry with the original key.
    outcome = { status: "retry" };
  }
  const retryDelay = outcome.status === "retry" ? retryDelaysMinutes[claim.attempt_count - 1] : undefined;
  const status = retryDelay ? "queued" : outcome.status === "accepted" ? "accepted" : "failed";
  const providerId = outcome.status === "accepted" ? outcome.providerId : null;
  await withTransaction(async (client) => {
    // A later attempt owns its outcome. Preserve confirmed provider acceptance
    // even if the membership changed while this handoff was already in flight.
    await client.query(`
      UPDATE mentoring.staff_onboarding_emails
      SET status = $4, provider_id = $5,
          next_attempt_at = statement_timestamp() + $6 * interval '1 minute'
      WHERE organization_id = $1 AND staff_id = $2 AND attempt_count = $3
        AND coalesce(delivery_id, staff_id) = $7
        AND (status = 'queued' OR (status = 'cancelled' AND $4 = 'accepted'))
    `, [ORGANIZATION_ID, claim.staff_id, claim.attempt_count, status, providerId, retryDelay ?? 0, claim.delivery_id]);
  });
}

/** Claim after membership commit. A lease recovers interrupted workers within the provider's idempotency window. */
export async function dispatchStaffOnboardingEmails(send: StaffOnboardingSender, staffId?: string): Promise<void> {
  const limit = staffId ? 1 : scheduledBatchSize;
  for (let index = 0; index < limit; index += 1) {
    const claim = await claimNext(staffId);
    if (!claim) return;
    if (claim.status === "queued") await dispatchClaim(send, claim);
  }
}
