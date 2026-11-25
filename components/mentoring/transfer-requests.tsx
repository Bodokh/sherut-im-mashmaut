"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  ArrowLeftRightIcon,
  BellRingIcon,
  CheckIcon,
  LoaderCircleIcon,
  MailCheckIcon,
  SendIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/staff/ui/alert";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/staff/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/staff/ui/field";
import { Input } from "@/components/staff/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/staff/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/staff/ui/tabs";
import { Textarea } from "@/components/staff/ui/textarea";
import type { TransferRequestDecision, TransferRequestView } from "@/lib/mentoring/features/transfers/contracts";
import { useWorkspace } from "@/lib/mentoring/workspace-client";
import { staffPublicPath } from "@/lib/staff-host";
import { InlineError, PageHeading, SectionEmpty, serviceNames, useCommandIntent } from "./common";
import { formatDateTime } from "./format";
import {
  availableTransferTargets,
  buildTransferRequestCommand,
  buildTransferResponseCommand,
  canCoordinatorManageTransfers,
  canViewTransfers,
  incomingTransferRequests,
  outgoingTransferRequests,
  ownActiveMentors,
  pendingIncomingTransferCount,
  transferStatusLabels,
} from "./transfer-state";

function TransferStatusBadge({ status }: { status: TransferRequestView["status"] }) {
  const variant = status === "pending" ? "default" : status === "approved" ? "secondary" : "outline";
  return <Badge variant={variant}>{transferStatusLabels[status]}</Badge>;
}

export function IncomingTransferAlertBanner() {
  const { snapshot } = useWorkspace();
  if (!snapshot || snapshot.actor.role !== "coordinator") return null;
  const count = pendingIncomingTransferCount(snapshot.actor, snapshot.transferRequests);
  if (count === 0) return null;

  return (
    <Alert className="border-primary/40 bg-primary/5">
      <BellRingIcon />
      <AlertTitle>
        {count === 1
          ? "ממתינה לאישורך בקשת העברת שיוך חדשה"
          : `ממתינות לאישורך ${count} בקשות להעברת שיוך`}
      </AlertTitle>
      <AlertDescription className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <span>
          רכזת אחרת ביקשה להעביר לצוות שלה חניכה המשויכת כעת לצוות שלך. השיוך לא ישתנה עד לאישורך.
        </span>
        <Button size="sm" nativeButton={false} render={<Link href={staffPublicPath("/staff/transfers")} />}>
          לצפייה ואישור הבקשות
          <ArrowLeftIcon data-icon="inline-end" />
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function RequestTransferDialog({
  defaultParticipantId = "",
  triggerVariant = "default",
  onRequested,
}: {
  defaultParticipantId?: string;
  triggerVariant?: "default" | "outline";
  onRequested?: () => void;
}) {
  const { snapshot } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!snapshot || !canCoordinatorManageTransfers(snapshot.actor)) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) setOpen(next); }}>
      <DialogTrigger render={<Button variant={triggerVariant} />}>
        <ArrowLeftRightIcon data-icon="inline-start" />
        בקשת העברת חניכה
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>בקשת העברת שיוך מרכזת לרכזת</DialogTitle>
          <DialogDescription>
            בחרי חניכה המשובצת כעת בצוות של רכזת אחרת ואת החונכת המיועדת בצוות שלך. החניכה תעבור לשיוך החדש רק לאחר שהרכזת המחזיקה בה כעת תאשר את הבקשה.
          </DialogDescription>
        </DialogHeader>
        <RequestTransferForm
          defaultParticipantId={defaultParticipantId}
          onBusyChange={setBusy}
          onClose={() => setOpen(false)}
          onRequested={onRequested}
        />
      </DialogContent>
    </Dialog>
  );
}

