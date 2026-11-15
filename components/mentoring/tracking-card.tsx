"use client";

import { useState, type FormEvent } from "react";
import { ClipboardPenLineIcon, LoaderCircleIcon, PencilIcon, PhoneIcon, UserRoundIcon, MessageSquareIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/staff/ui/alert";
import { Badge } from "@/components/staff/ui/badge";
import { Button } from "@/components/staff/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/staff/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/staff/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/staff/ui/field";
import { Input } from "@/components/staff/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/staff/ui/select";
import { Separator } from "@/components/staff/ui/separator";
import { Textarea } from "@/components/staff/ui/textarea";
import type { TrackingCardView, TrackingSubjectKind } from "@/lib/mentoring/features/tracking/contracts";
import { useWorkspace } from "@/lib/mentoring/workspace-client";
import { InlineError, ManualColorBadge, SectionEmpty, manualColorNames, useCommandIntent } from "./common";
import { formatDateTime, toDateTimeInput } from "./format";
import {
  canUseTrackingCards, trackingCardCommand, trackingCardFor, trackingCardFormValues, trackingMethodNames, trackingOutcomeNames,
  trackingReportCommand, trackingSubject, type TrackingCardFormValues, type TrackingReportFormValues,
} from "./tracking-state";

const kindNames: Record<TrackingSubjectKind, { card: string; subject: string }> = {
  mentee: { card: "כרטיס מעקב חניכה", subject: "החניכה" },
  mentor: { card: "כרטיס מעקב חונך/ת", subject: "החונך/ת" },
};

function CardForm({ kind, card, subjectId, onClose }: { kind: TrackingSubjectKind; card: TrackingCardView; subjectId: string; onClose: () => void }) {
  const { submitOnline, isOnline } = useWorkspace();
  const intent = useCommandIntent();
  const [values, setValues] = useState<TrackingCardFormValues>(() => trackingCardFormValues(card));
  const [issue, setIssue] = useState<{ field: string; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const subject = trackingSubject(kind, subjectId);
    const built = trackingCardCommand(subject, card, values);
    if (!built.ok) { setIssue(built.issue); return; }
    setBusy(true); setIssue(null); setError(null);
    try {
      const result = await submitOnline({ ...built.payload, operationId: intent.operationId(built.payload) } as Parameters<typeof submitOnline>[0]);
      if (!result.ok) { setError(result.error.message); return; }
      intent.clear();
      toast.success("כרטיס המעקב נשמר");
      onClose();
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-6" noValidate>
      <InlineError message={error} />
      {!isOnline && <Alert><AlertTitle>נדרש חיבור</AlertTitle><AlertDescription>עדכון כרטיס מעקב נשמר רק כשיש חיבור פעיל, ולא נשמר לביצוע מאוחר.</AlertDescription></Alert>}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="tracking-status">סימון מצב</FieldLabel>
          <Select items={{ none: "ללא סימון", ...manualColorNames }} value={values.status} onValueChange={(value) => setValues({ ...values, status: value ?? "none" })}>
            <SelectTrigger id="tracking-status" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>
              <SelectItem value="none">ללא סימון</SelectItem>
              {Object.entries(manualColorNames).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
            </SelectGroup></SelectContent>
          </Select>
        </Field>
        <Field data-invalid={issue?.field === "nextFollowupAt"}>
          <FieldLabel htmlFor="tracking-next">מועד המעקב הבא</FieldLabel>
          <Input id="tracking-next" type="datetime-local" dir="ltr" value={values.nextFollowupAt} onChange={(event) => setValues({ ...values, nextFollowupAt: event.target.value })} aria-invalid={issue?.field === "nextFollowupAt" || undefined} />
          <FieldDescription>אופציונלי. התאריך והשעה לפי שעון ישראל.</FieldDescription>
          {issue?.field === "nextFollowupAt" && <FieldError>{issue.message}</FieldError>}
        </Field>
        <Field data-invalid={issue?.field === "notes"}>
          <FieldLabel htmlFor="tracking-notes">הערות והתרשמות</FieldLabel>
          <Textarea id="tracking-notes" value={values.notes} maxLength={20000} onChange={(event) => setValues({ ...values, notes: event.target.value })} aria-invalid={issue?.field === "notes" || undefined} />
          {issue?.field === "notes" && <FieldError>{issue.message}</FieldError>}
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>סגירה</Button>
        <Button type="submit" disabled={busy || !isOnline}>
          {busy && <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />}
          שמירת הכרטיס
        </Button>
      </DialogFooter>
    </form>
  );
}

function ReportForm({ kind, subjectId, onClose }: { kind: TrackingSubjectKind; subjectId: string; onClose: () => void }) {
  const { submitOnline, isOnline } = useWorkspace();
  const intent = useCommandIntent();
  const [values, setValues] = useState<TrackingReportFormValues>(() => ({ method: "phone", outcome: "completed", occurredAt: toDateTimeInput(new Date()), notes: "" }));
  const [issue, setIssue] = useState<{ field: string; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const subject = trackingSubject(kind, subjectId);
    const built = trackingReportCommand(subject, values);
    if (!built.ok) { setIssue(built.issue); return; }
    setBusy(true); setIssue(null); setError(null);
    try {
      const result = await submitOnline({ ...built.payload, operationId: intent.operationId(built.payload) } as Parameters<typeof submitOnline>[0]);
      if (!result.ok) { setError(result.error.message); return; }
      intent.clear();
      toast.success("הדיווח נשמר בכרטיס המעקב");
      onClose();
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-6" noValidate>
      <InlineError message={error} />
      {!isOnline && <Alert><AlertTitle>נדרש חיבור</AlertTitle><AlertDescription>דיווח בכרטיס מעקב נשמר רק כשיש חיבור פעיל, ולא נשמר לביצוע מאוחר.</AlertDescription></Alert>}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="tracking-method">אופן הקשר</FieldLabel>
          <Select items={trackingMethodNames} value={values.method} onValueChange={(value) => setValues({ ...values, method: value ?? "phone" })}>
            <SelectTrigger id="tracking-method" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>{Object.entries(trackingMethodNames).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="tracking-outcome">תוצאה</FieldLabel>
          <Select items={trackingOutcomeNames} value={values.outcome} onValueChange={(value) => setValues({ ...values, outcome: value ?? "completed" })}>
            <SelectTrigger id="tracking-outcome" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>{Object.entries(trackingOutcomeNames).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </Field>
        <Field data-invalid={issue?.field === "occurredAt"}>
          <FieldLabel htmlFor="tracking-occurred">מתי התקיים הקשר?</FieldLabel>
          <Input id="tracking-occurred" type="datetime-local" dir="ltr" value={values.occurredAt} onChange={(event) => setValues({ ...values, occurredAt: event.target.value })} aria-invalid={issue?.field === "occurredAt" || undefined} required />
          {issue?.field === "occurredAt" && <FieldError>{issue.message}</FieldError>}
        </Field>
        <Field data-invalid={issue?.field === "notes"}>
          <FieldLabel htmlFor="tracking-report-notes">תוכן הדיווח</FieldLabel>
          <Textarea id="tracking-report-notes" value={values.notes} maxLength={20000} onChange={(event) => setValues({ ...values, notes: event.target.value })} aria-invalid={issue?.field === "notes" || undefined} required />
          {issue?.field === "notes" && <FieldError>{issue.message}</FieldError>}
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>סגירה</Button>
        <Button type="submit" disabled={busy || !isOnline}>
          {busy && <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />}
          שמירת הדיווח
        </Button>
      </DialogFooter>
    </form>
  );
}

const methodIcons = { phone: PhoneIcon, in_person: UserRoundIcon, message: MessageSquareIcon } as const;

/**
 * The management tracking card. It renders nothing for a mentor, who also never
 * receives the data: the server omits it from the workspace snapshot.
 */
export function TrackingCardPanel({ kind, subjectId, subjectName }: { kind: TrackingSubjectKind; subjectId: string; subjectName: string }) {
  const { snapshot } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [reporting, setReporting] = useState(false);
  if (!snapshot || !canUseTrackingCards(snapshot.actor)) return null;
  const card = trackingCardFor(snapshot, kind, subjectId);
  const names = kindNames[kind];

  return (
    <div className="flex flex-col gap-5" data-tracking-card={kind}>
      <Card>
        <CardHeader>
          <CardTitle>{names.card}</CardTitle>
          <CardDescription>
            מסמך ניהולי של המנכ״ל והרכזות בלבד: סימון מצב, הערות ומועד מעקב. החונכות אינן רואות אותו ואינן ממלאות אותו.
          </CardDescription>
          <CardAction>
            <Dialog open={editing} onOpenChange={setEditing}>
              <DialogTrigger render={<Button variant="outline" />}><PencilIcon data-icon="inline-start" />עריכת הכרטיס</DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{names.card}: {subjectName}</DialogTitle>
                  <DialogDescription>הכרטיס נשמר עם אישור המערכת בלבד, ושינוי חופף יידחה כדי לא לדרוס עדכון של אחר.</DialogDescription>
                </DialogHeader>
                <CardForm kind={kind} card={card} subjectId={subjectId} onClose={() => setEditing(false)} />
              </DialogContent>
            </Dialog>
          </CardAction>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-5 text-sm">
            <dt className="text-muted-foreground">סימון מצב</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <ManualColorBadge color={card.status} />
              {card.statusAt && <span className="text-xs text-muted-foreground">עודכן ב־{formatDateTime(card.statusAt)}</span>}
            </dd>
            <dt className="text-muted-foreground">מועד המעקב הבא</dt>
            <dd>{card.nextFollowupAt ? formatDateTime(card.nextFollowupAt) : "טרם נקבע"}</dd>
            <dt className="text-muted-foreground">עודכן לאחרונה</dt>
            <dd>{card.updatedAt ? `${formatDateTime(card.updatedAt)} · ${card.updatedByName ?? "חבר/ת צוות"}` : "הכרטיס טרם מולא"}</dd>
          </dl>
          <Separator className="my-5" />
          <h3 className="mb-2 font-medium">הערות והתרשמות</h3>
          {card.notes ? <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{card.notes}</p> : <p className="text-sm text-muted-foreground">עוד לא נכתבו הערות.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>דיווחים בכרטיס <Badge variant="secondary">{card.reports.length}</Badge></CardTitle>
          <CardDescription>שיחות, פגישות וניסיונות קשר של הנהלה או רכזת עם {names.subject}.</CardDescription>
          <CardAction>
            <Dialog open={reporting} onOpenChange={setReporting}>
              <DialogTrigger render={<Button />}><ClipboardPenLineIcon data-icon="inline-start" />דיווח חדש</DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>דיווח חדש בכרטיס המעקב</DialogTitle>
                  <DialogDescription>הדיווח מתועד עם שמך ועם מועד הקשר, ואינו נמחק.</DialogDescription>
                </DialogHeader>
                <ReportForm kind={kind} subjectId={subjectId} onClose={() => setReporting(false)} />
              </DialogContent>
            </Dialog>
          </CardAction>
        </CardHeader>
        <CardContent>
          {card.reports.length ? (
            <div className="flex flex-col gap-6">
              {card.reports.map((report, index) => {
                const Icon = methodIcons[report.method];
                return (
                  <article key={report.id} className="flex flex-col gap-3">
                    {index > 0 && <Separator />}
                    <div className="flex items-start gap-3">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-primary"><Icon className="size-5" /></div>
                      <div>
                        <h3 className="font-semibold">{trackingMethodNames[report.method]} · {trackingOutcomeNames[report.outcome]}</h3>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{formatDateTime(report.occurredAt)} · {report.authorName}</p>
                      </div>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{report.notes}</p>
                  </article>
                );
              })}
            </div>
          ) : (
            <SectionEmpty title="עוד לא נרשם דיווח" description={`דיווחי ההנהלה והרכזות על ${names.subject} יופיעו כאן, לפי מועד הקשר.`} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
