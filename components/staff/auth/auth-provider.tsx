import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { heIL } from "@clerk/localizations";

const useDevelopmentProxy = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_") === true;

export function StaffAuthProvider({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider
      localization={heIL}
      dynamic={false}
      {...(useDevelopmentProxy ? { proxyUrl: "/__clerk" } : {})}
      signInUrl="/staff/login"
      signUpUrl="/staff/signup"
      signInForceRedirectUrl="/staff"
      signUpForceRedirectUrl="/staff"
      afterSignOutUrl="/staff/login"
    >
      {children}
    </ClerkProvider>
  );
}
