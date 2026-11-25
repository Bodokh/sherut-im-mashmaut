import "server-only";

import { emailButton, emailPanel, emailParagraph, escapeEmailHtml, renderBrandedEmail } from "../../../email/brand";
import { ORGANIZATION_EMAIL_FROM } from "../../../organization-email";
import { ORGANIZATION_ID, withTransaction } from "../../server/db";
import { transferSchemaState } from "./database-schema";

export interface TransferEmailJob {
  readonly transferRequestId: string;
  readonly recipientEmail: string;
  readonly recipientName: string;
  readonly requesterName: string;
  readonly participantName: string;
}

type SendOutcome = { status: "accepted"; providerId: string } | { status: "retry" | "failed" };
export type TransferRequestEmailSender = (job: TransferEmailJob) => Promise<SendOutcome>;

type Claim = {
  transfer_request_id: string;
  recipient_email: string;
  recipient_name: string;
  requester_name: string;
  participant_name: string;
  attempt_count: number;
  status: "queued" | "failed";
};

const TRANSFERS_URL = "https://staff.imashmaut.co.il/staff/transfers";
const SUBJECT_PREFIX = "בקשת העברת שיוך חדשה | שירות עם משמעות";
const retryDelaysMinutes = [1, 5, 15, 60];
const maxAttempts = retryDelaysMinutes.length + 1;
const batchSize = 5;

export function buildTransferRequestEmailContent(job: Pick<TransferEmailJob, "recipientName" | "requesterName" | "participantName">) {
  const greeting = `שלום ${escapeEmailHtml(job.recipientName)},`;
  const summary = `הרכזת <strong>${escapeEmailHtml(job.requesterName)}</strong> ביקשה להעביר לאחריות הצוות שלה את החניכה <strong>${escapeEmailHtml(job.participantName)}</strong>, המשויכת כעת לצוות שלך.`;
  const instruction = "השיוך של החניכה לא ישתנה עד שתאשרי את הבקשה במרחב הליווי. ניתן להיכנס למערכת כדי לאשר או לדחות את הבקשה.";

  const html = renderBrandedEmail({
    language: "he",
    category: "מערך הליווי · בקשת העברת שיוך",
    title: "בקשת העברת שיוך חדשה",
    body: `${emailParagraph(greeting)}
      ${emailParagraph(summary)}
      ${emailPanel(`${emailParagraph(escapeEmailHtml(instruction))}${emailButton(TRANSFERS_URL, "צפייה בבקשה ואישור או דחייה")}`)}`,
  });

  const text = [
    `שלום ${job.recipientName},`,
    `הרכזת ${job.requesterName} ביקשה להעביר לאחריות הצוות שלה את החניכה ${job.participantName}, המשויכת כעת לצוות שלך.`,
    instruction,
    TRANSFERS_URL,
  ].join("\n\n");

  return { subject: SUBJECT_PREFIX, html, text };
}

export function transferRequestEmailSender(env = process.env): TransferRequestEmailSender | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (env.MENTORING_TRANSFER_EMAIL_ENABLED === "false" || !apiKey) return null;

  return async (job) => {
    const content = buildTransferRequestEmailContent(job);
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(8_000),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `transfer-request/${job.transferRequestId}`,
        },
        body: JSON.stringify({
          from: ORGANIZATION_EMAIL_FROM,
          to: [job.recipientEmail],
          subject: content.subject,
          text: content.text,
          html: content.html,
        }),
      });
      const payload: { id?: unknown; name?: unknown } | null = await response.json().catch(() => null);
      if (response.ok && typeof payload?.id === "string" && payload.id) {
        return { status: "accepted", providerId: payload.id };
      }
      if (
        response.ok
        || response.status >= 500
        || response.status === 429
        || response.status === 408
        || (response.status === 409 && payload?.name === "concurrent_idempotent_requests")
      ) {
        return { status: "retry" };
      }
      return { status: "failed" };
    } catch {
      return { status: "retry" };
    }
  };
}

