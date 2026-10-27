import type { ReminderReason } from "./contracts";
import { createMicropayTransport } from "./micropay";

/** Only real, explicitly configured adapters belong in a production registry. */
export interface ReminderTransport {
  readonly provider: string;
  readonly credentialsConfigured: boolean;
  readonly sendingEnabled: boolean;
  send(input: { readonly recipient: string; readonly message: string; readonly idempotencyKey: string; readonly signal: AbortSignal }): Promise<TransportResult>;
  /** Read-only provider lookup. It must never send or retry the original SMS. */
  reconcile?(input: { readonly idempotencyKey: string; readonly providerReference: string | null; readonly signal: AbortSignal }): Promise<TransportResult>;
}

export type TransportResult =
  | { readonly state: "provider_accepted" | "delivered"; readonly providerReference: string }
  | { readonly state: "failed"; readonly providerReference?: string }
  | { readonly state: "uncertain"; readonly providerReference?: string };

// Only the explicitly selected real provider can enter the production registry.
export function configuredReminderTransport(environment: Readonly<Record<string, string | undefined>> = process.env): ReminderTransport | null {
  if (environment.MENTORING_SMS_PROVIDER !== "micropay") return null;
  return createMicropayTransport({
    token: environment.MENTORING_MICROPAY_TOKEN,
    sender: environment.MENTORING_MICROPAY_SENDER,
    sendingEnabled: environment.MENTORING_SMS_SENDING_ENABLED === "true",
  });
}

export function transportBlockedReason(transport: ReminderTransport | null): ReminderReason {
  if (!transport) return "missing_sms_provider";
  if (!transport.credentialsConfigured) return "missing_sms_credentials";
  if (!transport.sendingEnabled) return "sending_disabled";
  return null;
}

/** Do not store arbitrary provider errors or untrusted response narratives. */
export function safeProviderReference(value: unknown): string | null {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_.:/-]{1,200}$/.test(value)) return null;
  if (/^(?:sk_|rk_|pk_|Bearer|Basic|api[_-]?key|token)/i.test(value) || value.includes("://")) return null;
  return value;
}

export function validProviderName(value: string): boolean { return /^[a-zA-Z0-9_-]{1,60}$/.test(value); }
