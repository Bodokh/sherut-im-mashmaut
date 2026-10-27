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

/** Restore added fields from defaults, while keeping malformed drafts untouched in storage. */
export function restoreDraftValue<T>(value: unknown, initial: T): T {
  return restoreValue(value, initial, false);
}

function restoreValue<T>(value: unknown, initial: T, nested: boolean): T {
  if (initial === null) {
    if ((nested && value !== null && typeof value === "object") || (typeof value === "number" && !Number.isFinite(value))) throw new Error("Invalid saved draft shape.");
    return value as T;
  }
  if (Array.isArray(initial)) {
    if (!Array.isArray(value)) throw new Error("Invalid saved draft shape.");
    return value as T;
  }
  if (typeof initial === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid saved draft shape.");
    const restored: Record<string, unknown> = { ...value };
    for (const [key, fallback] of Object.entries(initial)) {
      if (!Object.hasOwn(value, key)) { restored[key] = fallback; continue; }
      const saved = (value as Record<string, unknown>)[key];
      // Some version fields are nullable even when the current record now has a version.
      // baseVersion is nullable only for monthly reviews and participant profiles;
      // other forms require it, so do not accept null based on the name alone.
      const nullableVersion = ["appointmentVersion", "contactRevision", "baseTargetVersion"].includes(key)
        || (key === "baseVersion" && (("summary" in initial && "reviewed" in initial) || ("displayName" in initial && "serviceType" in initial && "profileNotes" in initial)));
      if (nullableVersion) {
        if (saved !== null && (typeof saved !== "number" || !Number.isFinite(saved))) throw new Error("Invalid saved draft shape.");
        restored[key] = saved;
      } else restored[key] = restoreValue(saved, fallback, true);
    }
    return restored as T;
  }
  if (typeof value !== typeof initial || (typeof value === "number" && !Number.isFinite(value))) throw new Error("Invalid saved draft shape.");
  return value as T;
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
  const candidate = envelope ? envelope.value : (stored as T | null);
  const value = candidate === null && !envelope ? initial : restoreDraftValue(candidate, initial);
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
