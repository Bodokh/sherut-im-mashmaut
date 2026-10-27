import { z } from "zod";

const uuid = z.uuid();
const version = z.number().int().positive().max(2_147_483_647);
const participant = { operationId: uuid, participantId: uuid, expectedVersion: version, reason: z.string().trim().min(1).max(2_000) };

export const PARTICIPANT_PROTECTION_FIELDS = ["displayName", "phone", "serviceType", "servicePlace", "serviceRole", "profileNotes", "manualColor", "appointment", "assignment", "lifecycle"] as const;
export const CONTACT_PROTECTION_FIELDS = ["method", "outcome", "occurredAt", "notes", "invalidatedAt"] as const;
const protectionField = z.enum([...PARTICIPANT_PROTECTION_FIELDS, ...CONTACT_PROTECTION_FIELDS]);

export const authorityCommandSchemas = [
  z.strictObject({ ...participant, type: z.literal("set_access_grant"), staffId: uuid, expectedGrantVersion: version.nullable(), actions: z.array(z.enum(["view", "edit", "approve"])).max(3), expiresAt: z.iso.datetime({ offset: true }).nullable() }).superRefine((value, context) => {
    if (new Set(value.actions).size !== value.actions.length) context.addIssue({ code: "custom", path: ["actions"], message: "יש לבחור כל הרשאה פעם אחת בלבד." });
    if (value.actions.some((action) => action === "edit" || action === "approve") && !value.actions.includes("view")) context.addIssue({ code: "custom", path: ["actions"], message: "הרשאת עריכה או אישור מחייבת גם הרשאת צפייה." });
  }),
  z.strictObject({ ...participant, type: z.literal("set_ceo_protection"), resourceId: uuid, expectedProtectionVersion: version.nullable(), active: z.boolean(), fieldPaths: z.array(protectionField).min(1).max(PARTICIPANT_PROTECTION_FIELDS.length + CONTACT_PROTECTION_FIELDS.length).nullable() }).superRefine((value, context) => {
    if (value.fieldPaths && new Set(value.fieldPaths).size !== value.fieldPaths.length) context.addIssue({ code: "custom", path: ["fieldPaths"], message: "יש לבחור כל שדה פעם אחת בלבד." });
    if (!value.active && value.fieldPaths !== null) context.addIssue({ code: "custom", path: ["fieldPaths"], message: "הסרת הגנה מחייבת תחום שדות ריק." });
  }),
  z.strictObject({ ...participant, type: z.literal("set_participant_lifecycle"), lifecycle: z.enum(["active", "paused", "closed"]) }),
  z.strictObject({ ...participant, type: z.literal("delete_participant") }),
  z.strictObject({ ...participant, type: z.literal("restore_participant") }),
  z.strictObject({ operationId: uuid, type: z.literal("update_staff"), staffId: uuid, expectedVersion: version, fields: z.strictObject({ displayName: z.string().trim().min(1).max(200).optional(), phone: z.string().trim().max(40).nullable().optional(), role: z.enum(["mentor", "coordinator"]).optional(), coordinatorId: uuid.nullable().optional() }).refine((fields) => Object.keys(fields).length > 0, { message: "יש לבחור לפחות שדה אחד לעדכון." }) }),
] as const;
