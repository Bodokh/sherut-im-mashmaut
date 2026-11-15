import { z } from "zod";
import { dateTimeSchema, manualColorSchema, notesSchema, operationIdSchema, recordIdSchema, strictObjectError, textSchema, versionSchema } from "../../validation-fields";

const subjectSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("mentee"), participantId: recordIdSchema }, strictObjectError),
  z.strictObject({ kind: z.literal("mentor"), staffId: recordIdSchema }, strictObjectError),
], { error: "יש לבחור את הכרטיס לעדכון: חניכה או חונך/ת." });

export const trackingMethodSchema = z.enum(["phone", "in_person", "message"], { error: "יש לבחור אופן קשר: שיחת טלפון, פגישה פנים אל פנים או הודעה." });
export const trackingOutcomeSchema = z.enum(["completed", "no_answer"], { error: "יש לבחור תוצאה: התקיים קשר או לא היה מענה." });

export const trackingCommandSchemas = [
  z.strictObject({
    operationId: operationIdSchema, type: z.literal("save_tracking_card"), subject: subjectSchema,
    expectedCardVersion: versionSchema.nullable(),
    fields: z.strictObject({
      status: manualColorSchema.nullable(),
      notes: notesSchema("הערות המעקב"),
      nextFollowupAt: dateTimeSchema("מועד המעקב הבא").nullable(),
    }, strictObjectError),
  }, strictObjectError),
  z.strictObject({
    operationId: operationIdSchema, type: z.literal("record_tracking_report"), subject: subjectSchema,
    method: trackingMethodSchema, outcome: trackingOutcomeSchema,
    occurredAt: dateTimeSchema("מועד הדיווח"),
    notes: textSchema("תוכן הדיווח", 20_000, 1),
  }, strictObjectError),
] as const;
