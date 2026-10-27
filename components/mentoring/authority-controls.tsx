"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArchiveRestoreIcon,
  LoaderCircleIcon,
  LockKeyholeIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/staff/ui/alert";
import { Badge } from "@/components/staff/ui/badge";
import { Button } from "@/components/staff/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/staff/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/staff/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/staff/ui/field";
import { Input } from "@/components/staff/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/staff/ui/select";
import { Textarea } from "@/components/staff/ui/textarea";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/staff/ui/toggle-group";
import type {
  ParticipantView,
  WorkspaceSnapshot,
} from "@/lib/mentoring/contracts";
import type { GrantView } from "@/lib/mentoring/features/authority/contracts";
import { useWorkspace } from "@/lib/mentoring/workspace-client";
import { AccessDenied, InlineError, SectionEmpty } from "./common";
import { DraftRecovery } from "./draft-recovery";
import { DraftStatus, useFormDraft } from "./form-draft";
import { formatDateTime, fromDateTimeInput, toDateTimeInput } from "./format";
import { RecoveredDraft } from "./recovered-draft";
import {
  authorityPendingState,
  authorityScopeComparison,
  buildAuthorityIntent,
  contactProtectionFields,
  grantActionNames,
  lifecycleNames,
  normalizeGrantActions,
  participantProtectionFields,
  type AuthorityDraft,
  type AuthorityMode,
} from "./authority-ui-state";

const titles: Record<AuthorityMode, string> = {
  lifecycle: "שינוי מצב הליווי",
  grant: "הרשאה אישית לכרטיס",
  protection: "הגנת מנכ״ל על רשומה",
  delete: "העברת כרטיס לסל המחזור",
  restore: "שחזור כרטיס מסל המחזור",
};
const savedMessages: Record<AuthorityMode, string> = {
  lifecycle: "מצב הליווי עודכן",
  grant: "ההרשאה עודכנה",
  protection: "הגנת הרשומה עודכנה",
  delete: "הכרטיס הועבר לסל המחזור",
  restore: "הכרטיס שוחזר",
};

