"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  CalendarClockIcon,
  CircleAlertIcon,
  LoaderCircleIcon,
  PaletteIcon,
  PencilIcon,
  ShieldAlertIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/staff/ui/alert";
import { Button } from "@/components/staff/ui/button";
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
  FieldError,
  FieldGroup,
  FieldLabel,
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
import type { MentoringCommand, ParticipantView } from "@/lib/mentoring/contracts";
import type {
  ContactEntry,
  ContactMethod,
  ContactOutcome,
  ManualColor,
} from "@/lib/mentoring/domain";
import { useWorkspace } from "@/lib/mentoring/workspace-client";
import { invalidationNeedsAppointmentReview } from "@/lib/mentoring/features/contacts/policy";
import { InlineError, manualColorNames, useNow } from "./common";
import {
  canCorrectContact,
  canInvalidateContact,
  canScheduleContact,
  contactCorrectionPlan,
  contactEditAccess,
  contactHasAcceptedBaseline,
  contactInvalidationState,
  contactResourceLocked,
} from "./contact-correction-state";
import { DraftRecovery } from "./draft-recovery";
import { DraftStatus, useFormDraft } from "./form-draft";
import { formatDateTime, fromDateTimeInput, toDateTimeInput } from "./format";
import { RecoveredDraft } from "./recovered-draft";
import { contactInputIssues, focusFormIssue, operationalCommandIssue, operationalFieldName } from "./operational-form-state";

type ActionKind = "revise" | "invalidate" | "reschedule" | "color";

const actionLabels: Record<ActionKind, string> = {
  revise: "תיקון דיווח",
  invalidate: "פסילת דיווח",
  reschedule: "שינוי מועד הקשר הבא",
  color: "עדכון מצב הליווי",
};
const actionDescriptions: Record<ActionKind, string> = {
  revise:
    "התיקון נשמר כגרסה חדשה עם שם עורך/ת השינוי וסיבת השינוי. הגרסאות הקודמות נשארות בהיסטוריה; אישור קודם אינו מאשר את הגרסה החדשה.",
  invalidate:
    "הדיווח נשאר בהיסטוריה ומסומן כפסול. הוא לא ייחשב קשר שהושלם ולא יאפס את חובת המעקב.",
  reschedule:
    "שינוי המועד מתועד עם סיבה. הוא אינו מוסיף דיווח על קשר שהתקיים ואינו מאפס את חובת המעקב השבועי.",
  color:
    "עדכון ידני לצוות על מצב הליווי. העדכון אינו מוסיף שיחה או פגישה, ואינו משנה את חובת המעקב השבועי.",
};

/** Always select the visible, current workspace row rather than trusting an old dialog prop. */
function useCurrentContactView(view: ParticipantView) {
  const { snapshot } = useWorkspace();
  return {
    snapshot,
    current: snapshot?.participants.find(
      (item) => item.participant.id === view.participant.id,
    ),
  };
}

export function AppointmentReviewWarning({ view }: { view: ParticipantView }) {
  if (
    !view.nextAppointment?.requiresReview &&
    !view.contactWarnings?.includes("appointment_requires_review")
  )
    return null;
  return (
    <Alert>
      <CircleAlertIcon />
      <AlertTitle>צריך לבדוק את מועד הקשר הבא</AlertTitle>
      <AlertDescription>
        דיווח שהשפיע על המעקב תוקן או נפסל. המועד הקיים נשמר לבדיקה ואינו מהווה
        אישור שהקשר התקיים. יש לבדוק את הכרטיס ולעדכן את המועד לפי הצורך.
      </AlertDescription>
    </Alert>
  );
}

