import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { heIL } from "@clerk/localizations";
import { clerkAuthorizedParties, staffPathsAtRoot, staffPublicPath } from "@/lib/staff-host";

const useDevelopmentProxy = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_") === true;
const staffAtRoot = staffPathsAtRoot(process.env);
const redirectOrigins = clerkAuthorizedParties(process.env);

export function StaffAuthProvider({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider
      localization={heIL}
      dynamic={false}
      {...(useDevelopmentProxy ? { proxyUrl: "/__clerk" } : {})}
      {...(redirectOrigins ? { allowedRedirectOrigins: redirectOrigins } : {})}
      signInUrl={staffPublicPath("/staff/login", staffAtRoot)}
      signUpUrl={staffPublicPath("/staff/signup", staffAtRoot)}
      signInForceRedirectUrl={staffPublicPath("/staff", staffAtRoot)}
      signUpForceRedirectUrl={staffPublicPath("/staff", staffAtRoot)}
      afterSignOutUrl={staffPublicPath("/staff/login", staffAtRoot)}
    >
      {children}
    </ClerkProvider>
  );
}
