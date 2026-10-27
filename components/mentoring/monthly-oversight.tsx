"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import {
  CalendarDaysIcon,
  CheckCircle2Icon,
  FileClockIcon,
  HistoryIcon,
  InfoIcon,
  LockKeyholeIcon,
  SaveIcon,
  Settings2Icon,
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
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/staff/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/staff/ui/empty";
import {
  Field,
  FieldContent,
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
import { Separator } from "@/components/staff/ui/separator";
import { Spinner } from "@/components/staff/ui/spinner";
import { Switch } from "@/components/staff/ui/switch";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/staff/ui/table";
import { Textarea } from "@/components/staff/ui/textarea";
import type {
  CommandSuccess,
  WorkspaceSnapshot,
} from "@/lib/mentoring/contracts";
import type {
  MonthlyReview,
  OrganizationSettings,
  OversightCommand,
} from "@/lib/mentoring/features/oversight/contracts";
import {
  deriveMonthlyOversight,
  isMonth,
  israelMonth,
} from "@/lib/mentoring/features/oversight/selectors";
import { useWorkspace } from "@/lib/mentoring/workspace-client";
import {
  AccessDenied,
  FollowupBadge,
  InlineError,
  PageHeading,
  readableError,
} from "./common";
import { formatDateTime } from "./format";
import { DraftStatus, useFormDraft } from "./form-draft";
import { focusFormIssue, operationalCommandIssue, operationalFieldName, settingsInputIssues } from "./operational-form-state";

function monthLabel(month: string) {
  return new Intl.DateTimeFormat("he-IL", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-15T12:00:00Z`));
}

function SavedReceipt({
  result,
  onContinue,
  busy,
}: {
  result: CommandSuccess;
  onContinue: () => void;
  busy: boolean;
}) {
  return (
    <Alert>
      <CheckCircle2Icon />
      <AlertTitle>
        {result.acceptance === "queued"
          ? "הפעולה שמורה במכשיר וממתינה לסנכרון"
          : "הפעולה התקבלה במערכת"}
      </AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <p>
          {result.acceptance === "queued"
            ? "הבקשה תיבדק מול ההרשאות והגרסה העדכניות בחידוש החיבור. אפשר לעקוב אחריה במצב הסנכרון של סביבת העבודה."
            : "השמירה נשמרה עם זהות עורך/ת השינוי והגרסה שנשמרה. אפשר לפתוח טיוטה חדשה כשנדרש עדכון נוסף."}
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={onContinue}
        >
          {busy && <Spinner data-icon="inline-start" />}
          פתיחת טיוטה חדשה
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function MonthlyOversightView({
  initialMonth,
}: {
  initialMonth?: string;
}) {
  const { snapshot } = useWorkspace();
  if (!snapshot) return null;
  if (snapshot.actor.role === "mentor") return <AccessDenied />;
  return (
    <MonthlyOversightWorkspace
      key={`${snapshot.actor.id}:${initialMonth ?? "current"}`}
      snapshot={snapshot}
      initialMonth={initialMonth}
    />
  );
}

function MonthlyOversightWorkspace({
  snapshot,
  initialMonth,
}: {
  snapshot: WorkspaceSnapshot;
  initialMonth?: string;
}) {
  const [month, setMonth] = useState(() =>
    initialMonth && isMonth(initialMonth)
      ? initialMonth
      : israelMonth(snapshot.serverTime),
  );
  const [scope, setScope] = useState(
    snapshot.actor.role === "coordinator" ? snapshot.actor.id : "organization",
  );
  const [monthInput, setMonthInput] = useState(month);
  const [filterIssues, setFilterIssues] = useState<Record<string, string>>({});
  const scopeStaffId =
    snapshot.actor.role === "coordinator"
      ? snapshot.actor.id
      : scope === "organization"
        ? null
        : scope;
  const report = deriveMonthlyOversight(snapshot, month, scopeStaffId);
  const coordinators = snapshot.staff.filter(
    (member) => member.role === "coordinator",
  );
  const review = snapshot.monthlyReviews?.find(
    (entry) => entry.month === month && entry.scopeStaffId === scopeStaffId,
  );
  const [formSession, setFormSession] = useState(0);
  const metrics = [
    {
      title: "חניכות נוכחיות בהיקף הנבחר",
      value: report.totals.participants,
      description: "לפי השיוך וההרשאות הנוכחיים, ללא כרטיסים מחוקים",
    },
    {
      title: "קשרים שהתקיימו בחודש",
      value: report.totals.completed,
      description: "לפי מועד הקשר בפועל",
    },
    {
      title: "ניסיונות ללא מענה בחודש",
      value: report.totals.attempted,
      description: "אינם נספרים כקשר שהתקיים",
    },
    {
      title: "דיווחים שהתקבלו בחודש",
      value: report.totals.reportsReceived,
      description: "לפי מועד הקליטה במערכת",
    },
  ];
  return (
    <div className="flex min-w-0 flex-col gap-6" dir="rtl">
      <PageHeading
        title="סקירה חודשית"
        description="עיון פנימי בפעילות הליווי ובתיעוד שלה, עם סיכום הנהלה שנשמר לכל חודש והיקף צוות."
      />
      <Card>
        <CardHeader>
          <CardTitle>הפעילות של {monthLabel(month)}</CardTitle>
          <CardDescription>
            החודש מחושב לפי שעון ישראל. הנתונים מעודכנים למועד{" "}
            {formatDateTime(snapshot.serverTime)}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="sm:flex-row sm:items-end">
            <Field className="sm:max-w-60" data-invalid={Boolean(filterIssues.month)}>
              <FieldLabel htmlFor="oversight-month">חודש לסקירה</FieldLabel>
              <Input
                id="oversight-month"
                type="month"
                min="0001-01"
                value={monthInput}
                required
                aria-invalid={Boolean(filterIssues.month)}
                aria-describedby={filterIssues.month ? "oversight-month-error" : undefined}
                onChange={(event) => {
                  const value = event.target.value;
                  setMonthInput(value);
                  setFilterIssues((previous) => ({ ...previous, month: isMonth(value) ? "" : "יש לבחור חודש ושנה תקינים. מוצג החודש התקין האחרון שנבחר." }));
                  if (isMonth(value)) setMonth(value);
                }}
              />
              {filterIssues.month && <FieldError id="oversight-month-error">{filterIssues.month}</FieldError>}
            </Field>
            {snapshot.actor.role === "ceo" && (
              <Field className="sm:max-w-80">
                <FieldLabel htmlFor="oversight-scope">היקף הסקירה</FieldLabel>
                <Select
                  value={scope}
                  onValueChange={(value) => {
                    if (value === "organization" || coordinators.some((member) => member.id === value)) {
                      setScope(value!);
                      setFilterIssues((previous) => ({ ...previous, scope: "" }));
                    } else setFilterIssues((previous) => ({ ...previous, scope: "יש לבחור את כל הארגון או רכז/ת מהרשימה." }));
                  }}
                >
                  <SelectTrigger id="oversight-scope" className="w-full" aria-invalid={Boolean(filterIssues.scope)} aria-describedby={filterIssues.scope ? "oversight-scope-error" : undefined}>
                    <SelectValue>
                      {scope === "organization"
                        ? "כל הארגון"
                        : (coordinators.find((member) => member.id === scope)
                            ?.displayName ?? "צוות הרכז/ת")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="organization">כל הארגון</SelectItem>
                      {coordinators.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          הצוות של {member.displayName}
                          {!member.active ? " · ללא גישה פעילה" : ""}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {filterIssues.scope && <FieldError id="oversight-scope-error">{filterIssues.scope}</FieldError>}
              </Field>
            )}
          </FieldGroup>
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.title}>
            <CardHeader>
              <CardDescription>{metric.title}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                {metric.value}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                {metric.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Alert>
        <InfoIcon />
        <AlertTitle>מועד הקשר ומועד הדיווח מוצגים בנפרד</AlertTitle>
        <AlertDescription>
          {report.totals.laterUploads} דיווחים על קשר מהחודש נקלטו לאחר סיומו.
          זהו עיכוב בדיווח, ואינו מעיד כשלעצמו על קשר שבוצע באיחור.{" "}
          {report.totals.invalidated} דיווחים שבוטלו אינם נספרים כקשר פעיל.{" "}
          {report.totals.awaitingReview} דיווחים מהחודש עדיין ללא אישור לגרסה
          הנוכחית.
          <p>
            בחודש הנבחר נקלטו גם {report.totals.correctionsReceived} תיקוני
            דיווח ו־{report.totals.invalidationsReceived} ביטולי דיווח, לפי מועד
            השינוי.
          </p>
          {report.totals.deletedParticipants > 0 && (
            <p>
              בהיקף הזה נשמרת גם היסטוריה של {report.totals.deletedParticipants}{" "}
              כרטיסים מחוקים. הפעילות שתועדה בהם כלולה בנתוני החודש; הם אינם
              נספרים כחניכות משויכות כעת ואינם יוצרים חיווי איחור נוכחי.
            </p>
          )}
          {report.totals.queuedContacts > 0 && (
            <p>
              {report.totals.queuedContacts} דיווחים או עדכונים שמורים במכשיר
              וממתינים לסנכרון. הם מוצגים לעיון ואינם כלולים בספירת הקשרים
              והדיווחים שהתקבלו במערכת.
            </p>
          )}
        </AlertDescription>
      </Alert>
      <Card>
        <CardHeader>
          <CardTitle>פעילות לפי חונך/ת</CardTitle>
          <CardDescription>
            השיוך המוצג הוא השיוך הנוכחי. ספירת הפעילות מתבססת על זהות הגורם שתיעד את
            הקשר.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {report.coverage.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CalendarDaysIcon />
                </EmptyMedia>
                <EmptyTitle>אין פעילות צוות להצגה</EmptyTitle>
                <EmptyDescription>
                  רשומות פעילות ושיוכים בהיקף הנבחר יופיעו כאן.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableCaption>
                כיסוי מתועד בחודש {monthLabel(month)}; הנתונים אינם מדד לאיכות
                הליווי או להיקף העבודה הזמין.
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>חונך/ת</TableHead>
                  <TableHead>חניכות משויכות כעת</TableHead>
                  <TableHead>חניכות עם קשר מתועד</TableHead>
                  <TableHead>קשרים בחודש</TableHead>
                  <TableHead>ללא מענה</TableHead>
                  <TableHead>דיווחים שנקלטו</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.coverage.map((row) => (
                  <TableRow key={row.staffId}>
                    <TableCell>{row.staffName}</TableCell>
                    <TableCell>{row.assignedParticipants}</TableCell>
                    <TableCell>
                      {row.participantsWithCompletedContact}
                    </TableCell>
                    <TableCell>{row.completed}</TableCell>
                    <TableCell>{row.attempted}</TableCell>
                    <TableCell>{row.reportsReceived}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>חניכות ותיעוד קשר</CardTitle>
          <CardDescription>
            אפשר לפתוח את סיכומי הקשר ואת זמני הקליטה. מצב המעקב מתאר את המצב
            הנוכחי במועד העדכון, גם בעת צפייה בחודש קודם.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              {report.totals.currentlyOverdue} חניכות דורשות קשר כעת
            </Badge>
            <Badge variant="secondary">
              עודכן {formatDateTime(snapshot.serverTime)}
            </Badge>
          </div>
          {report.participants.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileClockIcon />
                </EmptyMedia>
                <EmptyTitle>אין חניכות בהיקף הזה</EmptyTitle>
                <EmptyDescription>
                  אפשר לבחור היקף אחר או לבדוק את שיוכי הצוות.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            report.participants.map((entry) => {
              const evidence = report.contacts.filter(
                (contact) =>
                  contact.participantId === entry.view.participant.id,
              );
              return (
                <details
                  key={entry.view.participant.id}
                  className="rounded-lg border p-4"
                >
                  <summary className="min-h-11 cursor-pointer">
                    <span className="font-medium">
                      {entry.view.participant.displayName}
                    </span>
                    {entry.deletedAt && (
                      <Badge variant="secondary" className="ms-2">
                        כרטיס מחוק · היסטוריה בלבד
                      </Badge>
                    )}
                    <span className="ms-3 text-sm text-muted-foreground">
                      {entry.completed} קשרים · {entry.attempted} ניסיונות ללא
                      מענה · {entry.reportsReceived} דיווחים שנקלטו
                    </span>
                  </summary>
                  <div className="flex min-w-0 flex-col gap-4 pt-4">
                    <div className="flex flex-wrap items-center gap-3">
                      {entry.deletedAt ? (
                        <span className="text-sm text-muted-foreground">
                          הכרטיס נמחק ב־{formatDateTime(entry.deletedAt)}.
                          התיעוד ההיסטורי נשמר לעיון.
                        </span>
                      ) : (
                        <>
                          <FollowupBadge followup={entry.currentFollowup} />
                          <span className="text-xs text-muted-foreground">
                            מצב נוכחי
                          </span>
                        </>
                      )}
                      <Link
                        className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4"
                        href={`/staff/participants/${entry.view.participant.id}`}
                      >
                        פתיחת כרטיס החניכה
                      </Link>
                    </div>
                    {evidence.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        אין דיווחים שמועד הקשר, הקליטה או העדכון שלהם בחודש
                        הנבחר.
                      </p>
                    ) : (
                      evidence.map(
                        ({
                          contact,
                          authorName,
                          occurredInMonth,
                          receivedInMonth,
                          uploadedAfterMonth,
                          reviewDecision,
                          changes,
                          localPending,
                        }) => (
                          <div
                            key={`${contact.id}:${contact.revision}`}
                            className="flex min-w-0 flex-col gap-3 rounded-lg bg-muted/40 p-4"
                          >
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="outline">
                                {contact.outcome === "completed"
                                  ? "קשר שהתקיים"
                                  : "ללא מענה"}
                              </Badge>
                              {!localPending && (
                                <Badge variant="outline">
                                  גרסה {contact.revision}
                                </Badge>
                              )}
                              {localPending && (
                                <Badge variant="outline">
                                  שמורה במכשיר, ממתינה לסנכרון
                                </Badge>
                              )}
                              {contact.invalidatedAt && !localPending && (
                                <Badge variant="secondary">בוטל</Badge>
                              )}
                              {uploadedAfterMonth && (
                                <Badge variant="outline">
                                  נקלט לאחר סוף החודש
                                </Badge>
                              )}
                              {!localPending && (
                                <Badge variant="secondary">
                                  {reviewDecision === "approved"
                                    ? "אושר"
                                    : reviewDecision ===
                                        "returned_for_correction"
                                      ? "להשלמה"
                                      : "ללא אישור לגרסה"}
                                </Badge>
                              )}
                            </div>
                            <dl className="grid gap-2 text-sm sm:grid-cols-2">
                              <div>
                                <dt className="text-muted-foreground">
                                  מועד הקשר
                                  {occurredInMonth ? " · בחודש הנבחר" : ""}
                                </dt>
                                <dd>{formatDateTime(contact.occurredAt)}</dd>
                              </div>
                              {!localPending && (
                                <div>
                                  <dt className="text-muted-foreground">
                                    נקלט במערכת
                                    {receivedInMonth ? " · בחודש הנבחר" : ""}
                                  </dt>
                                  <dd>{formatDateTime(contact.receivedAt)}</dd>
                                </div>
                              )}
                              <div>
                                <dt className="text-muted-foreground">
                                  תועד על ידי
                                </dt>
                                <dd>{authorName}</dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">
                                  דרך הקשר
                                </dt>
                                <dd>
                                  {contact.method === "phone"
                                    ? "טלפון"
                                    : "פגישה פנים אל פנים"}
                                </dd>
                              </div>
                            </dl>
                            <p
                              dir="auto"
                              className="whitespace-pre-wrap break-words text-sm leading-relaxed"
                            >
                              {contact.notes?.trim() ||
                                "לא נוסף סיכום לדיווח הזה."}
                            </p>
                            {changes.some(
                              (change) => change.changeKind !== "initial",
                            ) && (
                              <details>
                                <summary className="min-h-11 cursor-pointer py-3 text-sm">
                                  תיקונים וביטולים של הדיווח
                                </summary>
                                <div className="flex flex-col gap-3 pt-2">
                                  {changes
                                    .filter(
                                      (change) =>
                                        change.changeKind !== "initial",
                                    )
                                    .map((change) => (
                                      <div
                                        key={`${change.id}:${change.revision}`}
                                        className="flex flex-col gap-1 text-sm"
                                      >
                                        <p>
                                          {change.localPending || ("localTimestamp" in change && change.localTimestamp === true) ? (
                                            change.changeKind ===
                                            "invalidation" ? (
                                              "ביטול שמור במכשיר, ממתין לעדכון מהמערכת"
                                            ) : (
                                              "תיקון שמור במכשיר, ממתין לעדכון מהמערכת"
                                            )
                                          ) : (
                                            <>
                                              {change.changeKind ===
                                              "invalidation"
                                                ? "ביטול"
                                                : "תיקון"}{" "}
                                              · גרסה {change.revision} ·{" "}
                                              {formatDateTime(change.revisedAt)}
                                            </>
                                          )}
                                        </p>
                                        <p className="text-muted-foreground">
                                          על ידי{" "}
                                          {snapshot.staff.find(
                                            (member) =>
                                              member.id ===
                                              change.revisedByStaffId,
                                          )?.displayName ?? "חבר/ת צוות"}
                                        </p>
                                        {change.reason && (
                                          <p
                                            dir="auto"
                                            className="whitespace-pre-wrap break-words"
                                          >
                                            {change.reason}
                                          </p>
                                        )}
                                      </div>
                                    ))}
                                </div>
                              </details>
                            )}
                          </div>
                        ),
                      )
                    )}
                  </div>
                </details>
              );
            })
          )}
        </CardContent>
      </Card>
      <MonthlyReviewForm
        key={`${month}:${scopeStaffId ?? "organization"}:${formSession}`}
        month={month}
        scopeStaffId={scopeStaffId}
        review={review}
        canEdit={!review?.ceoProtected || snapshot.actor.role === "ceo"}
        invalidFilter={!isMonth(monthInput) ? "month" : filterIssues.scope ? "scope" : null}
        onNewDraft={() => setFormSession((value) => value + 1)}
      />
    </div>
  );
}

function MonthlyReviewForm({
  month,
  scopeStaffId,
  review,
  canEdit,
  invalidFilter,
  onNewDraft,
}: {
  month: string;
  scopeStaffId: string | null;
  review?: MonthlyReview;
  canEdit: boolean;
  invalidFilter: "month" | "scope" | null;
  onNewDraft: () => void;
}) {
  const { submit } = useWorkspace();
  const draft = useFormDraft(
    `monthly-review:${month}:${scopeStaffId ?? "organization"}`,
    {
      summary: review?.summary ?? "",
      reviewed: review?.reviewed ?? false,
      baseVersion: review?.version ?? null,
    },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [receipt, setReceipt] = useState<CommandSuccess | null>(null);
  const submitting = useRef(false);
  const result = receipt ?? draft.recovered;
  const stale =
    draft.hydrated && draft.value.baseVersion !== (review?.version ?? null);
  const previousVersions =
    review?.history.filter((entry) => entry.version < review.version) ?? [];
  async function clearAndContinue() {
    setBusy(true);
    setError(null);
    try {
      await draft.clear();
      onNewDraft();
    } catch (error) {
      setError(readableError(error));
      setBusy(false);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !draft.hydrated || !canEdit || stale || result)
      return;
    if (invalidFilter) {
      document.getElementById(`oversight-${invalidFilter}`)?.focus();
      return;
    }
    setError(null);
    const payload: Omit<
      Extract<OversightCommand, { type: "save_monthly_review" }>,
      "operationId"
    > = {
      type: "save_monthly_review",
      month,
      scopeStaffId,
      expectedVersion: draft.value.baseVersion,
      summary: draft.value.summary.trim(),
      reviewed: draft.value.reviewed,
    };
    const invalidCommand = operationalCommandIssue(payload);
    if (invalidCommand) {
      setIssues({ [invalidCommand.field]: invalidCommand.message });
      setError(invalidCommand.message);
      focusFormIssue(event.currentTarget, { [invalidCommand.field]: invalidCommand.message });
      return;
    }
    setIssues({});
    submitting.current = true;
    setBusy(true);
    let submissionStarted = false;
    let received = false;
    try {
      const operationId = await draft.prepare(payload);
      submissionStarted = true;
      const saved = await submit({ ...payload, operationId });
      if (!saved.ok) {
        setError(saved.error.message);
        if (saved.error.field) setIssues({ [operationalFieldName(saved.error.field)]: saved.error.message });
        draft.recheck();
        return;
      }
      received = true;
      setReceipt(saved);
      await draft.clear();
      toast.success(
        saved.acceptance === "queued"
          ? "הסקירה שמורה במכשיר וממתינה לסנכרון"
          : "הסקירה החודשית נשמרה",
      );
    } catch (error) {
      setError(readableError(error));
      if (submissionStarted && !received) draft.recheck();
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>סיכום סקירת ההנהלה</CardTitle>
        <CardDescription>
          סיכום מילולי עבור {monthLabel(month)}. כל עדכון נשמר בגרסה חדשה עם
          ייחוס לעורך/ת השינוי.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {review && (
          <p className="text-xs text-muted-foreground">
            עודכן על ידי {review.updatedByName} ·{" "}
            {formatDateTime(review.updatedAt)} · גרסה {review.version}
          </p>
        )}
        {!canEdit && (
          <Alert>
            <LockKeyholeIcon />
            <AlertTitle>הסיכום מוגן לאחר עריכת המנכ״ל</AlertTitle>
            <AlertDescription>
              אפשר לעיין בסיכום ובהיסטוריה. עדכון נוסף של הסיכום נעשה על ידי
              המנכ״ל.
            </AlertDescription>
          </Alert>
        )}
        <InlineError message={error} />
        {result ? (
          <>
            <SavedReceipt
              result={result}
              onContinue={() => void clearAndContinue()}
              busy={busy}
            />
            <p
              dir="auto"
              className="whitespace-pre-wrap break-words text-sm leading-relaxed"
            >
              {draft.value.summary || "לא נוסף סיכום מילולי."}
            </p>
          </>
        ) : (
          <form
            onSubmit={(event) => void save(event)}
            noValidate
            className="flex flex-col gap-5"
          >
            {stale && (
              <Alert>
                <HistoryIcon />
                <AlertTitle>נשמרה גרסה חדשה מאז פתיחת הטיוטה</AlertTitle>
                <AlertDescription className="flex flex-col items-start gap-3">
                  <p>
                    הטקסט שלך נשמר במכשיר. הסיכום העדכני:{" "}
                    {review?.summary || "ללא סיכום מילולי"}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || !canEdit}
                    onClick={() =>
                      draft.update({
                        ...draft.value,
                        baseVersion: review?.version ?? null,
                      })
                    }
                  >
                    עיינתי בגרסה העדכנית — המשך עריכת הטיוטה
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            <FieldGroup>
              <Field data-disabled={!draft.hydrated || busy || !canEdit}>
                <FieldLabel htmlFor="monthly-review-summary">
                  תובנות והמשך מעקב
                </FieldLabel>
                <Textarea
                  id="monthly-review-summary"
                  data-validation-field="summary"
                  aria-invalid={Boolean(issues.summary)}
                  aria-describedby={issues.summary ? "monthly-review-summary-error" : undefined}
                  rows={6}
                  maxLength={20000}
                  value={draft.value.summary}
                  disabled={!draft.hydrated || busy || !canEdit}
                  onChange={(event) => {
                    setIssues((previous) => ({ ...previous, summary: "" }));
                    draft.update({
                      ...draft.value,
                      summary: event.target.value,
                    });
                  }}
                />
                {issues.summary && <FieldError id="monthly-review-summary-error">{issues.summary}</FieldError>}
                <FieldDescription>
                  אפשר לתעד תובנות מתוך דיווחי הצוות, נושאים להמשך בדיקה והחלטות
                  ליווי.
                </FieldDescription>
              </Field>
              <Field
                orientation="horizontal"
                data-disabled={!draft.hydrated || busy || !canEdit}
              >
                <FieldContent>
                  <FieldLabel htmlFor="monthly-reviewed">
                    הסקירה החודשית הושלמה
                  </FieldLabel>
                  <FieldDescription>
                    הסימון מתייחס לסקירה הזאת ואינו מאשר דיווחי קשר בנפרד.
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="monthly-reviewed"
                  data-validation-field="reviewed"
                  aria-invalid={Boolean(issues.reviewed)}
                  aria-describedby={issues.reviewed ? "monthly-reviewed-error" : undefined}
                  checked={draft.value.reviewed}
                  disabled={!draft.hydrated || busy || !canEdit}
                  onCheckedChange={(checked) => {
                    setIssues((previous) => ({ ...previous, reviewed: "" }));
                    draft.update({ ...draft.value, reviewed: checked });
                  }}
                />
                {issues.reviewed && <FieldError id="monthly-reviewed-error">{issues.reviewed}</FieldError>}
              </Field>
            </FieldGroup>
            <DraftStatus status={draft.status} onRetry={draft.retry} />
            <Button
              type="submit"
              disabled={busy || !draft.hydrated || !canEdit || stale}
              className="self-start"
            >
              {busy ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <SaveIcon data-icon="inline-start" />
              )}
              שמירת הסקירה
            </Button>
          </form>
        )}
        {previousVersions.length > 0 && (
          <>
            <Separator />
            <details>
              <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
                היסטוריית הסקירה · {previousVersions.length} גרסאות קודמות
              </summary>
              <div className="flex flex-col gap-4 pt-3">
                {previousVersions.map((entry) => (
                  <div
                    key={entry.version}
                    className="flex flex-col gap-2 rounded-lg border p-4"
                  >
                    <p className="text-xs text-muted-foreground">
                      גרסה {entry.version} · {entry.updatedByName} ·{" "}
                      {formatDateTime(entry.updatedAt)}
                    </p>
                    <Badge variant="outline" className="self-start">
                      {entry.reviewed ? "סומנה כהושלמה" : "טרם הושלמה"}
                    </Badge>
                    <p
                      dir="auto"
                      className="whitespace-pre-wrap break-words text-sm leading-relaxed"
                    >
                      {entry.summary || "ללא סיכום מילולי"}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function OrganizationSettingsForm() {
  const { snapshot } = useWorkspace();
  const [session, setSession] = useState(0);
  if (!snapshot || snapshot.actor.role !== "ceo") return null;
  if (!snapshot.settings)
    return (
      <Alert>
        <Settings2Icon />
        <AlertTitle>הגדרות הארגון עדיין לא זמינות</AlertTitle>
        <AlertDescription>
          יש לרענן את סביבת העבודה לאחר השלמת הכנת הנתונים.
        </AlertDescription>
      </Alert>
    );
  return (
    <SettingsEditor
      key={session}
      settings={snapshot.settings}
      onNewDraft={() => setSession((value) => value + 1)}
    />
  );
}

function SettingsEditor({
  settings,
  onNewDraft,
}: {
  settings: OrganizationSettings;
  onNewDraft: () => void;
}) {
  const { submit } = useWorkspace();
  const draft = useFormDraft("organization-settings", {
    baseVersion: settings.version,
    offlineLeaseHours: String(settings.offlineLeaseHours),
    reminderAudience: settings.reminderAudience,
    appointmentReminderMinutesBefore: String(
      settings.appointmentReminderMinutesBefore,
    ),
    overdueRemindersEnabled: settings.overdueRemindersEnabled,
    overdueRepeatHours:
      settings.overdueRepeatHours === null
        ? ""
        : String(settings.overdueRepeatHours),
    reason: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [receipt, setReceipt] = useState<CommandSuccess | null>(null);
  const submitting = useRef(false);
  const result = receipt ?? draft.recovered;
  const stale = draft.hydrated && draft.value.baseVersion !== settings.version;
  async function clearAndContinue() {
    setBusy(true);
    setError(null);
    try {
      await draft.clear();
      onNewDraft();
    } catch (error) {
      setError(readableError(error));
      setBusy(false);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !draft.hydrated || stale || result) return;
    const found = settingsInputIssues(draft.value);
    setIssues(found);
    setError(null);
    if (Object.keys(found).length) {
      focusFormIssue(event.currentTarget, found);
      return;
    }
    const lease = Number(draft.value.offlineLeaseHours);
    const reminder = Number(draft.value.appointmentReminderMinutesBefore);
    const repeat =
      draft.value.overdueRepeatHours.trim() === ""
        ? null
        : Number(draft.value.overdueRepeatHours);
    const payload: Omit<
      Extract<OversightCommand, { type: "update_organization_settings" }>,
      "operationId"
    > = {
      type: "update_organization_settings",
      expectedVersion: draft.value.baseVersion,
      settings: {
        offlineLeaseHours: lease,
        reminderAudience: draft.value.reminderAudience,
        appointmentReminderMinutesBefore: reminder,
        overdueRemindersEnabled: draft.value.overdueRemindersEnabled,
        overdueRepeatHours: repeat,
      },
      reason: draft.value.reason.trim(),
    };
    const invalidCommand = operationalCommandIssue(payload);
    if (invalidCommand) {
      setIssues({ [invalidCommand.field]: invalidCommand.message });
      setError(invalidCommand.message);
      focusFormIssue(event.currentTarget, { [invalidCommand.field]: invalidCommand.message });
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError(null);
    let submissionStarted = false;
    let received = false;
    try {
      const operationId = await draft.prepare(payload);
      submissionStarted = true;
      const saved = await submit({ ...payload, operationId });
      if (!saved.ok) {
        setError(saved.error.message);
        if (saved.error.field) setIssues({ [operationalFieldName(saved.error.field)]: saved.error.message });
        draft.recheck();
        return;
      }
      received = true;
      setReceipt(saved);
      await draft.clear();
      toast.success(
        saved.acceptance === "queued"
          ? "ההגדרות שמורות במכשיר וממתינות לסנכרון"
          : "הגדרות הארגון נשמרו",
      );
    } catch (error) {
      setError(readableError(error));
      if (submissionStarted && !received) draft.recheck();
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle>מדיניות ליווי ותזכורות</CardTitle>
        <CardDescription>
          הגדרות הארגון ניתנות לעדכון על ידי המנכ״ל. כל שינוי נרשם עם סיבה
          וגרסה.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Alert>
          <InfoIcon />
          <AlertTitle>ברירות מחדל זמניות עד לאישור המדיניות</AlertTitle>
          <AlertDescription>
            תוקף עבודה ללא חיבור: 24 שעות; תזכורות לצוות האחראי; תזכורת במועד
            הקשר; תזכורות איחור פעילות ללא חזרה אוטומטית. הערכים שבטופס הם
            ההגדרות הפעילות שנשמרו בארגון.
          </AlertDescription>
        </Alert>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">תדירות קשר קבועה</dt>
            <dd>שבעה ימים</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">אזור זמן קבוע</dt>
            <dd>ישראל · Asia/Jerusalem</dd>
          </div>
        </dl>
        <InlineError message={error} />
        {result ? (
          <SavedReceipt
            result={result}
            onContinue={() => void clearAndContinue()}
            busy={busy}
          />
        ) : (
          <form
            onSubmit={(event) => void save(event)}
            noValidate
            className="flex flex-col gap-5"
          >
            {stale && (
              <Alert>
                <HistoryIcon />
                <AlertTitle>ההגדרות עודכנו מאז פתיחת הטיוטה</AlertTitle>
                <AlertDescription className="flex flex-col items-start gap-3">
                  <p>
                    ערכי הטיוטה נשמרו. לפני המשך העריכה יש לעיין בגרסה הפעילה:
                    תוקף {settings.offlineLeaseHours} שעות, תזכורת{" "}
                    {settings.appointmentReminderMinutesBefore} דקות מראש, קהל{" "}
                    {settings.reminderAudience === "responsible_team"
                      ? "הצוות האחראי"
                      : "כל הצוות"}
                    , תזכורות איחור{" "}
                    {settings.overdueRemindersEnabled ? "פעילות" : "כבויות"},
                    חזרה{" "}
                    {settings.overdueRepeatHours === null
                      ? "כבויה"
                      : `כל ${settings.overdueRepeatHours} שעות`}
                    .
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      draft.update({
                        ...draft.value,
                        baseVersion: settings.version,
                      })
                    }
                  >
                    עיינתי בהגדרות הפעילות — המשך עריכת הטיוטה
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            <FieldGroup>
              <Field data-disabled={!draft.hydrated || busy}>
                <FieldLabel htmlFor="settings-offline-hours">
                  תוקף גישה ללא חיבור, בשעות
                </FieldLabel>
                <Input
                  id="settings-offline-hours"
                  data-validation-field="offlineLeaseHours"
                  aria-invalid={Boolean(issues.offlineLeaseHours)}
                  aria-describedby={issues.offlineLeaseHours ? "settings-offline-hours-error" : undefined}
                  type="number"
                  min={1}
                  max={24}
                  step={1}
                  required
                  value={draft.value.offlineLeaseHours}
                  disabled={!draft.hydrated || busy}
                  onChange={(event) => {
                    setIssues((previous) => ({ ...previous, offlineLeaseHours: "" }));
                    draft.update({
                      ...draft.value,
                      offlineLeaseHours: event.target.value,
                    });
                  }}
                />
                {issues.offlineLeaseHours && <FieldError id="settings-offline-hours-error">{issues.offlineLeaseHours}</FieldError>}
                <FieldDescription>
                  בין שעה ל־24 שעות. תוקף הרשאה זמנית עשוי לקצר את משך הגישה.
                </FieldDescription>
              </Field>
              <Field data-disabled={!draft.hydrated || busy}>
                <FieldLabel htmlFor="settings-audience">
                  למי מיועדות התזכורות
                </FieldLabel>
                <Select
                  value={draft.value.reminderAudience}
                  disabled={!draft.hydrated || busy}
                  onValueChange={(value) => {
                    if (value === "responsible_team" || value === "all_staff") {
                      setIssues((previous) => ({ ...previous, reminderAudience: "" }));
                      draft.update({ ...draft.value, reminderAudience: value });
                    }
                  }}
                >
                  <SelectTrigger id="settings-audience"
                  data-validation-field="reminderAudience"
                  aria-invalid={Boolean(issues.reminderAudience)}
                  aria-describedby={issues.reminderAudience ? "settings-audience-error" : undefined} className="w-full">
                    <SelectValue>
                      {draft.value.reminderAudience === "responsible_team"
                        ? "לצוות הליווי האחראי"
                        : "לכל הצוות"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="responsible_team">
                        לצוות הליווי האחראי
                      </SelectItem>
                      <SelectItem value="all_staff">לכל הצוות</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {issues.reminderAudience && <FieldError id="settings-audience-error">{issues.reminderAudience}</FieldError>}
                <FieldDescription>
                  לפי מדיניות התזכורות והרשאות הנמען. השתקת המנכ״ל נשמרת בנפרד.
                </FieldDescription>
              </Field>
              <Field data-disabled={!draft.hydrated || busy}>
                <FieldLabel htmlFor="settings-reminder-minutes">
                  תזכורת לפני מועד הקשר, בדקות
                </FieldLabel>
                <Input
                  id="settings-reminder-minutes"
                  data-validation-field="appointmentReminderMinutesBefore"
                  aria-invalid={Boolean(issues.appointmentReminderMinutesBefore)}
                  aria-describedby={issues.appointmentReminderMinutesBefore ? "settings-reminder-minutes-error" : undefined}
                  type="number"
                  min={0}
                  max={1440}
                  step={1}
                  required
                  value={draft.value.appointmentReminderMinutesBefore}
                  disabled={!draft.hydrated || busy}
                  onChange={(event) => {
                    setIssues((previous) => ({ ...previous, appointmentReminderMinutesBefore: "" }));
                    draft.update({
                      ...draft.value,
                      appointmentReminderMinutesBefore: event.target.value,
                    });
                  }}
                />
                {issues.appointmentReminderMinutesBefore && <FieldError id="settings-reminder-minutes-error">{issues.appointmentReminderMinutesBefore}</FieldError>}
                <FieldDescription>
                  0 שולח במועד שנקבע. אפשר לבחור עד 1,440 דקות מראש.
                </FieldDescription>
              </Field>
              <Field
                orientation="horizontal"
                data-disabled={!draft.hydrated || busy}
              >
                <FieldContent>
                  <FieldLabel htmlFor="settings-overdue-enabled">
                    תזכורות על איחור בקשר
                  </FieldLabel>
                  <FieldDescription>
                    הפעלת תזכורות לאחר שחלף מועד הקשר או מרווח שבעת הימים.
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="settings-overdue-enabled"
                  data-validation-field="overdueRemindersEnabled"
                  aria-invalid={Boolean(issues.overdueRemindersEnabled)}
                  aria-describedby={issues.overdueRemindersEnabled ? "settings-overdue-enabled-error" : undefined}
                  checked={draft.value.overdueRemindersEnabled}
                  disabled={!draft.hydrated || busy}
                  onCheckedChange={(checked) => {
                    setIssues((previous) => ({ ...previous, overdueRemindersEnabled: "" }));
                    draft.update({
                      ...draft.value,
                      overdueRemindersEnabled: checked,
                    });
                  }}
                />
                {issues.overdueRemindersEnabled && <FieldError id="settings-overdue-enabled-error">{issues.overdueRemindersEnabled}</FieldError>}
              </Field>
              <Field data-disabled={!draft.hydrated || busy}>
                <FieldLabel htmlFor="settings-repeat-hours">
                  חזרה על תזכורות איחור, בשעות
                </FieldLabel>
                <Input
                  id="settings-repeat-hours"
                  data-validation-field="overdueRepeatHours"
                  aria-invalid={Boolean(issues.overdueRepeatHours)}
                  aria-describedby={issues.overdueRepeatHours ? "settings-repeat-hours-error" : undefined}
                  type="number"
                  min={1}
                  max={168}
                  step={1}
                  placeholder="ללא חזרה אוטומטית"
                  value={draft.value.overdueRepeatHours}
                  disabled={!draft.hydrated || busy}
                  onChange={(event) => {
                    setIssues((previous) => ({ ...previous, overdueRepeatHours: "" }));
                    draft.update({
                      ...draft.value,
                      overdueRepeatHours: event.target.value,
                    });
                  }}
                />
                {issues.overdueRepeatHours && <FieldError id="settings-repeat-hours-error">{issues.overdueRepeatHours}</FieldError>}
                <FieldDescription>
                  אפשר להשאיר ריק כדי לא לשלוח תזכורות חוזרות. אחרת, בין שעה ל־168
                  שעות.
                </FieldDescription>
              </Field>
              <Field data-disabled={!draft.hydrated || busy}>
                <FieldLabel htmlFor="settings-reason">
                  סיבה לשינוי המדיניות
                </FieldLabel>
                <Textarea
                  id="settings-reason"
                  data-validation-field="reason"
                  aria-invalid={Boolean(issues.reason)}
                  aria-describedby={issues.reason ? "settings-reason-error" : undefined}
                  rows={3}
                  required
                  maxLength={2000}
                  value={draft.value.reason}
                  disabled={!draft.hydrated || busy}
                  onChange={(event) => {
                    setIssues((previous) => ({ ...previous, reason: "" }));
                    draft.update({ ...draft.value, reason: event.target.value });
                  }}
                />
                {issues.reason && <FieldError id="settings-reason-error">{issues.reason}</FieldError>}
              </Field>
            </FieldGroup>
            <DraftStatus status={draft.status} onRetry={draft.retry} />
            <Button
              type="submit"
              disabled={busy || !draft.hydrated || stale}
              className="self-start"
            >
              {busy ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <SaveIcon data-icon="inline-start" />
              )}
              שמירת הגדרות הארגון
            </Button>
          </form>
        )}
      </CardContent>
      <CardFooter>
        <p className="text-xs text-muted-foreground">
          גרסת הגדרות {settings.version} · עודכן{" "}
          {formatDateTime(settings.updatedAt)}
        </p>
      </CardFooter>
    </Card>
  );
}
