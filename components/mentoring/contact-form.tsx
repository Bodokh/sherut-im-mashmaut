"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRightIcon,
  CalendarCheck2Icon,
  CalendarClockIcon,
  CircleAlertIcon,
  LoaderCircleIcon,
  MessageSquareTextIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/staff/ui/alert";
import { Button } from "@/components/staff/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/staff/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
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
import { Separator } from "@/components/staff/ui/separator";
import { Textarea } from "@/components/staff/ui/textarea";
import type { ParticipantView } from "@/lib/mentoring/contracts";
import {
  validateCompletedContact,
  type ContactMethod,
  type ContactOutcome,
  type ManualColor,
} from "@/lib/mentoring/domain";
import { useWorkspace } from "@/lib/mentoring/workspace-client";
import {
  FollowupBadge,
  InlineError,
  PageHeading,
  ParticipantIdentity,
  SectionEmpty,
  followupFor,
  serviceNames,
  useNow,
} from "./common";
import { formatDateTime, fromDateTimeInput, toDateTimeInput } from "./format";
import { DraftStatus, useFormDraft } from "./form-draft";
import { DraftRecovery } from "./draft-recovery";
import { RecoveredDraft } from "./recovered-draft";
import { AssignmentEditor } from "./participant-forms";
import { AppointmentReviewWarning } from "./contact-corrections";
import { canScheduleContact, contactEditAccess, contactResourceLocked } from "./contact-correction-state";
import { contactInputIssues, focusFormIssue, operationalCommandIssue, operationalFieldName } from "./operational-form-state";