export function ContactCorrectionActions({
  view,
  entry,
}: {
  view: ParticipantView;
  entry: ContactEntry;
}) {
  const { snapshot, current } = useCurrentContactView(view);
  const now = useNow();
  const currentEntry = current?.contacts.find((item) => item.id === entry.id);
  if (
    !snapshot ||
    !current ||
    !currentEntry ||
    current.participant.deletedAt ||
    !contactHasAcceptedBaseline(current, currentEntry) ||
    !contactEditAccess(snapshot.actor, current, now)
  )
    return null;
  const locked = contactResourceLocked(snapshot.actor, current, currentEntry.id);
  const invalidationState = contactInvalidationState(snapshot.actor, current, currentEntry);
  return (
    <div className="flex flex-col items-start gap-2">
      {(currentEntry.localPending || currentEntry.localTimestamp) && !currentEntry.invalidatedAt && (
        <p role="status" className="text-xs leading-relaxed text-muted-foreground">
          שינוי קודם בדיווח ממתין לאישור המערכת. אפשר לשמור שינוי נוסף כבקשה
          נפרדת שתיבדק אחריו; אם הבקשה הקודמת לא תאושר, גם ההמשך יישמר לבדיקה.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {canCorrectContact(snapshot.actor, currentEntry) && (
          <ContactActionDialog
            kind="revise"
            view={current}
            entry={currentEntry}
            locked={locked}
          />
        )}
        {invalidationState !== "unavailable" && (
          <ContactActionDialog
            kind="invalidate"
            view={current}
            entry={currentEntry}
            locked={locked}
            pending={invalidationState === "pending"}
          />
        )}
      </div>
      {locked && !currentEntry.invalidatedAt && (
        <p className="text-xs text-muted-foreground">
          הדיווח מוגן בידי המנכ״ל. נדרשת הסרת ההגנה לפני שינוי.
        </p>
      )}
    </div>
  );
}

export function ContactFollowupActions({ view }: { view: ParticipantView }) {
  const { snapshot, current } = useCurrentContactView(view);
  const now = useNow();
  if (
    !snapshot ||
    !current ||
    current.participant.deletedAt ||
    !contactEditAccess(snapshot.actor, current, now)
  )
    return null;
  return (
    <div className="flex flex-wrap gap-2">
      <ContactActionDialog
        kind="color"
        view={current}
        locked={contactResourceLocked(snapshot.actor, current, current.participant.id, [
          "manualColor",
        ])}
      />
      {current.nextAppointment && canScheduleContact(current) && (
        <ContactActionDialog
          kind="reschedule"
          view={current}
          locked={contactResourceLocked(snapshot.actor, current, current.participant.id, [
            "appointment",
          ])}
        />
      )}
    </div>
  );
}

function ContactActionDialog({
  kind,
  view,
  entry,
  locked,
  pending = false,
}: {
  kind: ActionKind;
  view: ParticipantView;
  entry?: ContactEntry;
  locked: boolean;
  pending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const Icon =
    kind === "revise"
      ? PencilIcon
      : kind === "invalidate"
        ? ShieldAlertIcon
        : kind === "reschedule"
          ? CalendarClockIcon
          : PaletteIcon;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) setOpen(next);
      }}
    >
      <DialogTrigger
        render={
          <Button
            type="button"
            variant={kind === "invalidate" ? "destructive" : "outline"}
            disabled={locked || pending}
            title={pending ? "הפסילה ממתינה לאישור המערכת" : locked ? "הרשומה מוגנת בידי המנכ״ל" : undefined}
          />
        }
      >
        <Icon data-icon="inline-start" />
        {actionLabels[kind]}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{actionLabels[kind]}</DialogTitle>
          <DialogDescription>{actionDescriptions[kind]}</DialogDescription>
        </DialogHeader>
        {open && (
          <ContactActionForm
            kind={kind}
            view={view}
            entry={entry}
            onBusyChange={setBusy}
            onClose={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface ActionDraft {
  method: ContactMethod;
  outcome: ContactOutcome;
  occurredAt: string;
  sourceOccurredAt: string;
  nextAppointmentAt: string;
  notes: string;
  color: ManualColor;
  reason: string;
  baseVersion: number;
  contactRevision: number | null;
  appointmentVersion: number | null;
}

function ContactActionForm({
  kind,
  view,
  entry,
  onBusyChange,
  onClose,
}: {
  kind: ActionKind;
  view: ParticipantView;
  entry?: ContactEntry;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
}) {
  const { snapshot, submit } = useWorkspace();
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [queued, setQueued] = useState(false);
  const submitting = useRef(false);
  const draft = useFormDraft<ActionDraft>(
    `contact-action:${kind}:${view.participant.id}:${entry?.id ?? "followup"}`,
    {
      method: entry?.method ?? "phone",
      outcome: entry?.outcome ?? "completed",
      occurredAt: entry ? toDateTimeInput(entry.occurredAt) : "",
      sourceOccurredAt: entry?.occurredAt ?? "",
      nextAppointmentAt: view.nextAppointment
        ? toDateTimeInput(view.nextAppointment.scheduledAt)
        : "",
      notes: entry?.notes ?? "",
      color: view.manualColor ?? "green",
      reason: "",
      baseVersion: view.participant.version,
      contactRevision: entry?.revision ?? null,
      appointmentVersion: view.nextAppointment?.version ?? null,
    },
  );
  const values = draft.value;
  // The control displays minutes. Preserve the accepted seconds for a notes-only edit.
  const occurredAt =
    values.occurredAt === toDateTimeInput(values.sourceOccurredAt)
      ? values.sourceOccurredAt || null
      : fromDateTimeInput(values.occurredAt);
  const nextAt = fromDateTimeInput(values.nextAppointmentAt);
  const revisionPlan =
    kind === "revise" && entry
      ? contactCorrectionPlan(
          view.contacts,
          entry.id,
          {
            method: values.method,
            outcome: values.outcome,
            occurredAt: occurredAt ?? "",
            ...(view.participant.lifecycle === "active" && nextAt ? { nextAppointmentAt: nextAt } : {}),
          },
          now.toISOString(),
          view.participant.lifecycle,
        )
      : null;
  const needsNext = view.participant.lifecycle === "active" && (revisionPlan?.needsNextAppointment ?? false);
  const affectsAppointment =
    kind === "reschedule" ||
    (kind === "invalidate" && entry && invalidationNeedsAppointmentReview(view.contacts, entry.id)) ||
    (kind === "revise" &&
      (needsNext ||
        (revisionPlan?.plan.ok &&
          revisionPlan.plan.appointmentEffect === "retain_with_warning")));
  const currentEntry = entry
    ? view.contacts.find((item) => item.id === entry.id)
    : undefined;
  const allowed = Boolean(
    snapshot &&
      !view.participant.deletedAt &&
      contactEditAccess(snapshot.actor, view, now) &&
      (kind !== "reschedule" || canScheduleContact(view)) &&
      (kind === "revise"
        ? currentEntry && contactHasAcceptedBaseline(view, currentEntry) && canCorrectContact(snapshot.actor, currentEntry)
        : kind === "invalidate"
          ? currentEntry && contactHasAcceptedBaseline(view, currentEntry) && canInvalidateContact(snapshot.actor, currentEntry)
          : true),
  );
  const locked = Boolean(
    snapshot &&
      (contactResourceLocked(
        snapshot.actor,
        view,
        entry?.id ?? view.participant.id,
        entry ? undefined : [kind === "color" ? "manualColor" : "appointment"],
      ) ||
        (affectsAppointment &&
          contactResourceLocked(snapshot.actor, view, view.participant.id, [
            "appointment",
          ]))),
  );
  const stale =
    draft.hydrated &&
    (values.baseVersion !== view.participant.version ||
      (entry && values.contactRevision !== entry.revision) ||
      (kind !== "color" &&
        values.appointmentVersion !== (view.nextAppointment?.version ?? null)));
  const prefix = `contact-action-${kind}-${entry?.id ?? view.participant.id}`;

  function update<K extends keyof ActionDraft>(field: K, value: ActionDraft[K]) {
    draft.update({ ...values, [field]: value });
    setIssues((previous) => ({ ...previous, [field]: "" }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || busy || queued || !draft.hydrated || stale || !allowed || locked) return;
    const submittedAt = new Date();
    const found = kind === "revise"
      ? contactInputIssues({ method: values.method, outcome: values.outcome, notes: values.notes })
      : kind === "color"
        ? contactInputIssues({ method: "phone", outcome: "completed", notes: "", color: values.color })
        : {};
    const reason = values.reason.trim();
    if (kind !== "color" && !reason) found.reason = "יש לכתוב את סיבת השינוי.";
    if (reason.length > 2000) found.reason = "הסיבה יכולה להכיל עד 2,000 תווים.";
    let payload: Omit<Extract<MentoringCommand, { type: "set_manual_color" }>, "operationId"> |
      Omit<Extract<MentoringCommand, { type: "reschedule_appointment" }>, "operationId"> |
      Omit<Extract<MentoringCommand, { type: "revise_contact" }>, "operationId"> |
      Omit<Extract<MentoringCommand, { type: "invalidate_contact" }>, "operationId">;
    const common = {
      participantId: view.participant.id,
      expectedVersion: values.baseVersion,
    };
    if (kind === "revise" && entry) {
      const plan = contactCorrectionPlan(
        view.contacts,
        entry.id,
        {
          method: values.method,
          outcome: values.outcome,
          occurredAt: occurredAt ?? "",
          ...(view.participant.lifecycle === "active" && nextAt ? { nextAppointmentAt: nextAt } : {}),
        },
        submittedAt.toISOString(),
        view.participant.lifecycle,
      );
      if (!occurredAt) found.occurredAt = "יש להזין מועד תקין לפי שעון ישראל.";
      else if (!plan.plan.ok) found[plan.plan.field] = plan.plan.message;
      payload = {
        ...common,
        type: "revise_contact",
        contactId: entry.id,
        expectedRevision: values.contactRevision!,
        expectedAppointmentVersion: values.appointmentVersion,
        method: values.method,
        outcome: values.outcome,
        occurredAt: occurredAt ?? "",
        notes: values.notes.trim(),
        reason,
        ...(view.participant.lifecycle === "active" && plan.needsNextAppointment && nextAt ? { nextAppointmentAt: nextAt } : {}),
      };
    } else if (kind === "invalidate" && entry) {
      payload = {
        ...common,
        type: "invalidate_contact",
        contactId: entry.id,
        expectedRevision: values.contactRevision!,
        expectedAppointmentVersion: values.appointmentVersion,
        reason,
      };
    } else if (kind === "reschedule") {
      if (!nextAt || Date.parse(nextAt) <= submittedAt.getTime())
        found.nextAppointmentAt = "יש לבחור תאריך ושעה עתידיים לקשר הבא.";
      if (values.appointmentVersion === null)
        found.nextAppointmentAt = "אין מועד קיים לשינוי. יש לתעד תחילה קשר שהושלם.";
      payload = {
        ...common,
        type: "reschedule_appointment",
        expectedAppointmentVersion: values.appointmentVersion ?? 0,
        scheduledAt: nextAt ?? "",
        reason,
      };
    } else {
      payload = {
        ...common,
        type: "set_manual_color",
        color: values.color,
        ...(reason ? { reason } : {}),
      };
    }
    const invalidCommand = operationalCommandIssue(payload);
    if (invalidCommand) {
      const field = invalidCommand.field;
      found[field] ??= invalidCommand.message;
    }
    setIssues(found);
    setError(null);
    if (Object.keys(found).length) {
      focusFormIssue(event.currentTarget, found);
      if (invalidCommand && !["method", "outcome", "notes", "occurredAt", "nextAppointmentAt", "reason", "color"].includes(invalidCommand.field)) setError(invalidCommand.message);
      return;
    }
    submitting.current = true;
    setBusy(true);
    onBusyChange(true);
    let prepared = false;
    try {
      const operationId = await draft.prepare(payload);
      prepared = true;
      const result = await submit({ ...payload, operationId });
      if (!result.ok) {
        setError(result.error.message);
        if (result.error.field) setIssues({ [operationalFieldName(result.error.field)]: result.error.message });
        draft.recheck();
        return;
      }
      try {
        await draft.clear();
      } catch {
        toast.warning("הפעולה נשמרה. הטיוטה נשארה במכשיר ותיבדק לפני שליחה נוספת.");
      }
      if (result.acceptance === "queued") {
        setQueued(true);
        toast.success("הפעולה נשמרה במכשיר וממתינה לאישור המערכת");
      } else {
        toast.success("השינוי נשמר בכרטיס החניכה");
        onClose();
      }
    } catch {
      setError(prepared
        ? "לא התקבל אישור לשינוי. זהות הבקשה נשמרה ותיבדק לניסיון נוסף."
        : "לא ניתן להכין את הבקשה לשמירה. הפרטים נשארו בטופס; יש להשאיר אותו פתוח, לבדוק את מצב הטיוטה ולנסות שוב.");
      if (prepared) draft.recheck();
    } finally {
      submitting.current = false;
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
        <p>{actionLabels[kind]} עבור {view.participant.displayName}</p>
        <p className="whitespace-pre-wrap break-words">{values.reason || "לא הוזנה סיבה"}</p>
      </RecoveredDraft>
    );

  if (queued)
    return (
      <div className="flex flex-col gap-5">
        <Alert>
          <CalendarClockIcon />
          <AlertTitle>השינוי ממתין לאישור המערכת</AlertTitle>
          <AlertDescription>
            הפעולה נשמרה במכשיר ותישלח כשיתחדש החיבור. רק לאחר אישור המערכת היא
            נחשבת שינוי שהתקבל; אין צורך לשלוח אותה שוב.
          </AlertDescription>
        </Alert>
        <DialogFooter>
          <Button type="button" onClick={onClose}>סגירה</Button>
        </DialogFooter>
      </div>
    );

  return (
    <form onSubmit={save} noValidate className="flex min-w-0 flex-col gap-5">
      <InlineError message={error} />
      {(kind === "revise" || kind === "invalidate") && entry &&
        (entry.localPending || entry.localTimestamp) && contactHasAcceptedBaseline(view, entry) && (
        <Alert>
          <CalendarClockIcon />
          <AlertTitle>בקשה נוספת אחרי שינוי שממתין לאישור</AlertTitle>
          <AlertDescription>
            הדיווח המקורי מוכר למערכת. השינוי הזה יישמר כפעולה נפרדת על הגרסה
            המוצגת, ויישלח אחרי הבקשה הקודמת. כל בקשה נבדקת מחדש לפי ההרשאות
            וההגנות במערכת; בקשה שלא תאושר תשאיר גם את ההמשך לבדיקה.
          </AlertDescription>
        </Alert>
      )}
      {kind === "revise" && view.participant.lifecycle !== "active" && (
        <Alert>
          <CircleAlertIcon />
          <AlertTitle>תיקון היסטורי בכרטיס {view.participant.lifecycle === "paused" ? "מושהה" : "סגור"}</AlertTitle>
          <AlertDescription>
            אפשר לתקן את פרטי הדיווח בלי להחזיר את הליווי לפעילות. התיקון אינו
            יוצר או מחליף מועד. אם קיים מועד, שינוי שמשפיע על הקשר האחרון יסמן
            אותו לבדיקת הצוות.
          </AlertDescription>
        </Alert>
      )}
      {kind === "reschedule" && view.participant.lifecycle !== "active" && (
        <Alert>
          <CircleAlertIcon />
          <AlertTitle>אפשר לשנות מועד רק בכרטיס ליווי פעיל</AlertTitle>
          <AlertDescription>הטיוטה נשמרה במכשיר. המועד הקיים נשאר ללא שינוי.</AlertDescription>
        </Alert>
      )}
      {((kind === "invalidate" && entry && invalidationNeedsAppointmentReview(view.contacts, entry.id)) ||
        (revisionPlan?.plan.ok && revisionPlan.plan.appointmentEffect === "retain_with_warning")) && (
        <Alert>
          <CircleAlertIcon />
          <AlertTitle>{view.nextAppointment ? "המועד הקיים יישמר לבדיקה" : "התיקון אינו קובע מועד המשך"}</AlertTitle>
          <AlertDescription>{view.nextAppointment ? "השינוי משפיע על הקשר האחרון שהושלם. מועד ההמשך לא יוחלף אוטומטית, והוא יסומן לבדיקת הצוות." : "השינוי נשמר בהיסטוריית הקשר. לא יתווסף מועד חדש במסגרת התיקון הזה."}</AlertDescription>
        </Alert>
      )}
      {(!allowed || locked) && (
        <Alert>
          <ShieldAlertIcon />
          <AlertTitle>{locked ? "השדה מוגן בידי המנכ״ל" : "ההרשאה לשינוי אינה זמינה"}</AlertTitle>
          <AlertDescription>
            הטיוטה נשארת שמורה במכשיר. יש לבדוק את ההרשאה או להסיר את ההגנה לפני שמירת השינוי.
          </AlertDescription>
        </Alert>
      )}
      {stale && (
        <DraftRecovery
          rows={[
            { label: "גרסת הכרטיס", current: String(view.participant.version), draft: String(values.baseVersion) },
            ...(entry ? [{ label: "סיכום הדיווח", current: entry.notes ?? "", draft: values.notes }] : []),
            ...(kind !== "color" ? [{ label: "מועד הקשר הבא", current: formatDateTime(view.nextAppointment?.scheduledAt), draft: kind === "revise" && !needsNext ? "ללא שינוי במסגרת התיקון" : values.nextAppointmentAt ? formatDateTime(nextAt) : "טרם נקבע" }] : []),
            { label: "סיבת השינוי", current: "פעולה חדשה שתישמר בהיסטוריה", draft: values.reason },
          ]}
          onRebase={() => {
            draft.update({ ...values, baseVersion: view.participant.version, contactRevision: entry?.revision ?? null, appointmentVersion: view.nextAppointment?.version ?? null });
            setError(null);
            setIssues({});
          }}
        />
      )}
      <fieldset disabled={busy || !draft.hydrated || !allowed || locked} className="min-w-0 border-0 p-0">
        <FieldGroup>
          {entry && (
            <p className="text-sm text-muted-foreground">
              הדיווח מ־{formatDateTime(entry.occurredAt)} · גרסה {entry.revision}
            </p>
          )}
          {kind === "revise" && (
            <>
              <Field data-invalid={Boolean(issues.method)}>
                <FieldLabel htmlFor={`${prefix}-method`}>אופן הקשר</FieldLabel>
                <Select items={{ phone: "שיחה טלפונית", in_person: "פגישה פנים אל פנים" }} value={values.method} onValueChange={(value) => {
                  if (value === "phone" || value === "in_person") update("method", value);
                }} disabled={busy || !draft.hydrated || !allowed || locked}>
                  <SelectTrigger id={`${prefix}-method`} data-validation-field="method" className="w-full" aria-invalid={Boolean(issues.method)} aria-describedby={issues.method ? `${prefix}-method-error` : undefined}><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup>
                    <SelectItem value="phone">שיחה טלפונית</SelectItem>
                    <SelectItem value="in_person" disabled={values.outcome === "no_answer"}>פגישה פנים אל פנים</SelectItem>
                  </SelectGroup></SelectContent>
                </Select>
                {issues.method && <FieldError id={`${prefix}-method-error`}>{issues.method}</FieldError>}
              </Field>
              <Field data-invalid={Boolean(issues.outcome)}>
                <FieldLabel htmlFor={`${prefix}-outcome`}>תוצאת הקשר</FieldLabel>
                <Select items={{ completed: "הקשר הושלם", no_answer: "לא היה מענה" }} value={values.outcome} onValueChange={(value) => {
                  if (value === "completed" || value === "no_answer") {
                    draft.update({ ...values, outcome: value, ...(value === "no_answer" ? { method: "phone" as const } : {}) });
                    setIssues({});
                  }
                }} disabled={busy || !draft.hydrated || !allowed || locked}>
                  <SelectTrigger id={`${prefix}-outcome`} data-validation-field="outcome" className="w-full" aria-invalid={Boolean(issues.outcome)} aria-describedby={issues.outcome ? `${prefix}-outcome-error` : undefined}><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup>
                    <SelectItem value="completed">הקשר הושלם</SelectItem>
                    <SelectItem value="no_answer">לא היה מענה</SelectItem>
                  </SelectGroup></SelectContent>
                </Select>
                {issues.outcome && <FieldError id={`${prefix}-outcome-error`}>{issues.outcome}</FieldError>}
              </Field>
              <Field data-invalid={Boolean(issues.occurredAt)}>
                <FieldLabel htmlFor={`${prefix}-occurred`}>מועד הקשר בפועל</FieldLabel>
                <Input id={`${prefix}-occurred`} data-validation-field="occurredAt" type="datetime-local" dir="ltr" value={values.occurredAt} onChange={(event) => update("occurredAt", event.target.value)} aria-invalid={Boolean(issues.occurredAt)} aria-describedby={issues.occurredAt ? `${prefix}-occurred-error` : undefined} required />
                <FieldDescription>התאריך והשעה לפי שעון ישראל.</FieldDescription>
                {issues.occurredAt && <FieldError id={`${prefix}-occurred-error`}>{issues.occurredAt}</FieldError>}
              </Field>
              <Field data-invalid={Boolean(issues.notes)}>
                <FieldLabel htmlFor={`${prefix}-notes`}>סיכום הדיווח המתוקן</FieldLabel>
                <Textarea id={`${prefix}-notes`} data-validation-field="notes" rows={5} aria-invalid={Boolean(issues.notes)} aria-describedby={issues.notes ? `${prefix}-notes-error` : undefined} maxLength={20000} value={values.notes} onChange={(event) => update("notes", event.target.value)} />
                {issues.notes && <FieldError id={`${prefix}-notes-error`}>{issues.notes}</FieldError>}
              </Field>
            </>
          )}
          {view.participant.lifecycle === "active" && (kind === "reschedule" || needsNext) && (
            <Field data-invalid={Boolean(issues.nextAppointmentAt)}>
              <FieldLabel htmlFor={`${prefix}-next`}>מועד הקשר הבא</FieldLabel>
              <Input id={`${prefix}-next`} data-validation-field="nextAppointmentAt" type="datetime-local" dir="ltr" value={values.nextAppointmentAt} onChange={(event) => update("nextAppointmentAt", event.target.value)} aria-invalid={Boolean(issues.nextAppointmentAt)} aria-describedby={issues.nextAppointmentAt ? `${prefix}-next-error` : undefined} required />
              <FieldDescription>
                {needsNext ? "תיקון מועד הקשר האחרון מחייב קביעת מועד המשך. כל המועדים לפי שעון ישראל." : "שינוי מועד בלבד, ללא תיעוד של קשר חדש. כל המועדים לפי שעון ישראל."}
              </FieldDescription>
              {issues.nextAppointmentAt && <FieldError id={`${prefix}-next-error`}>{issues.nextAppointmentAt}</FieldError>}
            </Field>
          )}
          {kind === "revise" && !needsNext && view.participant.lifecycle === "active" && (
            <p className="text-sm text-muted-foreground">התיקון הזה שומר את מועד הקשר הבא. לשינוי המועד יש להשתמש בפעולת שינוי מועד.</p>
          )}
          {kind === "color" && (
            <Field data-invalid={Boolean(issues.color)}>
              <FieldLabel htmlFor={`${prefix}-color`}>מצב הליווי המדווח</FieldLabel>
              <Select items={manualColorNames} value={values.color} onValueChange={(value) => {
                if (value === "green" || value === "orange" || value === "red") update("color", value);
              }} disabled={busy || !draft.hydrated || !allowed || locked}>
                <SelectTrigger id={`${prefix}-color`} data-validation-field="color" className="w-full" aria-invalid={Boolean(issues.color)} aria-describedby={issues.color ? `${prefix}-color-error` : undefined}><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>
                  <SelectItem value="green">{manualColorNames.green}</SelectItem>
                  <SelectItem value="orange">{manualColorNames.orange}</SelectItem>
                  <SelectItem value="red">{manualColorNames.red}</SelectItem>
                </SelectGroup></SelectContent>
              </Select>
                {issues.color && <FieldError id={`${prefix}-color-error`}>{issues.color}</FieldError>}
            </Field>
          )}
          <Field data-invalid={Boolean(issues.reason)}>
            <FieldLabel htmlFor={`${prefix}-reason`}>{kind === "color" ? "הערה לעדכון (לא חובה)" : "סיבת השינוי"}</FieldLabel>
            <Textarea id={`${prefix}-reason`} data-validation-field="reason" rows={3} maxLength={2000} value={values.reason} onChange={(event) => update("reason", event.target.value)} aria-invalid={Boolean(issues.reason)} aria-describedby={issues.reason ? `${prefix}-reason-error` : undefined} required={kind !== "color"} />
            <FieldDescription>הסיבה ושם עורך/ת השינוי יישמרו בהיסטוריית הכרטיס.</FieldDescription>
            {issues.reason && <FieldError id={`${prefix}-reason-error`}>{issues.reason}</FieldError>}
          </Field>
        </FieldGroup>
      </fieldset>
      <DraftStatus status={draft.status} onRetry={draft.retry} />
      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>סגירה ושמירת טיוטה</Button>
        <Button type="submit" variant={kind === "invalidate" ? "destructive" : "default"} disabled={busy || !draft.hydrated || stale || !allowed || locked}>
          {busy && <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />}
          {kind === "invalidate" ? "פסילת הדיווח ושמירת הסיבה" : "שמירת השינוי"}
        </Button>
      </DialogFooter>
    </form>
  );
}
