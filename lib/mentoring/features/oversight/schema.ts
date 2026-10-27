import { z } from "zod";
import { booleanSchema, integerRangeSchema, notesSchema, operationIdSchema, reasonSchema, recordIdSchema, strictObjectError, versionSchema } from "../../validation-fields";

const monthError = "יש לבחור חודש ושנה תקינים עבור הסקירה החודשית.";
export const monthSchema = z.string({ error: monthError }).regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/, { error: monthError });
export const organizationPolicySchema = z.strictObject({
  offlineLeaseHours: integerRangeSchema("משך עבודה ללא חיבור בשעות", 1, 24),
  reminderAudience: z.enum(["responsible_team", "all_staff"], { error: "יש לבחור נמענים לתזכורות: הצוות האחראי או כל הצוות." }),
  appointmentReminderMinutesBefore: integerRangeSchema("זמן התזכורת לפני פגישה בדקות", 0, 1440),
  overdueRemindersEnabled: booleanSchema("תזכורות על איחור בקשר פעילות"),
  overdueRepeatHours: integerRangeSchema("תדירות תזכורת חוזרת בשעות", 1, 168).nullable(),
}, strictObjectError);

export const oversightCommandSchemas = [
  z.strictObject({
    type: z.literal("update_organization_settings"), operationId: operationIdSchema, expectedVersion: versionSchema,
    settings: organizationPolicySchema, reason: reasonSchema,
  }, strictObjectError),
  z.strictObject({
    type: z.literal("save_monthly_review"), operationId: operationIdSchema, month: monthSchema,
    scopeStaffId: recordIdSchema.nullable(), expectedVersion: versionSchema.nullable(),
    summary: notesSchema("סיכום הסקירה"), reviewed: booleanSchema("הסקירה הושלמה"),
  }, strictObjectError),
] as const;
