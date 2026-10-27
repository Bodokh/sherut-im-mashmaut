"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  ClipboardCheck,
  FileClock,
  History,
  Info,
  LockKeyhole,
  MessageSquare,
  ShieldCheck,
  Undo2,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/staff/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/staff/ui/alert-dialog";
import { Badge } from "@/components/staff/ui/badge";
import { Button } from "@/components/staff/ui/button";
import {
  Card,
  CardAction,
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
  FieldGroup,
  FieldLabel,
} from "@/components/staff/ui/field";
import { Separator } from "@/components/staff/ui/separator";
import { Spinner } from "@/components/staff/ui/spinner";
import { Switch } from "@/components/staff/ui/switch";
import { StaffManagement } from "@/components/mentoring/staff-management";
import type { MentoringCommand, StaffProfile } from "@/lib/mentoring/contracts";
import type { Review, StaffRole } from "@/lib/mentoring/domain";
import { useWorkspace } from "@/lib/mentoring/workspace-client";
import { DraftStatus, useFormDraft } from "./form-draft";
import { OrganizationSettingsForm } from "./monthly-oversight";
import { operationalCommandIssue } from "./operational-form-state";
import { RecoveryControls } from "./recovery-controls";
import { RecycleBinView } from "./authority-controls";
import { canReviewParticipant, contactReviewState } from "./management-command-state";
import { useNow } from "./common";
import { contactHasAcceptedBaseline } from "./contact-correction-state";

const roleLabels: Record<StaffRole, string> = {
  mentor: "חונך/ת",
  coordinator: "רכז/ת",
  ceo: "מנכ״ל",
};

const dateFormatter = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jerusalem",
});

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "מועד לא זמין" : dateFormatter.format(date);
}

function formatPreservedValue(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2) ?? value;
  } catch {
    return value;
  }
}

const savedActionLabels = new Map<string, string>([
  ["create_participant", "פתיחת כרטיס חניכה"],
  ["update_participant", "עדכון פרטי חניכה"],
  ["assign_participant", "עדכון שיוך לצוות הליווי"],
  ["record_contact", "רישום דיווח קשר"],
  ["review_contact", "בדיקת דיווח קשר"],
  ["set_sms_muted", "עדכון העדפת תזכורות"],
  ["resolve_conflict", "טיפול בהתנגשות"],
]);

const savedFieldLabels = new Map<string, string>([
  ["displayName", "שם החניכה"], ["phone", "טלפון"],
  ["serviceType", "סוג שירות"], ["servicePlace", "מקום השירות"],
  ["serviceRole", "תפקיד בשירות"], ["profileNotes", "הערות לכרטיס"],
  ["mentorId", "חונך/ת"], ["coordinatorId", "רכז/ת"],
  ["method", "דרך הקשר"], ["outcome", "תוצאת הקשר"],
  ["occurredAt", "מועד הקשר"], ["notes", "סיכום הקשר"],
  ["manualColor", "סימון החונך/ת"], ["nextAppointmentAt", "מועד הקשר הבא"],
  ["revision", "גרסת הדיווח"], ["decision", "החלטה"], ["muted", "השתקת SMS"],
]);

const savedValueLabels = new Map<string, string>([
  ["national", "שירות לאומי"], ["military", "שירות צבאי"],
  ["phone", "שיחה טלפונית"], ["in_person", "פגישה פנים אל פנים"],
  ["completed", "הקשר התקיים"], ["no_answer", "לא היה מענה"],
  ["green", "ירוק"], ["orange", "כתום"], ["red", "אדום"],
  ["approved", "אישור הדיווח"], ["returned_for_correction", "החזרה להשלמה"],
  ["keep_ceo", "שמירת גרסת המנכ״ל"],
]);

