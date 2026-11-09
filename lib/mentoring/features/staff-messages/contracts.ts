export interface SendStaffSmsCommand {
  readonly type: "send_staff_sms";
  readonly operationId: string;
  readonly message: string;
  readonly recipients: readonly { readonly staffId: string; readonly expectedVersion: number }[];
}

export type StaffSmsState = "pending" | "dispatching" | "provider_accepted" | "delivered" | "failed" | "uncertain" | "cancelled";
export type StaffSmsReason = "sender_ineligible" | "recipient_ineligible" | "provider_rejected" | "provider_outcome_unknown" | "lease_expired" | null;

export interface StaffSmsDeliveryView {
  readonly id: string;
  readonly recipientStaffIds: readonly string[];
  readonly recipientNames: readonly string[];
  readonly state: StaffSmsState;
  readonly reason: StaffSmsReason;
  readonly providerReference: string | null;
  readonly updatedAt: string;
}

export interface StaffSmsBatchView {
  readonly id: string;
  readonly message: string;
  readonly senderName: string;
  readonly createdAt: string;
  readonly recipientCount: number;
  readonly deliveries: readonly StaffSmsDeliveryView[];
}