/** Administrative controls only appear for the accepted snapshot's active CEO. */
export function ParticipantAuthorityControls({
  view,
}: {
  view: ParticipantView;
}) {
  const { snapshot } = useWorkspace();
  if (!snapshot || !snapshot.actor.active || snapshot.actor.role !== "ceo")
    return null;
  const pending = authorityPendingState(view.participant);
  if (view.participant.deletedAt)
    return pending.deletionPending ? (
      <Alert>
        <LoaderCircleIcon />
        <AlertTitle>בקשת ההעברה לסל המחזור ממתינה לאישור</AlertTitle>
        <AlertDescription>
          הבקשה שמורה במכשיר ותיבדק כשהחיבור יתחדש. אפשר יהיה לשחזר את
          הכרטיס לאחר שהמערכת תאשר את ההעברה לסל.
        </AlertDescription>
      </Alert>
    ) : (
      <AuthorityDialog view={view} mode="restore" />
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle>ניהול הכרטיס והרשאות</CardTitle>
        <CardDescription>
          כל שינוי כולל סיבה ונבדק מול הגרסה העדכנית של הכרטיס במערכת.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {pending.pending && <Alert><LoaderCircleIcon /><AlertTitle>בכרטיס יש שינוי שממתין לאישור המערכת</AlertTitle><AlertDescription>מוצגת גרסת העבודה המקומית. השינוי ייבדק מול המידע וההרשאות במערכת כשהחיבור יתחדש.</AlertDescription></Alert>}
        <div className="flex flex-wrap gap-2">
          <AuthorityDialog view={view} mode="lifecycle" />
          <AuthorityDialog view={view} mode="grant" />
          <AuthorityDialog view={view} mode="protection" />
          <AuthorityDialog view={view} mode="delete" disabled={!pending.canDelete} />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">הרשאות אישיות לכרטיס</p>
          {(view.accessGrants ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              אין הרשאות אישיות נוספות. האחריות לפי השיוך נשארת בתוקף.
            </p>
          ) : (
            (view.accessGrants ?? []).map((grant) => (
              <GrantSummary
                key={grant.id}
                view={view}
                grant={grant}
                snapshot={snapshot}
              />
            ))
          )}
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">הגנות רשומות</p>
          {(view.protectionStates ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              לא הוגדרו הגנות מנכ״ל מפורשות.
            </p>
          ) : (
            (view.protectionStates ?? []).map((protection) => {
              const labels =
                protection.resourceId === view.participant.id
                  ? participantProtectionFields
                  : contactProtectionFields;
              const resource =
                protection.resourceId === view.participant.id
                  ? "כרטיס החניכה"
                  : `תיעוד קשר מ־${formatDateTime(view.contacts.find((contact) => contact.id === protection.resourceId)?.occurredAt)}`;
              return (
                <div
                  key={protection.resourceId}
                  className="flex flex-col gap-1 rounded-lg border p-3 text-sm"
                >
                  <p className="font-medium">
                    {resource} · {protection.active ? "מוגן" : "ההגנה הוסרה"} ·
                    {pending.pending ? "גרסת עבודה מקומית" : "גרסה"} {protection.version}
                  </p>
                  <p>
                    {protection.active
                      ? protection.fieldPaths?.length
                        ? protection.fieldPaths
                            .map(
                              (path) =>
                                labels[path as keyof typeof labels] ?? path,
                            )
                            .join(" · ")
                        : "כל הרשומה מוגנת"
                      : `הוסרה ב־${formatDateTime(protection.unlockedAt)}`}
                  </p>
                  <p className="text-muted-foreground">
                    {snapshot.staff.find(
                      (staff) =>
                        staff.id ===
                        (protection.active
                          ? protection.protectedByStaffId
                          : protection.unlockedByStaffId),
                    )?.displayName ?? "חבר/ת צוות"}{" "}
                    · {formatDateTime(protection.updatedAt)}
                  </p>
                  {protection.reason && (
                    <p className="whitespace-pre-wrap break-words">
                      {protection.reason}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function GrantSummary({
  view,
  grant,
  snapshot,
}: {
  view: ParticipantView;
  grant: GrantView;
  snapshot: WorkspaceSnapshot;
}) {
  const expired =
    grant.expiresAt != null &&
    Date.parse(grant.expiresAt) <= Date.parse(snapshot.serverTime);
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1 text-sm">
        <p className="font-medium">
          {snapshot.staff.find((staff) => staff.id === grant.staffId)
            ?.displayName ?? "חבר/ת צוות"}{" "}
          <Badge variant="outline">
            {!grant.active ? "בוטלה" : expired ? "פג תוקף" : "בתוקף"}
          </Badge>
        </p>
        <p>
          {grant.actions
            .filter((action) => action !== "delete")
            .map(
              (action) =>
                grantActionNames[action as keyof typeof grantActionNames],
            )
            .join(" · ") || "ללא הרשאות"}{" "}
          · {view.participant.localPending ? "גרסת עבודה מקומית" : "גרסה"} {grant.version}
        </p>
        <p className="text-muted-foreground">
          {grant.expiresAt
            ? `עד ${formatDateTime(grant.expiresAt)}`
            : "ללא מועד תפוגה"}
        </p>
        {grant.reason && (
          <p className="whitespace-pre-wrap break-words">{grant.reason}</p>
        )}
      </div>
      <AuthorityDialog view={view} mode="grant" grant={grant} />
    </div>
  );
}

function AuthorityDialog({
  view,
  mode,
  grant,
  disabled = false,
}: {
  view: ParticipantView;
  mode: AuthorityMode;
  grant?: GrantView;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const Icon =
    mode === "delete"
      ? Trash2Icon
      : mode === "restore"
        ? ArchiveRestoreIcon
        : mode === "protection"
          ? LockKeyholeIcon
          : ShieldCheckIcon;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) setOpen(next);
      }}
    >
      <DialogTrigger
        disabled={disabled}
        render={
          <Button variant={mode === "delete" ? "destructive" : "outline"} />
        }
      >
        <Icon data-icon="inline-start" />
        {grant ? "שינוי או ביטול הרשאה" : titles[mode]}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{titles[mode]}</DialogTitle>
          <DialogDescription>
            {mode === "delete"
              ? "הכרטיס יעבור לסל המחזור, וההיסטוריה תישמר לשחזור. הפעולה תיכנס לתוקף לאחר אישור המערכת."
              : mode === "restore"
                ? "השחזור יחזיר את מצב הליווי שהיה לפני המחיקה. ההיסטוריה והשִיוך נשמרים."
                : "הטיוטה נשמרת במכשיר. הרשאות והגנות משתנות רק אחרי שהמערכת מאשרת את הפעולה."}
          </DialogDescription>
        </DialogHeader>
        <AuthorityForm
          view={view}
          mode={mode}
          grant={grant}
          onClose={() => setOpen(false)}
          onBusyChange={setBusy}
        />
      </DialogContent>
    </Dialog>
  );
}

function AuthorityForm({
  view,
  mode,
  grant,
  onClose,
  onBusyChange,
}: {
  view: ParticipantView;
  mode: AuthorityMode;
  grant?: GrantView;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const { snapshot, submit } = useWorkspace();
  const initialProtection = view.protectionStates?.find(
    (protection) => protection.resourceId === view.participant.id,
  );
  const draft = useFormDraft<AuthorityDraft>(
    `authority:${mode}:${view.participant.id}:${grant?.staffId ?? "new"}`,
    {
      baseVersion: view.participant.version,
      baseTargetVersion:
        mode === "grant"
          ? (grant?.version ?? null)
          : mode === "protection"
            ? (initialProtection?.version ?? null)
            : null,
      reason: "",
      lifecycle: view.participant.lifecycle,
      staffId: grant?.staffId ?? "",
      grantAction: "set",
      actions: normalizeGrantActions(grant?.actions ?? []),
      expiresAtLocal: grant?.expiresAt ? toDateTimeInput(grant.expiresAt) : "",
      resourceId: view.participant.id,
      protectionMode:
        initialProtection?.active && initialProtection.fieldPaths?.length
          ? "fields"
          : "whole",
      fieldPaths: [...(initialProtection?.fieldPaths ?? [])],
    },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const values = draft.value;
  if (!snapshot || !snapshot.actor.active || snapshot.actor.role !== "ceo")
    return <AccessDenied />;
  const staff = snapshot.staff.find((entry) => entry.id === values.staffId);
  const currentGrant = view.accessGrants?.find(
    (entry) => entry.staffId === values.staffId,
  );
  const currentProtection = view.protectionStates?.find(
    (entry) => entry.resourceId === values.resourceId,
  );
  const targetVersion =
    mode === "grant"
      ? (currentGrant?.version ?? null)
      : mode === "protection"
        ? (currentProtection?.version ?? null)
        : null;
  const stale =
    draft.hydrated &&
    (values.baseVersion !== view.participant.version ||
      ((mode === "grant" || mode === "protection") &&
        values.baseTargetVersion !== targetVersion));
  const disabled = busy || !draft.hydrated;
  const authorityPending = authorityPendingState(view.participant);
  const protectionFields =
    values.resourceId === view.participant.id
      ? participantProtectionFields
      : contactProtectionFields;
  function update(patch: Partial<AuthorityDraft>) {
    draft.update({ ...values, ...patch });
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || stale) return;
    if ((mode === "restore" && !authorityPending.canRestore) || (mode === "delete" && !authorityPending.canDelete)) { setError("יש להמתין לאישור השינוי הקודם בכרטיס לפני פעולה זו."); return; }
    let expirationIso: string | null = null;
    if (mode === "grant" && values.grantAction === "set") {
      if (!staff?.active) {
        setError("יש לבחור חבר/ת צוות עם גישה פעילה מהארגון.");
        return;
      }
      if (staff.role === "mentor" && values.actions.includes("approve")) {
        setError("הרשאת אישור זמינה לרכז/ת בלבד.");
        return;
      }
      if (values.expiresAtLocal) {
        expirationIso = fromDateTimeInput(values.expiresAtLocal);
        if (
          !expirationIso ||
          Date.parse(expirationIso) <= Date.parse(snapshot!.serverTime)
        ) {
          setError("יש להזין מועד תפוגה תקין בעתיד, לפי שעון ישראל.");
          return;
        }
      }
    }
    setBusy(true);
    onBusyChange(true);
    setError(null);
    let submissionStarted = false;
    try {
      const payload = buildAuthorityIntent(
        mode,
        view.participant.id,
        values,
        expirationIso,
      );
      const operationId = await draft.prepare(payload);
      submissionStarted = true;
      const result = await submit({ ...payload, operationId });
      if (!result.ok) {
        setError(result.error.message);
        draft.recheck();
        return;
      }
      try {
        await draft.clear();
      } catch {
        toast.warning(
          "הפעולה נשמרה, אך הטיוטה נשארה במכשיר. פתיחה חוזרת תבדוק את אותה פעולת שמירה.",
        );
      }
      toast.success(
        result.acceptance === "queued"
          ? "הפעולה שמורה במכשיר וממתינה לאישור המערכת עם חידוש החיבור"
          : savedMessages[mode],
      );
      onClose();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "לא ניתן לשמור כרגע. הטיוטה נשארה במכשיר.",
      );
      // The server may have accepted the action before its response was lost.
      // Reconcile the persisted intent before allowing edits or a new identity.
      if (submissionStarted) draft.recheck();
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  if (draft.recovered)
    return (
      <RecoveredDraft
        result={draft.recovered}
        onClear={draft.clear}
        participantId={view.participant.id}
        onClose={onClose}
      >
        <p>{titles[mode]}</p>
        <p className="whitespace-pre-wrap break-words">{values.reason}</p>
      </RecoveredDraft>
    );
  return (
    <form onSubmit={save} className="flex flex-col gap-5">
      <InlineError message={error} />
      {stale && (
        <DraftRecovery
          rows={[
            {
              label: "גרסת הכרטיס",
              current: String(view.participant.version),
              draft: String(values.baseVersion),
            },
            ...(mode === "grant" || mode === "protection"
              ? [
                  {
                    label: "גרסת ההרשאה או ההגנה",
                    current: String(targetVersion ?? "טרם הוגדרה"),
                    draft: String(values.baseTargetVersion ?? "טרם הוגדרה"),
                  },
                ]
              : []),
            ...authorityScopeComparison(mode, values, {
              staffName: staff?.displayName ?? "שם לא זמין ברשימת הצוות",
              grantActive: currentGrant?.active ?? false,
              grantActions: currentGrant?.actions ?? [],
              grantExpiry: currentGrant?.expiresAt
                ? formatDateTime(currentGrant.expiresAt)
                : "ללא מועד תפוגה",
              draftExpiry: values.expiresAtLocal
                ? formatDateTime(fromDateTimeInput(values.expiresAtLocal))
                : "ללא מועד תפוגה",
              resourceName:
                values.resourceId === view.participant.id
                  ? "כרטיס החניכה"
                  : `תיעוד קשר מ־${formatDateTime(view.contacts.find((contact) => contact.id === values.resourceId)?.occurredAt)}`,
              protectionActive: currentProtection?.active ?? false,
              protectionFields: currentProtection?.fieldPaths ?? null,
              fieldLabels: protectionFields,
            }),
            {
              label: "מצב הליווי",
              current: lifecycleNames[view.participant.lifecycle],
              draft:
                mode === "lifecycle"
                  ? lifecycleNames[values.lifecycle]
                  : "ללא שינוי בפעולה הזו",
            },
            {
              label: "סיבה לפעולה",
              current:
                mode === "grant"
                  ? (currentGrant?.reason ?? "")
                  : mode === "protection"
                    ? (currentProtection?.reason ?? "")
                    : "",
              draft: values.reason,
            },
          ]}
          onRebase={() => {
            update({
              baseVersion: view.participant.version,
              baseTargetVersion: targetVersion,
            });
            setError(null);
          }}
        />
      )}
      <fieldset disabled={disabled} className="min-w-0 border-0 p-0">
        <FieldGroup>
          {mode === "lifecycle" && (
            <Field>
              <FieldLabel id="authority-lifecycle-label">מצב הליווי</FieldLabel>
              <ToggleGroup
                aria-labelledby="authority-lifecycle-label"
                variant="outline"
                value={[values.lifecycle]}
                onValueChange={(selection) => {
                  const lifecycle = selection[0];
                  if (
                    lifecycle === "active" ||
                    lifecycle === "paused" ||
                    lifecycle === "closed"
                  )
                    update({ lifecycle });
                }}
                className="flex-wrap"
              >
                {Object.entries(lifecycleNames).map(([value, label]) => (
                  <ToggleGroupItem key={value} value={value}>
                    {label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <FieldDescription>
                השהיה או סגירה עוצרות תזכורות שטרם נשלחו. תיעוד הקשר נשמר.
              </FieldDescription>
            </Field>
          )}
          {mode === "grant" && (
            <>
              <Field>
                <FieldLabel htmlFor="authority-staff">חבר/ת צוות</FieldLabel>
                <Select
                  items={Object.fromEntries(
                    snapshot.staff.map((entry) => [
                      entry.id,
                      entry.displayName,
                    ]),
                  )}
                  disabled={disabled || Boolean(grant)}
                  value={values.staffId || null}
                  onValueChange={(id) => {
                    const selected = view.accessGrants?.find(
                      (entry) => entry.staffId === id,
                    );
                    update({
                      staffId: id ?? "",
                      baseTargetVersion: selected?.version ?? null,
                      actions: normalizeGrantActions(selected?.actions ?? []),
                      expiresAtLocal: selected?.expiresAt
                        ? toDateTimeInput(selected.expiresAt)
                        : "",
                    });
                  }}
                >
                  <SelectTrigger id="authority-staff" className="w-full">
                    <SelectValue placeholder="בחירת חבר/ת צוות" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {snapshot.staff
                        .filter(
                          (entry) =>
                            entry.active || entry.id === grant?.staffId,
                        )
                        .map((entry) => (
                          <SelectItem key={entry.id} value={entry.id}>
                            {entry.displayName}
                            {!entry.active ? " · חשבון מושבת" : ""}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel id="authority-grant-mode-label">פעולה</FieldLabel>
                <ToggleGroup
                  aria-labelledby="authority-grant-mode-label"
                  variant="outline"
                  value={[values.grantAction]}
                  onValueChange={(selection) => {
                    const grantAction = selection[0];
                    if (grantAction === "set" || grantAction === "revoke")
                      update({ grantAction });
                  }}
                >
                  <ToggleGroupItem value="set">הגדרת הרשאה</ToggleGroupItem>
                  <ToggleGroupItem
                    value="revoke"
                    disabled={!currentGrant?.active}
                  >
                    ביטול הרשאה
                  </ToggleGroupItem>
                </ToggleGroup>
              </Field>
              {values.grantAction === "set" && (
                <>
                  <FieldSet>
                    <FieldLegend variant="label">הרשאות מותרות</FieldLegend>
                    <ToggleGroup
                      multiple
                      variant="outline"
                      value={values.actions}
                      onValueChange={(selection) =>
                        update({ actions: normalizeGrantActions(selection) })
                      }
                      aria-label="בחירת הרשאות"
                      className="flex-wrap"
                    >
                      {Object.entries(grantActionNames).map(
                        ([value, label]) => (
                          <ToggleGroupItem
                            key={value}
                            value={value}
                            disabled={
                              disabled ||
                              (value === "approve" && staff?.role === "mentor")
                            }
                          >
                            {label}
                          </ToggleGroupItem>
                        ),
                      )}
                    </ToggleGroup>
                    <FieldDescription>
                      עריכה ואישור כוללים גם צפייה. ההרשאה אינה מחליפה שיוך
                      לחונך/ת.
                    </FieldDescription>
                  </FieldSet>
                  <Field>
                    <FieldLabel htmlFor="authority-expiration">
                      מועד תפוגה לפי שעון ישראל
                    </FieldLabel>
                    <Input
                      id="authority-expiration"
                      dir="ltr"
                      type="datetime-local"
                      value={values.expiresAtLocal}
                      onChange={(event) =>
                        update({ expiresAtLocal: event.target.value })
                      }
                    />
                    <FieldDescription>
                      אפשר להשאיר ריק להרשאה ללא מועד תפוגה.
                    </FieldDescription>
                  </Field>
                </>
              )}
              <p className="text-sm text-muted-foreground">
                {authorityPending.pending ? "גרסת עבודה מקומית של ההרשאה" : "גרסת ההרשאה"}: {values.baseTargetVersion ?? "הרשאה חדשה"}
              </p>
            </>
          )}
          {mode === "protection" && (
            <>
              <Field>
                <FieldLabel htmlFor="authority-resource">
                  הרשומה המוגנת
                </FieldLabel>
                <Select
                  items={{
                    [view.participant.id]: "כרטיס החניכה",
                    ...Object.fromEntries(
                      view.contacts.map((contact) => [
                        contact.id,
                        `תיעוד קשר מ־${formatDateTime(contact.occurredAt)}`,
                      ]),
                    ),
                  }}
                  disabled={disabled}
                  value={values.resourceId}
                  onValueChange={(resourceId) => {
                    const selected = view.protectionStates?.find(
                      (entry) => entry.resourceId === resourceId,
                    );
                    update({
                      resourceId: resourceId ?? view.participant.id,
                      baseTargetVersion: selected?.version ?? null,
                      protectionMode:
                        selected?.active && selected.fieldPaths?.length
                          ? "fields"
                          : "whole",
                      fieldPaths: [...(selected?.fieldPaths ?? [])],
                    });
                  }}
                >
                  <SelectTrigger id="authority-resource" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value={view.participant.id}>
                        כרטיס החניכה
                      </SelectItem>
                      {view.contacts
                        .filter((contact) => !contact.localPending)
                        .map((contact) => (
                          <SelectItem key={contact.id} value={contact.id}>
                            תיעוד קשר מ־{formatDateTime(contact.occurredAt)}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel id="authority-protection-mode-label">
                  תחום ההגנה
                </FieldLabel>
                <ToggleGroup
                  aria-labelledby="authority-protection-mode-label"
                  variant="outline"
                  value={[values.protectionMode]}
                  onValueChange={(selection) => {
                    const protectionMode = selection[0];
                    if (
                      protectionMode === "whole" ||
                      protectionMode === "fields" ||
                      protectionMode === "unlock"
                    )
                      update({ protectionMode });
                  }}
                  className="flex-wrap"
                >
                  <ToggleGroupItem value="whole">כל הרשומה</ToggleGroupItem>
                  <ToggleGroupItem value="fields">שדות נבחרים</ToggleGroupItem>
                  <ToggleGroupItem
                    value="unlock"
                    disabled={!currentProtection?.active}
                  >
                    הסרת הגנה
                  </ToggleGroupItem>
                </ToggleGroup>
              </Field>
              {values.protectionMode === "fields" && (
                <FieldSet>
                  <FieldLegend variant="label">שדות מוגנים</FieldLegend>
                  <ToggleGroup
                    multiple
                    variant="outline"
                    value={values.fieldPaths}
                    onValueChange={(fieldPaths) => update({ fieldPaths })}
                    aria-label="בחירת שדות מוגנים"
                    className="flex-wrap"
                  >
                    {Object.entries(protectionFields).map(([value, label]) => (
                      <ToggleGroupItem key={value} value={value}>
                        {label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </FieldSet>
              )}
              {values.protectionMode === "unlock" && (
                <Alert>
                  <LockKeyholeIcon />
                  <AlertTitle>הסרה מפורשת של הגנה</AlertTitle>
                  <AlertDescription>
                    רק ההגנה על הרשומה שנבחרה תוסר. יש לפרט את הסיבה להסרה.
                  </AlertDescription>
                </Alert>
              )}
              <p className="text-sm text-muted-foreground">
                {authorityPending.pending ? "גרסת עבודה מקומית של ההגנה" : "גרסת ההגנה"}: {values.baseTargetVersion ?? "הגנה חדשה"}
              </p>
            </>
          )}
          {mode === "restore" && (
            <p className="text-sm">
              מצב הליווי לאחר שחזור:{" "}
              {
                lifecycleNames[
                  view.participant.deletedPreviousLifecycle ?? "closed"
                ]
              }
            </p>
          )}
          <Field>
            <FieldLabel htmlFor="authority-reason">סיבה לפעולה</FieldLabel>
            <Textarea
              id="authority-reason"
              value={values.reason}
              onChange={(event) => update({ reason: event.target.value })}
              maxLength={2000}
              rows={3}
              required
              placeholder="הסבר לצוות שיופיע בהיסטוריית הכרטיס"
            />
            <FieldDescription>
              הסיבה נשמרת יחד עם זהות מבצע/ת הפעולה והמועד.
            </FieldDescription>
          </Field>
        </FieldGroup>
      </fieldset>
      <DraftStatus status={draft.status} onRetry={draft.retry} />
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={onClose}
        >
          סגירה
        </Button>
        <Button
          type="submit"
          variant={mode === "delete" ? "destructive" : "default"}
          disabled={disabled || stale || !values.reason.trim() || (mode === "restore" && !authorityPending.canRestore) || (mode === "delete" && !authorityPending.canDelete)}
        >
          {busy && (
            <LoaderCircleIcon
              data-icon="inline-start"
              className="animate-spin"
            />
          )}
          {mode === "delete"
            ? "העברה לסל המחזור"
            : mode === "restore"
              ? "שחזור הכרטיס"
              : "שמירת השינוי"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function RecycleBinView() {
  const { snapshot } = useWorkspace();
  if (!snapshot) return null;
  if (!snapshot.actor.active || snapshot.actor.role !== "ceo")
    return <AccessDenied />;
  const deleted = snapshot.participants.filter(
    (view) => view.participant.deletedAt,
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>סל המחזור</CardTitle>
        <CardDescription>
          כרטיסים שהועברו לסל נשמרים עם ההיסטוריה שלהם וניתנים לשחזור.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {deleted.length === 0 ? (
          <SectionEmpty
            title="סל המחזור ריק"
            description="כרטיסים שיועברו לסל המחזור יופיעו כאן."
          />
        ) : (
          deleted.map((view) => (
            <div
              key={view.participant.id}
              className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="flex flex-col gap-1">
                <p className="font-medium">
                  {view.participant.displayName || "חניכה ללא שם"}
                  {view.participant.localPending && <Badge variant="outline">בקשת העברה ממתינה לאישור</Badge>}
                </p>
                <p className="text-sm text-muted-foreground">
                  {view.participant.localPending ? "מועד הבקשה במכשיר: " : "הועבר לסל ב־"}{formatDateTime(view.participant.deletedAt)} ·{" "}
                  {snapshot.staff.find(
                    (staff) => staff.id === (view.participant.deletedBy ?? view.deletedBy),
                  )?.displayName ?? "חבר/ת צוות"}
                </p>
                {view.participant.localPending && <p role="status" className="text-sm text-muted-foreground">הבקשה שמורה במכשיר; ההעברה לסל המחזור עדיין לא אושרה במערכת. שחזור יתאפשר לאחר אישור הפעולה.</p>}
                {(view.participant.deletionReason ?? view.deletionReason) && (
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {view.participant.deletionReason ?? view.deletionReason}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  nativeButton={false}
                  variant="outline"
                  render={
                    <Link
                      href={`/staff/participants/${encodeURIComponent(view.participant.id)}`}
                    />
                  }
                >
                  פתיחת ההיסטוריה
                </Button>
                <AuthorityDialog view={view} mode="restore" disabled={!authorityPendingState(view.participant).canRestore} />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
