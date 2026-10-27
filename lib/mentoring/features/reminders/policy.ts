import type { ParticipantView, StaffProfile } from "../../contracts";
import { computeFollowup, type ContactEntry } from "../../domain";
import type { OrganizationSettings } from "../oversight/contracts";

export interface ReminderOccurrence {
  readonly kind: "appointment" | "seven_day_overdue";
  /** Stable delivery identity; profile changes cannot resend an accepted occurrence. */
  readonly occurrenceKey: string;
  /** Current validation identity; every claim compares this with authoritative data. */
  readonly generation: string;
  readonly scheduledAt: string;
  readonly referenceAt: string;
}

function latestQualifyingContact(view: ParticipantView, now: string): ContactEntry | undefined {
  return view.contacts.filter((entry) =>
    entry.organizationId === view.participant.organizationId &&
    entry.participantId === view.participant.id && entry.outcome === "completed" &&
    (entry.method === "phone" || entry.method === "in_person") && entry.invalidatedAt == null &&
    Date.parse(entry.occurredAt) <= Date.parse(now),
  ).toSorted((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt) ||
    Date.parse(right.receivedAt) - Date.parse(left.receivedAt) || left.id.localeCompare(right.id))[0];
}

function validScope(view: ParticipantView, settings: OrganizationSettings): boolean {
  return view.participant.organizationId === settings.organizationId &&
    view.participant.lifecycle === "active" && view.participant.deletedAt == null && view.deletedAt == null &&
    view.assignment != null && view.assignment.organizationId === view.participant.organizationId &&
    view.assignment.participantId === view.participant.id;
}

/** No narrative, phone number, or recipient address belongs in the generation. */
export function reminderGeneration(view: ParticipantView, settings: OrganizationSettings, now: string): string {
  const completed = latestQualifyingContact(view, now);
  return JSON.stringify([
    "reminder-v1", view.participant.id, view.participant.version, view.participant.lifecycle,
    view.participant.deletedAt ?? view.deletedAt ?? null,
    view.assignment?.id ?? null, view.assignment?.version ?? null,
    view.assignment?.followupAnchorAt ?? view.assignment?.assignedAt ?? null,
    completed?.id ?? null, completed?.revision ?? null, completed?.occurredAt ?? null,
    view.nextAppointment?.id ?? null, view.nextAppointment?.version ?? null,
    view.nextAppointment?.scheduledAt ?? null, settings.version,
  ]);
}

/**
 * Plan one appointment and one initial breach, plus the latest explicitly
 * configured repeat. Old repeat intervals are never backfilled in a burst.
 */
export function planReminderOccurrences(view: ParticipantView, settings: OrganizationSettings, now: string): readonly ReminderOccurrence[] {
  if (!validScope(view, settings)) return [];
  const generation = reminderGeneration(view, settings, now);
  const occurrences: ReminderOccurrence[] = [];
  const appointment = view.nextAppointment;
  if (appointment && appointment.organizationId === view.participant.organizationId && appointment.participantId === view.participant.id) {
    occurrences.push({ kind: "appointment", occurrenceKey: JSON.stringify(["appointment", appointment.id, appointment.version]), generation,
      scheduledAt: new Date(Date.parse(appointment.scheduledAt) - settings.appointmentReminderMinutesBefore * 60_000).toISOString(),
      referenceAt: new Date(appointment.scheduledAt).toISOString() });
  }
  if (!settings.overdueRemindersEnabled) return occurrences;
  const followup = computeFollowup({ organizationId: view.participant.organizationId, participantId: view.participant.id,
    assignedAt: view.assignment?.assignedAt ?? null, followupAnchorAt: view.assignment?.followupAnchorAt,
    contacts: view.contacts, nextAppointment: appointment }, now);
  if (!followup.dueAt) return occurrences;
  const completed = latestQualifyingContact(view, now);
  const obligation = completed ? ["contact", completed.id, completed.revision, completed.occurredAt] :
    ["assignment", view.assignment?.id, view.assignment?.followupAnchorAt ?? view.assignment?.assignedAt];
  const dueAt = followup.dueAt;
  occurrences.push({ kind: "seven_day_overdue", occurrenceKey: JSON.stringify(["seven_day_overdue", obligation, "base"]),
    generation, scheduledAt: dueAt, referenceAt: dueAt });
  if (settings.overdueRepeatHours != null && settings.overdueRepeatHours > 0) {
    const interval = settings.overdueRepeatHours * 3_600_000;
    const index = Math.floor((Date.parse(now) - Date.parse(dueAt)) / interval);
    if (index >= 1) {
      const repeatAt = new Date(Date.parse(dueAt) + index * interval).toISOString();
      occurrences.push({ kind: "seven_day_overdue", occurrenceKey: JSON.stringify(["seven_day_overdue", obligation, "repeat", repeatAt]),
        generation, scheduledAt: repeatAt, referenceAt: dueAt });
    }
  }
  return occurrences;
}

/** Agreed Israeli staff-mobile formats only; participant phones are never read. */
export function normalizeStaffMobile(phone: string | null): string | null {
  if (phone == null || !/^[+\d\s().-]+$/.test(phone)) return null;
  const compact = phone.replace(/[\s().-]/g, "");
  if (/^05\d{8}$/.test(compact)) return `+972${compact.slice(1)}`;
  if (/^\+9725\d{8}$/.test(compact)) return compact;
  if (/^9725\d{8}$/.test(compact)) return `+${compact}`;
  return null;
}

export function selectReminderRecipients(view: ParticipantView, staff: readonly StaffProfile[], settings: OrganizationSettings): readonly StaffProfile[] {
  if (!validScope(view, settings)) return [];
  const selected = new Map<string, StaffProfile>();
  for (const member of staff) {
    if (member.organizationId !== view.participant.organizationId || !member.active || !["mentor", "coordinator", "ceo"].includes(member.role)) continue;
    if (member.role === "ceo" && member.smsMuted) continue;
    const responsible = member.role === "ceo" ||
      (member.role === "mentor" && member.id === view.assignment?.mentorId) ||
      (member.role === "coordinator" && member.id === view.assignment?.coordinatorId);
    if (settings.reminderAudience === "all_staff" || responsible) selected.set(member.id, member);
  }
  return [...selected.values()].sort((left, right) => left.id.localeCompare(right.id));
}

const dateFormatter = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" });

/** Only a participant name, the relevant date/time, and the contact need. */
export function reminderMessage(participantName: string, occurrence: Pick<ReminderOccurrence, "kind" | "referenceAt">): string {
  const name = participantName.replace(/[\r\n\t\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
  const when = dateFormatter.format(new Date(occurrence.referenceAt));
  return occurrence.kind === "appointment" ? `תזכורת לקשר עם ${name}: ${when}.` :
    `נדרש קשר עם ${name}. מועד שבעת הימים: ${when}.`;
}
