import "server-only";
import { normalizeStaffMobile } from "./policy";
import type { ReminderTransport, TransportResult } from "./transport";

const SEND_ENDPOINT = "https://www.micropay.co.il/extApi/scheduleSms.php";
const MAX_RESPONSE_BYTES = 8_192;

export interface MicropayConfiguration {
  readonly token?: string;
  readonly sender?: string;
  readonly sendingEnabled: boolean;
}

function validToken(token: string): boolean {
  return /^[\x21-\x7e]{1,512}$/.test(token);
}

function validSender(sender: string): boolean {
  // Numeric identities must additionally be verified in the Micropay account.
  if (/^\d+$/.test(sender)) return /^\d{8,15}$/.test(sender);
  return sender === sender.trim() && /^[A-Za-z0-9 +*]{2,11}$/.test(sender);
}

function object(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function taskReference(value: unknown): string | null {
  const reference = typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? String(value) : value;
  return typeof reference === "string" && /^[1-9]\d{0,19}$/.test(reference) ? reference : null;
}

/** A provider response is untrusted and must not allocate an unbounded body. */
async function responseBody(response: Response): Promise<unknown> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength != null && Number(declaredLength) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    return null;
  }
  const reader = response.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    // Decoding can fail before the stream ends. Do not leave unread bytes or
    // their connection alive after returning an unknown outcome.
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/**
 * One immediate SMS per call. Micropay provides no documented idempotency field;
 * an uncertain result must never cause an automatic retry of this request.
 */
export function createMicropayTransport(configuration: MicropayConfiguration, request: typeof fetch = fetch): ReminderTransport {
  const token = configuration.token ?? "";
  const sender = configuration.sender ?? "";
  const credentialsConfigured = validToken(token) && validSender(sender);
  const sendingEnabled = configuration.sendingEnabled === true;
  return {
    provider: "micropay",
    credentialsConfigured,
    sendingEnabled,
    async send(input): Promise<TransportResult> {
      if (input.signal.aborted) return { state: "uncertain" };
      const recipient = normalizeStaffMobile(input.recipient);
      if (!credentialsConfigured || !sendingEnabled || !recipient || input.message.trim().length === 0 || input.message.length > 1_000) {
        return { state: "failed" };
      }
      try {
        const response = await request(SEND_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json; charset=utf-8", accept: "application/json" },
          body: JSON.stringify({ token, from: sender, msg: input.message, list: recipient.slice(1) }),
          signal: input.signal,
          redirect: "error",
          credentials: "omit",
          cache: "no-store",
        });
        if (!response.ok || response.redirected || (response.url && response.url !== SEND_ENDPOINT)) {
          await response.body?.cancel();
          return { state: "uncertain" };
        }
        const body = await responseBody(response);
        if (input.signal.aborted || !object(body)) return { state: "uncertain" };
        const data = object(body.data) ? body.data : null;
        const reference = taskReference(data?.taskId);
        if (body.status === 1 && body.message === "OK" && reference) {
          return { state: "provider_accepted", providerReference: reference };
        }
        // A contradictory task reference prevents classifying a response as a
        // definitive rejection. Ignore narratives and all unrelated fields.
        if (body.status === 0 && body.message === "ERROR" && data?.taskId == null) return { state: "failed" };
        return { state: "uncertain" };
      } catch {
        // Timeout, transport failure and unreadable responses can all follow a
        // successful handoff. Neither their text nor the credential may escape.
        return { state: "uncertain" };
      }
    },
  };
}
