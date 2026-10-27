import { createHash } from "node:crypto";
import { z } from "zod";
import type { ApiFailure, MentoringCommand } from "../contracts";
import { contactCommandSchemas } from "../features/contacts/schema";
import { authorityCommandSchemas } from "../features/authority/schema";
import { oversightCommandSchemas } from "../features/oversight/schema";

const uuid = z.uuid();
const version = z.number().int().positive().max(2_147_483_647);
const instant = z.iso.datetime({ offset: true });
const nullableText = (max: number) => z.string().trim().max(max).nullable();
const fields = z.strictObject({
  displayName: z.string().trim().max(160).optional(),
  phone: nullableText(40).optional(),
  serviceType: z.enum(["national", "military"]).nullable().optional(),
  servicePlace: nullableText(240).optional(),
  serviceRole: nullableText(240).optional(),
  profileNotes: nullableText(20_000).optional(),
});
const operation = { operationId: uuid };

export const commandSchema = z.discriminatedUnion("type", [
  ...contactCommandSchemas,
  ...authorityCommandSchemas,
  ...oversightCommandSchemas,
  z.strictObject({ ...operation, type: z.literal("evaluate_reminders"), afterParticipantId: uuid.nullable().optional() }),
  z.strictObject({ ...operation, type: z.literal("create_staff"), fields: z.strictObject({
    displayName: z.string().trim().min(1).max(200), email: z.email().trim().toLowerCase().max(320),
    phone: nullableText(40), role: z.enum(["mentor", "coordinator"]), coordinatorId: uuid.nullable(),
  }) }),
  z.strictObject({ ...operation, type: z.literal("set_staff_active"), staffId: uuid, expectedVersion: version, active: z.boolean() }),
  z.strictObject({ ...operation, type: z.literal("create_participant"), fields }),
  z.strictObject({ ...operation, type: z.literal("update_participant"), participantId: uuid, expectedVersion: version, fields: fields.refine((value) => Object.keys(value).length > 0) }),
  z.strictObject({ ...operation, type: z.literal("assign_participant"), participantId: uuid, expectedVersion: version, mentorId: uuid, coordinatorId: uuid.nullable() }),
  z.strictObject({
    ...operation, type: z.literal("record_contact"), participantId: uuid,
    expectedVersion: version,
    // Required even when there is currently no appointment. Omission must never bypass concurrency.
    expectedAppointmentVersion: version.nullable(),
    method: z.enum(["phone", "in_person"]), outcome: z.enum(["completed", "no_answer"]),
    occurredAt: instant, notes: z.string().max(20_000),
    manualColor: z.enum(["green", "orange", "red"]).optional(),
    nextAppointmentAt: instant.optional(),
  }).superRefine((value, context) => {
    if (value.outcome === "completed" && !value.nextAppointmentAt) context.addIssue({ code: "custom", path: ["nextAppointmentAt"], message: "יש לבחור תאריך ושעה לפגישה הבאה." });
    if (value.outcome === "no_answer" && value.nextAppointmentAt) context.addIssue({ code: "custom", path: ["nextAppointmentAt"], message: "ניסיון ללא מענה אינו משנה את הפגישה הבאה." });
    if (value.outcome === "no_answer" && value.method !== "phone") context.addIssue({ code: "custom", path: ["method"], message: "ניסיון ללא מענה מתועד כשיחת טלפון." });
  }),
  z.strictObject({ ...operation, type: z.literal("review_contact"), participantId: uuid, contactId: uuid, revision: version, decision: z.enum(["approved", "returned_for_correction"]) }),
  z.strictObject({ ...operation, type: z.literal("set_sms_muted"), muted: z.boolean() }),
  z.strictObject({ ...operation, type: z.literal("resolve_conflict"), conflictId: uuid, decision: z.literal("keep_ceo") }),
]);

export function parseCommand(value: unknown): { readonly ok: true; readonly command: MentoringCommand } | ApiFailure {
  const result = commandSchema.safeParse(value);
  if (result.success) return { ok: true, command: result.data };
  const issue = result.error.issues[0];
  const field = issue?.path.join(".");
  return { ok: false, error: { code: "validation", message: issue?.code === "custom" ? issue.message : "יש לבדוק את פרטי הפעולה ואת השדות הנדרשים.", ...(field ? { field } : {}) } };
}

/** Stable hashes make equivalent object-key ordering an identical retry. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}

export function commandHash(command: MentoringCommand): string {
  return createHash("sha256").update(canonicalJson(command)).digest("hex");
}
