/** Operational defaults are provisional product choices, never provider credentials. */
export const DEFAULT_ORGANIZATION_POLICY = {
  offlineLeaseHours: 24,
  reminderAudience: "responsible_team",
  appointmentReminderMinutesBefore: 0,
  overdueRemindersEnabled: true,
  overdueRepeatHours: null,
} as const;

export interface OrganizationPolicy {
  readonly offlineLeaseHours: number;
  readonly reminderAudience: "responsible_team" | "all_staff";
  readonly appointmentReminderMinutesBefore: number;
  readonly overdueRemindersEnabled: boolean;
  readonly overdueRepeatHours: number | null;
}

export interface OrganizationSettings extends OrganizationPolicy {
  readonly organizationId: string;
  readonly version: number;
  readonly updatedAt: string;
  readonly updatedBy: string | null;
}

export function defaultOrganizationSettings(organizationId: string, now: string): OrganizationSettings {
  return { ...DEFAULT_ORGANIZATION_POLICY, organizationId, version: 1, updatedAt: now, updatedBy: null };
}

export interface MonthlyReviewHistory {
  readonly version: number;
  readonly summary: string;
  readonly reviewed: boolean;
  readonly updatedAt: string;
  readonly updatedBy: string;
  readonly updatedByName: string;
  readonly ceoProtected: boolean;
}

export interface MonthlyReview extends MonthlyReviewHistory {
  readonly id: string;
  readonly organizationId: string;
  readonly month: string;
  /** Null is the organization review; a staff ID is a coordinator's own team. */
  readonly scopeStaffId: string | null;
  readonly history: readonly MonthlyReviewHistory[];
}

export type OversightCommand =
  | {
      readonly type: "update_organization_settings";
      readonly operationId: string;
      readonly expectedVersion: number;
      readonly settings: OrganizationPolicy;
      readonly reason: string;
    }
  | {
      readonly type: "save_monthly_review";
      readonly operationId: string;
      readonly month: string;
      readonly scopeStaffId: string | null;
      readonly expectedVersion: number | null;
      readonly summary: string;
      readonly reviewed: boolean;
    };
