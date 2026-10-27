import type { ContactEntry, ContactMethod, ContactOutcome, ManualColor, Review } from "../../domain";

interface ContactOperation {
  readonly operationId: string;
  readonly participantId: string;
  readonly expectedVersion: number;
}

export type ContactCommand = ContactOperation & (
  | { readonly type: "revise_contact"; readonly contactId: string; readonly expectedRevision: number; readonly expectedAppointmentVersion: number | null; readonly method: ContactMethod; readonly outcome: ContactOutcome; readonly occurredAt: string; readonly notes: string; readonly reason: string; readonly nextAppointmentAt?: string }
  | { readonly type: "invalidate_contact"; readonly contactId: string; readonly expectedRevision: number; readonly expectedAppointmentVersion: number | null; readonly reason: string }
  | { readonly type: "reschedule_appointment"; readonly expectedAppointmentVersion: number; readonly scheduledAt: string; readonly reason: string }
  | { readonly type: "set_manual_color"; readonly color: ManualColor; readonly reason?: string }
);

/** Immutable accepted content; review evidence always belongs to this revision. */
export interface ContactRevision extends ContactEntry {
  readonly revisedByStaffId: string;
  readonly revisedAt: string;
  readonly reason: string | null;
  readonly changeKind: "initial" | "correction" | "invalidation";
  readonly operationId: string | null;
  readonly review: Review | null;
}

export interface ManualColorChange {
  readonly localPending?: boolean;
  readonly localTimestamp?: boolean;
  readonly id: string;
  readonly color: ManualColor;
  readonly setByStaffId: string;
  readonly setAt: string;
  readonly reason: string | null;
  readonly participantVersion: number;
}

export interface AppointmentChange {
  readonly localPending?: boolean;
  readonly localTimestamp?: boolean;
  readonly id: string;
  readonly appointmentId: string;
  readonly scheduledAt: string;
  readonly appointmentVersion: number;
  readonly mentorId: string;
  readonly sourceContactId: string | null;
  readonly requiresReview: boolean;
  readonly changedByStaffId: string;
  readonly changedAt: string;
  readonly reason: string | null;
  readonly changeKind: "prior_state" | "contact_recorded" | "contact_correction" | "contact_invalidation" | "rescheduled";
}

export interface ReviewEvent extends Review {
  readonly id: string;
  readonly participantId: string;
  /** Null only for the review projection captured by the migration. */
  readonly operationId: string | null;
}

export interface ContactHistory {
  readonly contactRevisions: readonly ContactRevision[];
  readonly manualColorHistory: readonly ManualColorChange[];
  readonly appointmentHistory: readonly AppointmentChange[];
  readonly reviewEvents: readonly ReviewEvent[];
  readonly contactWarnings: readonly "appointment_requires_review"[];
}
