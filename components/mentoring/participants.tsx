"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarClockIcon,
  CheckCheckIcon,
  CircleAlertIcon,
  LockKeyholeIcon,
  MapPinIcon,
  PhoneIcon,
  UserRoundIcon,
} from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/staff/ui/alert";
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
import { Field, FieldGroup, FieldLabel } from "@/components/staff/ui/field";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/staff/ui/tabs";
import { useWorkspace } from "@/lib/mentoring/workspace-client";
import {
  ContactLink,
  FollowupBadge,
  ManualColorBadge,
  PageHeading,
  ParticipantIdentity,
  SectionEmpty,
  followupFor,
  serviceNames,
  useNow,
} from "./common";
import { formatDateTime } from "./format";
import { AssignmentEditor, ParticipantEditor } from "./participant-forms";
import { AppointmentReviewWarning, ContactCorrectionActions, ContactFollowupActions } from "./contact-corrections";
import { ParticipantAuthorityControls } from "./authority-controls";
import { ParticipantHistory } from "./participant-history";

const lifecycleNames = {
  active: "בליווי פעיל",
  paused: "הליווי בהשהיה",
  closed: "הליווי הסתיים",
} as const;

export function ParticipantsView() {
  const { snapshot } = useWorkspace();
  const [query, setQuery] = useState("");
  const [service, setService] = useState("all");
  const [lifecycle, setLifecycle] = useState("active");
  const now = useNow();
  if (!snapshot) return null;
  const normalized = query.trim().toLocaleLowerCase("he");
  const views = snapshot.participants.filter(
    ({ participant }) =>
      !participant.deletedAt &&
      (lifecycle === "all" || participant.lifecycle === lifecycle) &&
      (service === "all" ||
        participant.serviceType === service ||
        (service === "unknown" && !participant.serviceType)) &&
      (!normalized ||
        [
          participant.displayName,
          participant.phone,
          participant.servicePlace,
        ].some((value) => value?.toLocaleLowerCase("he").includes(normalized))),
  );
  return (
    <>
      <PageHeading
        title="החניכות"
        description="לכל חניכה יש כרטיס אחד שמרכז את הפרטים, האחריות לליווי והקשר לאורך הדרך."
        action={<ParticipantEditor />}
      />
      <Card>
        <CardHeader>
          <CardTitle>מבט על מערך הליווי</CardTitle>
          <CardDescription>
            מוצגות {views.length} מתוך {snapshot.participants.filter(({ participant }) => !participant.deletedAt).length} חניכות
            הזמינות לחשבון שלך.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <Field>
              <FieldLabel htmlFor="participant-search">חיפוש חניכה</FieldLabel>
              <Input
                id="participant-search"
                type="search"
                placeholder="שם, טלפון או מקום שירות"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="service-filter">סוג השירות</FieldLabel>
              <Select
                items={{
                  all: "כל סוגי השירות",
                  ...serviceNames,
                  unknown: "טרם נבחר",
                }}
                value={service}
                onValueChange={(value) => setService(value ?? "all")}
              >
                <SelectTrigger id="service-filter" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">כל סוגי השירות</SelectItem>
                    <SelectItem value="national">שירות לאומי</SelectItem>
                    <SelectItem value="military">שירות צבאי</SelectItem>
                    <SelectItem value="unknown">טרם נבחר</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="lifecycle-filter">מצב הליווי</FieldLabel>
              <Select
                items={{ all: "כל החניכות", ...lifecycleNames }}
                value={lifecycle}
                onValueChange={(value) => setLifecycle(value ?? "active")}
              >
                <SelectTrigger id="lifecycle-filter" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="active">בליווי פעיל</SelectItem>
                    <SelectItem value="paused">הליווי בהשהיה</SelectItem>
                    <SelectItem value="closed">הליווי הסתיים</SelectItem>
                    <SelectItem value="all">כל החניכות</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
      {views.length ? (
        <div className="grid items-stretch gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          {views.map((view) => {
            const followup = followupFor(view, now);
            const mentor = snapshot.staff.find(
              (staff) => staff.id === view.assignment?.mentorId,
            );
            return (
              <Card key={view.participant.id}>
                <CardHeader>
                  <CardTitle>
                    <Link
                      className="rounded-md outline-offset-4 hover:underline"
                      href={`/staff/participants/${encodeURIComponent(view.participant.id)}`}
                    >
                      <ParticipantIdentity
                        name={view.participant.displayName}
                        service={
                          view.participant.serviceType
                            ? serviceNames[view.participant.serviceType]
                            : "סוג השירות טרם הוזן"
                        }
                      />
                    </Link>
                  </CardTitle>
                  <CardDescription className="pt-2">
                    <span className="flex flex-wrap gap-2">
                      <FollowupBadge followup={followup} />
                      <ManualColorBadge color={view.manualColor} />
                      {view.participant.localPending && <Badge variant="outline">עדכון ממתין לאישור המערכת</Badge>}
                    </span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-3">
                  <div className="flex items-start gap-2 text-sm">
                    <UserRoundIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span>
                      {mentor?.displayName ??
                        (view.assignment ? "שיוך לחונך/ת קיים" : "טרם הוגדר שיוך לחונך/ת")}
                    </span>
                  </div>
                  {view.participant.servicePlace && (
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <MapPinIcon className="mt-0.5 size-4 shrink-0" />
                      <span>{view.participant.servicePlace}</span>
                    </div>
                  )}
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CalendarClockIcon className="mt-0.5 size-4 shrink-0" />
                    <span>
                      {view.nextAppointment
                        ? `הפגישה הבאה: ${formatDateTime(view.nextAppointment.scheduledAt)}`
                        : "הפגישה הבאה טרם נקבעה"}
                    </span>
                  </div>
                  {view.participant.lifecycle !== "active" && (
                    <Badge variant="secondary">
                      {lifecycleNames[view.participant.lifecycle]}
                    </Badge>
                  )}
                </CardContent>
                <CardFooter className="flex-wrap justify-between gap-2">
                  <Button
                    variant="ghost"
                    nativeButton={false}
                    render={
                      <Link
                        href={`/staff/participants/${encodeURIComponent(view.participant.id)}`}
                      />
                    }
                  >
                    לכרטיס החניכה
                    <ArrowLeftIcon data-icon="inline-end" />
                  </Button>
                    <ContactLink participantId={view.participant.id} />
                </CardFooter>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent>
            <SectionEmpty
              title={
                snapshot.participants.length
                  ? "לא נמצאו חניכות שמתאימות לחיפוש"
                  : "עדיין אין חניכות ברשימה"
              }
              description={
                snapshot.participants.length
                  ? "אפשר לשנות את החיפוש או את הסינון כדי לראות חניכות נוספות."
                  : snapshot.actor.role === "mentor"
                    ? "לאחר שיוך חניכות על ידי ההנהלה, הכרטיסים שלהן יופיעו כאן."
                    : "אפשר להוסיף כרטיס חניכה גם עם פרטים חלקיים, ובהמשך לשייך לה חונך/ת."
              }
              action={
                snapshot.participants.length ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setQuery("");
                      setService("all");
                      setLifecycle("all");
                    }}
                  >
                    ניקוי הסינון
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      )}
    </>
  );
}

