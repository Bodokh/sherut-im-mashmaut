import { parseCommand } from "../../lib/mentoring/validation";
import {
  contactProtectionFields,
  participantProtectionFields,
  type AuthorityDraft,
  type AuthorityMode,
} from "./authority-ui-state";
import { fromDateTimeInput } from "./format";

export type FormIssues = Record<string, string>;

export function operationalFieldName(field: string): string {
  const name = field.replace(/^settings\./, "").split(".")[0];
  return name === "scheduledAt" ? "nextAppointmentAt" : name === "expiresAt" ? "expiresAtLocal" : name;
}

/** Check the wire contract before persisting an immutable retry identity. */
export function operationalCommandIssue(payload: object): { field: string; message: string } | null {
  const result = parseCommand({ ...payload, operationId: crypto.randomUUID() });
  if (result.ok) return null;
  return {
    field: result.error.field ? operationalFieldName(result.error.field) : "form",
    message: result.error.message,
  };
}

export function contactInputIssues(values: {
  method: string;
  outcome: string;
  notes: string;
  manualColor?: string;
  color?: string;
}, maxNotes = 20_000): FormIssues {
  const issues: FormIssues = {};
  if (!["phone", "in_person"].includes(values.method)) issues.method = "יש לבחור שיחה טלפונית או פגישה פנים אל פנים.";
  if (!["completed", "no_answer"].includes(values.outcome)) issues.outcome = "יש לבחור אם הקשר הושלם או שלא היה מענה.";
  if (values.notes.trim().length > maxNotes) issues.notes = `הסיכום יכול להכיל עד ${maxNotes.toLocaleString("he-IL")} תווים.`;
  if (values.manualColor !== undefined && !["unchanged", "green", "orange", "red"].includes(values.manualColor)) issues.manualColor = "יש לבחור צבע דיווח מהרשימה או להשאיר את הדיווח הקיים.";
  if (values.color !== undefined && !["green", "orange", "red"].includes(values.color)) issues.color = "יש לבחור ירוק, כתום או אדום.";
  return issues;
}

export function authorityInputIssues(
  mode: AuthorityMode,
  values: AuthorityDraft,
  context: {
    participantId: string;
    resourceIds: readonly string[];
    staff?: { active: boolean; role: string };
    grantActive?: boolean;
    protectionActive?: boolean;
    now: Date;
  },
): FormIssues {
  const issues: FormIssues = {};
  if (!values.reason.trim()) issues.reason = "יש לכתוב סיבה לפעולה.";
  else if (values.reason.trim().length > 2000) issues.reason = "הסיבה יכולה להכיל עד 2,000 תווים.";
  if (mode === "lifecycle" && !["active", "paused", "closed"].includes(values.lifecycle)) issues.lifecycle = "יש לבחור מצב ליווי מהרשימה.";
  if (mode === "grant") {
    if (!["set", "revoke"].includes(values.grantAction)) issues.grantAction = "יש לבחור הגדרת הרשאה או ביטול הרשאה.";
    if (!context.staff || (values.grantAction === "set" && !context.staff.active)) issues.staffId = "יש לבחור חבר/ת צוות עם גישה פעילה מהארגון.";
    if (values.grantAction === "revoke" && !context.grantActive) issues.grantAction = "אין הרשאה פעילה לביטול. יש לבחור הגדרת הרשאה.";
    if (values.grantAction === "set") {
      if (!values.actions.length || values.actions.some((action) => !["view", "edit", "approve"].includes(action))) issues.actions = "יש לבחור הרשאה תקינה אחת לפחות.";
      else if (new Set(values.actions).size !== values.actions.length) issues.actions = "יש לבחור כל הרשאה פעם אחת בלבד.";
      else if (context.staff?.role === "mentor" && values.actions.includes("approve")) issues.actions = "הרשאת אישור זמינה לרכז/ת בלבד.";
      if (values.expiresAtLocal) {
        const expiration = fromDateTimeInput(values.expiresAtLocal);
        if (!expiration || Date.parse(expiration) <= context.now.getTime()) issues.expiresAtLocal = "יש להזין מועד תפוגה תקין בעתיד, לפי שעון ישראל.";
      }
    }
  }
  if (mode === "protection") {
    if (!context.resourceIds.includes(values.resourceId)) issues.resourceId = "יש לבחור רשומה קיימת מהרשימה.";
    if (!["whole", "fields", "unlock"].includes(values.protectionMode)) issues.protectionMode = "יש לבחור את תחום ההגנה מהרשימה.";
    if (values.protectionMode === "unlock" && !context.protectionActive) issues.protectionMode = "אין הגנה פעילה להסרה. יש לבחור תחום הגנה אחר.";
    if (values.protectionMode === "fields") {
      const allowed = values.resourceId === context.participantId ? participantProtectionFields : contactProtectionFields;
      if (!values.fieldPaths.length || values.fieldPaths.some((path) => !Object.hasOwn(allowed, path))) issues.fieldPaths = "יש לבחור לפחות שדה מותר אחד לרשומה שנבחרה.";
      else if (new Set(values.fieldPaths).size !== values.fieldPaths.length) issues.fieldPaths = "יש לבחור כל שדה פעם אחת בלבד.";
    }
  }
  return issues;
}

export function settingsInputIssues(values: {
  offlineLeaseHours: string;
  appointmentReminderMinutesBefore: string;
  overdueRepeatHours: string;
  reminderAudience: string;
  reason: string;
}): FormIssues {
  const issues: FormIssues = {};
  const integer = (value: string, minimum: number, maximum: number) => /^\d+$/.test(value.trim()) && Number.isInteger(Number(value)) && Number(value) >= minimum && Number(value) <= maximum;
  if (!integer(values.offlineLeaseHours, 1, 24)) issues.offlineLeaseHours = "יש להזין מספר שלם בין 1 ל־24 שעות.";
  if (!integer(values.appointmentReminderMinutesBefore, 0, 1440)) issues.appointmentReminderMinutesBefore = "יש להזין מספר שלם בין 0 ל־1,440 דקות. להזמנה במועד עצמו יש להזין 0.";
  if (values.overdueRepeatHours.trim() && !integer(values.overdueRepeatHours, 1, 168)) issues.overdueRepeatHours = "יש להשאיר ריק או להזין מספר שלם בין 1 ל־168 שעות.";
  if (!["responsible_team", "all_staff"].includes(values.reminderAudience)) issues.reminderAudience = "יש לבחור את קהל התזכורות מהרשימה.";
  if (!values.reason.trim()) issues.reason = "יש לכתוב סיבה לשינוי המדיניות.";
  else if (values.reason.trim().length > 2000) issues.reason = "הסיבה יכולה להכיל עד 2,000 תווים.";
  return issues;
}

export function focusFormIssue(form: HTMLFormElement, issues: FormIssues) {
  const field = Object.keys(issues).find((key) => issues[key]);
  if (!field) return;
  requestAnimationFrame(() => {
    const control = form.querySelector<HTMLElement>(`[data-validation-field="${field}"]`);
    const target = control?.querySelector<HTMLElement>("button:not(:disabled), input:not(:disabled), [tabindex='0']") ?? control;
    target?.focus();
  });
}
