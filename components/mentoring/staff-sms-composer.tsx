"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, MessageSquare, RefreshCw, Send, WifiOff } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/staff/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/staff/ui/alert-dialog";
import { Badge } from "@/components/staff/ui/badge";
import { Button } from "@/components/staff/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/staff/ui/card";
import { Label } from "@/components/staff/ui/label";
import { Spinner } from "@/components/staff/ui/spinner";
import { Textarea } from "@/components/staff/ui/textarea";
import type { StaffProfile, WorkspaceSnapshot } from "@/lib/mentoring/contracts";
import type { StaffSmsBatchView, StaffSmsDeliveryView } from "@/lib/mentoring/features/staff-messages/contracts";
import { normalizeStaffMobile } from "@/lib/mentoring/features/reminders/policy";
import type { WorkspaceContextValue } from "@/lib/mentoring/workspace-client";
import { InlineError, readableError, roleNames, useCommandIntent } from "./common";
import { formatDateTime } from "./format";

type ComposerProps = Pick<WorkspaceContextValue, "snapshot" | "isOnline" | "submitOnline" | "refresh">;
type Review = {
  readonly operationId: string;
  readonly message: string;
  readonly recipients: readonly { readonly staffId: string; readonly expectedVersion: number; readonly name: string; readonly phone: string }[];
  readonly attempted: boolean;
};

const stateNames: Record<StaffSmsDeliveryView["state"], string> = {
  pending: "ממתינה לשליחה", dispatching: "השליחה בתהליך", provider_accepted: "הספק קיבל את הבקשה",
  delivered: "המסירה אושרה", failed: "השליחה נכשלה", uncertain: "תוצאת השליחה אינה ידועה", cancelled: "השליחה בוטלה",
};
const reasonNames: Record<NonNullable<StaffSmsDeliveryView["reason"]>, string> = {
  sender_ineligible: "הרשאת השולח השתנתה", recipient_ineligible: "פרטי הנמען או הזכאות לקבלת SMS השתנו",
  provider_rejected: "הספק דחה את הבקשה", provider_outcome_unknown: "נדרש בירור אצל הספק לפני ניסיון נוסף",
  lease_expired: "תהליך השליחה נקטע והתוצאה דורשת בירור",
};

function unavailableReason(member: StaffProfile): string | null {
  if (member.localPending) return "פרטי הצוות טרם נשמרו במערכת";
  if (member.role === "ceo" && member.smsMuted) return "הודעות SMS מושתקות בחשבון זה";
  if (!normalizeStaffMobile(member.phone)) return member.phone ? "נדרש מספר נייד ישראלי תקין" : "לא הוגדר מספר נייד";
  return null;
}

