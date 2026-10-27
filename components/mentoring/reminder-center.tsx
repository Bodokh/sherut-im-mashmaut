"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { AlertCircle, Bell, CheckCircle2, RefreshCw, WifiOff } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/staff/ui/alert";
import { Badge } from "@/components/staff/ui/badge";
import { Button } from "@/components/staff/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/staff/ui/card";
import { Spinner } from "@/components/staff/ui/spinner";
import type { ReminderJobView, ReminderReadiness, ReminderReason, ReminderState } from "@/lib/mentoring/features/reminders/contracts";
import { useWorkspace } from "@/lib/mentoring/workspace-client";
import { AccessDenied, InlineError, PageHeading, readableError, SectionEmpty, useCommandIntent } from "./common";

const stateNames: Record<ReminderState, string> = {
  pending: "ממתינה לשליחה",
  dispatching: "השליחה בתהליך",
  provider_accepted: "הספק קיבל את הבקשה",
  delivered: "המסירה אושרה",
  failed: "השליחה נכשלה",
  uncertain: "תוצאת השליחה אינה ידועה",
  cancelled: "התזכורת בוטלה",
  blocked: "השליחה חסומה",
};

const reasonNames: Record<NonNullable<ReminderReason>, string> = {
  missing_sms_provider: "טרם הוגדר ספק SMS",
  missing_sms_credentials: "טרם הוגדרו פרטי החיבור לספק",
  sending_disabled: "שליחת SMS אינה מופעלת",
  invalid_staff_phone: "נדרש מספר נייד תקין של חבר/ת הצוות",
  superseded: "הנתונים עודכנו והתזכורת אינה בתוקף",
  recipient_ineligible: "הנמענת אינה זכאית לתזכורת במצב הנוכחי",
  provider_rejected: "הספק דחה את בקשת השליחה",
  provider_outcome_unknown: "נדרש בירור אצל הספק לפני ניסיון נוסף",
  lease_expired: "תוקף ביצוע השליחה חלף והתוצאה דורשת בירור",
};

const formatter = new Intl.DateTimeFormat("he-IL", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jerusalem" });
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "מועד לא זמין" : formatter.format(date);
}

function StateBadge({ state }: { state: ReminderState }) {
  return <Badge variant={state === "failed" || state === "uncertain" ? "destructive" : state === "delivered" ? "default" : "outline"}>{stateNames[state]}</Badge>;
}

function Readiness({ readiness }: { readiness: ReminderReadiness | undefined }) {
  if (!readiness) return <Alert><AlertCircle /><AlertTitle>מצב התזכורות עדיין אינו זמין</AlertTitle><AlertDescription>יש להתחבר ולעדכן את המידע כדי לקבל את מצב ההגדרות והשליחה הנוכחי.</AlertDescription></Alert>;
  return (
    <Card>
      <CardHeader>
        <CardTitle>הגדרות התזכורות</CardTitle>
        <CardDescription>התזכורות מיועדות לצוות בלבד. מספרי הטלפון של החניכות ותוכן הדיווחים אינם נכללים בהודעות.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">ספק SMS</dt><dd className="mt-1 font-medium">{readiness.smsProviderConfigured ? "הוגדר" : "טרם הוגדר — השליחה חסומה"}</dd></div>
          <div><dt className="text-muted-foreground">חיבור לשליחת SMS</dt><dd className="mt-1 font-medium">{readiness.smsCredentialsConfigured ? readiness.smsSendingEnabled ? "השליחה מופעלת" : "פרטי החיבור הוגדרו; השליחה אינה מופעלת" : "פרטי החיבור טרם הוגדרו"}</dd></div>
          <div><dt className="text-muted-foreground">סריקה אוטומטית</dt><dd className="mt-1 font-medium">{readiness.hostedSchedulerConfigured ? "הוגדרה" : "טרם הוגדרה; סריקה ידנית זמינה"}</dd></div>
          <div><dt className="text-muted-foreground">קהל התזכורת</dt><dd className="mt-1 font-medium">{readiness.audience === "all_staff" ? "כל הצוות הפעיל — לפי הגדרה מפורשת" : "החונך/ת המשויך/ת, הרכז/ת והמנכ״ל — ברירת מחדל זמנית"}</dd></div>
          <div><dt className="text-muted-foreground">תזכורת למועד קשר</dt><dd className="mt-1 font-medium">{readiness.appointmentReminderMinutesBefore === 0 ? "במועד שנקבע" : `${readiness.appointmentReminderMinutesBefore} דקות לפני המועד`}</dd></div>
          <div><dt className="text-muted-foreground">לאחר שבעה ימים ללא קשר</dt><dd className="mt-1 font-medium">{!readiness.overdueRemindersEnabled ? "תזכורת אינה מופעלת" : readiness.overdueRepeatHours === null ? "תזכורת אחת, ללא חזרה" : `תזכורת וחזרה מדי ${readiness.overdueRepeatHours} שעות`}</dd></div>
        </dl>
        <p className="text-sm leading-relaxed text-muted-foreground">השתקת המנכ״ל חלה על ההודעות לחשבונו בלבד. קבלת בקשה אצל הספק ואישור מסירה מוצגים בנפרד.</p>
      </CardContent>
    </Card>
  );
}

