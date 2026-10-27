const fallback = "לא ניתן להשלים את הפעולה כרגע. יש לבדוק את החיבור ולנסות שוב. לפני סגירת הטופס יש לוודא שמוצג אישור לשמירת הטיוטה במכשיר.";
const knownCodes = new Set(["not_authenticated", "not_staff", "not_configured", "forbidden", "not_found", "validation", "conflict", "ceo_protected", "unavailable", "account_changed", "expired", "storage_unavailable", "superseded", "invalid_command", "operation_reused"]);

/** Unknown browser/provider exceptions should never become the user's instructions. */
export function readableWorkspaceError(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string" && knownCodes.has(error.code) && "message" in error && typeof error.message === "string" && /[\u0590-\u05ff]/.test(error.message)) return error.message;
  return fallback;
}
