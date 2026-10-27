import { z } from "zod";
import { contactMethodSchema, contactOutcomeSchema, dateTimeSchema, manualColorSchema, notesSchema, operationIdSchema, reasonSchema, recordIdSchema, strictObjectError, versionSchema } from "../../validation-fields";

const common = { operationId: operationIdSchema, participantId: recordIdSchema, expectedVersion: versionSchema };
const contact = { ...common, contactId: recordIdSchema, expectedRevision: versionSchema, expectedAppointmentVersion: versionSchema.nullable() };

export const contactCommandSchemas = [
  z.strictObject({
    ...contact, type: z.literal("revise_contact"), method: contactMethodSchema,
    outcome: contactOutcomeSchema, occurredAt: dateTimeSchema("מועד הקשר"),
    notes: notesSchema("תוכן הדיווח"), reason: reasonSchema, nextAppointmentAt: dateTimeSchema("מועד הפגישה הבאה").optional(),
  }, strictObjectError).superRefine((value, context) => {
    if (value.outcome === "no_answer" && value.method !== "phone") context.addIssue({ code: "custom", path: ["method"], message: "ניסיון ללא מענה מתועד כשיחת טלפון." });
    if (value.outcome === "no_answer" && value.nextAppointmentAt) context.addIssue({ code: "custom", path: ["nextAppointmentAt"], message: "ניסיון ללא מענה אינו קובע פגישה חדשה." });
  }),
  z.strictObject({ ...contact, type: z.literal("invalidate_contact"), reason: reasonSchema }, strictObjectError),
  z.strictObject({ ...common, type: z.literal("reschedule_appointment"), expectedAppointmentVersion: versionSchema, scheduledAt: dateTimeSchema("מועד הפגישה הבאה"), reason: reasonSchema }, strictObjectError),
  z.strictObject({ ...common, type: z.literal("set_manual_color"), color: manualColorSchema, reason: reasonSchema.optional() }, strictObjectError),
] as const;
