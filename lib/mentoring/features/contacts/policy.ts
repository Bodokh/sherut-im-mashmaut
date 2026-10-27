import type { ContactEntry, ContactMethod, ContactOutcome, Participant } from "../../domain";

interface ProposedContact {
  readonly method: ContactMethod;
  readonly outcome: ContactOutcome;
  readonly occurredAt: string;
  readonly nextAppointmentAt?: string;
}

type RevisionPlan =
  | { readonly ok: true; readonly appointmentEffect: "replace" | "retain" | "retain_with_warning" }
  | { readonly ok: false; readonly field: string; readonly message: string };

function latestCompleted(contacts: readonly ContactEntry[]): ContactEntry | undefined {
  return contacts.filter((entry) => entry.outcome === "completed" && entry.invalidatedAt == null)
    .toSorted((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt) || Date.parse(right.receivedAt) - Date.parse(left.receivedAt) || left.id.localeCompare(right.id))[0];
}

/** Corrections never turn a historical submission into a replacement schedule. */
export function planContactRevision(contacts: readonly ContactEntry[], targetId: string, proposed: ProposedContact, now: string, lifecycle: Participant["lifecycle"] = "active"): RevisionPlan {
  const target = contacts.find((entry) => entry.id === targetId);
  const invalid = (field: string, message: string): RevisionPlan => ({ ok: false, field, message });
  if (!target || target.invalidatedAt != null) return invalid("contactId", "לא ניתן לתקן דיווח שאינו פעיל.");
  const occurred = Date.parse(proposed.occurredAt);
  if (!Number.isFinite(occurred) || occurred > Date.parse(now)) return invalid("occurredAt", "לא ניתן לתעד קשר שבוצע בעתיד.");
  if (proposed.outcome === "no_answer" && proposed.method !== "phone") return invalid("method", "ניסיון ללא מענה מתועד כשיחת טלפון.");
  if (proposed.outcome === "no_answer" && proposed.nextAppointmentAt !== undefined) return invalid("nextAppointmentAt", "ניסיון ללא מענה אינו קובע פגישה חדשה.");
  if (lifecycle !== "active" && proposed.nextAppointmentAt !== undefined) return invalid("nextAppointmentAt", "תיקון היסטורי בכרטיס מושהה או סגור אינו קובע פגישה חדשה.");
  const before = latestCompleted(contacts);
  const after = latestCompleted(contacts.map((entry) => entry.id === targetId ? { ...entry, ...proposed } : entry));
  const changedAnchor = target.outcome !== proposed.outcome || Date.parse(target.occurredAt) !== occurred;
  const qualifiesNewAttempt = target.outcome === "no_answer" && (!before || Date.parse(target.occurredAt) >= Date.parse(before.occurredAt));
  const replace = (before?.id === targetId || qualifiesNewAttempt) && after?.id === targetId && proposed.outcome === "completed" && changedAnchor;
  // Historical maintenance on an inactive card preserves every chosen time.
  if (lifecycle !== "active") return { ok: true, appointmentEffect: replace || (changedAnchor && before?.id !== after?.id) ? "retain_with_warning" : "retain" };
  if (replace) {
    const next = Date.parse(proposed.nextAppointmentAt ?? "");
    if (!Number.isFinite(next) || next <= occurred) return invalid("nextAppointmentAt", "יש לבחור פגישה הבאה לאחר מועד הקשר המתוקן.");
    return { ok: true, appointmentEffect: "replace" };
  }
  if (proposed.nextAppointmentAt !== undefined) return invalid("nextAppointmentAt", "תיקון זה שומר את הפגישה הקיימת. לשינוי המועד יש להשתמש בשינוי פגישה.");
  return { ok: true, appointmentEffect: changedAnchor && before?.id !== after?.id ? "retain_with_warning" : "retain" };
}

export function invalidationNeedsAppointmentReview(contacts: readonly ContactEntry[], targetId: string): boolean {
  return latestCompleted(contacts)?.id === targetId;
}
