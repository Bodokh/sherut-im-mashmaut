import { z } from "zod";

const version = z.number().int().positive().max(2_147_483_647);
export const monthSchema = z.string().regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/);
export const organizationPolicySchema = z.strictObject({
  offlineLeaseHours: z.number().int().min(1).max(24),
  reminderAudience: z.enum(["responsible_team", "all_staff"]),
  appointmentReminderMinutesBefore: z.number().int().min(0).max(1440),
  overdueRemindersEnabled: z.boolean(),
  overdueRepeatHours: z.number().int().min(1).max(168).nullable(),
});

export const oversightCommandSchemas = [
  z.strictObject({
    type: z.literal("update_organization_settings"), operationId: z.uuid(), expectedVersion: version,
    settings: organizationPolicySchema, reason: z.string().trim().min(1).max(2000),
  }),
  z.strictObject({
    type: z.literal("save_monthly_review"), operationId: z.uuid(), month: monthSchema,
    scopeStaffId: z.uuid().nullable(), expectedVersion: version.nullable(),
    summary: z.string().max(20_000), reviewed: z.boolean(),
  }),
] as const;
