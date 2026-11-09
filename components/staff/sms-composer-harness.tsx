"use client";

import { useState } from "react";
import { StaffSmsComposer } from "@/components/mentoring/staff-sms-composer";
import { Button } from "@/components/staff/ui/button";
import type { StaffProfile, WorkspaceSnapshot } from "@/lib/mentoring/contracts";

type ComposerProps = Parameters<typeof StaffSmsComposer>[0];
type SendCommand = Parameters<ComposerProps["submitOnline"]>[0];
type ActorMode = "ceo" | "inactive_ceo" | "coordinator" | "mentor";

const organizationId = "10000000-0000-4000-8000-000000000001";
function member(index: number, displayName: string, fields: Partial<StaffProfile> = {}): StaffProfile {
  return {
    id: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    organizationId, role: "mentor", active: true, version: 1,
    authUserId: `synthetic-sms-${index}`, displayName,
    email: `staff${index}@example.invalid`, phone: "+972501234567",
    coordinatorId: null, smsMuted: false, ...fields,
  };
}

const staff = [
  member(1, "מנכ״ל בדיקה", { role: "ceo" }),
  member(2, "רכזת בדיקה", { role: "coordinator", phone: "+972502345678" }),
  member(3, "חונכת בדיקה", { phone: "+972503456789" }),
  member(4, "מספר לא תקין", { phone: "123" }),
  member(5, "חונכת לא פעילה", { active: false }),
  member(6, "חונכת מקומית", { localPending: true }),
  member(7, "צוות מארגון אחר", { organizationId: "10000000-0000-4000-8000-000000000002" }),
] as const;

export function StaffSmsHarness() {
  const [mode, setMode] = useState<ActorMode>("ceo");
  const [isOnline, setOnline] = useState(true);
  const [commands, setCommands] = useState<readonly SendCommand[]>([]);
  const [refreshes, setRefreshes] = useState(0);
  const actor = { ...staff[0], role: mode === "inactive_ceo" ? "ceo" as const : mode, active: mode !== "inactive_ceo" };
  const snapshot: WorkspaceSnapshot = {
    actor, staff: [actor, ...staff.slice(1)], participants: [], conflicts: [],
    serverTime: "2026-11-09T12:00:00Z", offlineValidUntil: "2026-11-10T12:00:00Z",
    capabilities: { smsConfigured: true, smsSendingEnabled: true },
  };

  const submitOnline: ComposerProps["submitOnline"] = async (command) => {
    setCommands((previous) => [...previous, command]);
    return { ok: true, operationId: command.operationId, replayed: false, acceptance: "accepted", staffSmsBatchId: command.operationId };
  };

  return (
    <main className="mx-auto min-h-dvh max-w-5xl space-y-6 bg-background p-5 text-foreground">
      <header className="space-y-3 rounded-xl border p-4">
        <h1 className="text-xl font-semibold">בדיקת הודעות צוות — נתונים מדומים בלבד</h1>
        <p className="text-sm">אין חיבור לשרת או לספק SMS. אישור השליחה מתועד בעמוד הזה בלבד.</p>
        <div className="flex flex-wrap gap-2" aria-label="תפקיד הבדיקה">
          {([ ["ceo", "מנכ״ל פעיל"], ["inactive_ceo", "מנכ״ל לא פעיל"], ["coordinator", "רכזת"], ["mentor", "חונכת"] ] as const).map(([value, label]) => (
            <Button key={value} type="button" variant={mode === value ? "default" : "outline"} onClick={() => setMode(value)}>{label}</Button>
          ))}
          <Button type="button" variant="outline" onClick={() => setOnline((value) => !value)}>{isOnline ? "מעבר למצב לא מקוון" : "חזרה למצב מקוון"}</Button>
        </div>
        <p role="status">מספר בקשות מדומות: {commands.length}. מספר רענונים: {refreshes}.</p>
      </header>
      <StaffSmsComposer snapshot={snapshot} isOnline={isOnline} submitOnline={submitOnline} refresh={async () => setRefreshes((value) => value + 1)} />
      <pre data-testid="recorded-sms-commands" dir="ltr" className="overflow-auto whitespace-pre-wrap break-all rounded-xl border p-3 text-xs">{JSON.stringify(commands, null, 2)}</pre>
    </main>
  );
}