function ReminderCard({ reminder }: { reminder: ReminderJobView }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle><Link href={`/staff/participants/${encodeURIComponent(reminder.participantId)}`} className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4">{reminder.participantName}</Link></CardTitle>
            <CardDescription className="mt-1">{reminder.kind === "appointment" ? "תזכורת למועד קשר" : "תזכורת למועד שבעת הימים"} · {reminder.recipientName}</CardDescription>
          </div>
          <StateBadge state={reminder.state} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">מועד התזכורת</dt><dd className="mt-1">{formatDate(reminder.scheduledAt)}</dd></div>
          <div><dt className="text-muted-foreground">{reminder.kind === "appointment" ? "מועד הקשר" : "מועד שבעת הימים"}</dt><dd className="mt-1">{formatDate(reminder.referenceAt)}</dd></div>
        </dl>
        {reminder.reason && <p className="text-sm leading-relaxed">{reasonNames[reminder.reason]}</p>}
        {reminder.state === "uncertain" && <p className="text-sm leading-relaxed text-muted-foreground">לא מתבצע ניסיון חוזר אוטומטי כל עוד תוצאת השליחה אינה ידועה.</p>}
        {reminder.attempts.length > 0 && (
          <details className="rounded-lg border px-3">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">ניסיונות שליחה ({reminder.attempts.length})</summary>
            <ol className="space-y-4 border-t py-4">
              {reminder.attempts.map((attempt) => (
                <li key={attempt.id} className="space-y-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span>ניסיון {attempt.attemptNumber} · {formatDate(attempt.claimedAt)}</span><StateBadge state={attempt.state} /></div>
                  <p className="break-words text-muted-foreground">ספק: <bdi>{attempt.provider}</bdi>{attempt.providerReference && <> · אסמכתה: <bdi>{attempt.providerReference}</bdi></>}</p>
                  {attempt.reason && <p className="text-muted-foreground">{reasonNames[attempt.reason]}</p>}
                  {attempt.finishedAt && <p className="text-muted-foreground">עדכון תוצאה: {formatDate(attempt.finishedAt)}</p>}
                </li>
              ))}
            </ol>
          </details>
        )}
        <p className="text-xs text-muted-foreground">עודכן: {formatDate(reminder.updatedAt)}</p>
      </CardContent>
    </Card>
  );
}

