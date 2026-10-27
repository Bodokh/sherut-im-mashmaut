import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";

/** Identity only. Staff membership and permissions are resolved in the repository. */
export async function getVerifiedIdentity(): Promise<{
  userId: string;
  verifiedEmail: string | null;
} | null> {
  const session = await auth();
  if (!session.isAuthenticated || session.sessionStatus !== "active") return null;

  const user = await currentUser();
  if (!user || user.id !== session.userId) return null;

  const primaryEmail = user.emailAddresses.find(
    (email) => email.id === user.primaryEmailAddressId,
  );

  return {
    userId: user.id,
    verifiedEmail:
      primaryEmail?.verification?.status === "verified"
        ? primaryEmail.emailAddress.trim().toLowerCase()
        : null,
  };
}
