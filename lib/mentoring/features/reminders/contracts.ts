export const REMINDER_STATES = ["pending", "dispatching", "provider_accepted", "delivered", "failed", "uncertain", "cancelled", "blocked"] as const;
export type ReminderState = (typeof REMINDER_STATES)[number];
export type ReminderKind = "appointment" | "seven_day_overdue";
export type ReminderReason = "missing_sms_provider" | "missing_sms_credentials" | "sending_disabled" | "invalid_staff_phone" | "superseded" | "recipient_ineligible" | "provider_rejected" | "provider_outcome_unknown" | "lease_expired" | null;

export interface ReminderAttempt {
  readonly id: string;
  readonly attemptNumber: number;
  readonly state: ReminderState;
  readonly claimedAt: string;
  readonly finishedAt: string | null;
  readonly leaseExpiresAt: string;
  readonly provider: string;
  readonly providerReference: string | null;
  readonly reason: ReminderReason;
}

export interface ReminderJobView {
  readonly id: string;
  readonly participantId: string;
  readonly participantName: string;
  readonly recipientStaffId: string;
  readonly recipientName: string;
  readonly kind: ReminderKind;
  readonly scheduledAt: string;
  readonly referenceAt: string;
  readonly state: ReminderState;
  readonly reason: ReminderReason;
  readonly updatedAt: string;
  readonly attempts: readonly ReminderAttempt[];
}

export interface ReminderReadiness {
  readonly smsProviderConfigured: boolean;
  readonly smsCredentialsConfigured: boolean;
  readonly smsSendingEnabled: boolean;
  readonly hostedSchedulerConfigured: boolean;
  readonly evaluationMode: "manual_and_cli";
  readonly blockedReasons: readonly ("missing_sms_provider" | "missing_sms_credentials" | "sending_disabled" | "hosted_scheduler_not_configured")[];
  readonly audience: "responsible_team" | "all_staff";
  readonly appointmentReminderMinutesBefore: number;
  readonly overdueRemindersEnabled: boolean;
  readonly overdueRepeatHours: number | null;
  readonly diagnosticsTruncated: boolean;
}

export interface ReminderCommand {
  readonly type: "evaluate_reminders";
  readonly operationId: string;
  readonly afterParticipantId?: string | null;
}
