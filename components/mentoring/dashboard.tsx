"use client";

import Link from "next/link";
import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  HeartHandshakeIcon,
  ListChecksIcon,
  UserRoundIcon,
} from "lucide-react";
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
import { Separator } from "@/components/staff/ui/separator";
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
import { ParticipantEditor } from "./participant-forms";

export function DashboardView() {
  const { snapshot } = useWorkspace();
  const now = useNow();
  if (!snapshot) return null;
  const active = snapshot.participants.filter(
    (view) => view.participant.lifecycle === "active",
  );
  const attention = active
    .map((view) => ({ view, followup: followupFor(view, now) }))
    .filter(
      ({ view, followup }) =>
        !followup ||
        view.manualColor === "red" ||
        view.manualColor === "orange" ||
        followup.status !== "within_interval" ||
        followup.nextAppointmentMissing,
    )
    .sort((a, b) =>
      (a.followup?.dueAt ?? "").localeCompare(b.followup?.dueAt ?? ""),
    );
  const upcoming = active
    .filter(
      (view) =>
        view.nextAppointment &&
        new Date(view.nextAppointment.scheduledAt) >= now,
    )
    .sort((a, b) =>
      a.nextAppointment!.scheduledAt.localeCompare(
        b.nextAppointment!.scheduledAt,
      ),
    );
  const pendingReviews = active.reduce(
    (count, view) =>
      count +
      view.contacts.filter(
        (contact) =>
          !contact.invalidatedAt &&
          !view.reviews.some(
            (review) =>
              review.contactId === contact.id &&
              review.revision === contact.revision &&
              review.decision === "approved",
          ),
      ).length,
    0,
  );
  const management = snapshot.actor.role !== "mentor";

  return (
    <>
      <PageHeading
        title={`שלום, ${snapshot.actor.displayName.split(/\s+/)[0] || snapshot.actor.displayName}`}
        description="תמונת המצב של הליווי, הפגישות הקרובות והחניכות שזקוקות לתשומת לב."
        action={
          <>
            {management && <ParticipantEditor />}
            <ContactLink primary={!management} />
          </>
        }
      />
      <section className="grid items-stretch gap-4 lg:grid-cols-3" aria-label="תמונת המצב">
        <div className="flex h-full flex-col justify-between gap-7 rounded-2xl bg-primary p-6 text-primary-foreground">
          <HeartHandshakeIcon className="size-7" />
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm">חניכות בליווי פעיל</p>
              <p className="mt-2 text-4xl font-semibold tabular-nums">
                {active.length}
              </p>
            </div>
            <span className="max-w-32 text-sm leading-relaxed">
              קשר אישי, רציף ומשמעותי
            </span>
          </div>
        </div>
        <Card className="h-full pb-0">
          <CardHeader>
            <CardTitle>דורשות תשומת לב</CardTitle>
            <CardDescription>
              דיווח שדורש טיפול, מועד שחלף או פרטי ליווי חסרים
            </CardDescription>
            <CardAction>
              <ListChecksIcon className="size-5 text-muted-foreground" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-1 items-end">
            <p className="text-4xl font-semibold tabular-nums">
              {attention.length}
            </p>
          </CardContent>
          <CardFooter className="mt-auto min-h-20">
            <a
              href="#attention"
              className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary"
            >
              לרשימת המעקב
              <ArrowLeftIcon className="size-4" />
            </a>
          </CardFooter>
        </Card>
        <Card className="h-full pb-0">
          <CardHeader>
            <CardTitle>
              {management ? "דיווחים לבקרה" : "פגישות שנקבעו"}
            </CardTitle>
            <CardDescription>
              {management
                ? "דיווחים שטרם אושרו בגרסה הנוכחית"
                : "מועדי הקשר הבאים שנרשמו לחניכות שלך"}
            </CardDescription>
            <CardAction>
              <CalendarDaysIcon className="size-5 text-muted-foreground" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-1 items-end">
            <p className="text-4xl font-semibold tabular-nums">
              {management ? pendingReviews : upcoming.length}
            </p>
          </CardContent>
          <CardFooter className="mt-auto min-h-20">
            <Button
              variant="link"
              nativeButton={false}
              render={
                <Link
                  href={management ? "/staff/reviews" : "/staff/participants"}
                />
              }
            >
              {management ? "לבקרה ואישורים" : "לכל החניכות"}
              <ArrowLeftIcon data-icon="inline-end" />
            </Button>
          </CardFooter>
        </Card>
      </section>
      <div className="grid items-stretch gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card id="attention" className="h-full scroll-mt-28 pb-0">
          <CardHeader>
            <CardTitle>במוקד המעקב</CardTitle>
            <CardDescription>
              השעון השבועי מחושב בנפרד מדיווח הצבע של החונך/ת.
            </CardDescription>
            <CardAction>
              <Badge variant="secondary">{attention.length}</Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="flex-1">
            {attention.length ? (
              <div className="flex flex-col gap-5">
                {attention.map(({ view, followup }, index) => (
                  <div
                    key={view.participant.id}
                    className="flex flex-col gap-5"
                  >
                    {index > 0 && <Separator />}
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 flex-col gap-3">
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
                        <div className="flex flex-wrap gap-2">
                          <FollowupBadge followup={followup} />
                          <ManualColorBadge color={view.manualColor} />
                        </div>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {followup?.dueAt
                            ? `נדרש קשר עד ${formatDateTime(followup.dueAt)}`
                            : "יש לשייך חונך/ת כדי להתחיל את המעקב."}
                          {followup?.nextAppointmentMissing &&
                            " · פגישה הבאה טרם נקבעה"}
                        </p>
                      </div>
                      <div className="shrink-0">
                        <ContactLink participantId={view.participant.id} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <SectionEmpty
                title={active.length ? "המעקב מעודכן" : "כאן מתחיל הקשר"}
                description={
                  active.length
                    ? "אין כרגע פערים במעקב השבועי או בקביעת הפגישה הבאה."
                    : management
                      ? "כדי להתחיל ליווי מסודר, אפשר להוסיף חניכה ולשייך לה חונך/ת."
                      : "החניכות שישויכו לחשבון שלך יופיעו כאן, עם תמונת מצב ומועד הקשר הבא."
                }
              />
            )}
          </CardContent>
          <CardFooter className="mt-auto min-h-20">
            <Button
              variant="link"
              nativeButton={false}
              render={<Link href="/staff/participants" />}
            >
              לכל כרטיסי החניכות
              <ArrowLeftIcon data-icon="inline-end" />
            </Button>
          </CardFooter>
        </Card>
        <Card className="h-full pb-0">
          <CardHeader>
            <CardTitle>הפגישות הבאות</CardTitle>
            <CardDescription>שיחות ופגישות שנקבע להן מועד.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            {upcoming.length ? (
              <div className="flex flex-col gap-5">
                {upcoming.slice(0, 6).map((view, index) => (
                  <div
                    key={view.participant.id}
                    className="flex flex-col gap-5"
                  >
                    {index > 0 && <Separator />}
                    <Link
                      className="group flex min-h-14 items-center justify-between gap-3 rounded-md outline-offset-4"
                      href={`/staff/participants/${encodeURIComponent(view.participant.id)}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-primary">
                          <UserRoundIcon className="size-5" />
                        </div>
                        <div>
                          <p className="font-medium group-hover:underline">
                            {view.participant.displayName}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatDateTime(view.nextAppointment!.scheduledAt)}
                          </p>
                        </div>
                      </div>
                      <ArrowLeftIcon className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <SectionEmpty
                title="אין פגישות עתידיות כרגע"
                description="לאחר קשר שהושלם, יש לקבוע תאריך ושעה לקשר הבא."
              />
            )}
          </CardContent>
          <CardFooter className="mt-auto min-h-20">
            <p className="text-xs leading-relaxed text-muted-foreground">
              כל המועדים מוצגים לפי שעון ישראל. מענה מוצלח בטלפון או פנים אל
              פנים נחשב קשר שהושלם.
            </p>
          </CardFooter>
        </Card>
      </div>
    </>
  );
}
