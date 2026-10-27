import type {
  Assignment,
  Appointment,
  CeoProtection,
  ContactEntry,
  ContactMethod,
  ContactOutcome,
  ManualColor,
  Participant,
  Review,
  ServiceType,
  StaffMember,
  ParticipantAction,
} from "./domain";
import type { ContactCommand, ContactHistory } from "./features/contacts/contracts";
import type { AuthorityCommand, AuthorityExtras, ParticipantDeletionState } from "./features/authority/contracts";
import type { OversightCommand, OrganizationSettings, MonthlyReview } from "./features/oversight/contracts";
import type { ReminderCommand, ReminderJobView, ReminderReadiness } from "./features/reminders/contracts";

export interface StaffProfile extends StaffMember {
  readonly localPending?: boolean;
  readonly authUserId: string;
  readonly displayName: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly coordinatorId: string | null;
  readonly smsMuted: boolean;
}

export interface ParticipantProfile extends Participant, Partial<ParticipantDeletionState> {
  readonly localPending?: boolean;
  readonly createdBy?: string;
  readonly localCreatedByStaffId?: string;
  readonly servicePlace: string | null;
  readonly serviceRole: string | null;
  readonly profileNotes: string | null;
  readonly createdAt: string;
}

export interface ParticipantView extends Partial<ContactHistory>, Partial<AuthorityExtras> {
  readonly acceptedNextAppointment?: Appointment | null;
  readonly acceptedAssignment?: Assignment | null;
  readonly allowedActions?: readonly ParticipantAction[];
  readonly participant: ParticipantProfile;
  readonly assignment: Assignment | null;
  readonly nextAppointment: Appointment | null;
  readonly manualColor: ManualColor | null;
  readonly manualColorAt: string | null;
  readonly contacts: readonly ContactEntry[];
  readonly reviews: readonly Review[];
  readonly protections: readonly CeoProtection[];
}

export interface ConflictView {
  readonly id: string;
  readonly participantId: string;
  readonly participantName: string;
  readonly authorName: string;
  readonly authoritativeValue: string;
  readonly submittedValue: string;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
}

export interface WorkspaceSnapshot {
  readonly actor: StaffProfile;
  readonly staff: readonly StaffProfile[];
  readonly participants: readonly ParticipantView[];
  readonly conflicts: readonly ConflictView[];
  readonly serverTime: string;
  readonly offlineValidUntil: string;
  readonly settings?: OrganizationSettings;
  readonly monthlyReviews?: readonly MonthlyReview[];
  readonly reminders?: readonly ReminderJobView[];
  readonly reminderReadiness?: ReminderReadiness;
  readonly capabilities: {
    readonly smsConfigured: boolean;
    readonly smsSendingEnabled: boolean;
  };
}

export interface ParticipantFields {
  readonly displayName?: string;
  readonly phone?: string | null;
  readonly serviceType?: ServiceType | null;
  readonly servicePlace?: string | null;
  readonly serviceRole?: string | null;
  readonly profileNotes?: string | null;
}

interface Operation {
  readonly operationId: string;
}

export interface NewStaffFields {
  readonly displayName: string;
  readonly email: string;
  readonly phone: string | null;
  readonly role: "mentor" | "coordinator";
  readonly coordinatorId: string | null;
}

export type MentoringCommand = Operation & (
  | ContactCommand
  | AuthorityCommand
  | OversightCommand
  | ReminderCommand
  | { readonly type: "create_staff"; readonly fields: NewStaffFields }
  | { readonly type: "set_staff_active"; readonly staffId: string; readonly expectedVersion: number; readonly active: boolean }
  | { readonly type: "create_participant"; readonly fields: ParticipantFields }
  | { readonly type: "update_participant"; readonly participantId: string; readonly expectedVersion: number; readonly fields: ParticipantFields }
  | { readonly type: "assign_participant"; readonly participantId: string; readonly expectedVersion: number; readonly mentorId: string; readonly coordinatorId: string | null }
  | {
      readonly type: "record_contact";
      readonly participantId: string;
      readonly expectedVersion: number;
      readonly expectedAppointmentVersion: number | null;
      readonly method: ContactMethod;
      readonly outcome: ContactOutcome;
      readonly occurredAt: string;
      readonly notes: string;
      readonly manualColor?: ManualColor;
      readonly nextAppointmentAt?: string;
    }
  | { readonly type: "review_contact"; readonly participantId: string; readonly contactId: string; readonly revision: number; readonly decision: Review["decision"] }
  | { readonly type: "set_sms_muted"; readonly muted: boolean }
  | { readonly type: "resolve_conflict"; readonly conflictId: string; readonly decision: "keep_ceo" }
);

export type ApiErrorCode =
  | "not_authenticated"
  | "not_staff"
  | "not_configured"
  | "forbidden"
  | "not_found"
  | "validation"
  | "conflict"
  | "ceo_protected"
  | "unavailable";

export interface ApiFailure {
  readonly ok: false;
  readonly error: {
    readonly code: ApiErrorCode;
    readonly message: string;
    readonly field?: string;
    readonly conflictId?: string;
  };
}

export interface CommandSuccess {
  readonly ok: true;
  readonly operationId: string;
  readonly replayed: boolean;
  readonly acceptance: "queued" | "accepted";
  readonly participantId?: string;
  readonly staffId?: string;
  readonly reminderScan?: { readonly scanned: number; readonly planned: number; readonly nextCursor: string | null };
}

export type CommandResult = CommandSuccess | ApiFailure;
