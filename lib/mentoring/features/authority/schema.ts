import { z } from "zod";
import { booleanSchema, dateTimeSchema, operationIdSchema, phoneSchema, reasonSchema, recordIdSchema, staffNameSchema, staffRoleSchema, strictObjectError, versionSchema } from "../../validation-fields";

const participant = { operationId: operationIdSchema, participantId: recordIdSchema, expectedVersion: versionSchema, reason: reasonSchema };

export const PARTICIPANT_PROTECTION_FIELDS = ["displayName", "phone", "serviceType", "servicePlace", "serviceRole", "profileNotes", "manualColor", "appointment", "assignment", "lifecycle"] as const;
export const CONTACT_PROTECTION_FIELDS = ["method", "outcome", "occurredAt", "notes", "invalidatedAt"] as const;
const protectionField = z.enum([...PARTICIPANT_PROTECTION_FIELDS, ...CONTACT_PROTECTION_FIELDS], { error: "יש לבחור שדה מוכר להגנה מתוך הרשימה." });

export const authorityCommandSchemas = [
  z.strictObject({ ...participant, type: z.literal("set_access_grant"), staffId: recordIdSchema, expectedGrantVersion: versionSchema.nullable(), actions: z.array(z.enum(["view", "edit", "approve"], { error: "יש לבחור הרשאה: צפייה, עריכה או אישור." }), { error: "יש לבחור הרשאות מתוך הרשימה." }).max(3, { error: "אפשר לבחור עד שלוש הרשאות: צפייה, עריכה ואישור." }), expiresAt: dateTimeSchema("מועד פקיעת תוקף ההרשאה").nullable() }, strictObjectError).superRefine((value, context) => {
    if (new Set(value.actions).size !== value.actions.length) context.addIssue({ code: "custom", path: ["actions"], message: "יש לבחור כל הרשאה פעם אחת בלבד." });
    if (value.actions.some((action) => action === "edit" || action === "approve") && !value.actions.includes("view")) context.addIssue({ code: "custom", path: ["actions"], message: "הרשאת עריכה או אישור מחייבת גם הרשאת צפייה." });
  }),
  z.strictObject({ ...participant, type: z.literal("set_ceo_protection"), resourceId: recordIdSchema, expectedProtectionVersion: versionSchema.nullable(), active: booleanSchema("הגנת המנכ״ל/ית פעילה"), fieldPaths: z.array(protectionField, { error: "יש לבחור שדות להגנה מתוך הרשימה." }).min(1, { error: "יש לבחור לפחות שדה אחד להגנה, או הגנה על כל הרשומה." }).max(PARTICIPANT_PROTECTION_FIELDS.length + CONTACT_PROTECTION_FIELDS.length, { error: "נבחרו יותר מדי שדות להגנה. יש לבחור כל שדה פעם אחת בלבד." }).nullable() }, strictObjectError).superRefine((value, context) => {
    if (value.fieldPaths && new Set(value.fieldPaths).size !== value.fieldPaths.length) context.addIssue({ code: "custom", path: ["fieldPaths"], message: "יש לבחור כל שדה פעם אחת בלבד." });
    if (!value.active && value.fieldPaths !== null) context.addIssue({ code: "custom", path: ["fieldPaths"], message: "הסרת הגנה מחייבת תחום שדות ריק." });
  }),
  z.strictObject({ ...participant, type: z.literal("set_participant_lifecycle"), lifecycle: z.enum(["active", "paused", "closed"], { error: "יש לבחור מצב ליווי: פעיל, מושהה או סגור." }) }, strictObjectError),
  z.strictObject({ ...participant, type: z.literal("delete_participant") }, strictObjectError),
  z.strictObject({ ...participant, type: z.literal("restore_participant") }, strictObjectError),
  z.strictObject({ operationId: operationIdSchema, type: z.literal("update_staff"), staffId: recordIdSchema, expectedVersion: versionSchema, fields: z.strictObject({ displayName: staffNameSchema.optional(), phone: phoneSchema.optional(), role: staffRoleSchema.optional(), coordinatorId: recordIdSchema.nullable().optional() }, strictObjectError).refine((fields) => Object.keys(fields).length > 0, { message: "יש לבחור לפחות שדה אחד לעדכון." }) }, strictObjectError),
] as const;
