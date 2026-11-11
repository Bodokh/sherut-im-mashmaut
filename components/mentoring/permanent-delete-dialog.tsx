"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircleIcon, Trash2Icon, WifiOffIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/staff/ui/alert";
import { Button } from "@/components/staff/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/staff/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/staff/ui/field";
import { Input } from "@/components/staff/ui/input";
import { Textarea } from "@/components/staff/ui/textarea";
import type { MentoringCommand, ParticipantView, WorkspaceSnapshot } from "@/lib/mentoring/contracts";
import { useWorkspace, type WorkspaceContextValue } from "@/lib/mentoring/workspace-client";
import { staffPublicPath } from "@/lib/staff-host";
import { InlineError, readableError } from "./common";

type DeleteCommand = Extract<MentoringCommand, { type: "permanently_delete_participant" }>;
type DeleteFormProps = Pick<WorkspaceContextValue, "isOnline" | "submitOnline"> & { readonly view: ParticipantView; readonly snapshot: WorkspaceSnapshot };

function PermanentDeleteForm({ view, snapshot, isOnline, submitOnline }: DeleteFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmationName, setConfirmationName] = useState("");
  const [reason, setReason] = useState("");
  const [reviewed, setReviewed] = useState<{ readonly version: number; readonly name: string } | null>(null);
  const [command, setCommand] = useState<DeleteCommand | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = snapshot.participants.find((item) => item.participant.id === view.participant.id && item.participant.organizationId === snapshot.actor.organizationId);
  const localPending = current?.participant.localPending === true;
  const name = command?.confirmationName ?? reviewed?.name ?? current?.participant.displayName ?? view.participant.displayName;
  const stale = Boolean(reviewed && (!current || current.participant.version !== reviewed.version || current.participant.displayName !== reviewed.name));
  const needsReview = open && !command && !reviewed;
  const ready = Boolean(reviewed && current && !localPending && !stale && confirmationName.trim() === reviewed.name && reason.trim() && reason.trim().length <= 2000);
  const canConfirm = isOnline && !busy && (Boolean(command) || ready);

  function changeOpen(next: boolean) {
    if (sending.current || (!command && next && (!isOnline || !current || localPending))) return;
    setOpen(next);
    if (!command) {
      setReviewed(next && current ? { version: current.participant.version, name: current.participant.displayName } : null);
      setConfirmationName(""); setReason(""); setError(null);
    }
  }

  async function remove() {
    if (!mounted.current || sending.current || !isOnline || (!command && !ready)) return;
    const frozen: DeleteCommand = command ?? {
      type: "permanently_delete_participant", operationId: crypto.randomUUID(), participantId: view.participant.id,
      expectedVersion: reviewed!.version, confirmationName: confirmationName.trim(), reason: reason.trim(),
    };
    const routeAtSubmission = typeof window === "undefined" ? null : window.location.pathname;
    sending.current = true;
    setCommand(frozen); setBusy(true); setError(null);
    try {
      const result = await submitOnline(frozen);
      // The controller validates the auth epoch before returning acceptance.
      // Its cache purge can already have unmounted this card, so navigation
      // must also complete after that successful removal.
      if (result.ok && result.acceptance === "accepted" && result.participantId === frozen.participantId) {
        if (mounted.current) setOpen(false);
        if (routeAtSubmission === null || window.location.pathname === routeAtSubmission) router.replace(staffPublicPath("/staff/participants"));
        return;
      }
      if (!mounted.current) return;
      if (!result.ok) {
        setError(result.error.message);
        if (!["unavailable", "not_configured"].includes(result.error.code)) { setCommand(null); setReviewed(null); }
        return;
      }
      setError("לא התקבל אישור מלא למחיקה. יש לבדוק שוב את אותה בקשה לפני פעולה נוספת.");
    } catch (failure) {
      if (mounted.current) setError(readableError(failure));
    } finally {
      sending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return <>
    <Button variant="destructive" disabled={busy || (!command && (!isOnline || !current || localPending))} onClick={() => changeOpen(true)}>
      <Trash2Icon data-icon="inline-start" />{command ? "בדיקת בקשת המחיקה" : "מחיקה לצמיתות"}
    </Button>
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>{command ? "בדיקת בקשת המחיקה הקודמת" : "מחיקת כרטיס חניכה לצמיתות"}</DialogTitle>
          <DialogDescription>הכרטיס של {name}, כל דוחות הקשר וההיסטוריה שלו יימחקו מהמערכת. הפעולה אינה ניתנת לשחזור מסל המחזור.</DialogDescription>
        </DialogHeader>
        {!isOnline && <Alert><WifiOffIcon /><AlertTitle>נדרש חיבור למחיקה לצמיתות</AlertTitle><AlertDescription>הבקשה אינה נשמרת לשליחה מאוחרת.</AlertDescription></Alert>}
        {command && <Alert><Trash2Icon /><AlertTitle>תוצאת הבקשה הקודמת עדיין דורשת בדיקה</AlertTitle><AlertDescription>ייתכן שהמחיקה כבר התקבלה. הבדיקה משתמשת באותו מזהה ובאותם פרטים ואינה יוצרת פעולת מחיקה נוספת.</AlertDescription></Alert>}
        {localPending && !command && <Alert><AlertTitle>בכרטיס יש עבודה מקומית שטרם נשמרה</AlertTitle><AlertDescription>יש להשלים את הסנכרון ולבדוק את העדכונים לפני מחיקה לצמיתות.</AlertDescription></Alert>}
        {(stale || needsReview) && !command && <Alert><AlertTitle>{stale ? "הכרטיס השתנה מאז פתיחת מסך האישור" : "נדרשת בדיקה מחדש לפני מחיקה"}</AlertTitle><AlertDescription>יש לסגור את המסך, לבדוק את הכרטיס העדכני ולפתוח שוב את בקשת המחיקה.</AlertDescription></Alert>}
        <FieldGroup>
          <Field><FieldLabel htmlFor={`permanent-delete-name-${view.participant.id}`}>להקליד את שם החניכה לאישור</FieldLabel><Input id={`permanent-delete-name-${view.participant.id}`} value={command?.confirmationName ?? confirmationName} disabled={busy || Boolean(command)} autoComplete="off" onChange={(event) => setConfirmationName(event.target.value)} aria-describedby={`permanent-delete-help-${view.participant.id}`} /><FieldDescription id={`permanent-delete-help-${view.participant.id}`}>השם לאישור: {name}</FieldDescription></Field>
          <Field><FieldLabel htmlFor={`permanent-delete-reason-${view.participant.id}`}>סיבת המחיקה</FieldLabel><Textarea id={`permanent-delete-reason-${view.participant.id}`} value={command?.reason ?? reason} maxLength={2000} disabled={busy || Boolean(command)} onChange={(event) => setReason(event.target.value)} /></Field>
        </FieldGroup>
        <p className="text-xs leading-relaxed text-muted-foreground">המחיקה מסירה גם את המידע השמור במכשיר זה לאחר אישור. מכשירים מנותקים יתעדכנו כשיתחברו מחדש. גיבויים והודעות SMS שכבר נשלחו אינם נמחקים בפעולה זו.</p>
        <InlineError message={error} />
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => changeOpen(false)}>{command ? "סגירה" : needsReview ? "סגירה ובדיקה מחדש" : "ביטול"}</Button>
          <Button variant="destructive" disabled={!canConfirm} onClick={() => void remove()}>{busy ? <LoaderCircleIcon className="animate-spin" data-icon="inline-start" /> : <Trash2Icon data-icon="inline-start" />}{command ? "בדיקת המחיקה באותו מזהה" : "אישור מחיקה לצמיתות"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

/** Never expose a destructive action outside the accepted active CEO scope. */
export function PermanentDeleteDialog({ view }: { readonly view: ParticipantView }) {
  const { snapshot, isOnline, submitOnline } = useWorkspace();
  if (!snapshot?.actor.active || snapshot.actor.role !== "ceo" || view.participant.organizationId !== snapshot.actor.organizationId) return null;
  const scope = JSON.stringify([snapshot.actor.organizationId, snapshot.actor.id, snapshot.actor.authUserId, view.participant.id]);
  return <PermanentDeleteForm key={scope} view={view} snapshot={snapshot} isOnline={isOnline} submitOnline={submitOnline} />;
}
