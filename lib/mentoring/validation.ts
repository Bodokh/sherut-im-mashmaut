import { z } from "zod";
import type { ApiFailure, MentoringCommand } from "./contracts";
import { contactCommandSchemas } from "./features/contacts/schema";
import { authorityCommandSchemas } from "./features/authority/schema";
import { oversightCommandSchemas } from "./features/oversight/schema";
import { booleanSchema, contactMethodSchema, contactOutcomeSchema, dateTimeSchema, emailSchema, manualColorSchema, notesSchema, operationIdSchema, phoneSchema, recordIdSchema, staffNameSchema, staffRoleSchema, strictObjectError, textSchema, versionSchema } from "./validation-fields";

const fields = z.strictObject({
  displayName: textSchema("שם מלא", 160).optional(),
  phone: phoneSchema.optional(),
  serviceType: z.enum(["national", "military"], { error: "יש לבחור סוג שירות: שירות לאומי או שירות צבאי." }).nullable().optional(),
  servicePlace: textSchema("מקום השירות", 240).nullable().optional(),
  serviceRole: textSchema("התפקיד בשירות", 240).nullable().optional(),
  profileNotes: textSchema("הערות לפרופיל", 20_000).nullable().optional(),
}, strictObjectError);
const operation = { operationId: operationIdSchema };

/** This module is shared by browser forms and the authoritative server boundary. */
export const commandSchema = z.discriminatedUnion("type", [
  ...contactCommandSchemas,
  ...authorityCommandSchemas,
  ...oversightCommandSchemas,
  z.strictObject({ ...operation, type: z.literal("evaluate_reminders"), afterParticipantId: recordIdSchema.nullable().optional() }, strictObjectError),
  z.strictObject({ ...operation, type: z.literal("create_staff"), fields: z.strictObject({
    displayName: staffNameSchema, email: emailSchema,
    phone: phoneSchema, role: staffRoleSchema, coordinatorId: recordIdSchema.nullable(),
  }, strictObjectError) }, strictObjectError),
  z.strictObject({ ...operation, type: z.literal("set_staff_active"), staffId: recordIdSchema, expectedVersion: versionSchema, active: booleanSchema("הגישה לצוות פעילה") }, strictObjectError),
  z.strictObject({ ...operation, type: z.literal("create_participant"), fields }, strictObjectError),
  z.strictObject({ ...operation, type: z.literal("update_participant"), participantId: recordIdSchema, expectedVersion: versionSchema, fields: fields.refine((value) => Object.keys(value).length > 0, { message: "יש לבחור לפחות שדה אחד לעדכון." }) }, strictObjectError),
  z.strictObject({ ...operation, type: z.literal("assign_participant"), participantId: recordIdSchema, expectedVersion: versionSchema, mentorId: recordIdSchema, coordinatorId: recordIdSchema.nullable() }, strictObjectError),
  z.strictObject({
    ...operation, type: z.literal("record_contact"), participantId: recordIdSchema,
    expectedVersion: versionSchema,
    // Required even when there is currently no appointment. Omission must never bypass concurrency.
    expectedAppointmentVersion: versionSchema.nullable(),
    method: contactMethodSchema, outcome: contactOutcomeSchema,
    occurredAt: dateTimeSchema("מועד הקשר"), notes: notesSchema("תוכן הדיווח"),
    manualColor: manualColorSchema.optional(),
    nextAppointmentAt: dateTimeSchema("מועד הפגישה הבאה").optional(),
  }, strictObjectError).superRefine((value, context) => {
    if (value.outcome === "completed" && !value.nextAppointmentAt) context.addIssue({ code: "custom", path: ["nextAppointmentAt"], message: "יש לבחור תאריך ושעה לפגישה הבאה." });
    if (value.outcome === "no_answer" && value.nextAppointmentAt) context.addIssue({ code: "custom", path: ["nextAppointmentAt"], message: "ניסיון ללא מענה אינו משנה את הפגישה הבאה." });
    if (value.outcome === "no_answer" && value.method !== "phone") context.addIssue({ code: "custom", path: ["method"], message: "ניסיון ללא מענה מתועד כשיחת טלפון." });
  }),
  z.strictObject({ ...operation, type: z.literal("review_contact"), participantId: recordIdSchema, contactId: recordIdSchema, revision: versionSchema, decision: z.enum(["approved", "returned_for_correction"], { error: "יש לבחור החלטת בקרה: אישור או החזרה לתיקון." }) }, strictObjectError),
  z.strictObject({ ...operation, type: z.literal("set_sms_muted"), muted: booleanSchema("תזכורות המסרונים מושתקות") }, strictObjectError),
  z.strictObject({ ...operation, type: z.literal("resolve_conflict"), conflictId: recordIdSchema, decision: z.literal("keep_ceo", { error: "יש לבחור בשמירת החלטת המנכ״ל/ית כדי לסגור את ההתנגשות." }) }, strictObjectError),
], { error: "סוג הפעולה אינו נתמך. יש לרענן את הדף ולנסות שוב." });

export function parseCommand(value: unknown): { readonly ok: true; readonly command: MentoringCommand } | ApiFailure {
  const result = commandSchema.safeParse(value);
  if (result.success) return { ok: true, command: result.data };
  const issue = result.error.issues[0];
  const field = issue?.path.join(".");
  return { ok: false, error: { code: "validation", message: issue?.message ?? "יש לבדוק את פרטי הפעולה ואת השדות הנדרשים.", ...(field ? { field } : {}) } };
}
