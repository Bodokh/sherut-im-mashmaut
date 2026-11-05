"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import { AuthFrame } from "./auth-frame";
import { AuthError, authErrorMessage } from "./auth-controls";
import { Button } from "@/components/staff/ui/button";
import { staffPublicPath } from "@/lib/staff-host";
import { Spinner } from "@/components/staff/ui/spinner";

export function GoogleSignInCallback() {
  const clerk = useClerk();
  const started = useRef(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!clerk.loaded || started.current) return;
    started.current = true;
    // A preapproved staff email may not have a Clerk identity yet. Clerk handles
    // identity signup; server-side membership checks still decide staff access.
    void clerk.handleRedirectCallback({
      transferable: true,
      reloadResource: "signIn",
      signInUrl: staffPublicPath("/staff/login?google=unavailable"),
      signUpUrl: staffPublicPath("/staff/signup"),
      continueSignUpUrl: staffPublicPath("/staff/signup#/continue"),
      firstFactorUrl: staffPublicPath("/staff/login?google=verify-account"),
      secondFactorUrl: staffPublicPath("/staff/login?google=continue"),
      resetPasswordUrl: staffPublicPath("/staff/login?google=continue"),
      signInForceRedirectUrl: staffPublicPath("/staff"),
      signUpForceRedirectUrl: staffPublicPath("/staff"),
    }).catch((error: unknown) => setMessage(authErrorMessage(error)));
  }, [clerk, clerk.loaded]);

  return (
    <AuthFrame title="מתחברים עם Google" description="מאמתים את החשבון כדי להיכנס למרחב הליווי.">
      <div className="flex flex-col gap-5" role="status" aria-live="polite">
        {message ? <AuthError message={message} /> : <Spinner className="mx-auto size-6" aria-label="ממתינים לאימות עם Google" />}
        <Button variant="outline" nativeButton={false} render={<Link href={staffPublicPath("/staff/login")} />}>חזרה לכניסה</Button>
      </div>
    </AuthFrame>
  );
}