async function claimNext(transferRequestId?: string): Promise<Claim | undefined> {
  return withTransaction(async (client) => {
    if ((await transferSchemaState(client)) !== "ready") return undefined;
    const claimed = await client.query<Claim>(`
      WITH candidate AS (
        SELECT email.transfer_request_id,
          recipient.display_name AS recipient_name,
          requester.display_name AS requester_name,
          participant.display_name AS participant_name,
          email.attempt_count >= $3 OR email.first_attempt_at <= statement_timestamp() - interval '23 hours' AS expired
        FROM mentoring.transfer_request_emails email
        JOIN mentoring.transfer_requests request
          ON request.organization_id = email.organization_id AND request.id = email.transfer_request_id
        JOIN mentoring.participants participant
          ON participant.organization_id = request.organization_id AND participant.id = request.participant_id
        JOIN mentoring.memberships recipient
          ON recipient.organization_id = email.organization_id AND recipient.id = email.recipient_staff_id
        JOIN mentoring.memberships requester
          ON requester.organization_id = request.organization_id AND requester.id = request.requester_coordinator_id
        WHERE email.organization_id = $1
          AND ($2::uuid IS NULL OR email.transfer_request_id = $2)
          AND email.status = 'queued'
          AND email.next_attempt_at <= statement_timestamp()
          AND request.status = 'pending'
          AND participant.deleted_at IS NULL
          AND recipient.active AND recipient.role = 'coordinator'
          AND recipient.email = email.recipient_email
        ORDER BY email.next_attempt_at, email.transfer_request_id
        LIMIT 1
        FOR UPDATE OF email SKIP LOCKED
        FOR SHARE OF request SKIP LOCKED
        FOR SHARE OF recipient SKIP LOCKED
      )
      UPDATE mentoring.transfer_request_emails email
      SET status = CASE WHEN candidate.expired THEN 'failed' ELSE 'queued' END,
          attempt_count = email.attempt_count + CASE WHEN candidate.expired THEN 0 ELSE 1 END,
          first_attempt_at = coalesce(email.first_attempt_at, statement_timestamp()),
          next_attempt_at = statement_timestamp() + interval '2 minutes'
      FROM candidate
      WHERE email.organization_id = $1 AND email.transfer_request_id = candidate.transfer_request_id
      RETURNING email.transfer_request_id, email.recipient_email,
        candidate.recipient_name, candidate.requester_name, candidate.participant_name,
        email.attempt_count, email.status
    `, [ORGANIZATION_ID, transferRequestId ?? null, maxAttempts]);
    return claimed.rows[0];
  });
}

async function dispatchClaim(send: TransferRequestEmailSender, claim: Claim): Promise<void> {
  let outcome: SendOutcome;
  try {
    outcome = await send({
      transferRequestId: claim.transfer_request_id,
      recipientEmail: claim.recipient_email,
      recipientName: claim.recipient_name,
      requesterName: claim.requester_name,
      participantName: claim.participant_name,
    });
  } catch {
    outcome = { status: "retry" };
  }
  const retryDelay = outcome.status === "retry" ? retryDelaysMinutes[claim.attempt_count - 1] : undefined;
  const status = retryDelay ? "queued" : outcome.status === "accepted" ? "accepted" : "failed";
  const providerId = outcome.status === "accepted" ? outcome.providerId : null;
  await withTransaction(async (client) => {
    await client.query(`
      UPDATE mentoring.transfer_request_emails
      SET status = $4,
          provider_id = $5,
          next_attempt_at = statement_timestamp() + $6 * interval '1 minute'
      WHERE organization_id = $1
        AND transfer_request_id = $2
        AND attempt_count = $3
        AND (status = 'queued' OR (status = 'cancelled' AND $4 = 'accepted'))
    `, [ORGANIZATION_ID, claim.transfer_request_id, claim.attempt_count, status, providerId, retryDelay ?? 0]);
  });
}

export async function dispatchTransferRequestEmails(send: TransferRequestEmailSender, transferRequestId?: string): Promise<void> {
  const limit = transferRequestId ? 1 : batchSize;
  for (let index = 0; index < limit; index += 1) {
    const claim = await claimNext(transferRequestId);
    if (!claim) return;
    if (claim.status === "queued") await dispatchClaim(send, claim);
  }
}