function MessageHistory({ batches, isOnline, refresh }: { batches: readonly StaffSmsBatchView[]; isOnline: boolean; refresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <div className="space-y-3 border-t pt-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">הודעות אחרונות</h3><Button variant="ghost" size="sm" disabled={!isOnline || busy} onClick={() => { setBusy(true); setError(null); void refresh().catch((failure) => setError(readableError(failure))).finally(() => setBusy(false)); }}>{busy ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}עדכון מצב ההודעות</Button></div>
    <InlineError message={error} />
    <p className="text-sm leading-relaxed text-muted-foreground">קבלת הבקשה אצל הספק אינה אישור שההודעה הגיעה לטלפון. לבדיקה ראשונית יש לבקש מהצוות לאשר קבלה. תוצאה לא ידועה אינה נשלחת שוב אוטומטית.</p>
    {batches.length === 0 ? <p className="py-2 text-sm text-muted-foreground">עדיין אין הודעות לצוות.</p> : batches.map((batch) => <details key={batch.id} className="rounded-lg border px-4">
      <summary className="min-h-11 cursor-pointer py-3"><span className="block whitespace-pre-wrap break-words text-sm font-medium">{batch.message}</span><span className="mt-1 block text-xs text-muted-foreground">{formatDateTime(batch.createdAt)} · {batch.senderName} · {batch.recipientCount} אנשי צוות · {batch.deliveries.length} מספרי טלפון</span></summary>
      <ul className="space-y-3 border-t py-4">{batch.deliveries.map((delivery) => <li key={delivery.id} className="space-y-1 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><span>{delivery.recipientNames.join(", ")}</span><Badge variant={delivery.state === "failed" || delivery.state === "uncertain" ? "destructive" : "outline"}>{stateNames[delivery.state]}</Badge></div>
        {delivery.recipientNames.length > 1 && <p className="text-xs text-muted-foreground">מספר טלפון משותף — נשלחת הודעה אחת.</p>}
        {delivery.reason && <p className="text-muted-foreground">{reasonNames[delivery.reason]}</p>}
        {delivery.providerReference && <p className="break-words text-xs text-muted-foreground">אסמכתה אצל הספק: <bdi>{delivery.providerReference}</bdi></p>}
      </li>)}</ul>
    </details>)}
  </div>;
}

function StaffSmsForm({ snapshot, isOnline, submitOnline, refresh, scope }: Omit<ComposerProps, "snapshot"> & { snapshot: WorkspaceSnapshot; scope: string }) {
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const sending = useRef(false);
  const mounted = useRef(true);
  const intent = useCommandIntent();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const staff = snapshot.staff.filter((member) => member.organizationId === snapshot.actor.organizationId && member.active);
  const eligible = staff.filter((member) => !unavailableReason(member));
  const recipients = eligible.filter((member) => selected.includes(member.id));
  const allSelected = eligible.length > 0 && recipients.length === eligible.length;
  const phoneCount = new Set(recipients.map((member) => normalizeStaffMobile(member.phone))).size;
  const reviewPhoneCount = new Set(review?.recipients.map((member) => member.phone)).size;
  const reviewStale = Boolean(review && !review.attempted && review.recipients.some((recipient) => {
    const member = staff.find((candidate) => candidate.id === recipient.staffId);
    return !member || unavailableReason(member) || member.version !== recipient.expectedVersion || normalizeStaffMobile(member.phone) !== recipient.phone;
  }));
  const history = snapshot.staffSmsBatches ?? [];
  const acceptedReview = review?.attempted ? history.find((batch) => batch.id === review.operationId) : undefined;

  function prepareReview() {
    if (review || !isOnline || !message.trim() || message.trim().length > 1000 || recipients.length === 0) return;
    const frozen = recipients.map((member) => ({ staffId: member.id, expectedVersion: member.version, name: member.displayName, phone: normalizeStaffMobile(member.phone)! })).sort((left, right) => left.staffId.localeCompare(right.staffId));
    const text = message.trim();
    setReview({ operationId: intent.operationId({ scope, message: text, recipients: frozen.map(({ staffId, expectedVersion }) => ({ staffId, expectedVersion })) }), message: text, recipients: frozen, attempted: false });
    setReviewOpen(true); setError(null); setNotice(null);
  }

  async function send() {
    if (!review || sending.current || !isOnline || reviewStale) return;
    sending.current = true;
    setBusy(true); setError(null); setNotice(null);
    setReview({ ...review, attempted: true });
    try {
      const result = await submitOnline({ type: "send_staff_sms", operationId: review.operationId, message: review.message, recipients: review.recipients.map(({ staffId, expectedVersion }) => ({ staffId, expectedVersion })) });
      if (!mounted.current) return;
      if (!result.ok) {
        setError(result.error.message);
        if (!["unavailable", "not_configured"].includes(result.error.code)) { setReview(null); setReviewOpen(false); }
        return;
      }
      if (result.acceptance !== "accepted" || !result.staffSmsBatchId) { setError("לא התקבל אישור מלא לבקשה. יש לבדוק את אותה בקשה לפני יצירת הודעה נוספת."); return; }
      setNotice("בקשת השליחה התקבלה. מצב כל נמען מופיע בהודעות האחרונות; קבלת הבקשה אינה אישור מסירה לטלפון.");
      setReview(null); setReviewOpen(false); setMessage(""); setSelected([]); intent.clear();
    } catch (failure) {
      if (mounted.current) setError(readableError(failure));
    } finally {
      sending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function closeReview(open: boolean) {
    if (busy) return;
    setReviewOpen(open);
    if (!open && !review?.attempted) setReview(null);
  }

  function acknowledgeAccepted() {
    if (sending.current) return;
    setReview(null); setReviewOpen(false); setMessage(""); setSelected([]); setError(null); intent.clear();
    setNotice("הבקשה הקודמת נמצאה בהיסטוריית ההודעות. אפשר לעקוב שם אחר תוצאות השליחה.");
  }

  return <Card>
    <CardHeader><CardTitle className="flex items-center gap-2"><MessageSquare className="size-5" aria-hidden="true" />הודעות SMS לצוות</CardTitle><CardDescription>שליחת הודעה לצוות הנבחר או לכל אנשי הצוות הזמינים. מספר טלפון משותף יקבל הודעה אחת.</CardDescription></CardHeader>
    <CardContent className="space-y-6">
      {!isOnline && <Alert><WifiOff /><AlertTitle>נדרש חיבור לשליחת הודעה</AlertTitle><AlertDescription>הודעות יזומות לצוות אינן נשמרות במכשיר לשליחה מאוחרת.</AlertDescription></Alert>}
      <div aria-live="polite" aria-atomic="true">{notice && <Alert><CheckCircle2 /><AlertTitle>מצב ההודעה</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert>}<InlineError message={error} /></div>
      {review?.attempted && <Alert><MessageSquare /><AlertTitle>{acceptedReview ? "הבקשה הקודמת נמצאה בהיסטוריה" : "יש לבדוק את בקשת השליחה הקודמת"}</AlertTitle><AlertDescription>{acceptedReview ? "הבקשה התקבלה במערכת. אפשר לראות את תוצאותיה בהודעות האחרונות." : "ייתכן שהבקשה כבר התקבלה. אפשר לעדכן את ההיסטוריה או לבדוק שוב עם אותו מזהה; לא תיווצר בקשה כפולה."}</AlertDescription><div className="mt-3">{acceptedReview ? <Button variant="outline" disabled={busy} onClick={acknowledgeAccepted}>המשך להודעה חדשה</Button> : <Button variant="outline" disabled={busy} onClick={() => setReviewOpen(true)}>בדיקת הבקשה הקודמת</Button>}</div></Alert>}
      <div className="grid gap-6 lg:grid-cols-2">
        <fieldset disabled={busy || Boolean(review)} className="min-w-0 space-y-3">
          <legend className="mb-3 text-sm font-semibold">נמענים ({recipients.length} נבחרו)</legend>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg bg-muted/60 px-3 text-sm font-medium"><input type="checkbox" className="size-4 accent-primary" aria-label="בחירת כל הנמענים הזמינים" checked={allSelected} ref={(node) => { if (node) node.indeterminate = recipients.length > 0 && !allSelected; }} onChange={(event) => setSelected(event.target.checked ? eligible.map((member) => member.id) : [])} disabled={eligible.length === 0} />בחירת כל הנמענים הזמינים ({eligible.length})</label>
          <div className="max-h-80 overflow-y-auto rounded-lg border">{staff.map((member) => {
            const reason = unavailableReason(member);
            return <label key={member.id} className={`flex min-h-14 items-start gap-3 border-b px-3 py-3 last:border-b-0 ${reason ? "cursor-not-allowed bg-muted/30 text-muted-foreground" : "cursor-pointer hover:bg-muted/40"}`}><input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" checked={!reason && selected.includes(member.id)} disabled={Boolean(reason)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, member.id] : current.filter((id) => id !== member.id))} /><span className="min-w-0 text-sm"><span className="font-medium">{member.displayName}</span><span className="ms-2 text-xs text-muted-foreground">{roleNames[member.role]}</span><span className="mt-1 block text-xs text-muted-foreground">{reason ?? <bdi>{normalizeStaffMobile(member.phone)}</bdi>}</span></span></label>;
          })}{staff.length === 0 && <p className="p-4 text-sm text-muted-foreground">אין אנשי צוות פעילים להצגה.</p>}</div>
          <p className="text-xs leading-relaxed text-muted-foreground">חשבונות ללא נייד תקין, הודעות מושתקות ופרטים שטרם נשמרו אינם זמינים לשליחה.</p>
        </fieldset>
        <div className="flex min-w-0 flex-col gap-3">
          <Label htmlFor="staff-sms-message">תוכן ההודעה</Label>
          <Textarea id="staff-sms-message" value={message} maxLength={1000} dir="auto" className="min-h-48" disabled={busy || Boolean(review)} aria-describedby="staff-sms-message-help" placeholder="לדוגמה: בדיקת SMS משירות עם משמעות. נא לאשר לדניאל שההודעה התקבלה." onChange={(event) => setMessage(event.target.value)} />
          <p id="staff-sms-message-help" className="text-xs leading-relaxed text-muted-foreground">{message.length}/1000 תווים · ההודעה תישלח כפי שתופיע במסך האישור.</p>
          <p className="text-sm">{recipients.length} אנשי צוות · {phoneCount} מספרי טלפון ייחודיים</p>
          <Button className="mt-auto self-start" disabled={!isOnline || busy || Boolean(review) || !message.trim() || recipients.length === 0} onClick={prepareReview}><Send data-icon="inline-start" />בדיקת ההודעה והנמענים</Button>
        </div>
      </div>
      <MessageHistory batches={history} isOnline={isOnline} refresh={refresh} />
    </CardContent>
    <AlertDialog open={reviewOpen && Boolean(review)} onOpenChange={closeReview}>
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
        <AlertDialogHeader><AlertDialogTitle>{review?.attempted ? "בדיקת בקשת השליחה הקודמת" : "לשלוח את ההודעה לצוות שנבחר?"}</AlertDialogTitle><AlertDialogDescription>{review?.recipients.length ?? 0} אנשי צוות יקבלו הודעה ב־{reviewPhoneCount} מספרי טלפון ייחודיים. לאחר תחילת השליחה אי אפשר לבטל אותה.</AlertDialogDescription></AlertDialogHeader>
        <p dir="auto" className="whitespace-pre-wrap break-words rounded-lg bg-muted p-4 text-sm leading-relaxed">{review?.message}</p>
        <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">{review?.recipients.map((recipient) => <li key={recipient.staffId} className="flex flex-wrap justify-between gap-2"><span>{recipient.name}</span><bdi>{recipient.phone}</bdi></li>)}</ul>
        {reviewStale && <p role="alert" className="text-sm text-destructive">פרטי הנמענים השתנו מאז הבדיקה. יש לחזור לעריכה ולבדוק את הרשימה המעודכנת.</p>}
        {review?.attempted && !acceptedReview && <p className="text-sm leading-relaxed text-muted-foreground">הבדיקה משתמשת באותו מזהה בקשה. אם הבקשה הקודמת כבר התקבלה, היא לא תישלח שוב. אם טרם התקבלה, היא תישלח כעת.</p>}
        <InlineError message={error} />
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>{review?.attempted ? "סגירה" : "חזרה לעריכה"}</AlertDialogCancel>{acceptedReview ? <AlertDialogAction disabled={busy} onClick={acknowledgeAccepted}>מעבר לתוצאות השליחה</AlertDialogAction> : <AlertDialogAction disabled={!isOnline || busy || reviewStale} onClick={(event) => { event.preventDefault(); void send(); }}>{busy ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" />}{review?.attempted ? "בדיקה ושליחה באותו מזהה" : "שליחת SMS"}</AlertDialogAction>}</AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </Card>;
}

export function StaffSmsComposer(props: ComposerProps) {
  const { snapshot } = props;
  if (!snapshot?.actor.active || snapshot.actor.role !== "ceo") return null;
  const scope = `${snapshot.actor.organizationId}:${snapshot.actor.id}:${snapshot.actor.authUserId}`;
  return <StaffSmsForm key={scope} {...props} snapshot={snapshot} scope={scope} />;
}
