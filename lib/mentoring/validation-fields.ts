import { z } from "zod";
import { normalizePhoneNumber } from "../phone";

export const recordIdSchema = z.uuid({ error: "פרטי הרשומה אינם תקינים. יש לרענן את הדף ולבחור את הרשומה שוב." });
export const operationIdSchema = z.uuid({ error: "מזהה הפעולה אינו תקין. יש לרענן את הדף ולנסות שוב." });
const versionError = "גרסת הרשומה אינה תקינה. יש לרענן את הנתונים ולנסות שוב.";
export const versionSchema = z.number({ error: versionError }).int({ error: versionError }).min(1, { error: versionError }).max(2_147_483_647, { error: versionError });

export function textSchema(label: string, maximum: number, minimum = 0) {
  return z.string({ error: `יש להזין ${label} כטקסט.` }).trim()
    .min(minimum, { error: `יש להזין ${label}.` })
    .max(maximum, { error: `${label} יכול להכיל עד ${maximum.toLocaleString("en-US")} תווים. יש לקצר את הטקסט.` });
}

/** Notes preserve their whitespace; profile text and required reasons are trimmed. */
export function notesSchema(label: string) {
  return z.string({ error: `יש להזין ${label} כטקסט.` }).max(20_000, { error: `${label} יכול להכיל עד 20,000 תווים. יש לקצר את הטקסט.` });
}

export const reasonSchema = textSchema("סיבה לפעולה", 2_000, 1);
export const staffNameSchema = textSchema("שם מלא", 200, 1);
const emailError = "יש להזין כתובת דוא״ל תקינה, למשל name@example.org.";
export const emailSchema = z.string({ error: emailError }).trim().toLowerCase().pipe(z.email({ error: emailError }).max(320, { error: "כתובת הדוא״ל יכולה להכיל עד 320 תווים." }));

const phoneError = "יש להזין מספר טלפון תקין, למשל 050-123-4567 או מספר בינלאומי עם קידומת מדינה.";
export const phoneSchema = z.string({ error: phoneError }).trim().max(40, { error: "מספר הטלפון יכול להכיל עד 40 תווים. יש להזין מספר אחד בלבד." }).nullable().transform((value, context) => {
  if (value === null || value === "") return null;
  const normalized = normalizePhoneNumber(value);
  if (normalized) return normalized;
  context.addIssue({ code: "custom", message: phoneError });
  return z.NEVER;
});

export const staffRoleSchema = z.enum(["mentor", "coordinator"], { error: "יש לבחור תפקיד: חונך/ת או רכז/ת." });
export const contactMethodSchema = z.enum(["phone", "in_person"], { error: "יש לבחור את אופן הקשר: שיחת טלפון או פגישה פנים אל פנים." });
export const contactOutcomeSchema = z.enum(["completed", "no_answer"], { error: "יש לבחור תוצאת קשר: התקיים קשר או לא היה מענה." });
export const manualColorSchema = z.enum(["green", "orange", "red"], { error: "יש לבחור צבע: ירוק, כתום או אדום." });

export function dateTimeSchema(label: string) {
  return z.iso.datetime({ offset: true, error: `${label} אינו תקין. יש לבחור תאריך ושעה מחדש.` });
}

export function booleanSchema(label: string) {
  return z.boolean({ error: `יש לבחור אם ${label}.` });
}

export function integerRangeSchema(label: string, minimum: number, maximum: number) {
  const error = `יש להזין ${label} כמספר שלם בין ${minimum} ל־${maximum}.`;
  return z.number({ error }).int({ error }).min(minimum, { error }).max(maximum, { error });
}

export const strictObjectError = {
  error: (issue: { readonly code?: string }) => issue.code === "unrecognized_keys"
    ? "הטופס כולל שדות שאינם נתמכים. יש לרענן את הדף ולנסות שוב."
    : "חסרים פרטי טופס תקינים. יש למלא את השדות ולנסות שוב.",
};
