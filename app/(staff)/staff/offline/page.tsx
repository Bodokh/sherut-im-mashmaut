import { OfflineWorkspace } from "@/components/staff/offline-workspace";

// An anonymous shell only: authorized data is loaded from the API or a valid
// account-scoped offline lease in WorkspaceProvider, never rendered into HTML.
export default function OfflinePage() {
  return <OfflineWorkspace />;
}