export function ReminderCenter() {
  const { snapshot, isOnline, submit } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [messageScope, setMessageScope] = useState<string | null>(null);
  const [continuation, setContinuation] = useState<{ scope: string; cursor: string | null } | null>(null);
  const scanning = useRef(false);
  const intent = useCommandIntent();
  if (!snapshot) return null;
  if (snapshot.actor.role === "mentor" || !snapshot.actor.active) return <AccessDenied />;
  const scope = `${snapshot.actor.organizationId}:${snapshot.actor.id}:${snapshot.actor.authUserId}`;
  const afterParticipantId = continuation?.scope === scope ? continuation.cursor : null;
  const reminders = snapshot.reminders ?? [];
  const readiness = snapshot.reminderReadiness;

  async function scan() {
    if (scanning.current) return;
    scanning.current = true;
    setMessageScope(scope);
    setBusy(true); setError(null); setMessage(null);
    try {
      let cursor = afterParticipantId;
      for (let page = 0; page < 50; page += 1) {
        const payload = { type: "evaluate_reminders" as const, afterParticipantId: cursor };
        // Keep the current page and its immutable intent together. A queued or
        // uncertain submission is replayed with the same ID before continuing.
        setContinuation({ scope, cursor });
        const result = await submit({ ...payload, operationId: intent.operationId({ scope, payload }) });
        if (!result.ok) { setError(result.error.message); return; }
        if (result.acceptance === "queued") {
          setMessage("בקשת הסריקה לעמוד הנוכחי נשמרה במכשיר. הסריקה טרם הושלמה. לאחר חידוש החיבור אפשר להמשיך בסריקה; ההרשאות ייבדקו מחדש.");
          return;
        }
        if (!result.reminderScan) {
          setMessage("בקשת הסריקה התקבלה, אך לא התקבל אישור אם נותרו נתונים לסריקה. לא ניתן לאשר שהסריקה הושלמה.");
          return;
        }
        cursor = result.reminderScan.nextCursor;
        setContinuation({ scope, cursor });
        if (cursor === null) {
          setMessage("סריקת התזכורות הושלמה והמידע עודכן. מצב השליחה מוצג בכל תזכורת.");
          intent.clear();
          return;
        }
      }
      setMessage("חלק מהנתונים נסרקו. נותרו נתונים נוספים; יש ללחוץ על המשך סריקה כדי להשלים את הפעולה.");
    } catch (failure) { setError(readableError(failure)); }
    finally { scanning.current = false; setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <PageHeading title="תזכורות" description="מעקב אחר תזכורות לצוות הליווי שבתחום האחריות שלך, חסמים ותוצאות שליחה." action={<Button onClick={() => void scan()} disabled={busy}>{busy ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}{afterParticipantId === null ? "סריקת תזכורות" : "המשך סריקה"}</Button>} />
      {!isOnline && <Alert><WifiOff /><AlertTitle>מוצג המידע האחרון שנשמר במכשיר</AlertTitle><AlertDescription>מצב השליחה עשוי להשתנות בינתיים. בקשת סריקה תישמר ותמתין לחיבור.</AlertDescription></Alert>}
      <div aria-live="polite" aria-atomic="true">{messageScope === scope && <>{message && <Alert><CheckCircle2 /><AlertTitle>מצב הסריקה</AlertTitle><AlertDescription>{message}</AlertDescription></Alert>}<InlineError message={error} /></>}</div>
      <Readiness readiness={readiness} />
      {readiness?.diagnosticsTruncated && <Alert><AlertCircle /><AlertTitle>היסטוריית התזכורות מוגבלת</AlertTitle><AlertDescription>כל התזכורות שטרם נמסרו, לרבות ניסיונות שנכשלו, מוצגות בתחום האחריות שלך, לצד 200 העדכונים האחרונים של תזכורות שנמסרו או בוטלו.</AlertDescription></Alert>}
      <section aria-label="מצב התזכורות" className="space-y-4">
        <div className="flex items-center gap-2"><Bell className="size-5 text-muted-foreground" aria-hidden="true" /><h2 className="text-lg font-semibold">תזכורות ומצב שליחה</h2><Badge variant="secondary">{reminders.length}</Badge></div>
        {reminders.length === 0 ? <SectionEmpty title="אין תזכורות להצגה" description="לאחר סריקה יופיעו כאן התזכורות שנוצרו לחניכות בתחום האחריות שלך ומצב השליחה שלהן." /> : <div className="grid gap-4 xl:grid-cols-2">{reminders.map((reminder) => <ReminderCard key={reminder.id} reminder={reminder} />)}</div>}
      </section>
    </div>
  );
}
