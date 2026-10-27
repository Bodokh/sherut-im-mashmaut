import type { ReactNode } from "react";
import { MentoringShell } from "@/components/mentoring/shell";
import { WorkspaceProvider } from "@/lib/mentoring/workspace-client";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <WorkspaceProvider>
      <MentoringShell>{children}</MentoringShell>
    </WorkspaceProvider>
  );
}
