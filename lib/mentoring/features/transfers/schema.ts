import { z } from "zod";
import type { MentoringCommand } from "../../contracts";
import { operationIdSchema, recordIdSchema, strictObjectError, textSchema } from "../../validation-fields";
import type { TransferCommand } from "./contracts";

export const transferRequestDecisionSchema = z.enum(["approved", "rejected"], {
  error: "יש לבחור אישור או דחייה של הבקשה.",
});

const optionalNoteSchema = textSchema("הערה לבקשת ההעברה", 2_000, 1).nullable().optional();

export const requestParticipantTransferCommandSchema = z.strictObject({
  operationId: operationIdSchema,
  type: z.literal("request_participant_transfer"),
  participantId: recordIdSchema,
  targetMentorId: recordIdSchema,
  note: optionalNoteSchema,
}, strictObjectError);

export const respondParticipantTransferCommandSchema = z.strictObject({
  operationId: operationIdSchema,
  type: z.literal("respond_participant_transfer"),
  transferRequestId: recordIdSchema,
  decision: transferRequestDecisionSchema,
  note: optionalNoteSchema,
}, strictObjectError);

export const transferCommandSchemas = [
  requestParticipantTransferCommandSchema,
  respondParticipantTransferCommandSchema,
] as const;

export function isTransferCommand(command: MentoringCommand): command is TransferCommand {
  return command.type === "request_participant_transfer" || command.type === "respond_participant_transfer";
}
