import { getVerifiedIdentity } from "@/lib/mentoring/server/auth";
import { getWorkspace } from "@/lib/mentoring/server/repository";
import { serverFailure } from "@/lib/mentoring/server/db";
import { privateFailure, privateHeaders, unauthenticated } from "@/lib/mentoring/server/http";

export async function GET() {
  try {
    const identity = await getVerifiedIdentity();
    if (!identity) return unauthenticated();
    const snapshot = await getWorkspace(identity.userId, identity.verifiedEmail);
    return Response.json(snapshot, { headers: privateHeaders });
  } catch (error) {
    return privateFailure(serverFailure(error));
  }
}
