import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { heIL } from "@clerk/localizations";

export function StaffAuthProvider({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider
      localization={heIL}
      dynamic={false}
      proxyUrl="/__clerk"
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