export function ContactFormView({
  initialParticipantId,
}: {
  initialParticipantId?: string;
}) {
  const { snapshot } = useWorkspace();
  const now = useNow();
  const [participantId, setParticipantId] = useState<string | null>(
    initialParticipantId ?? null,
  );
  if (!snapshot) return null;
  const view = snapshot.participants.find(
    ({ participant }) => participant.id === participantId,
  );

  return (
    <>
      <PageHeading
        title="מתעדים קשר, ממשיכים ללוות"
        description="תיעוד קצר של מה שהתקיים וקביעת מועד אישי לקשר הבא. השיחות והפגישות נשמרות בכרטיס החניכה."
      />
      <Card>
        <CardHeader>
          <CardTitle>עם מי נוצר הקשר?</CardTitle>
          <CardDescription>
            יש לבחור חניכה מתוך הכרטיסים הזמינים לך.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {snapshot.participants.length ? (
            <Field>
              <FieldLabel htmlFor="contact-participant">חניכה</FieldLabel>
              <Select
                items={snapshot.participants.map(({ participant }) => ({
                  value: participant.id,
                  label: participant.displayName || "חניכה ללא שם",
                }))}
                value={view?.participant.id ?? null}
                onValueChange={setParticipantId}
              >
                <SelectTrigger
                  id="contact-participant"
                  className="w-full sm:max-w-md"
                >
                  <SelectValue placeholder="בחירת חניכה" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {snapshot.participants.map(({ participant }) => (
                      <SelectItem key={participant.id} value={participant.id}>
                        {participant.displayName || "חניכה ללא שם"}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {initialParticipantId &&
                !view &&
                participantId === initialParticipantId && (
                  <FieldDescription>
                    הכרטיס שבקישור אינו זמין כרגע. אפשר לבחור כרטיס אחר מהרשימה.
                  </FieldDescription>
                )}
            </Field>
          ) : (
            <SectionEmpty
              title="אין כרגע חניכות זמינות לתיעוד"
              description="החניכה צריכה להופיע במערך הליווי ולהיות משויכת לחונך/ת. לאחר מכן אפשר לתעד את הקשר."
              action={
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/staff/participants" />}
                >
                  <ArrowRightIcon data-icon="inline-start" />
                  לרשימת החניכות
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>
      {view &&
        (!contactEditAccess(snapshot.actor, view, now) ? (
          <Alert>
            <CircleAlertIcon />
            <AlertTitle>הכרטיס זמין לצפייה בלבד</AlertTitle>
            <AlertDescription>ההרשאה בחשבון שלך אינה מאפשרת לתעד קשר בכרטיס הזה.</AlertDescription>
          </Alert>
        ) : view.participant.lifecycle !== "active" ? (
          <Alert>
            <CircleAlertIcon />
            <AlertTitle>הליווי בכרטיס אינו פעיל</AlertTitle>
            <AlertDescription>אפשר לתעד קשר חדש אחרי שההנהלה תחזיר את הכרטיס לליווי פעיל.</AlertDescription>
          </Alert>
        ) : view.assignment ? (
          <ContactFields key={view.participant.id} view={view} />
        ) : (
          <Alert>
            <CircleAlertIcon />
            <AlertTitle>לפני התיעוד יש לשייך חונך/ת אחראי/ת</AlertTitle>
            <AlertDescription>
              <p>השיוך מגדיר מי אחראים לליווי ומתחיל את המעקב השבועי.</p>
              <div className="mt-3">
                <AssignmentEditor view={view} />
              </div>
            </AlertDescription>
          </Alert>
        ))}
    </>
  );
}

interface ContactDraft {
  method: ContactMethod;
  outcome: ContactOutcome;
  occurredAt: string;
  nextAppointmentAt: string;
  notes: string;
  manualColor: ManualColor | "unchanged";
  baseVersion: number;
  appointmentVersion: number | null;
}

const issueMessages: Record<string, string> = {
  invalid_method: "יש לבחור שיחה טלפונית או פגישה פנים אל פנים.",
  invalid_contact_time: "יש להזין תאריך ושעה תקינים של הקשר בפועל.",
  future_contact: "אפשר לתעד קשר שהתקיים עד עכשיו, ללא מועד עתידי.",
  next_appointment_required: "יש לבחור תאריך ושעה לקשר הבא.",
  next_not_after_contact: "מועד הקשר הבא צריך להיות מאוחר מהקשר שתועד.",
  after_cadence_deadline:
    "המועד שנבחר מאוחר מחלון שבעת הימים. חובת המעקב השבועית ממשיכה לחול גם אם נקבע מועד מאוחר יותר.",
};

function ContactFields({ view }: { view: ParticipantView }) {
  const { submit, snapshot } = useWorkspace();
  const router = useRouter();
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const submitting = useRef(false);
  const draft = useFormDraft<ContactDraft>(`contact:${view.participant.id}`, {
    method: "phone",
    outcome: "completed",
    occurredAt: toDateTimeInput(new Date()),
    nextAppointmentAt: "",
    notes: "",
    manualColor: "unchanged",
    baseVersion: view.participant.version,
    appointmentVersion: view.nextAppointment?.version ?? null,
  });
  const values = draft.value;
  const allowed = Boolean(snapshot && canScheduleContact(view) && contactEditAccess(snapshot.actor, view, now));
  const manualColorLocked = Boolean(snapshot && contactResourceLocked(snapshot.actor, view, view.participant.id, ["manualColor"]));
  const appointmentLocked = Boolean(snapshot && values.outcome === "completed" && contactResourceLocked(snapshot.actor, view, view.participant.id, ["appointment"]));
  const blocked = !allowed || appointmentLocked || (manualColorLocked && values.manualColor !== "unchanged" && values.manualColor !== view.manualColor);
  const occurredAt = fromDateTimeInput(values.occurredAt);
  const nextAppointmentAt = fromDateTimeInput(values.nextAppointmentAt);
  const warnings =
    values.outcome === "completed" && occurredAt && nextAppointmentAt
      ? validateCompletedContact(
          { method: values.method, occurredAt, nextAppointmentAt },
          now,
        ).filter((issue) => issue.severity === "warning")
      : [];
  const followup = followupFor(view, now);
  const stale =
    draft.hydrated &&
    (values.baseVersion !== view.participant.version ||
      values.appointmentVersion !== (view.nextAppointment?.version ?? null));
  function update<K extends keyof ContactDraft>(
    field: K,
    value: ContactDraft[K],
  ) {
    draft.update({ ...values, [field]: value });
    setIssues((previous) => ({ ...previous, [field]: "" }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || busy || !draft.hydrated || stale || blocked) return;
    const submittedAt = new Date();
    const foundIssues = contactInputIssues(values);
    if (values.outcome === "no_answer" && values.method !== "phone")
      foundIssues.method =
        "ניסיון ללא מענה מתועד כשיחה טלפונית. יש לבחור שיחה טלפונית.";
    if (!occurredAt)
      foundIssues.occurredAt =
        "יש להזין מועד תקין. בשינוי לשעון קיץ, שעה שאינה קיימת אינה ניתנת לבחירה.";
    else if (new Date(occurredAt).getTime() > submittedAt.getTime())
      foundIssues.occurredAt = issueMessages.future_contact;
    if (values.outcome === "completed") {
      for (const issue of validateCompletedContact(
        {
          method: values.method,
          occurredAt: occurredAt ?? "",
          nextAppointmentAt,
        },
        submittedAt,
      )) {
        if (issue.severity === "error")
          foundIssues[issue.field] =
            issueMessages[issue.code] ?? "יש לבדוק את הערך שהוזן.";
      }
    }
    setIssues(foundIssues);
    setError(null);
    if (Object.keys(foundIssues).length) {
      focusFormIssue(event.currentTarget, foundIssues);
      return;
    }
    const payload = {
      type: "record_contact" as const,
      participantId: view.participant.id,
      expectedVersion: values.baseVersion,
      expectedAppointmentVersion: values.appointmentVersion,
      method: values.method,
      outcome: values.outcome,
      occurredAt: occurredAt!,
      notes: values.notes.trim(),
      ...(values.manualColor === "unchanged"
        ? {}
        : { manualColor: values.manualColor }),
      ...(values.outcome === "completed" && nextAppointmentAt
        ? { nextAppointmentAt }
        : {}),
    };
    const invalidCommand = operationalCommandIssue(payload);
    if (invalidCommand) {
      const commandIssues = { [invalidCommand.field]: invalidCommand.message };
      setIssues(commandIssues);
      setError(invalidCommand.message);
      focusFormIssue(event.currentTarget, commandIssues);
      return;
    }
    submitting.current = true;
    setBusy(true);
    let completed = false;
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
        toast.warning(
          "הדיווח נשמר, אך לא ניתן לנקות את הטיוטה. יש לבדוק את היסטוריית הקשר לפני שליחה נוספת.",
        );
      }
      toast.success(
        result.acceptance === "queued"
          ? "הדיווח נשמר במכשיר וממתין לשליחה למערכת"
          : "הקשר תועד בכרטיס החניכה",
      );
      completed = true;
      const href = `/staff/participants/${encodeURIComponent(view.participant.id)}`;
      if (result.acceptance === "queued") {
        // Offline queued saves cannot fetch the RSC payload required by router.push.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(href);
      } else router.push(href);
    } catch {
      setError(prepared
        ? "לא התקבל אישור לתיעוד. זהות הבקשה נשמרה ותיבדק לניסיון נוסף."
        : "לא ניתן להכין את הבקשה לשמירה. הפרטים נשארו בטופס; יש להשאיר אותו פתוח, לבדוק את מצב הטיוטה ולנסות שוב.");
      if (prepared) draft.recheck();
    } finally {
      submitting.current = false;
      if (!completed) setBusy(false);
    }
  }

  if (draft.recovered)
    return (
      <RecoveredDraft
        result={draft.recovered}
        onClear={draft.clear}
        participantId={view.participant.id}
      >
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 text-sm">
          <dt>החניכה</dt>
          <dd>{view.participant.displayName}</dd>
          <dt>מועד הקשר</dt>
          <dd>{occurredAt ? formatDateTime(occurredAt) : values.occurredAt}</dd>
          <dt>הסיכום בטיוטה</dt>
          <dd className="whitespace-pre-wrap break-words">
            {values.notes || "לא הוזן סיכום"}
          </dd>
        </dl>
      </RecoveredDraft>
    );

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
      <form onSubmit={save} noValidate className="flex min-w-0 flex-col gap-5">
        <InlineError message={error} />
        <AppointmentReviewWarning view={view} />
        {appointmentLocked && (
          <Alert>
            <CircleAlertIcon />
            <AlertTitle>מועד הקשר הבא מוגן בידי המנכ״ל</AlertTitle>
            <AlertDescription>
              תיעוד קשר שהושלם קובע גם מועד המשך חדש. נדרשת הסרת ההגנה בידי
              המנכ״ל או שמירה בידי המנכ״ל לפני שאפשר להשלים את התיעוד. הטיוטה
              נשארת שמורה במכשיר.
            </AlertDescription>
          </Alert>
        )}
        {blocked && !appointmentLocked && (
          <Alert>
            <CircleAlertIcon />
            <AlertTitle>{allowed ? "הצבע מוגן בידי המנכ״ל" : "ההרשאה לתיעוד אינה זמינה"}</AlertTitle>
            <AlertDescription>
              הטיוטה נשארת שמורה. יש לבדוק את הרשאת הכרטיס או את ההגנה לפני שמירת השינוי.
            </AlertDescription>
          </Alert>
        )}
        {stale && !busy && (
          <DraftRecovery
            contact
            rows={[
              {
                label: "הקשר האחרון / הקשר בטיוטה",
                current: formatDateTime(followup?.lastCompletedContactAt),
                draft: occurredAt
                  ? formatDateTime(occurredAt)
                  : values.occurredAt,
              },
              {
                label: "מועד הפגישה הבאה",
                current: formatDateTime(view.nextAppointment?.scheduledAt),
                draft:
                  values.outcome === "completed"
                    ? nextAppointmentAt
                      ? formatDateTime(nextAppointmentAt)
                      : "טרם נקבע"
                    : "ניסיון ללא מענה — המועד הקיים נשמר",
              },
              {
                label: "הסיכום שלך לדיווח החדש",
                current: "הוספת דיווח חדש להיסטוריה",
                draft: values.notes,
              },
              ...(values.manualColor === "unchanged"
                ? []
                : [
                    {
                      label: "דיווח החונך/ת על מצב הליווי",
                      current:
                        view.manualColor === "green"
                          ? "ירוק — בוצע"
                          : view.manualColor === "orange"
                            ? "כתום — בעיכוב"
                            : view.manualColor === "red"
                              ? "אדום — נדרש טיפול"
                              : "טרם עודכן דיווח",
                      draft:
                        values.manualColor === "green"
                          ? "ירוק — בוצע"
                          : values.manualColor === "orange"
                            ? "כתום — בעיכוב"
                            : "אדום — נדרש טיפול",
                    },
                  ]),
            ]}
            onRebase={() => {
              draft.update({
                ...values,
                baseVersion: view.participant.version,
                appointmentVersion: view.nextAppointment?.version ?? null,
              });
              setError(null);
              setIssues({});
            }}
          />
        )}
        <Card>
          <CardHeader>
            <CardTitle>פרטי הקשר</CardTitle>
            <CardDescription>
              יש להזין את מועד הקשר שהתקיים בפועל. כל המועדים לפי שעון ישראל.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <fieldset
              disabled={busy || !draft.hydrated || !allowed}
              className="min-w-0 border-0 p-0"
            >
              <FieldGroup>
                <FieldSet>
                  <FieldLegend>מה התקיים?</FieldLegend>
                  <FieldGroup className="grid gap-5 sm:grid-cols-2">
                    <Field data-invalid={Boolean(issues.method)}>
                      <FieldLabel htmlFor="contact-method">
                        אופן הקשר
                      </FieldLabel>
                      <Select
                        items={{
                          phone: "שיחה טלפונית",
                          in_person: "פגישה פנים אל פנים",
                        }}
                        disabled={busy || !draft.hydrated || !allowed}
                        value={values.method}
                        onValueChange={(value) => {
                          if (value === "phone" || value === "in_person")
                            update("method", value);
                        }}
                      >
                        <SelectTrigger
                          id="contact-method"
                          data-validation-field="method"
                          className="w-full"
                          aria-invalid={Boolean(issues.method)}
                          aria-describedby={
                            issues.method ? "contact-method-error" : undefined
                          }
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="phone">שיחה טלפונית</SelectItem>
                            <SelectItem
                              value="in_person"
                              disabled={values.outcome === "no_answer"}
                            >
                              פגישה פנים אל פנים
                            </SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      {issues.method && (
                        <FieldError id="contact-method-error">
                          {issues.method}
                        </FieldError>
                      )}
                    </Field>
                    <Field data-invalid={Boolean(issues.outcome)}>
                      <FieldLabel htmlFor="contact-outcome">
                        תוצאת הקשר
                      </FieldLabel>
                      <Select
                        items={{
                          completed: "הקשר הושלם",
                          no_answer: "לא היה מענה",
                        }}
                        disabled={busy || !draft.hydrated || !allowed}
                        value={values.outcome}
                        onValueChange={(value) => {
                          if (value === "completed" || value === "no_answer") {
                            draft.update({
                              ...values,
                              outcome: value,
                              ...(value === "no_answer"
                                ? { method: "phone" }
                                : {}),
                            });
                            setIssues({});
                          }
                        }}
                      >
                        <SelectTrigger id="contact-outcome" data-validation-field="outcome" className="w-full" aria-invalid={Boolean(issues.outcome)} aria-describedby={issues.outcome ? "contact-outcome-error" : undefined}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="completed">
                              הקשר הושלם
                            </SelectItem>
                            <SelectItem value="no_answer">
                              לא היה מענה
                            </SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      {issues.outcome && <FieldError id="contact-outcome-error">{issues.outcome}</FieldError>}
                    </Field>
                  </FieldGroup>
                </FieldSet>
                <Field data-invalid={Boolean(issues.occurredAt)}>
                  <FieldLabel htmlFor="contact-occurredAt">
                    מתי התקיים הקשר?
                  </FieldLabel>
                  <Input
                    id="contact-occurredAt"
                    data-validation-field="occurredAt"
                    type="datetime-local"
                    dir="ltr"
                    value={values.occurredAt}
                    onChange={(event) =>
                      update("occurredAt", event.target.value)
                    }
                    aria-invalid={Boolean(issues.occurredAt)}
                    aria-describedby={
                      issues.occurredAt ? "contact-occurred-error" : undefined
                    }
                    required
                  />
                  <FieldDescription>
                    התאריך והשעה מוצגים ונשמרים לפי שעון ישראל.
                  </FieldDescription>
                  {issues.occurredAt && (
                    <FieldError id="contact-occurred-error">
                      {issues.occurredAt}
                    </FieldError>
                  )}
                </Field>
                <Field data-invalid={Boolean(issues.notes)}>
                  <FieldLabel htmlFor="contact-notes">
                    סיכום והערות לצוות
                  </FieldLabel>
                  <Textarea
                    id="contact-notes"
                    value={values.notes}
                    onChange={(event) => update("notes", event.target.value)}
                    maxLength={20000}
                    data-validation-field="notes"
                    aria-invalid={Boolean(issues.notes)}
                    aria-describedby={issues.notes ? "contact-notes-error" : undefined}
                    rows={6}
                    placeholder="מה עלה בשיחה, איך החניכה מרגישה ומה חשוב להמשך הליווי?"
                  />
                  {issues.notes && <FieldError id="contact-notes-error">{issues.notes}</FieldError>}
                  <FieldDescription>
                    הסיכום מיועד לצוות המורשה ואינו נשלח לחניכה.
                  </FieldDescription>
                </Field>
                <Field data-invalid={Boolean(issues.manualColor)}>
                  <FieldLabel htmlFor="contact-color">
                    דיווח החונך/ת על מצב הליווי
                  </FieldLabel>
                  <Select
                    items={{
                      unchanged: "השארת הדיווח הקיים",
                      green: "ירוק — הפגישה בוצעה",
                      orange: "כתום — בעיכוב",
                      red: "אדום — נדרש טיפול",
                    }}
                    disabled={busy || !draft.hydrated || !allowed || manualColorLocked}
                    value={values.manualColor}
                    onValueChange={(value) => {
                      if (
                        value === "green" ||
                        value === "orange" ||
                        value === "red" ||
                        value === "unchanged"
                      )
                        update("manualColor", value);
                    }}
                  >
                    <SelectTrigger id="contact-color" data-validation-field="manualColor" className="w-full" aria-invalid={Boolean(issues.manualColor)} aria-describedby={issues.manualColor ? "contact-color-error" : undefined}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="unchanged">
                          השארת הדיווח הקיים
                        </SelectItem>
                        <SelectItem value="green">
                          ירוק — הפגישה בוצעה
                        </SelectItem>
                        <SelectItem value="orange">כתום — בעיכוב</SelectItem>
                        <SelectItem value="red">אדום — נדרש טיפול</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {issues.manualColor && <FieldError id="contact-color-error">{issues.manualColor}</FieldError>}
                  <FieldDescription>
                    הצבע נבחר ידנית. הוא אינו מבטל חריגה מהמעקב השבועי.
                  </FieldDescription>
                  {manualColorLocked && (
                    <FieldDescription>הצבע מוגן בידי המנכ״ל. אפשר לתעד קשר ולשמור את הצבע הקיים.</FieldDescription>
                  )}
                  {manualColorLocked && values.manualColor !== "unchanged" && (
                    <Button type="button" variant="outline" onClick={() => update("manualColor", "unchanged")}>
                      השארת הצבע הקיים והמשך התיעוד
                    </Button>
                  )}
                </Field>
              </FieldGroup>
            </fieldset>
          </CardContent>
        </Card>
        {values.outcome === "completed" ? (
          <Card>
            <CardHeader>
              <CardTitle>קביעת הקשר הבא</CardTitle>
              <CardDescription>
                אחרי כל קשר שהושלם נדרש תאריך ושעה חדשים, גם אם זו שיחה נוספת
                באותו שבוע.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Field data-invalid={Boolean(issues.nextAppointmentAt)}>
                <FieldLabel htmlFor="contact-nextAppointmentAt">
                  תאריך ושעה לקשר הבא
                </FieldLabel>
                <Input
                  id="contact-nextAppointmentAt"
                  data-validation-field="nextAppointmentAt"
                  type="datetime-local"
                  dir="ltr"
                  value={values.nextAppointmentAt}
                  onChange={(event) =>
                    update("nextAppointmentAt", event.target.value)
                  }
                  disabled={busy || !draft.hydrated || !allowed || appointmentLocked}
                  aria-invalid={Boolean(issues.nextAppointmentAt)}
                  aria-describedby={
                    issues.nextAppointmentAt ? "contact-next-error" : undefined
                  }
                  required
                />
                {issues.nextAppointmentAt && (
                  <FieldError id="contact-next-error">
                    {issues.nextAppointmentAt}
                  </FieldError>
                )}
                <FieldDescription>
                  יש לקבוע מועד אחד שמתאים להמשך הליווי. אין חובה מצטברת לשתי
                  פגישות בשבוע.
                </FieldDescription>
              </Field>
              {warnings.map((warning) => (
                <Alert key={warning.code} className="mt-4">
                  <CircleAlertIcon />
                  <AlertTitle>המועד חורג מהמעקב השבועי</AlertTitle>
                  <AlertDescription>
                    {issueMessages[warning.code] ??
                      "יש לבדוק את מועד הקשר הבא."}
                  </AlertDescription>
                </Alert>
              ))}
            </CardContent>
          </Card>
        ) : (
          <Alert>
            <CircleAlertIcon />
            <AlertTitle>ניסיון ללא מענה נשמר בתיעוד</AlertTitle>
            <AlertDescription>
              הניסיון אינו נחשב קשר שהושלם, אינו מאפס את שבעת הימים ואינו מחליף
              את מועד הפגישה הקיים.
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-4">
          <DraftStatus status={draft.status} onRetry={draft.retry} />
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="outline"
              nativeButton={false}
              render={
                <Link
                  href={`/staff/participants/${encodeURIComponent(view.participant.id)}`}
                />
              }
            >
              חזרה לכרטיס החניכה
            </Button>
            <Button type="submit" disabled={busy || !draft.hydrated || stale || blocked}>
              {busy ? (
                <LoaderCircleIcon
                  data-icon="inline-start"
                  className="animate-spin"
                />
              ) : (
                <CalendarCheck2Icon data-icon="inline-start" />
              )}
              שמירת התיעוד
              {values.outcome === "completed" ? " והפגישה הבאה" : ""}
            </Button>
          </div>
        </div>
      </form>
      <aside className="flex flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>החניכה שמאחורי הדיווח</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <ParticipantIdentity
              name={view.participant.displayName}
              service={
                view.participant.serviceType
                  ? serviceNames[view.participant.serviceType]
                  : "סוג השירות טרם הוזן"
              }
            />
            <Separator />
            <FollowupBadge followup={followup} />
            <div className="flex items-start gap-3 text-sm text-muted-foreground">
              <CalendarClockIcon className="mt-0.5 size-5 shrink-0" />
              <p>
                {view.nextAppointment
                  ? `המועד הקיים: ${formatDateTime(view.nextAppointment.scheduledAt)}`
                  : "לא נקבע עדיין מועד לקשר הבא."}
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <p className="text-xs leading-relaxed text-muted-foreground">
              מענה בטלפון או פנים אל פנים נחשב קשר שהושלם. האישור הניהולי נבדק
              בנפרד.
            </p>
          </CardFooter>
        </Card>
        <div className="flex items-start gap-3 px-2 text-sm leading-relaxed text-muted-foreground">
          <MessageSquareTextIcon className="mt-0.5 size-5 shrink-0" />
          <p>
            גם התעניינות קטנה חשובה. התיעוד עוזר לצוות להמשיך מאותה נקודה ולשמור
            על רצף הליווי.
          </p>
        </div>
      </aside>
    </div>
  );
}