export function ParticipantDetailView({
  participantId,
}: {
  participantId: string;
}) {
  const { snapshot } = useWorkspace();
  const now = useNow();
  if (!snapshot) return null;
  const view = snapshot.participants.find(
    ({ participant }) => participant.id === participantId,
  );
  if (!view)
    return (
      <>
        <PageHeading
          title="כרטיס החניכה אינו זמין"
          description="ייתכן שהשיוך או ההרשאות השתנו, או שהכרטיס אינו קיים."
        />
        <SectionEmpty
          title="אין כרטיס זמין להצגה"
          description="ברשימת החניכות מופיעים הכרטיסים שזמינים לחשבון שלך כרגע."
          action={
            <Button
              nativeButton={false}
              render={<Link href="/staff/participants" />}
            >
              <ArrowRightIcon data-icon="inline-start" />
              לרשימת החניכות
            </Button>
          }
        />
      </>
    );
  const followup = followupFor(view, now);
  const mentor = snapshot.staff.find(
    (staff) => staff.id === view.assignment?.mentorId,
  );
  const coordinator = snapshot.staff.find(
    (staff) => staff.id === view.assignment?.coordinatorId,
  );
  const contacts = [...view.contacts].sort(
    (a, b) =>
      new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );
  const protectedProfile = view.protections.some(
    (protection) =>
      protection.active && protection.resourceId === view.participant.id,
  );
  const deleted = Boolean(view.participant.deletedAt ?? view.deletedAt);

  return (
    <>
      <nav aria-label="ניווט בכרטיס החניכה">
        <Button
          variant="ghost"
          nativeButton={false}
          render={<Link href="/staff/participants" />}
        >
          <ArrowRightIcon data-icon="inline-start" />
          לכל החניכות
        </Button>
      </nav>
      <PageHeading
        title={view.participant.displayName || "חניכה ללא שם"}
        description={[
          view.participant.serviceType
            ? serviceNames[view.participant.serviceType]
            : "סוג השירות טרם הוזן",
          view.participant.servicePlace,
        ]
          .filter(Boolean)
          .join(" · ")}
        action={
          <>
            {!deleted && <ParticipantEditor view={view} />}
            {!deleted && <ContactLink participantId={view.participant.id} primary />}
          </>
        }
      />
      {view.participant.localPending && <Alert><CalendarClockIcon /><AlertTitle>יש עדכון בכרטיס שממתין לאישור המערכת</AlertTitle><AlertDescription>התצוגה כוללת בקשה שנשמרה במכשיר. המערכת תבדוק את הגרסה וההרשאות כאשר הבקשה תגיע אליה; ההרשאות הזמינות נשארות לפי האישור האחרון.</AlertDescription></Alert>}
      {deleted && <Alert><LockKeyholeIcon /><AlertTitle>{view.participant.localPending ? "בקשה להעברת הכרטיס לסל המחזור נשמרה במכשיר" : "הכרטיס נמצא בסל המחזור"}</AlertTitle><AlertDescription>{view.participant.localPending ? "ההעברה ממתינה לאישור המערכת. פרטי הכרטיס וההיסטוריה נשמרים במכשיר עד לבדיקת הבקשה." : "המידע נשמר לעיון ולשחזור על ידי המנכ״ל. אפשר לעיין בהיסטוריה; כדי להמשיך לעדכן את הכרטיס יש לשחזר אותו."}</AlertDescription></Alert>}
      <AppointmentReviewWarning view={view} />
      {protectedProfile && (
        <Alert>
          <LockKeyholeIcon />
          <AlertTitle>הכרטיס כולל פרטים מוגנים של המנכ״ל</AlertTitle>
          <AlertDescription>
            שינויים בפרטים המוגנים דורשים טיפול של המנכ״ל. אפשר להמשיך לצפות
            במידע ולתעד קשר בהתאם להרשאות.
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-5 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>המעקב השבועי</CardTitle>
            <CardDescription>
              לפי מועד השיוך או הקשר האחרון שהושלם
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-start gap-3">
            <FollowupBadge followup={followup} />
            <p className="text-sm text-muted-foreground">
              {followup?.dueAt
                ? `נדרש קשר עד ${formatDateTime(followup.dueAt)}`
                : "המעקב יתחיל לאחר שיוך חונך/ת."}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>דיווח החונך/ת</CardTitle>
            <CardDescription>הצבע האחרון שנבחר על ידי החונך/ת</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-start gap-3">
            <ManualColorBadge color={view.manualColor} />
            <p className="text-sm text-muted-foreground">
              {view.manualColorAt
                ? `עודכן ב־${formatDateTime(view.manualColorAt)}`
                : "טרם נמסר דיווח צבע בכרטיס."}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>הפגישה הבאה</CardTitle>
            <CardDescription>מועד קשר מתוכנן אחד בכל פעם</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-semibold">
              {formatDateTime(view.nextAppointment?.scheduledAt)}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              {view.nextAppointment
                ? "שיחה טלפונית או פגישה, בתיאום עם החניכה."
                : "בתיעוד קשר שהושלם יש לקבוע את המועד הבא."}
            </p>
          </CardContent>
        </Card>
      </div>
      {!deleted && <ContactFollowupActions view={view} />}
      <Tabs defaultValue="history">
        <TabsList variant="line" className="w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto">
          <TabsTrigger value="history" className="min-h-11 flex-none px-3">
            היסטוריית קשר <Badge variant="secondary">{contacts.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="profile" className="min-h-11 flex-none px-3">פרטי החניכה והליווי</TabsTrigger>
          <TabsTrigger value="changes" className="min-h-11 flex-none px-3">שינויים ואחריות</TabsTrigger>
        </TabsList>
        <TabsContent value="history" className="pt-5">
          <Card>
            <CardHeader>
              <CardTitle>הקשר לאורך הדרך</CardTitle>
              <CardDescription>
                כל השיחות, הפגישות וניסיונות הקשר, לפי מועד הביצוע.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {contacts.length ? (
                <div className="flex flex-col gap-6">
                  {contacts.map((contact, index) => {
                    const review = [...view.reviews]
                      .reverse()
                      .find(
                        (item) =>
                          item.contactId === contact.id &&
                          item.revision === contact.revision,
                      );
                    const author = snapshot.staff.find(
                      (staff) => staff.id === contact.actorId,
                    );
                    return (
                      <article
                        key={contact.id}
                        className="flex flex-col gap-4"
                      >
                        {index > 0 && <Separator />}
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex items-start gap-3">
                            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-primary">
                              {contact.method === "phone" ? (
                                <PhoneIcon className="size-5" />
                              ) : (
                                <UserRoundIcon className="size-5" />
                              )}
                            </div>
                            <div>
                              <h3 className="font-semibold">
                                {contact.outcome === "no_answer"
                                  ? "ניסיון קשר ללא מענה"
                                  : contact.method === "phone"
                                    ? "שיחה טלפונית שהושלמה"
                                    : "פגישה שהושלמה"}
                              </h3>
                              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                {formatDateTime(contact.occurredAt)} ·{" "}
                                {author?.displayName ?? "חבר/ת צוות"} · גרסה{" "}
                                {contact.revision}
                              </p>
                            </div>
                          </div>
                          <Badge
                            variant={
                              contact.invalidatedAt
                                ? "outline"
                                : review?.decision === "approved"
                                  ? "secondary"
                                  : "outline"
                            }
                          >
                            {contact.localPending ? (
                              "דיווח ממתין לסנכרון"
                            ) : contact.invalidatedAt ? (
                              "דיווח שבוטל"
                            ) : review?.localPending ? (
                              "החלטת בקרה ממתינה לאישור המערכת"
                            ) : review?.decision === "approved" ? (
                              <>
                                <CheckCheckIcon data-icon="inline-start" />
                                אושר
                              </>
                            ) : review?.decision ===
                              "returned_for_correction" ? (
                              "הוחזר להשלמה"
                            ) : (
                              "ממתין לבקרה"
                            )}
                          </Badge>
                        </div>
                        {contact.notes && (
                          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                            {contact.notes}
                          </p>
                        )}
                        {contact.outcome === "no_answer" && (
                          <p className="flex items-center gap-2 text-xs text-muted-foreground">
                            <CircleAlertIcon className="size-4 shrink-0" />
                            ניסיון ללא מענה אינו מאפס את המעקב השבועי.
                          </p>
                        )}
                        {review && <p className="text-xs leading-relaxed text-muted-foreground">{review.localPending ? "החלטת בקרה נשמרה במכשיר" : review.decision === "approved" ? "אושר" : "הוחזר להשלמה"} על ידי {snapshot.staff.find((staff) => staff.id === review.reviewedByStaffId)?.displayName ?? "שם לא זמין ברשימת הצוות הנוכחית"} · {formatDateTime(review.reviewedAt)} · גרסה {review.revision}</p>}
                        {!deleted && <ContactCorrectionActions view={view} entry={contact} />}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <SectionEmpty
                  title="עוד לא תועד קשר"
                  description="תיעוד השיחה או הפגישה הראשונה יופיע כאן. חובת המעקב מתחילה כבר ממועד השיוך."
                  action={
                    <ContactLink participantId={view.participant.id} primary />
                  }
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="profile" className="pt-5">
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>פרטים אישיים ושירות</CardTitle>
                <CardDescription>
                  אפשר להשלים את פרטי הכרטיס בהדרגה.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-5 text-sm">
                  <dt className="text-muted-foreground">טלפון</dt>
                  <dd className="break-words">
                    {view.participant.phone ? (
                      <a
                        className="inline-flex min-h-11 items-center text-primary underline underline-offset-4"
                        dir="ltr"
                        href={`tel:${view.participant.phone.replace(/[^\d+]/g, "")}`}
                      >
                        {view.participant.phone}
                      </a>
                    ) : (
                      "טרם הוזן"
                    )}
                  </dd>
                  <dt className="text-muted-foreground">סוג השירות</dt>
                  <dd>
                    {view.participant.serviceType
                      ? serviceNames[view.participant.serviceType]
                      : "טרם נבחר"}
                  </dd>
                  <dt className="text-muted-foreground">מקום השירות</dt>
                  <dd className="break-words">
                    {view.participant.servicePlace || "טרם הוזן"}
                  </dd>
                  <dt className="text-muted-foreground">תפקיד</dt>
                  <dd className="break-words">
                    {view.participant.serviceRole || "טרם הוזן"}
                  </dd>
                  <dt className="text-muted-foreground">מצב הליווי</dt>
                  <dd>{lifecycleNames[view.participant.lifecycle]}</dd>
                </dl>
                {view.participant.profileNotes && (
                  <>
                    <Separator className="my-5" />
                    <h3 className="mb-2 font-medium">מידע נוסף לליווי</h3>
                    <p className="whitespace-pre-wrap break-words leading-relaxed text-muted-foreground">
                      {view.participant.profileNotes}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>הצוות המלווה</CardTitle>
                <CardDescription>
                  אחריות ברורה ומועד התחלה אחד למעקב.
                </CardDescription>
                <CardAction>
                  {!deleted && <AssignmentEditor view={view} />}
                </CardAction>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-5 text-sm">
                  <dt className="text-muted-foreground">חונך/ת</dt>
                  <dd>
                    {mentor?.displayName ??
                      (view.assignment ? "שיוך לחונך/ת קיים" : "טרם הוגדר שיוך")}
                  </dd>
                  <dt className="text-muted-foreground">רכז/ת</dt>
                  <dd>{coordinator?.displayName ?? "טרם הוגדרה"}</dd>
                  <dt className="text-muted-foreground">מועד שיוך</dt>
                  <dd>
                    {view.assignment
                      ? formatDateTime(view.assignment.assignedAt)
                      : "טרם בוצע שיוך"}
                  </dd>
                  <dt className="text-muted-foreground">קשר אחרון שהושלם</dt>
                  <dd>
                    {followup?.lastCompletedContactAt
                      ? formatDateTime(followup.lastCompletedContactAt)
                      : "טרם תועד"}
                  </dd>
                </dl>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="changes" className="pt-5"><ParticipantHistory view={view} staff={snapshot.staff} /></TabsContent>
      </Tabs>
      <ParticipantAuthorityControls view={view} />
    </>
  );
}
