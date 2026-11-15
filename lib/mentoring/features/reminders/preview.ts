import type { ParticipantView, StaffProfile } from "../../contracts";
import { canAccessParticipant } from "../../domain";
import type { OrganizationSettings } from "../oversight/contracts";
import { normalizeStaffMobile, planReminderOccurrences, reminderMessage, selectReminderRecipients, type ReminderOccurrence } from "./policy";

export type ReminderPreviewLabel = "three_days_before" | "scheduled_day" | "overdue_followup";

export interface ReminderPreviewEntry {
  readonly participantId: string;
  readonly recipientId: string;
  readonly recipientName: string;
  readonly recipientRole: "mentor" | "coordinator";
  /** Masked staff mobile, or null when the stored number cannot receive SMS. */
  readonly destination: string | null;
  readonly kind: ReminderOccurrence["kind"];
  readonly label: ReminderPreviewLabel;
  readonly scheduledAt: string;
  readonly due: boolean;
  readonly skippedReason: "invalid_staff_phone" | null;
  readonly message: string;
}

export interface ReminderPreviewOptions {
  /** Keep the mentee's name and phone out of the output (default). */
  readonly redactPersonalData?: boolean;
}

const REDACTED_NAME = "«שם החניכה»";
const REDACTED_PHONE = "050-0000000";

export function maskStaffMobile(normalized: string | null): string | null {
  if (!normalized) return null;
  return `${normalized.slice(0, 6)}•••${normalized.slice(-4)}`;
}

function labelFor(occurrence: ReminderOccurrence): ReminderPreviewLabel {
  if (occurrence.kind === "seven_day_overdue") return "overdue_followup";
  return occurrence.occurrenceKey.includes('"advance"') ? "three_days_before" : "scheduled_day";
}

/**
 * Read-only description of the SMS messages the production planner would
 * create for these participants. It uses the production recipient selection and
 * message templates and never touches a transport, so it cannot send anything.
 */
export function previewReminders(views: readonly ParticipantView[], staff: readonly StaffProfile[], settings: OrganizationSettings, now: string, options: ReminderPreviewOptions = {}): readonly ReminderPreviewEntry[] {
  const redact = options.redactPersonalData !== false;
  const entries: ReminderPreviewEntry[] = [];
  for (const view of views) {
    const occurrences = planReminderOccurrences(view, settings, now);
    if (!occurrences.length) continue;
    for (const recipient of selectReminderRecipients(view, staff, settings)) {
      if (recipient.role !== "mentor" && recipient.role !== "coordinator") continue;
      const destination = normalizeStaffMobile(recipient.phone);
      const mayReadPhone = canAccessParticipant(recipient, view.participant, view.assignment, [], now);
      for (const occurrence of occurrences) {
        const name = redact ? REDACTED_NAME : view.participant.displayName;
        const phone = mayReadPhone ? (redact ? REDACTED_PHONE : view.participant.phone) : null;
        entries.push({
          participantId: view.participant.id,
          recipientId: recipient.id,
          recipientName: recipient.displayName,
          recipientRole: recipient.role,
          destination: maskStaffMobile(destination),
          kind: occurrence.kind,
          label: labelFor(occurrence),
          scheduledAt: occurrence.scheduledAt,
          due: Date.parse(occurrence.scheduledAt) <= Date.parse(now),
          skippedReason: destination ? null : "invalid_staff_phone",
          message: reminderMessage(name, occurrence, phone),
        });
      }
    }
  }
  return entries.toSorted((left, right) => Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt) ||
    left.recipientId.localeCompare(right.recipientId) || left.participantId.localeCompare(right.participantId));
}