function RequestTransferForm({
  defaultParticipantId,
  onBusyChange,
  onClose,
  onRequested,
}: {
  defaultParticipantId: string;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
  onRequested?: () => void;
}) {
  const { snapshot, submitOnline, isOnline } = useWorkspace();
  const intent = useCommandIntent();
  const mentors = useMemo(
    () => (snapshot ? ownActiveMentors(snapshot.actor, snapshot.staff) : []),
    [snapshot],
  );
  const targets = useMemo(
    () =>
      snapshot
        ? availableTransferTargets(snapshot.actor, snapshot.transferableParticipants, snapshot.transferRequests)
        : [],
    [snapshot],
  );
  const [search, setSearch] = useState("");
  const [participantId, setParticipantId] = useState(defaultParticipantId);
  const [targetMentorId, setTargetMentorId] = useState(() => (mentors.length === 1 ? mentors[0].id : ""));
  const [note, setNote] = useState("");
  const [issue, setIssue] = useState<{ field: "participantId" | "targetMentorId" | "note"; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!snapshot) return null;
  const staffById = new Map(snapshot.staff.map((member) => [member.id, member.displayName]));
  const normalizedSearch = search.trim().toLocaleLowerCase("he");
  const filteredTargets = targets.filter((item) => {
    if (item.participantId === participantId) return true;
    if (!normalizedSearch) return true;
    const coordinatorName = staffById.get(item.currentCoordinatorId) ?? "";
    return (
      item.displayName.toLocaleLowerCase("he").includes(normalizedSearch)
      || coordinatorName.toLocaleLowerCase("he").includes(normalizedSearch)
    );
  });

  const targetLabels = Object.fromEntries(
    targets.map((item) => {
      const coordinatorName = staffById.get(item.currentCoordinatorId) ?? "רכזת פעילה";
      const suffix = item.assignmentProtected
        ? " · נעולה בהגנת מנכ״ל"
        : item.hasPendingOutgoing
          ? " · בקשה ממתינה לאישור"
          : "";
      return [item.participantId, `${item.displayName} (רכזת נוכחית: ${coordinatorName}${suffix})`];
    }),
  );
  const mentorLabels = Object.fromEntries(mentors.map((mentor) => [mentor.id, mentor.displayName]));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const built = buildTransferRequestCommand({ participantId, targetMentorId, note }, targets, mentors);
    if (!built.ok) {
      setIssue(built.issue);
      return;
    }
    setBusy(true);
    onBusyChange(true);
    setIssue(null);
    setError(null);
    try {
      const result = await submitOnline({
        ...built.payload,
        operationId: intent.operationId(built.payload),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      intent.clear();
      toast.success("בקשת ההעברה נשלחה לרכזת לאישור");
      onRequested?.();
      onClose();
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-5" noValidate>
      <InlineError message={error} />
      {!isOnline && (
        <Alert>
          <AlertTitle>נדרש חיבור פעיל</AlertTitle>
          <AlertDescription>
            שליחת בקשת העברת שיוך מחייבת חיבור פעיל כדי לעדכן את הרכזת המחזיקה בחניכה בזמן אמת.
          </AlertDescription>
        </Alert>
      )}
      {mentors.length === 0 && (
        <Alert>
          <AlertTitle>אין חונכות פעילות בצוות שלך</AlertTitle>
          <AlertDescription>
            לפני שליחת בקשת העברה יש לוודא שקיימת לפחות חונכת פעילה אחת המשויכת לצוות שלך.
          </AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        {targets.length > 5 && (
          <Field>
            <FieldLabel htmlFor="transfer-search">סינון חניכות לפי שם או רכזת</FieldLabel>
            <Input
              id="transfer-search"
              type="search"
              placeholder="חיפוש לפי שם החניכה או שם הרכזת הנוכחית"
              value={search}
              disabled={busy}
              onChange={(event) => setSearch(event.target.value)}
            />
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="transfer-participant">חניכה מבוקשת להעברה</FieldLabel>
          <Select
            items={targetLabels}
            value={participantId || null}
            disabled={busy || targets.length === 0}
            onValueChange={(value) => {
              setParticipantId(value ?? "");
              setIssue(null);
            }}
          >
            <SelectTrigger
              id="transfer-participant"
              className="w-full"
              aria-invalid={issue?.field === "participantId" || undefined}
            >
              <SelectValue placeholder="בחירת חניכה המשויכת לרכזת אחרת" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {filteredTargets.map((item) => {
                  const coordinatorName = staffById.get(item.currentCoordinatorId) ?? "רכזת פעילה";
                  const serviceLabel = item.serviceType ? ` · ${serviceNames[item.serviceType]}` : "";
                  const stateNote = item.assignmentProtected
                    ? " (נעולה בהגנת מנכ״ל)"
                    : item.hasPendingOutgoing
                      ? " (כבר נשלחה בקשה ממתינה)"
                      : "";
                  return (
                    <SelectItem
                      key={item.participantId}
                      value={item.participantId}
                      disabled={item.assignmentProtected || item.hasPendingOutgoing}
                    >
                      {item.displayName}{serviceLabel} — רכזת: {coordinatorName}{stateNote}
                    </SelectItem>
                  );
                })}
              </SelectGroup>
            </SelectContent>
          </Select>
          {targets.length === 0 && (
            <FieldDescription>
              אין כרגע חניכות פעילות המשויכות לרכזות אחרות שניתן לבקש עבורן העברה.
            </FieldDescription>
          )}
          {issue?.field === "participantId" && <FieldError>{issue.message}</FieldError>}
        </Field>
        <Field>
          <FieldLabel htmlFor="transfer-mentor">חונכת מיועדת בצוות שלך</FieldLabel>
          <Select
            items={mentorLabels}
            value={targetMentorId || null}
            disabled={busy || mentors.length === 0}
            onValueChange={(value) => {
              setTargetMentorId(value ?? "");
              setIssue(null);
            }}
          >
            <SelectTrigger
              id="transfer-mentor"
              className="w-full"
              aria-invalid={issue?.field === "targetMentorId" || undefined}
            >
              <SelectValue placeholder="בחירת חונכת מתוך הצוות שלך" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {mentors.map((mentor) => (
                  <SelectItem key={mentor.id} value={mentor.id}>
                    {mentor.displayName}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>
            אם הרכזת הנוכחית תאשר את הבקשה, החניכה תשויך אוטומטית לחונכת זו בצוות שלך.
          </FieldDescription>
          {issue?.field === "targetMentorId" && <FieldError>{issue.message}</FieldError>}
        </Field>
        <Field>
          <FieldLabel htmlFor="transfer-note">הערה לרכזת המחזיקה (רשות)</FieldLabel>
          <Textarea
            id="transfer-note"
            rows={3}
            maxLength={2000}
            value={note}
            disabled={busy}
            placeholder="סיבת הבקשה או פרט חשוב לתיאום בין הרכזות"
            onChange={(event) => {
              setNote(event.target.value);
              setIssue(null);
            }}
          />
          {issue?.field === "note" && <FieldError>{issue.message}</FieldError>}
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
          סגירה
        </Button>
        <Button type="submit" disabled={busy || !isOnline || targets.length === 0 || mentors.length === 0}>
          {busy ? (
            <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
          ) : (
            <SendIcon data-icon="inline-start" />
          )}
          שליחת בקשת העברה
        </Button>
      </DialogFooter>
    </form>
  );
}

function RespondTransferAction({
  request,
  decision,
}: {
  request: TransferRequestView;
  decision: TransferRequestDecision;
}) {
  const { submitOnline, isOnline } = useWorkspace();
  const intent = useCommandIntent();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [issue, setIssue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isApprove = decision === "approved";

  async function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const built = buildTransferResponseCommand(request.id, decision, note);
    if (!built.ok) {
      setIssue(built.issue.message);
      return;
    }
    setBusy(true);
    setIssue(null);
    setError(null);
    try {
      const result = await submitOnline({
        ...built.payload,
        operationId: intent.operationId(built.payload),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      intent.clear();
      toast.success(
        isApprove
          ? "בקשת ההעברה אושרה והחניכה הועברה לצוות המבקש"
          : "בקשת ההעברה נדחתה והחניכה נשארה בצוות שלך",
      );
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) setOpen(next); }}>
      <DialogTrigger render={<Button size="sm" variant={isApprove ? "default" : "outline"} />}>
        {isApprove ? <CheckIcon data-icon="inline-start" /> : <XIcon data-icon="inline-start" />}
        {isApprove ? "אישור העברה" : "דחיית בקשה"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isApprove
              ? `אישור העברת השיוך של ${request.participantName}`
              : `דחיית בקשת ההעברה של ${request.participantName}`}
          </DialogTitle>
          <DialogDescription>
            {isApprove
              ? "לאחר האישור, השיוך של החניכה יעבור באופן מיידי לצוות של הרכזת המבקשת ולחונכת המיועדת שנבחרה בבקשה."
              : "בדחיית הבקשה לא יתבצע שום שינוי בשיוך הקיים, והחניכה תישאר באחריות הצוות שלך."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submitDecision} className="flex flex-col gap-5" noValidate>
          <InlineError message={error} />
          {!isOnline && (
            <Alert>
              <AlertTitle>נדרש חיבור פעיל</AlertTitle>
              <AlertDescription>
                אישור או דחייה של בקשת העברת שיוך מחייבים חיבור פעיל.
              </AlertDescription>
            </Alert>
          )}
          <Field>
            <FieldLabel htmlFor={`transfer-response-note-${request.id}-${decision}`}>
              הערה למענה (רשות)
            </FieldLabel>
            <Textarea
              id={`transfer-response-note-${request.id}-${decision}`}
              rows={3}
              maxLength={2000}
              value={note}
              disabled={busy}
              placeholder={isApprove ? "הערה לרכזת המקבלת לקראת המשך הליווי" : "סיבת הדחייה או הערה לתיאום"}
              onChange={(event) => {
                setNote(event.target.value);
                setIssue(null);
              }}
            />
            {issue && <FieldError>{issue}</FieldError>}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              ביטול
            </Button>
            <Button type="submit" variant={isApprove ? "default" : "destructive"} disabled={busy || !isOnline}>
              {busy && <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />}
              {isApprove ? "אישור והעברת החניכה" : "דחיית הבקשה"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TransferRequestCard({
  request,
  direction,
}: {
  request: TransferRequestView;
  direction: "incoming" | "outgoing" | "overview";
}) {
  const { snapshot } = useWorkspace();
  if (!snapshot) return null;
  const staffById = new Map(snapshot.staff.map((member) => [member.id, member.displayName]));
  const requesterName = staffById.get(request.requesterCoordinatorId) ?? "רכזת";
  const currentOwnerName = staffById.get(request.currentCoordinatorId) ?? "רכזת";
  const targetMentorName = staffById.get(request.targetMentorId) ?? "חונכת";
  const canOpenParticipant = snapshot.participants.some((view) => view.participant.id === request.participantId);
  const canRespond =
    snapshot.actor.role === "coordinator"
    && request.status === "pending"
    && request.currentCoordinatorId === snapshot.actor.id;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {canOpenParticipant ? (
            <Link
              href={staffPublicPath(`/staff/participants/${encodeURIComponent(request.participantId)}`)}
              className="text-primary underline-offset-4 hover:underline"
            >
              {request.participantName}
            </Link>
          ) : (
            <span>{request.participantName}</span>
          )}
        </CardTitle>
        <CardDescription>
          {direction === "incoming"
            ? `בקשה מאת הרכזת ${requesterName}`
            : direction === "outgoing"
              ? `נשלחה אל הרכזת ${currentOwnerName}`
              : `מאת ${requesterName} אל ${currentOwnerName}`}
        </CardDescription>
        <CardAction>
          <TransferStatusBadge status={request.status} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <dl className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">רכזת מחזיקה בעת הבקשה</dt>
            <dd className="font-medium">{currentOwnerName}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">רכזת מבקשת וחונכת מיועדת</dt>
            <dd className="font-medium">
              {requesterName} · {targetMentorName}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">מועד שליחת הבקשה</dt>
            <dd>{formatDateTime(request.createdAt)}</dd>
          </div>
          {request.respondedAt && (
            <div>
              <dt className="text-xs text-muted-foreground">מועד המענה</dt>
              <dd>{formatDateTime(request.respondedAt)}</dd>
            </div>
          )}
        </dl>
        {request.requestNote && (
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs font-medium text-muted-foreground">הערת הרכזת המבקשת</p>
            <p className="mt-1 whitespace-pre-wrap break-words">{request.requestNote}</p>
          </div>
        )}
        {request.responseNote && (
          <div className="rounded-lg border p-3">
            <p className="text-xs font-medium text-muted-foreground">הערת מענה</p>
            <p className="mt-1 whitespace-pre-wrap break-words">{request.responseNote}</p>
          </div>
        )}
        {request.emailStatus === "accepted" && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MailCheckIcon className="size-3.5" aria-hidden="true" />
            נשלחה הודעת דוא״ל לרכזת המחזיקה בחניכה
          </p>
        )}
      </CardContent>
      {canRespond && (
        <CardFooter className="flex flex-wrap gap-2">
          <RespondTransferAction request={request} decision="approved" />
          <RespondTransferAction request={request} decision="rejected" />
        </CardFooter>
      )}
    </Card>
  );
}

function CoordinatorTransfersTabs({
  incoming,
  outgoing,
  pendingIncoming,
}: {
  incoming: readonly TransferRequestView[];
  outgoing: readonly TransferRequestView[];
  pendingIncoming: number;
}) {
  const initialTab = pendingIncoming > 0 || incoming.length > 0 || outgoing.length === 0 ? "incoming" : "outgoing";
  const [activeTab, setActiveTab] = useState<"incoming" | "outgoing">(initialTab);

  return (
    <>
      <PageHeading
        title="בקשות העברת שיוך"
        description="כדי להעביר אלייך חניכה שכבר משובצת בצוות אחר, שלחי בקשת העברה לרכזת המחזיקה בה. החניכה תעבור רק לאחר אישור הרכזת."
        action={<RequestTransferDialog onRequested={() => setActiveTab("outgoing")} />}
      />
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (value === "incoming" || value === "outgoing") setActiveTab(value);
        }}
        className="flex flex-col gap-5"
      >
        <TabsList className="self-start">
          <TabsTrigger value="incoming" className="gap-2">
            בקשות נכנסות לאישורי
            {pendingIncoming > 0 && <Badge>{pendingIncoming}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="outgoing" className="gap-2">
            בקשות ששלחתי
            {outgoing.length > 0 && <Badge variant="outline">{outgoing.length}</Badge>}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="incoming" className="flex flex-col gap-4">
          {incoming.length === 0 ? (
            <SectionEmpty
              title="אין בקשות העברה נכנסות"
              description="כאשר רכזת אחרת תבקש להעביר לצוות שלה חניכה המשויכת אלייך, תקבלי התראה כאן ובדוא״ל ותוכלי לאשר או לדחות את הבקשה."
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {incoming.map((request) => (
                <TransferRequestCard key={request.id} request={request} direction="incoming" />
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="outgoing" className="flex flex-col gap-4">
          {outgoing.length === 0 ? (
            <SectionEmpty
              title="טרם שלחת בקשות העברה"
              description="אפשר לבקש העברת שיוך של חניכה המשובצת אצל רכזת אחרת באמצעות הכפתור למעלה. עד לאישור הרכזת לא יתבצע שינוי בשיוך."
              action={<RequestTransferDialog triggerVariant="outline" onRequested={() => setActiveTab("outgoing")} />}
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {outgoing.map((request) => (
                <TransferRequestCard key={request.id} request={request} direction="outgoing" />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}

export function TransfersView() {
  const { snapshot } = useWorkspace();
  if (!snapshot) return null;

  if (!canViewTransfers(snapshot.actor)) {
    return (
      <>
        <PageHeading
          title="בקשות העברת שיוך"
          description="העברת חניכה שכבר משובצת מתבצעת על ידי המנכ״ל או בבקשה מרכזת לרכזת."
        />
        <SectionEmpty
          title="ניהול העברות זמין לרכזות ולהנהלה"
          description="חונכות יכולות לשייך חניכות חדשות שטרם שובצו דרך מסך החניכות. עבור חניכה שכבר משובצת, יש לפנות לרכזת הצוות או למנכ״ל."
          action={
            <Button variant="outline" nativeButton={false} render={<Link href={staffPublicPath("/staff/participants")} />}>
              למסך החניכות
            </Button>
          }
        />
      </>
    );
  }

  const allRequests = snapshot.transferRequests ?? [];
  const incoming = incomingTransferRequests(snapshot.actor, allRequests);
  const outgoing = outgoingTransferRequests(snapshot.actor, allRequests);
  const pendingIncoming = pendingIncomingTransferCount(snapshot.actor, allRequests);

  if (snapshot.actor.role === "ceo") {
    return (
      <>
        <PageHeading
          title="בקשות העברת שיוך"
          description="מעקב הנהלה אחר בקשות העברת חניכות בין רכזות. כמנכ״ל, באפשרותך גם לשנות שיוך ישירות מתוך כרטיס החניכה."
        />
        {incoming.length === 0 ? (
          <SectionEmpty
            title="אין בקשות העברת שיוך"
            description="כאשר רכזת תבקש להעביר חניכה מצוות של רכזת אחרת, הבקשה והמענה יופיעו כאן."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {incoming.map((request) => (
              <TransferRequestCard key={request.id} request={request} direction="overview" />
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <CoordinatorTransfersTabs
      incoming={incoming}
      outgoing={outgoing}
      pendingIncoming={pendingIncoming}
    />
  );
}
