"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  LoaderCircleIcon,
  PencilIcon,
  PlusIcon,
  UserRoundPlusIcon,
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
import type { ParticipantView } from "@/lib/mentoring/contracts";
import { useWorkspace } from "@/lib/mentoring/workspace-client";
import { InlineError } from "./common";
import { DraftStatus, useFormDraft } from "./form-draft";
import { DraftRecovery } from "./draft-recovery";
import { RecoveredDraft } from "./recovered-draft";
import { assignmentScope, canEditParticipant, changedParticipantFields, createdParticipantFields, fieldIsProtected, participantFieldNames, participantFormFields, type ParticipantFieldName } from "./participant-form-state";

export function ParticipantEditor({ view }: { view?: ParticipantView }) {
  const { snapshot } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!snapshot || (!view && snapshot.actor.role === "mentor")) return null;
  const currentView = view ? snapshot.participants.find((item) => item.participant.id === view.participant.id) : undefined;
  if (view && !currentView) return null;
  const protectedProfile = currentView && participantFieldNames.every((field) => fieldIsProtected(snapshot.actor, currentView.participant.id, currentView.protections, field));
  const editAllowed = !currentView || canEditParticipant(snapshot.actor, currentView);

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
            variant={view ? "outline" : "default"}
            disabled={Boolean(protectedProfile) || !editAllowed}
          />
        }
      >
        {view ? (
          <PencilIcon data-icon="inline-start" />
        ) : (
          <PlusIcon data-icon="inline-start" />
        )}
        {view ? "עריכת פרטים" : "חניכה חדשה"}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {view ? "עריכת כרטיס חניכה" : "הוספת חניכה למערך הליווי"}
          </DialogTitle>
          <DialogDescription>
            אפשר להתחיל גם בכרטיס חלקי ולהשלים פרטים בהמשך. המידע מיועד לצוות
            המורשה.
          </DialogDescription>
        </DialogHeader>
        <ParticipantProfileForm
          view={currentView}
          onBusyChange={setBusy}
          onClose={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ParticipantProfileForm({
  view,
  onBusyChange,
  onClose,
}: {
  view?: ParticipantView;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
}) {
  const { snapshot, submit } = useWorkspace();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draft = useFormDraft(
    `participant-profile:${view?.participant.id ?? "new"}`,
    {
      displayName: view?.participant.displayName ?? "",
      phone: view?.participant.phone ?? "",
      serviceType: view?.participant.serviceType ?? "unknown",
      servicePlace: view?.participant.servicePlace ?? "",
      serviceRole: view?.participant.serviceRole ?? "",
      profileNotes: view?.participant.profileNotes ?? "",
      baseVersion: view?.participant.version ?? null,
    },
  );
  const values = draft.value;
  const actor = snapshot?.actor;
  const currentView = view && snapshot?.participants.find((item) => item.participant.id === view.participant.id);
  const editable = Boolean(snapshot && (!view || (currentView && canEditParticipant(snapshot.actor, currentView))));
  const locked = (field: ParticipantFieldName) => Boolean(view && actor && fieldIsProtected(actor, view.participant.id, currentView?.protections ?? view.protections, field));
  const changedFields = view && actor ? changedParticipantFields(values, currentView?.participant ?? view.participant, actor, currentView?.protections ?? view.protections) : participantFormFields(values);
  const hasChanges = !view || Object.keys(changedFields).length > 0;
  const stale =
    view && draft.hydrated && values.baseVersion !== (currentView?.participant.version ?? view.participant.version);
  function update(field: keyof typeof values, value: string) {
    draft.update({ ...values, [field]: value });
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !draft.hydrated || stale || !editable || !hasChanges) return;
    const fields = view ? changedFields : createdParticipantFields(values);
    const payload = view
      ? {
          type: "update_participant" as const,
          participantId: view.participant.id,
          expectedVersion: values.baseVersion ?? view.participant.version,
          fields,
        }
      : { type: "create_participant" as const, fields };
    setBusy(true);
    onBusyChange(true);
    setError(null);
    try {
      const result = await submit({
        ...payload,
        operationId: await draft.prepare(payload),
      });
      if (!result.ok) {
        setError(result.error.message);
        draft.recheck();
        return;
      }
      try {
        await draft.clear();
      } catch {
        toast.warning(
          "העדכון נשמר, אך לא ניתן לנקות את הטיוטה במכשיר. יש לוודא שאין כרטיס קיים לפני שליחה נוספת.",
        );
      }
      onClose();
      toast.success(
        result.acceptance === "queued"
          ? "העדכון נשמר במכשיר וממתין לשליחה"
          : view
            ? "פרטי החניכה עודכנו"
            : "כרטיס החניכה נוצר",
      );
      if (!view && result.participantId && result.acceptance === "accepted")
        router.push(
          `/staff/participants/${encodeURIComponent(result.participantId)}`,
        );
    } catch {
      setError(
        "לא ניתן לשמור כרגע. הפרטים שהזנת נשארו בטופס, ואפשר לנסות שוב.",
      );
      draft.recheck();
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
        participantId={draft.recovered.participantId ?? view?.participant.id}
        onClose={onClose}
      >
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 text-sm">
          <dt>שם החניכה</dt>
          <dd>{values.displayName || "טרם הוזן"}</dd>
          <dt>טלפון</dt>
          <dd dir="ltr">{values.phone || "טרם הוזן"}</dd>
          <dt>מידע נוסף לליווי</dt>
          <dd className="whitespace-pre-wrap break-words">
            {values.profileNotes || "טרם הוזן"}
          </dd>
        </dl>
      </RecoveredDraft>
    );

  return (
    <form onSubmit={save} className="flex flex-col gap-6">
      <InlineError message={error} />
      {!editable && <Alert><AlertTitle>העריכה אינה זמינה לחשבון הזה</AlertTitle><AlertDescription>הטיוטה נשארת שמורה במכשיר. אפשר לפנות להנהלה לבדיקת ההרשאה העדכנית.</AlertDescription></Alert>}
      {participantFieldNames.some(locked) && <Alert><AlertTitle>חלק מהפרטים מוגנים על ידי המנכ״ל</AlertTitle><AlertDescription>הפרטים המוגנים נעולים לעריכה. שמירת הטופס מעדכנת רק פרטים אחרים ששינית.</AlertDescription></Alert>}
      {stale && !busy && (
        <DraftRecovery
          rows={[
            {
              label: "שם החניכה",
              current: view.participant.displayName,
              draft: values.displayName,
            },
            {
              label: "טלפון",
              current: view.participant.phone ?? "",
              draft: values.phone,
            },
            {
              label: "סוג השירות",
              current:
                view.participant.serviceType === "national"
                  ? "שירות לאומי"
                  : view.participant.serviceType === "military"
                    ? "שירות צבאי"
                    : "טרם נבחר",
              draft:
                values.serviceType === "national"
                  ? "שירות לאומי"
                  : values.serviceType === "military"
                    ? "שירות צבאי"
                    : "טרם נבחר",
            },
            {
              label: "מקום השירות",
              current: view.participant.servicePlace ?? "",
              draft: values.servicePlace,
            },
            {
              label: "תפקיד",
              current: view.participant.serviceRole ?? "",
              draft: values.serviceRole,
            },
            {
              label: "מידע נוסף לליווי",
              current: view.participant.profileNotes ?? "",
              draft: values.profileNotes,
            },
          ]}
          onRebase={() => {
            draft.update({ ...values, baseVersion: currentView?.participant.version ?? view.participant.version });
            setError(null);
          }}
        />
      )}
      <fieldset
        disabled={busy || !draft.hydrated || !editable}
        className="min-w-0 border-0 p-0"
      >
        <FieldGroup className="grid gap-5 sm:grid-cols-2">
          <Field data-disabled={locked("displayName")}>
            <FieldLabel htmlFor="participant-name">שם החניכה</FieldLabel>
            <Input
              id="participant-name"
              disabled={locked("displayName")}
              maxLength={160}
              autoComplete="off"
              value={values.displayName}
              onChange={(event) => update("displayName", event.target.value)}
              placeholder="שם פרטי ומשפחה"
            />
            <FieldDescription>
              מומלץ להזין שם כדי שיהיה קל לזהות את הכרטיס.
            </FieldDescription>
          </Field>
          <Field data-disabled={locked("phone")}>
            <FieldLabel htmlFor="participant-phone">טלפון</FieldLabel>
            <Input
              id="participant-phone"
              disabled={locked("phone")}
              type="tel"
              dir="ltr"
              maxLength={32}
              autoComplete="off"
              value={values.phone}
              onChange={(event) => update("phone", event.target.value)}
              placeholder="050-0000000"
            />
          </Field>
          <Field data-disabled={locked("serviceType")}>
            <FieldLabel htmlFor="participant-service">סוג השירות</FieldLabel>
            <Select
              items={{
                unknown: "טרם נבחר",
                national: "שירות לאומי",
                military: "שירות צבאי",
              }}
              disabled={busy || !draft.hydrated || !editable || locked("serviceType")}
              value={values.serviceType}
              onValueChange={(value) =>
                update("serviceType", value ?? "unknown")
              }
            >
              <SelectTrigger id="participant-service" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="unknown">טרם נבחר</SelectItem>
                  <SelectItem value="national">שירות לאומי</SelectItem>
                  <SelectItem value="military">שירות צבאי</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field data-disabled={locked("servicePlace")}>
            <FieldLabel htmlFor="participant-place">מקום השירות</FieldLabel>
            <Input
              id="participant-place"
              disabled={locked("servicePlace")}
              maxLength={240}
              value={values.servicePlace}
              onChange={(event) => update("servicePlace", event.target.value)}
              placeholder="יישוב, מסגרת או יחידה"
            />
          </Field>
          <Field className="sm:col-span-2" data-disabled={locked("serviceRole")}>
            <FieldLabel htmlFor="participant-role">
              תפקיד במסגרת השירות
            </FieldLabel>
            <Input
              id="participant-role"
              disabled={locked("serviceRole")}
              maxLength={240}
              value={values.serviceRole}
              onChange={(event) => update("serviceRole", event.target.value)}
              placeholder="אפשר להשלים בהמשך"
            />
          </Field>
          <Field className="sm:col-span-2" data-disabled={locked("profileNotes")}>
            <FieldLabel htmlFor="participant-notes">
              מידע נוסף לליווי
            </FieldLabel>
            <Textarea
              id="participant-notes"
              disabled={locked("profileNotes")}
              maxLength={8000}
              value={values.profileNotes}
              onChange={(event) => update("profileNotes", event.target.value)}
              placeholder="פרטים שחשוב שהצוות המלווה יכיר"
              rows={4}
            />
            <FieldDescription>
              סיכומי השיחות והפגישות נשמרים בנפרד, בתיעוד הקשר.
            </FieldDescription>
          </Field>
        </FieldGroup>
      </fieldset>
      <DraftStatus status={draft.status} onRetry={draft.retry} />
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={busy}
        >
          סגירה
        </Button>
        <Button
          type="submit"
          disabled={busy || !draft.hydrated || Boolean(stale) || !editable || !hasChanges}
        >
          {busy && (
            <LoaderCircleIcon
              data-icon="inline-start"
              className="animate-spin"
            />
          )}
          {view ? "שמירת פרטים" : "יצירת כרטיס"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function AssignmentEditor({ view }: { view: ParticipantView }) {
  const { snapshot } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!snapshot || snapshot.actor.role === "mentor") return null;
  const currentView = snapshot.participants.find((item) => item.participant.id === view.participant.id);
  if (!currentView) return null;
  const scope = assignmentScope(snapshot.actor, currentView, snapshot.staff);

  return (
    <div className="flex flex-col items-start gap-2">
    <Dialog open={open} onOpenChange={(next) => { if (!busy) setOpen(next); }}>
      <DialogTrigger render={<Button variant="outline" disabled={!scope.canAssign} aria-describedby={!scope.canAssign ? `assignment-unavailable-${view.participant.id}` : undefined} />}>
        <UserRoundPlusIcon data-icon="inline-start" />
        {view.assignment ? "שינוי שיוך" : "שיוך לחונך/ת"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{view.assignment ? "שינוי שיוך הליווי" : "שיוך חניכה לחונך/ת"}</DialogTitle>
          <DialogDescription>
            {snapshot.actor.role === "coordinator"
              ? "אפשר לשייך חניכה שטרם שויכה לחונך/ת עם גישה פעילה בצוות שלך. שינוי שיוך קיים מתבצע על ידי המנכ״ל."
              : "השיוך מגדיר את האחריות לליווי. חובת המעקב הראשונה מתחילה במועד השיוך."}
          </DialogDescription>
        </DialogHeader>
        <AssignmentForm view={currentView} onBusyChange={setBusy} onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
    {!scope.canAssign && <p id={`assignment-unavailable-${view.participant.id}`} className="text-sm text-muted-foreground">{view.assignment && snapshot.actor.role !== "ceo" ? "שינוי שיוך קיים מתבצעת על ידי המנכ״ל." : "עדכון השיוך אינו זמין בהרשאה הנוכחית או בכרטיס מוגן."}</p>}
    </div>
  );
}

function AssignmentForm({ view, onBusyChange, onClose }: {
  view: ParticipantView;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
}) {
  const { snapshot, submit, isOnline } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draft = useFormDraft(`assignment:${view.participant.id}`, {
    mentorId: view.assignment?.mentorId ?? "",
    coordinatorId: snapshot?.actor.role === "coordinator" ? snapshot.actor.id : view.assignment?.coordinatorId ?? "none",
    baseVersion: view.participant.version,
  });
  if (!snapshot) return null;
  const currentView = snapshot.participants.find((item) => item.participant.id === view.participant.id);
  const scope = currentView && assignmentScope(snapshot.actor, currentView, snapshot.staff);
  const values = draft.value;
  const stale = draft.hydrated && currentView && values.baseVersion !== currentView.participant.version;
  const coordinatorId = snapshot.actor.role === "coordinator" ? snapshot.actor.id : values.coordinatorId;
  const validSelection = Boolean(scope?.mentors.some((mentor) => mentor.id === values.mentorId) && (coordinatorId === "none" || scope?.coordinators.some((coordinator) => coordinator.id === coordinatorId)));
  const nameFor = (id: string | null | undefined) => snapshot.staff.find((staff) => staff.id === id)?.displayName ?? "ללא שיוך";

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !draft.hydrated || stale || !scope?.canAssign || !validSelection) return;
    const payload = {
      type: "assign_participant" as const,
      participantId: view.participant.id,
      expectedVersion: values.baseVersion,
      mentorId: values.mentorId,
      coordinatorId: coordinatorId === "none" ? null : coordinatorId,
    };
    setBusy(true);
    onBusyChange(true);
    setError(null);
    try {
      const result = await submit({ ...payload, operationId: await draft.prepare(payload) });
      if (!result.ok) {
        setError(result.error.message);
        draft.recheck();
        return;
      }
      try { await draft.clear(); } catch {
        toast.warning("השיוך נשמר, אך לא ניתן לנקות את הטיוטה במכשיר. פתיחה מחדש תבדוק את אותה פעולת שמירה.");
      }
      onClose();
      toast.success(result.acceptance === "queued" ? "בקשת השיוך נשמרה במכשיר וממתינה לאישור המערכת" : "החניכה שויכה לחונך/ת");
    } catch {
      setError("לא ניתן להשלים את השיוך כרגע. הטיוטה ומזהה פעולת השמירה נשמרו לניסיון חוזר.");
      draft.recheck();
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  if (draft.recovered) return <RecoveredDraft result={draft.recovered} onClear={draft.clear} participantId={view.participant.id} onClose={onClose}>
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 text-sm"><dt>חונך/ת אחראי/ת</dt><dd>{nameFor(values.mentorId)}</dd><dt>רכז/ת אחראי/ת</dt><dd>{nameFor(coordinatorId)}</dd></dl>
  </RecoveredDraft>;

  return (
    <form onSubmit={save} className="flex flex-col gap-6">
      <InlineError message={error} />
      {!scope?.canAssign && <Alert><AlertTitle>השיוך אינו זמין כרגע</AlertTitle><AlertDescription>שינוי שיוך קיים ועריכת שיוך מוגן זמינות למנכ״ל. הטיוטה נשארת שמורה במכשיר.</AlertDescription></Alert>}
      {stale && currentView && <DraftRecovery rows={[
        { label: "חונך/ת אחראי/ת", current: nameFor(currentView.assignment?.mentorId), draft: nameFor(values.mentorId) },
        { label: "רכז/ת אחראי/ת", current: nameFor(currentView.assignment?.coordinatorId), draft: nameFor(coordinatorId) },
      ]} onRebase={() => { draft.update({ ...values, baseVersion: currentView.participant.version }); setError(null); }} />}
      <FieldGroup>
        <Field data-disabled={busy || !draft.hydrated || !scope?.canAssign}>
          <FieldLabel htmlFor="assignment-mentor">חונך/ת אחראי/ת</FieldLabel>
          <Select items={Object.fromEntries(snapshot.staff.map((staff) => [staff.id, staff.displayName]))} disabled={busy || !draft.hydrated || !scope?.canAssign} value={values.mentorId || null} onValueChange={(value) => draft.update({ ...values, mentorId: value ?? "" })}>
            <SelectTrigger id="assignment-mentor" className="w-full"><SelectValue placeholder="בחירת חונך/ת מהצוות" /></SelectTrigger>
            <SelectContent><SelectGroup>{scope?.mentors.map((staff) => <SelectItem key={staff.id} value={staff.id}>{staff.displayName}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
          {scope?.mentors.length === 0 && <FieldDescription>אין כרגע חונכים או חונכות עם גישה פעילה הזמינים לשיוך.</FieldDescription>}
          {values.mentorId && !validSelection && <FieldDescription>יש לבחור חונך/ת ורכז/ת עם גישה פעילה שאפשר לשייך לפי המידע העדכני.</FieldDescription>}
        </Field>
        <Field data-disabled={snapshot.actor.role === "coordinator" || busy || !draft.hydrated || !scope?.canAssign}>
          <FieldLabel htmlFor="assignment-coordinator">רכז/ת אחראי/ת</FieldLabel>
          <Select items={{ none: "ללא שיוך לרכז/ת", ...Object.fromEntries(snapshot.staff.map((staff) => [staff.id, staff.displayName])) }} disabled={snapshot.actor.role === "coordinator" || busy || !draft.hydrated || !scope?.canAssign} value={coordinatorId} onValueChange={(value) => draft.update({ ...values, coordinatorId: value ?? "none" })}>
            <SelectTrigger id="assignment-coordinator" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup><SelectItem value="none">ללא שיוך לרכז/ת</SelectItem>{scope?.coordinators.map((staff) => <SelectItem key={staff.id} value={staff.id}>{staff.displayName}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
          {snapshot.actor.role === "coordinator" && <FieldDescription>החניכה תישאר באחריות הצוות שלך.</FieldDescription>}
        </Field>
      </FieldGroup>
      {!isOnline && <Alert><AlertTitle>הבקשה תישמר במכשיר</AlertTitle><AlertDescription>עם חזרת החיבור המערכת תבדוק את ההרשאות ואת השיוך העדכני. הרשאות הצפייה ישתנו רק אחרי קבלת הבקשה.</AlertDescription></Alert>}
      <DraftStatus status={draft.status} onRetry={draft.retry} />
      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>סגירה</Button>
        <Button type="submit" disabled={busy || !draft.hydrated || Boolean(stale) || !scope?.canAssign || !validSelection}>
          {busy && <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />}
          אישור השיוך
        </Button>
      </DialogFooter>
    </form>
  );
}
