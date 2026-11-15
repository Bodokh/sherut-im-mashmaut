import type { ManualColor } from "../../domain";

/** A tracking card (כרטיס מעקב) is a management document: one per mentee, one per mentor. */
export type TrackingSubjectKind = "mentee" | "mentor";
export type TrackingSubject =
  | { readonly kind: "mentee"; readonly participantId: string }
  | { readonly kind: "mentor"; readonly staffId: string };
export type TrackingMethod = "phone" | "in_person" | "message";
export type TrackingOutcome = "completed" | "no_answer";

export interface TrackingCardFields {
  readonly status: ManualColor | null;
  readonly notes: string;
  readonly nextFollowupAt: string | null;
}

export interface TrackingReportView {
  readonly id: string;
  readonly authorId: string;
  readonly authorName: string;
  readonly method: TrackingMethod;
  readonly outcome: TrackingOutcome;
  readonly occurredAt: string;
  readonly receivedAt: string;
  readonly notes: string;
}

export interface TrackingCardView extends TrackingCardFields {
  readonly kind: TrackingSubjectKind;
  /** The participant ID for a mentee card, or the mentor's staff ID for a mentor card. */
  readonly subjectId: string;
  /** Null until the card is first saved; reports can exist before that. */
  readonly version: number | null;
  readonly statusAt: string | null;
  readonly updatedAt: string | null;
  readonly updatedBy: string | null;
  readonly updatedByName: string | null;
  readonly reports: readonly TrackingReportView[];
}

export type TrackingCommand =
  | {
      readonly type: "save_tracking_card";
      readonly subject: TrackingSubject;
      readonly expectedCardVersion: number | null;
      readonly fields: TrackingCardFields;
    }
  | {
      readonly type: "record_tracking_report";
      readonly subject: TrackingSubject;
      readonly method: TrackingMethod;
      readonly outcome: TrackingOutcome;
      readonly occurredAt: string;
      readonly notes: string;
    };

export const TRACKING_COMMAND_TYPES = ["save_tracking_card", "record_tracking_report"] as const;
