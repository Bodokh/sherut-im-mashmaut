import { after } from "next/server";
import { getVerifiedIdentity } from "@/lib/mentoring/server/auth";
import { executeCommand } from "@/lib/mentoring/server/commands";
import { serverFailure } from "@/lib/mentoring/server/db";
import { accountBindingFailure, privateFailure, privateHeaders, readCommandBody, unauthenticated } from "@/lib/mentoring/server/http";
import { dispatchStaffOnboardingEmails } from "@/lib/mentoring/server/staff-onboarding";
import { staffOnboardingSender } from "@/lib/mentoring/server/staff-onboarding-email";
import { runStaffSmsDispatcher } from "@/lib/mentoring/features/staff-messages/dispatcher";
import { ORGANIZATION_ID } from "@/lib/mentoring/server/db";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await readCommandBody(request);
    if (!body.ok) return privateFailure(body);
    const identity = await getVerifiedIdentity();
    if (!identity) return unauthenticated();
    const bindingFailure = accountBindingFailure(request, identity.userId);
    if (bindingFailure) return privateFailure(bindingFailure);
    // Keep the original payload for matching receipts written before phone
    // normalization; executeCommand validates all new operations itself.
    const result = await executeCommand(identity.userId, identity.verifiedEmail, body.value, identity.passwordEnabled);
    if (!result.ok) return privateFailure(result);

    const command = body.value;
    const dispatchOnboarding = command && typeof command === "object" && "type" in command
      && (command.type === "create_staff" || (command.type === "resend_staff_invite" && !result.replayed));
    if (result.staffId && dispatchOnboarding) {
      const send = staffOnboardingSender();
      const staffId = result.staffId;
      if (send) after(() => dispatchStaffOnboardingEmails(send, staffId).catch(() => {
        console.error("Staff onboarding email could not be processed after approval.");
      }));
    }
    if (result.staffSmsBatchId && command && typeof command === "object" && "type" in command && command.type === "send_staff_sms" && !result.replayed) {
      const batchId = result.staffSmsBatchId;
      after(() => runStaffSmsDispatcher({ organizationId: ORGANIZATION_ID, batchId, limit: 5, timeoutMs: 10_000 }).catch(() => {
        console.error("Staff SMS batch could not be processed after approval.");
      }));
    }
    return Response.json(result, { headers: privateHeaders });
  } catch (error) {
    return privateFailure(serverFailure(error));
  }
}
