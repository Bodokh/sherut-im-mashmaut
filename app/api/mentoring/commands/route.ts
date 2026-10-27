import { getVerifiedIdentity } from "@/lib/mentoring/server/auth";
import { executeCommand } from "@/lib/mentoring/server/commands";
import { serverFailure } from "@/lib/mentoring/server/db";
import { parseCommand } from "@/lib/mentoring/server/validation";
import { accountBindingFailure, privateFailure, privateHeaders, readCommandBody, unauthenticated } from "@/lib/mentoring/server/http";

export async function POST(request: Request) {
  try {
    const body = await readCommandBody(request);
    if (!body.ok) return privateFailure(body);
    const identity = await getVerifiedIdentity();
    if (!identity) return unauthenticated();
    const bindingFailure = accountBindingFailure(request, identity.userId);
    if (bindingFailure) return privateFailure(bindingFailure);
    const parsed = parseCommand(body.value);
    if (!parsed.ok) return privateFailure(parsed);
    const result = await executeCommand(identity.userId, identity.verifiedEmail, parsed.command);
    return result.ok ? Response.json(result, { headers: privateHeaders }) : privateFailure(result);
  } catch (error) {
    return privateFailure(serverFailure(error));
  }
}