function savedFieldValue(key: string, value: unknown, staff: readonly StaffProfile[]) {
  if (value === null || value === "") return "ערך ריק";
  if (typeof value === "boolean") return value ? "כן" : "לא";
  if (typeof value === "string") {
    if (key === "mentorId" || key === "coordinatorId") {
      return staff.find((member) => member.id === value)?.displayName ?? "שם לא זמין ברשימת הצוות הנוכחית";
    }
    if (key === "occurredAt" || key === "nextAppointmentAt") return formatDate(value);
    if (["serviceType", "method", "outcome", "manualColor", "decision"].includes(key)) {
      return savedValueLabels.get(value) ?? value;
    }
    return value;
  }
  return JSON.stringify(value) ?? "ערך לא זמין";
}

function LocalSavedDraft({ value, staff }: { value: string; staff: readonly StaffProfile[] }) {
  let command: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) command = parsed as Record<string, unknown>;
  } catch {
    // The original value remains available below even if it is not JSON.
  }
  const fields = command.fields && typeof command.fields === "object" && !Array.isArray(command.fields)
    ? { ...command, ...command.fields }
    : command;
  const readableFields = Object.entries(fields).filter(([key]) => savedFieldLabels.has(key));

  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-lg border p-4">
      <p className="text-sm font-medium">{typeof command.type === "string" ? savedActionLabels.get(command.type) ?? "עדכון שלא הושלם" : "עדכון שלא הושלם"}</p>
      {readableFields.length > 0 && (
        <dl className="flex min-w-0 flex-col gap-3 text-sm">
          {readableFields.map(([key, fieldValue]) => (
            <div key={key} className="flex min-w-0 flex-col gap-1">
              <dt className="text-muted-foreground">{savedFieldLabels.get(key)}</dt>
              <dd dir="auto" className="whitespace-pre-wrap break-words leading-relaxed">{savedFieldValue(key, fieldValue, staff)}</dd>
            </div>
          ))}
        </dl>
      )}
      <details className="min-w-0">
        <summary className="min-h-11 cursor-pointer py-3 text-sm text-muted-foreground">הצגת הנתונים המלאים שנשמרו</summary>
        <pre dir="auto" className="whitespace-pre-wrap break-words text-sm leading-relaxed">{formatPreservedValue(value) || "ערך ריק"}</pre>
      </details>
    </div>
  );
}

function PageHeading({ title, description }: { title: string; description: string }) {
  return (
    <header className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
    </header>
  );
}

function MutationError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert variant="destructive">
      <Info aria-hidden="true" />
      <AlertTitle>הפעולה לא הושלמה</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function OfflineActionNotice({ online }: { online: boolean }) {
  if (online) return null;
  return (
    <Alert>
      <WifiOff aria-hidden="true" />
      <AlertTitle>הבקשות ימתינו לחידוש החיבור</AlertTitle>
      <AlertDescription>
        אפשר לשלוח בקשה על בסיס המידע הזמין במכשיר. היא נשמרת במכשיר ונבדקת מול המידע וההרשאות העדכניים לאחר חידוש החיבור. עד לקבלת אישור, השינוי ממתין לסנכרון.
      </AlertDescription>
    </Alert>
  );
}

type ManagementPayload = MentoringCommand extends infer Command
  ? Command extends { operationId: string }
    ? Omit<Command, "operationId">
    : never
  : never;

interface ManagementActionDraft {
  key: string;
  payload: ManagementPayload;
  successMessage: string;
}

