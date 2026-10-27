import type {
  CommandResult,
  CommandSuccess,
  MentoringCommand,
} from "@/lib/mentoring/contracts";

export interface DraftIntent {
  operationId: string;
  signature: string;
}
export interface PersistedDraft<T> {
  kind: "mentoring-form-draft-v1";
  value: T;
  intent: DraftIntent | null;
}

function isPersistedDraft<T>(
  value: T | PersistedDraft<T>,
): value is PersistedDraft<T> {
  return (
    value !== null &&
    typeof value === "object" &&
    "kind" in value &&
    value.kind === "mentoring-form-draft-v1" &&
    "value" in value
  );
}

export async function reconcileStoredDraft<T>(
  stored: T | PersistedDraft<T> | null,
  initial: T,
  submit: (command: MentoringCommand) => Promise<CommandResult>,
): Promise<{
  value: T;
  intent: DraftIntent | null;
  recovered: CommandSuccess | null;
  rejected: boolean;
}> {
  const envelope = stored !== null && isPersistedDraft(stored) ? stored : null;
  const value = envelope ? envelope.value : (stored as T | null);
  const intent = envelope?.intent ?? null;
  if (!intent)
    return {
      value: value ?? initial,
      intent: null,
      recovered: null,
      rejected: false,
    };
  const payload: unknown = JSON.parse(intent.signature);
  if (!payload || typeof payload !== "object" || !("type" in payload))
    throw new Error("Invalid saved command.");
  const result = await submit({
    ...payload,
    operationId: intent.operationId,
  } as MentoringCommand);
  if (result.ok)
    return {
      value: value ?? initial,
      intent,
      recovered: result,
      rejected: false,
    };
  if (
    [
      "unavailable",
      "not_authenticated",
      "not_staff",
      "not_configured",
    ].includes(result.error.code)
  )
    throw new Error("The previous save could not be reconciled.");
  return {
    value: value ?? initial,
    intent: null,
    recovered: null,
    rejected: true,
  };
}
