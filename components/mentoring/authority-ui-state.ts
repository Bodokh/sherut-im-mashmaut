import type {
  AuthorityCommand,
  GrantAction,
  ParticipantLifecycle,
} from "@/lib/mentoring/features/authority/contracts";

export const participantProtectionFields = {
  displayName: "שם החניכה",
  phone: "טלפון",
  serviceType: "סוג השירות",
  servicePlace: "מקום השירות",
  serviceRole: "תפקיד בשירות",
  profileNotes: "מידע נוסף לליווי",
  manualColor: "צבע דיווח",
  assignment: "שיוך לחונך/ת",
  lifecycle: "מצב הליווי",
  appointment: "הפגישה הבאה",
} as const;
export const contactProtectionFields = {
  method: "אופן הקשר",
  outcome: "תוצאת הקשר",
  occurredAt: "מועד הקשר",
  notes: "סיכום הקשר",
  invalidatedAt: "ביטול התיעוד",
} as const;
export const lifecycleNames: Record<ParticipantLifecycle, string> = {
  active: "ליווי פעיל",
  paused: "ליווי בהשהיה",
  closed: "ליווי סגור",
};
export const grantActionNames: Record<GrantAction, string> = {
  view: "צפייה",
  edit: "עריכה",
  approve: "אישור תיעוד",
};
export type AuthorityMode =
  "lifecycle" | "grant" | "protection" | "delete" | "restore";
export interface AuthorityDraft {
  baseVersion: number;
  baseTargetVersion: number | null;
  reason: string;
  lifecycle: ParticipantLifecycle;
  staffId: string;
  grantAction: "set" | "revoke";
  actions: GrantAction[];
  expiresAtLocal: string;
  resourceId: string;
  protectionMode: "whole" | "fields" | "unlock";
  fieldPaths: string[];
}
type WithoutOperation<T> = T extends { operationId: string }
  ? Omit<T, "operationId">
  : never;
export type AuthorityPayload = WithoutOperation<AuthorityCommand>;

export function authorityPendingState(participant: {
  readonly localPending?: boolean;
  readonly deletedAt?: string | null;
}) {
  const pending = participant.localPending === true;
  const deleted = participant.deletedAt != null;
  return {
    pending,
    deletionPending: deleted && pending,
    canRestore: deleted && !pending,
    canDelete: !deleted && !pending,
  };
}

export function authorityScopeComparison(
  mode: AuthorityMode,
  values: AuthorityDraft,
  current: {
    staffName: string;
    grantActive: boolean;
    grantActions: readonly string[];
    grantExpiry: string;
    draftExpiry: string;
    resourceName: string;
    protectionActive: boolean;
    protectionFields: readonly string[] | null;
    fieldLabels: Readonly<Record<string, string>>;
  },
): { label: string; current: string; draft: string }[] {
  const actions = (selected: readonly string[]) =>
    selected
      .map((action) => grantActionNames[action as GrantAction] ?? action)
      .join(" · ") || "ללא הרשאות";
  const scope = (active: boolean, fields: readonly string[] | null) =>
    !active
      ? "ללא הגנה פעילה"
      : fields?.length
        ? fields.map((field) => current.fieldLabels[field] ?? field).join(" · ")
        : "כל הרשומה מוגנת";
  if (mode === "grant")
    return [
      {
        label: "חבר/ת צוות",
        current: current.staffName,
        draft: current.staffName,
      },
      {
        label: "מצב ההרשאה",
        current: current.grantActive ? "פעילה" : "אינה פעילה",
        draft: values.grantAction === "revoke" ? "ביטול ההרשאה" : "הרשאה פעילה",
      },
      {
        label: "הרשאות",
        current: actions(current.grantActions),
        draft:
          values.grantAction === "revoke"
            ? "ללא הרשאות"
            : actions(normalizeGrantActions(values.actions)),
      },
      {
        label: "תוקף ההרשאה",
        current: current.grantExpiry,
        draft:
          values.grantAction === "revoke"
            ? "ללא הרשאה פעילה"
            : current.draftExpiry,
      },
    ];
  if (mode === "protection")
    return [
      {
        label: "הרשומה המוגנת",
        current: current.resourceName,
        draft: current.resourceName,
      },
      {
        label: "תחום ההגנה",
        current: scope(current.protectionActive, current.protectionFields),
        draft: scope(
          values.protectionMode !== "unlock",
          values.protectionMode === "fields" ? values.fieldPaths : null,
        ),
      },
    ];
  return [];
}

export function normalizeGrantActions(
  actions: readonly string[],
): GrantAction[] {
  const selected = new Set(
    actions.filter(
      (action): action is GrantAction =>
        action === "view" || action === "edit" || action === "approve",
    ),
  );
  if (selected.has("edit") || selected.has("approve")) selected.add("view");
  return (["view", "edit", "approve"] as const).filter((action) =>
    selected.has(action),
  );
}

/** Builds one explicit Save intent; incomplete local drafts never become commands. */
export function buildAuthorityIntent(
  mode: AuthorityMode,
  participantId: string,
  values: AuthorityDraft,
  expirationIso: string | null,
): AuthorityPayload {
  const reason = values.reason.trim();
  if (!reason || reason.length > 2000)
    throw new Error("יש להזין סיבה לפעולה, עד 2,000 תווים.");
  if (!Number.isInteger(values.baseVersion) || values.baseVersion < 1)
    throw new Error("גרסת הכרטיס אינה זמינה. יש לרענן את המידע.");
  const common = { participantId, expectedVersion: values.baseVersion, reason };
  if (mode === "delete") return { ...common, type: "delete_participant" };
  if (mode === "restore") return { ...common, type: "restore_participant" };
  if (mode === "lifecycle")
    return {
      ...common,
      type: "set_participant_lifecycle",
      lifecycle: values.lifecycle,
    };
  if (mode === "grant") {
    if (!values.staffId) throw new Error("יש לבחור חבר/ת צוות.");
    const actions =
      values.grantAction === "revoke"
        ? []
        : normalizeGrantActions(values.actions);
    if (values.grantAction === "set" && !actions.length)
      throw new Error("יש לבחור הרשאה אחת לפחות.");
    return {
      ...common,
      type: "set_access_grant",
      staffId: values.staffId,
      expectedGrantVersion: values.baseTargetVersion,
      actions,
      expiresAt: values.grantAction === "revoke" ? null : expirationIso,
    };
  }
  if (!values.resourceId) throw new Error("יש לבחור רשומה להגנה.");
  const allowed =
    values.resourceId === participantId
      ? participantProtectionFields
      : contactProtectionFields;
  const paths = [...new Set(values.fieldPaths)];
  if (
    values.protectionMode === "fields" &&
    (!paths.length || paths.some((path) => !Object.hasOwn(allowed, path)))
  )
    throw new Error("יש לבחור שדות מותרים לרשומה שנבחרה.");
  return {
    ...common,
    type: "set_ceo_protection",
    resourceId: values.resourceId,
    expectedProtectionVersion: values.baseTargetVersion,
    active: values.protectionMode !== "unlock",
    fieldPaths: values.protectionMode === "fields" ? paths : null,
  };
}
