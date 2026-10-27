import { getVerifiedIdentity } from "@/lib/mentoring/server/auth";
import { executeCommand } from "@/lib/mentoring/server/commands";
import { serverFailure } from "@/lib/mentoring/server/db";
import { accountBindingFailure, privateFailure, privateHeaders, readCommandBody, unauthenticated } from "@/lib/mentoring/server/http";

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
    const result = await executeCommand(identity.userId, identity.verifiedEmail, body.value);
    return result.ok ? Response.json(result, { headers: privateHeaders }) : privateFailure(result);
  } catch (error) {
    return privateFailure(serverFailure(error));
  }
}