function useManagementCommand(screen: "reviews" | "settings" | "conflicts") {
  const { submit, isOnline } = useWorkspace();
  const draft = useFormDraft<ManagementActionDraft | null>(`management-action:${screen}`, null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const submitting = useRef(false);
  const recoveredOperation = useRef<string | null>(null);

  useEffect(() => {
    if (!draft.recovered || recoveredOperation.current === draft.recovered.operationId) return;
    recoveredOperation.current = draft.recovered.operationId;
    const recovered = draft.recovered;
    setFeedback(recovered.acceptance === "accepted"
      ? "הבקשה הקודמת התקבלה במערכת."
      : "הבקשה הקודמת שמורה במכשיר וממתינה לאישור המערכת.");
    void draft.clear().catch(() => {
      setError("הבקשה הקודמת נשמרה, אך לא ניתן היה לסגור את הטיוטה המקומית. ניסיון נוסף ישתמש באותו מזהה.");
    });
  }, [draft]);

  async function run(key: string, payload: ManagementPayload, successMessage: string) {
    if (submitting.current || !draft.hydrated) return;
    const invalidCommand = operationalCommandIssue(payload);
    if (invalidCommand) {
      setError(invalidCommand.message);
      return;
    }
    submitting.current = true;
    setPendingKey(key);
    setError(null);
    setFeedback(null);
    let submissionStarted = false;

    try {
      draft.update({ key, payload, successMessage });
      const operationId = await draft.prepare(payload);
      submissionStarted = true;
      const result = await submit({ ...payload, operationId } as MentoringCommand);
      if (!result.ok) {
        setError(result.error.message);
        toast.error("הפעולה לא הושלמה");
        return;
      }
      if ("acceptance" in result && result.acceptance === "accepted") {
        toast.success(successMessage);
        setFeedback(successMessage);
      } else {
        const message = "הבקשה נשמרה במכשיר וממתינה לאישור המערכת. השינוי עדיין לא אושר.";
        toast.message(message);
        setFeedback(message);
      }
      try {
        await draft.clear();
      } catch {
        setError(result.acceptance === "accepted"
          ? "הפעולה התקבלה במערכת. סגירת הטיוטה במכשיר לא הושלמה; פתיחה מחדש תבדוק את אותה פעולה."
          : "הבקשה נשמרה בתור לשליחה. סגירת הטיוטה במכשיר לא הושלמה; פתיחה מחדש תבדוק את אותה פעולה.");
      }
    } catch {
      setError("לא התקבל אישור מלא לפעולה. הבקשה נשארה שמורה במכשיר; ניסיון נוסף באותה פעולה ישתמש באותו מזהה.");
      // A rejected promise may follow a committed transaction. Reconcile the
      // persisted immutable action before allowing a different action to replace it.
      if (submissionStarted) draft.recheck();
      toast.error("לא התקבל אישור לפעולה");
    } finally {
      submitting.current = false;
      setPendingKey(null);
    }
  }

  return { run, pendingKey, error, feedback, online: isOnline, draft, ready: draft.hydrated };
}

function ManagementActionStatus({ command }: { command: ReturnType<typeof useManagementCommand> }) {
  return (
    <div className="flex flex-col gap-3">
      <DraftStatus status={command.draft.status} onRetry={command.draft.retry} />
      {command.feedback && <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{command.feedback}</p>}
    </div>
  );
}

function latestReview(reviews: readonly Review[], contactId: string, revision: number) {
  return reviews
    .filter((review) => review.contactId === contactId && review.revision === revision)
    .reduce<Review | undefined>((latest, review) => {
      if (!latest || new Date(review.reviewedAt).getTime() >= new Date(latest.reviewedAt).getTime()) {
        return review;
      }
      return latest;
    }, undefined);
}

export function ReviewsView() {
  const { snapshot } = useWorkspace();
  const command = useManagementCommand("reviews");
  const { run, pendingKey, error, online, ready } = command;
  const now = useNow();
  if (!snapshot) return null;

  if (snapshot.actor.role === "mentor") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeading title="אישור דיווחים" description="בדיקת סיכומי הקשר נעשית על ידי צוות ההנהלה." />
        <Alert>
          <LockKeyhole aria-hidden="true" />
          <AlertTitle>המסך זמין לרכזים ולרכזות ולמנכ״ל</AlertTitle>
          <AlertDescription>אפשר לצפות בתיעוד הקשר מתוך כרטיס החניכה ולרשום דיווח חדש.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const entries = snapshot.participants
    .flatMap((view) => view.contacts.map((contact) => ({
      contact,
      participant: view.participant,
      review: latestReview(view.reviews, contact.id, contact.revision),
      canReview: canReviewParticipant(snapshot.actor, view, now),
      acceptedContactBaseline: contactHasAcceptedBaseline(view, contact),
    })))
    .sort((a, b) => {
      const aApproved = contactReviewState(a.contact, a.review).approved;
      const bApproved = contactReviewState(b.contact, b.review).approved;
      return Number(aApproved) - Number(bApproved)
        || new Date(b.contact.occurredAt).getTime() - new Date(a.contact.occurredAt).getTime();
    });
  const awaitingCount = entries.filter(({ contact, review }) => {
    const state = contactReviewState(contact, review);
    return !state.invalidated && !state.approved;
  }).length;
  const pendingCount = entries.filter(({ contact, review }) => {
    const state = contactReviewState(contact, review);
    return state.pendingContact || state.pendingReview || state.reviewAwaitingSnapshot;
  }).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="אישור דיווחים" description="מקום אחד לבדיקת התיעוד, לאישורו ולהחזרתו להשלמה. כל החלטה מתייחסת לגרסה המדויקת המוצגת." />
      <OfflineActionNotice online={online} />
      <MutationError message={error} />
      <ManagementActionStatus command={command} />
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{awaitingCount} דיווחים ללא אישור</Badge>
        {pendingCount > 0 && <Badge variant="outline">{pendingCount} עדכונים ממתינים לאישור המערכת</Badge>}
        <span className="text-sm text-muted-foreground">האישור אינו משנה את מועד הקשר או את ספירת שבעת הימים.</span>
      </div>
      {entries.length === 0 ? (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><ClipboardCheck aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>עדיין אין דיווחים לבדיקה</EmptyTitle>
            <EmptyDescription>סיכומי קשר שיירשמו בכרטיסי החניכות יופיעו כאן עם הגרסה והמצב שלהם.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          {entries.map(({ contact, participant, review, canReview, acceptedContactBaseline }) => {
            const key = `${contact.id}:${contact.revision}`;
            const { approved, approvalRecorded, invalidated, pendingContact, pendingCorrection, pendingReview, reviewAwaitingSnapshot, canSubmit } = contactReviewState(contact, review, acceptedContactBaseline);
            const author = snapshot.staff.find((staff) => staff.id === contact.actorId);
            const reviewer = snapshot.staff.find((staff) => staff.id === review?.reviewedByStaffId);
            return (
              <Card key={key}>
                <CardHeader>
                  <CardTitle>
                    <Link href={`/staff/participants/${participant.id}`} className="inline-flex min-h-11 items-center break-words underline-offset-4 hover:underline">
                      {participant.displayName}
                    </Link>
                  </CardTitle>
                  <CardDescription>גרסה {contact.revision} · {formatDate(contact.occurredAt)}</CardDescription>
                  <CardAction>
                    <Badge variant={approved ? "secondary" : "outline"}>
                      {invalidated ? "דיווח שבוטל" : pendingContact ? "הדיווח ממתין לאישור המערכת" : pendingReview ? "החלטת הבדיקה ממתינה לאישור המערכת" : reviewAwaitingSnapshot ? "החלטת הבדיקה ממתינה לעדכון הכרטיס" : approved ? "אושר" : review?.decision === "returned_for_correction" ? "להשלמה" : "ממתין לבדיקה"}
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{contact.method === "phone" ? "שיחה טלפונית" : "פגישה פנים אל פנים"}</Badge>
                    <Badge variant={contact.outcome === "completed" ? "secondary" : "outline"}>
                      {contact.outcome === "completed" ? "הקשר התקיים" : "לא היה מענה · לא נחשב לקשר שבוצע"}
                    </Badge>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{contact.notes?.trim() || "לא נוסף סיכום לדיווח זה."}</p>
                  <dl className="grid gap-1 text-xs text-muted-foreground">
                    <div className="flex flex-wrap gap-1"><dt>דווח על ידי:</dt><dd>{author?.displayName ?? "שם לא זמין ברשימת הצוות הנוכחית"}</dd></div>
                    {review && (
                      <div className="flex flex-wrap gap-1"><dt>{pendingReview ? "בקשת בדיקה שטרם אושרה" : reviewAwaitingSnapshot ? "החלטת בדיקה הממתינה לעדכון הכרטיס" : approved ? "אושר" : "הוחזר להשלמה"}:</dt><dd>{reviewer?.displayName ?? "צוות ההנהלה"} · {reviewAwaitingSnapshot ? "מועד הפעולה במכשיר" : formatDate(review.reviewedAt)}</dd></div>
                    )}
                  </dl>
                  {(pendingContact || pendingReview || reviewAwaitingSnapshot) && <p className="text-sm text-muted-foreground">{pendingReview ? "הבקשה לבדיקה נשמרה במכשיר. הגרסה תיחשב מאושרת או מוחזרת להשלמה לאחר אישור המערכת." : reviewAwaitingSnapshot ? "החלטת הבדיקה נשמרה. הכרטיס ממתין לרענון מהמערכת." : pendingCorrection ? "תיקון הדיווח נשמר במכשיר. אפשר לשלוח בקשת בדיקה לגרסה המוצגת; היא תיבדק במערכת לאחר קבלת התיקון." : "הדיווח נשמר במכשיר. בדיקתו תתאפשר לאחר שיתקבל במערכת."}</p>}
                  {!canReview && <p className="text-sm text-muted-foreground">ההרשאה לכרטיס מאפשרת צפייה בדיווח. אישורו או החזרתו להשלמה דורשים הרשאת אישור עדכנית.</p>}
                </CardContent>
                <CardFooter className="flex flex-col items-stretch gap-2 sm:flex-row sm:justify-between">
                  <Button
                    disabled={!canReview || !canSubmit || !ready || pendingKey !== null}
                    onClick={() => void run(`${key}:approved`, {
                      type: "review_contact",
                      participantId: participant.id, contactId: contact.id,
                      revision: contact.revision, decision: "approved",
                    }, "הגרסה המוצגת אושרה")}
                  >
                    {pendingKey === `${key}:approved` ? <Spinner aria-label="מאשר דיווח" data-icon="inline-start" /> : <Check data-icon="inline-start" />}
                    {approved ? "הגרסה אושרה" : approvalRecorded && !pendingReview ? "אישור הגרסה ממתין לעדכון" : pendingReview ? "בקשת הבדיקה ממתינה" : "אישור הדיווח"}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!canReview || !canSubmit || !ready || pendingKey !== null || review?.decision === "returned_for_correction"}
                    onClick={() => void run(`${key}:returned`, {
                      type: "review_contact",
                      participantId: participant.id, contactId: contact.id,
                      revision: contact.revision, decision: "returned_for_correction",
                    }, "הדיווח הוחזר להשלמה")}
                  >
                    {pendingKey === `${key}:returned` ? <Spinner aria-label="מחזיר להשלמה" data-icon="inline-start" /> : <Undo2 data-icon="inline-start" />}החזרה להשלמה
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TeamView() {
  const { snapshot } = useWorkspace();
  if (!snapshot) return null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="הצוות שלנו" description="האנשים שמחזיקים את רצף הליווי. פרטי הקשר והשיוך המוצגים כאן מגיעים מרשימת הצוות במערכת." />
      <StaffManagement />
    </div>
  );
}

export function SettingsView() {
  const { snapshot } = useWorkspace();
  const command = useManagementCommand("settings");
  const { run, pendingKey, error, online, ready } = command;
  if (!snapshot) return null;
  const { actor, capabilities } = snapshot;
  const isCeo = actor.role === "ceo";
  const smsAvailable = capabilities.smsConfigured && capabilities.smsSendingEnabled;
  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="החשבון וההתראות" description="פרטי החשבון שלך והעדפות העדכון שמאפשרות לשמור על קשר רציף עם החניכות." />
      <MutationError message={error} />
      {isCeo && <OfflineActionNotice online={online} />}
      {isCeo && <ManagementActionStatus command={command} />}
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{actor.displayName}</CardTitle>
            <CardDescription>פרטי החשבון המחובר</CardDescription>
            <CardAction><Badge variant="outline">{roleLabels[actor.role]}</Badge></CardAction>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-4 text-sm">
              <div className="flex flex-col gap-1"><dt className="text-muted-foreground">כתובת דוא״ל</dt><dd className="break-words"><span dir="ltr">{actor.email ?? "לא הוזנה כתובת"}</span></dd></div>
              <div className="flex flex-col gap-1"><dt className="text-muted-foreground">טלפון צוות</dt><dd><span dir="ltr">{actor.phone ?? "לא הוזן מספר"}</span></dd></div>
              <div className="flex flex-col gap-1"><dt className="text-muted-foreground">תפקיד במערכת</dt><dd>{roleLabels[actor.role]}</dd></div>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>תזכורות לצוות</CardTitle>
            <CardDescription>התזכורות מיועדות לאנשי הצוות בלבד. החניכות אינן מקבלות הודעות מהמערכת.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <FieldGroup>
              <Field orientation="horizontal" data-disabled={!isCeo || !ready || pendingKey !== null}>
                <FieldContent>
                  <FieldLabel htmlFor="staff-sms" className="min-h-11 items-center">קבלת תזכורות ב־SMS</FieldLabel>
                  <FieldDescription id="staff-sms-description">
                    {isCeo
                      ? "אפשר להשתיק את הודעות ה־SMS לחשבון המנכ״ל בלבד. השינוי אינו משפיע על תזכורות לשאר הצוות."
                      : "קבלת SMS היא חלק ממערך הליווי ואינה ניתנת לביטול בחשבונות הצוות."}
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="staff-sms"
                  className="my-3.5 after:-inset-y-3.5"
                  aria-describedby="staff-sms-description"
                  checked={isCeo ? !actor.smsMuted : true}
                  disabled={!isCeo || !ready || pendingKey !== null}
                  onCheckedChange={(checked) => void run("sms", {
                    type: "set_sms_muted", muted: !checked,
                  }, checked ? "קבלת תזכורות SMS הופעלה" : "הודעות ה־SMS לחשבונך הושתקו")}
                />
              </Field>
            </FieldGroup>
            {pendingKey === "sms" && <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Spinner aria-label="שומר העדפה" />שומר את ההעדפה…</p>}
            <Separator />
            <Alert>
              <MessageSquare aria-hidden="true" />
              <AlertTitle>{smsAvailable ? "שליחת SMS מופעלת במערכת" : capabilities.smsConfigured ? "שירות ה־SMS מוגדר; השליחה כבויה" : "שירות ה־SMS טרם הוגדר"}</AlertTitle>
              <AlertDescription>
                {smsAvailable
                  ? "העדפת החשבון קובעת אם תישלח תזכורת. הפעלת השירות אינה אישור למסירת הודעה מסוימת."
                  : "ההעדפה נשמרת בנפרד ממצב השירות. עד להפעלת השליחה, אין להסתמך על קבלת תזכורות ב־SMS."}
              </AlertDescription>
            </Alert>
          </CardContent>
          <CardFooter><p className="text-xs leading-relaxed text-muted-foreground">התזכורת כוללת פרטים מינימליים לתיאום הקשר. הסיכומים נשארים במערכת.</p></CardFooter>
        </Card>
      </div>
      <OrganizationSettingsForm />
      {isCeo && <RecycleBinView />}
    </div>
  );
}

export function ConflictsView() {
  const { snapshot, acknowledgeLocalFailure } = useWorkspace();
  const command = useManagementCommand("conflicts");
  const { run, pendingKey, error, online, ready } = command;
  const [acknowledgmentId, setAcknowledgmentId] = useState<string | null>(null);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [acknowledgmentError, setAcknowledgmentError] = useState<string | null>(null);
  const acknowledgmentLock = useRef(false);
  if (!snapshot) return null;
  const isCeo = snapshot.actor.role === "ceo";
  const conflicts = [...snapshot.conflicts].sort((a, b) => Number(Boolean(a.resolvedAt)) - Number(Boolean(b.resolvedAt)) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const hasServerConflicts = conflicts.some((conflict) => !conflict.id.startsWith("local:"));
  const acknowledgmentTarget = conflicts.find((conflict) => conflict.id === acknowledgmentId && conflict.id.startsWith("local:") && !conflict.resolvedAt);

  async function acknowledgeSavedSubmission() {
    if (!acknowledgmentTarget || acknowledgmentLock.current || pendingKey !== null) return;
    const operationId = acknowledgmentTarget.id.slice("local:".length);
    if (!operationId) {
      setAcknowledgmentError("לא נמצא מזהה תקין לעדכון השמור. הפרטים נשארו שמורים לעיון.");
      return;
    }
    acknowledgmentLock.current = true;
    setAcknowledgingId(acknowledgmentTarget.id);
    setAcknowledgmentError(null);
    try {
      await acknowledgeLocalFailure(operationId);
      setAcknowledgmentId(null);
      toast.success("העדכון סומן כנקרא ופרטיו נשמרו לעיון");
    } catch (failure) {
      setAcknowledgmentError(failure instanceof Error ? failure.message : "לא ניתן היה לשמור את האישור. הפרטים נשארו שמורים לעיון.");
      toast.error("האישור לא נשמר");
    } finally {
      acknowledgmentLock.current = false;
      setAcknowledgingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="התנגשויות בסנכרון" description="עדכונים שלא הושלמו נשמרים לעיון לצד הסיבה לעצירתם. במקרה של מידע מוגן, גרסת המנכ״ל נשארת בתוקף." />
      <RecoveryControls />
      {isCeo && hasServerConflicts && <OfflineActionNotice online={online} />}
      <MutationError message={error} />
      {isCeo && hasServerConflicts && <ManagementActionStatus command={command} />}
      {!isCeo && hasServerConflicts && (
        <Alert>
          <ShieldCheck aria-hidden="true" />
          <AlertTitle>הכרעה בידי המנכ״ל</AlertTitle>
          <AlertDescription>העדכון שנשלח נשמר לעיון. רק המנכ״ל רשאי לסגור את ההתנגשות.</AlertDescription>
        </Alert>
      )}
      {conflicts.length === 0 ? (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><History aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>אין התנגשויות להצגה</EmptyTitle>
            <EmptyDescription>עדכונים שייעצרו בסנכרון יופיעו כאן עם הסיבה לעצירה והנתונים שנשמרו.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-4">
          {conflicts.map((conflict) => {
            const isLocal = conflict.id.startsWith("local:");
            const participantAvailable = snapshot.participants.some((view) => view.participant.id === conflict.participantId);
            return (
            <Card key={conflict.id}>
              <CardHeader>
                <CardTitle>
                  {participantAvailable ? (
                    <Link href={`/staff/participants/${conflict.participantId}`} className="inline-flex min-h-11 items-center break-words underline-offset-4 hover:underline">{conflict.participantName}</Link>
                  ) : conflict.participantName}
                </CardTitle>
                <CardDescription>{conflict.authorName} · {formatDate(conflict.createdAt)}</CardDescription>
                <CardAction><Badge variant={conflict.resolvedAt ? "secondary" : "outline"}>{conflict.resolvedAt ? isLocal ? "נקרא ונשמר" : "טופל" : isLocal ? "הסנכרון נעצר" : "ממתין להכרעה"}</Badge></CardAction>
              </CardHeader>
              <CardContent className="grid min-w-0 gap-5 md:grid-cols-2">
                <section className="flex min-w-0 flex-col gap-2" aria-label={isLocal ? "הסיבה לעצירת הסנכרון" : "הגרסה המוגנת של המנכ״ל"}>
                  <h2 className="flex items-center gap-2 text-sm font-medium"><ShieldCheck aria-hidden="true" className="size-4 text-muted-foreground" />{isLocal ? "הסיבה לעצירת הסנכרון" : "הגרסה המוגנת של המנכ״ל"}</h2>
                  <p className="whitespace-pre-wrap break-words rounded-lg border bg-muted/50 p-4 text-sm leading-relaxed">{conflict.authoritativeValue || "ערך ריק"}</p>
                </section>
                <section className="flex min-w-0 flex-col gap-2" aria-label={isLocal ? "העדכון שנשמר במכשיר" : "העדכון שנשלח ונשמר"}>
                  <h2 className="flex items-center gap-2 text-sm font-medium"><FileClock aria-hidden="true" className="size-4 text-muted-foreground" />{isLocal ? "העדכון שנשמר במכשיר" : "העדכון שנשלח ונשמר"}</h2>
                  {isLocal ? (
                    <LocalSavedDraft value={conflict.submittedValue} staff={snapshot.staff} />
                  ) : (
                    <p className="whitespace-pre-wrap break-words rounded-lg border p-4 text-sm leading-relaxed">{conflict.submittedValue || "ערך ריק"}</p>
                  )}
                </section>
              </CardContent>
              <CardFooter className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {isLocal
                    ? conflict.resolvedAt
                      ? `העדכון סומן כנקרא ב־${formatDate(conflict.resolvedAt)}. כל פרטיו נשמרו לעיון במכשיר.`
                      : "העדכון נשמר במכשיר ולא התקבל במערכת. יש לבדוק את הסיבה עם צוות ההנהלה לפני הזנת עדכון נוסף."
                    : conflict.resolvedAt ? `ההתנגשות נסגרה ב־${formatDate(conflict.resolvedAt)}. שתי הגרסאות נשמרו.` : "הטיוטה אינה מחליפה את הגרסה המוגנת ונשמרת גם לאחר סגירת ההתנגשות."}
                </p>
                {isLocal && !conflict.resolvedAt && (
                  <Button variant="outline" disabled={acknowledgingId !== null || pendingKey !== null} onClick={() => {
                    setAcknowledgmentError(null);
                    setAcknowledgmentId(conflict.id);
                  }}>
                    <Check data-icon="inline-start" />עיינתי בעדכון השמור
                  </Button>
                )}
                {isCeo && !isLocal && !conflict.resolvedAt && (
                  <Button disabled={!ready || pendingKey !== null || acknowledgingId !== null} onClick={() => void run(conflict.id, {
                    type: "resolve_conflict",
                    conflictId: conflict.id, decision: "keep_ceo",
                  }, "ההתנגשות נסגרה; הגרסה המוגנת נשמרה")}>
                    {pendingKey === conflict.id ? <Spinner aria-label="סוגר התנגשות" data-icon="inline-start" /> : <ShieldCheck data-icon="inline-start" />}
                    שמירת גרסת המנכ״ל וסגירה
                  </Button>
                )}
              </CardFooter>
            </Card>
            );
          })}
        </div>
      )}
      <AlertDialog open={Boolean(acknowledgmentTarget)} onOpenChange={(open) => {
        if (!open && !acknowledgmentLock.current) {
          setAcknowledgmentId(null);
          setAcknowledgmentError(null);
        }
      }}>
        <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>אישור עיון בעדכון השמור</AlertDialogTitle>
            <AlertDialogDescription>
              האישור מסמן שעיינת בעדכון שנשמר במכשיר ומסיר אותו מרשימת הממתינים. כל הפרטים יישארו שמורים לעיון. נתוני החניכה במערכת אינם משתנים בפעולה זו.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <MutationError message={acknowledgmentError} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={acknowledgingId !== null}>ביטול</AlertDialogCancel>
            <AlertDialogAction disabled={acknowledgingId !== null || pendingKey !== null} onClick={() => void acknowledgeSavedSubmission()}>
              {acknowledgingId !== null ? <Spinner aria-label="שומר אישור עיון" data-icon="inline-start" /> : <Check data-icon="inline-start" />}
              עיינתי בעדכון השמור
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
