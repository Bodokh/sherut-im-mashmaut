import { z } from "zod";

const version = z.number().int().positive().max(2_147_483_647);
const instant = z.iso.datetime({ offset: true });
const reason = z.string().trim().min(1).max(2_000);
const common = { operationId: z.uuid(), participantId: z.uuid(), expectedVersion: version };
const contact = { ...common, contactId: z.uuid(), expectedRevision: version, expectedAppointmentVersion: version.nullable() };

export const contactCommandSchemas = [
  z.strictObject({
    ...contact, type: z.literal("revise_contact"), method: z.enum(["phone", "in_person"]),
    outcome: z.enum(["completed", "no_answer"]), occurredAt: instant,
    notes: z.string().max(20_000), reason, nextAppointmentAt: instant.optional(),
  }).superRefine((value, context) => {
    if (value.outcome === "no_answer" && value.method !== "phone") context.addIssue({ code: "custom", path: ["method"], message: "ניסיון ללא מענה מתועד כשיחת טלפון." });
    if (value.outcome === "no_answer" && value.nextAppointmentAt) context.addIssue({ code: "custom", path: ["nextAppointmentAt"], message: "ניסיון ללא מענה אינו קובע פגישה חדשה." });
  }),
  z.strictObject({ ...contact, type: z.literal("invalidate_contact"), reason }),
  z.strictObject({ ...common, type: z.literal("reschedule_appointment"), expectedAppointmentVersion: version, scheduledAt: instant, reason }),
  z.strictObject({ ...common, type: z.literal("set_manual_color"), color: z.enum(["green", "orange", "red"]), reason: reason.optional() }),
] as const;
