"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRightIcon, MailIcon, PhoneIcon } from "lucide-react";
import { Badge } from "@/components/staff/ui/badge";
import { Button } from "@/components/staff/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/staff/ui/card";
import { Input } from "@/components/staff/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/staff/ui/table";
import type { StaffProfile, WorkspaceSnapshot } from "@/lib/mentoring/contracts";
import { useWorkspace } from "@/lib/mentoring/workspace-client";
import { staffPublicPath } from "@/lib/staff-host";
import { AccessDenied, FollowupBadge, ManualColorBadge, PageHeading, SectionEmpty, followupFor, useNow } from "./common";
import { formatDateTime } from "./format";
import { TrackingCardPanel, TrackingUnavailable } from "./tracking-card";
import { canUseTrackingCards, trackedMentors, trackingCardFor } from "./tracking-state";

function menteesOf(snapshot: WorkspaceSnapshot, mentorId: string) {
  return snapshot.participants.filter((view) => view.assignment?.mentorId === mentorId && !view.participant.deletedAt && view.participant.lifecycle !== "closed");
}

function ContactLinks({ member }: { member: StaffProfile }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      {member.phone ? <a className="inline-flex min-h-11 items-center gap-2 text-primary underline underline-offset-4" dir="ltr" href={`tel:${member.phone.replace(/[^\d+]/g, "")}`}><PhoneIcon className="size-4" />{member.phone}</a> : <span className="text-muted-foreground">אין מספר טלפון בכרטיס</span>}
      {member.email ? <a className="inline-flex min-h-11 items-center gap-2 break-all text-primary underline underline-offset-4" dir="ltr" href={`mailto:${member.email}`}><MailIcon className="size-4" />{member.email}</a> : <span className="text-muted-foreground">אין כתובת דוא״ל בכרטיס</span>}
    </div>
  );
}

/** Task 10: the list of mentor tracking cards (CEO and coordinators only). */
export function MentorsView() {
  const { snapshot } = useWorkspace();
  const [query, setQuery] = useState("");
  if (!snapshot) return null;
  if (!canUseTrackingCards(snapshot.actor)) return <AccessDenied />;
  if (snapshot.trackingCards === undefined) return <TrackingUnavailable />;
  const normalized = query.trim().toLocaleLowerCase("he");
  const mentors = trackedMentors(snapshot.actor, snapshot.staff)
    .filter((mentor) => !normalized || [mentor.displayName, mentor.phone, mentor.email].some((value) => value?.toLocaleLowerCase("he").includes(normalized)));
  const coordinatorName = (id: string | null) => snapshot.staff.find((member) => member.id === id)?.displayName ?? "ללא רכז/ת";

  return (
    <>
      <PageHeading
        title="כרטיסי מעקב חונכות"
        description={snapshot.actor.role === "ceo" ? "כרטיס מעקב לכל חונכת: פרטי קשר, החניכות שלה, הערות ודיווחי ההנהלה." : "כרטיס מעקב לכל חונכת בצוות שלך: פרטי קשר, החניכות שלה, הערות ודיווחים."}
      />
      <Card>
        <CardHeader>
          <CardTitle>החונכות</CardTitle>
          <CardDescription>{mentors.length} חונכות זמינות לחשבון שלך.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Input type="search" aria-label="חיפוש חונכת" placeholder="שם, טלפון או דוא״ל" value={query} onChange={(event) => setQuery(event.target.value)} />
          {mentors.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>חונכת</TableHead>
                  {snapshot.actor.role === "ceo" && <TableHead>רכז/ת</TableHead>}
                  <TableHead>חניכות</TableHead>
                  <TableHead>סימון מצב</TableHead>
                  <TableHead>מעקב הבא</TableHead>
                  <TableHead><span className="sr-only">כרטיס</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mentors.map((mentor) => {
                  const card = trackingCardFor(snapshot, "mentor", mentor.id);
                  return (
                    <TableRow key={mentor.id} data-mentor-row={mentor.id}>
                      <TableCell className="font-medium">{mentor.displayName}{!mentor.active && <Badge className="ms-2" variant="outline">ללא גישה פעילה</Badge>}</TableCell>
                      {snapshot.actor.role === "ceo" && <TableCell>{coordinatorName(mentor.coordinatorId)}</TableCell>}
                      <TableCell>{menteesOf(snapshot, mentor.id).length}</TableCell>
                      <TableCell><ManualColorBadge color={card.status} /></TableCell>
                      <TableCell>{card.nextFollowupAt ? formatDateTime(card.nextFollowupAt) : "טרם נקבע"}</TableCell>
                      <TableCell><Button size="sm" nativeButton={false} render={<Link href={staffPublicPath(`/staff/mentors/${encodeURIComponent(mentor.id)}`)} />}>פתיחת הכרטיס</Button></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <SectionEmpty title="אין חונכות להצגה" description="חונכות שמשויכות אלייך יופיעו כאן עם כרטיס מעקב." />
          )}
        </CardContent>
      </Card>
    </>
  );
}

/** Task 10: a single mentor's tracking card, with her contact details and her mentees. */
export function MentorCardView({ mentorId }: { mentorId: string }) {
  const { snapshot } = useWorkspace();
  const now = useNow();
  if (!snapshot) return null;
  if (!canUseTrackingCards(snapshot.actor)) return <AccessDenied />;
  const mentor = trackedMentors(snapshot.actor, snapshot.staff).find((member) => member.id === mentorId);
  if (!mentor) {
    return (
      <>
        <PageHeading title="כרטיס החונכת אינו זמין" description="ייתכן שהחונכת אינה בצוות שלך, או שהכרטיס אינו קיים." />
        <SectionEmpty title="אין כרטיס זמין להצגה" description="ברשימת הכרטיסים מופיעות החונכות שזמינות לחשבון שלך." action={<Button nativeButton={false} render={<Link href={staffPublicPath("/staff/mentors")} />}><ArrowRightIcon data-icon="inline-start" />לרשימת החונכות</Button>} />
      </>
    );
  }
  const coordinator = snapshot.staff.find((member) => member.id === mentor.coordinatorId);
  const mentees = menteesOf(snapshot, mentor.id);

  return (
    <>
      <nav aria-label="ניווט בכרטיס החונכת">
        <Button variant="ghost" nativeButton={false} render={<Link href={staffPublicPath("/staff/mentors")} />}><ArrowRightIcon data-icon="inline-start" />לכל החונכות</Button>
      </nav>
      <PageHeading
        title={mentor.displayName}
        description={`חונכת${coordinator ? ` · בצוות של ${coordinator.displayName}` : " · ללא רכז/ת"}${mentor.active ? "" : " · ללא גישה פעילה"}`}
      />
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>פרטי קשר</CardTitle><CardDescription>כדי ליצור קשר עם החונכת.</CardDescription></CardHeader>
          <CardContent><ContactLinks member={mentor} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>החניכות של החונכת <Badge variant="secondary">{mentees.length}</Badge></CardTitle><CardDescription>כל כרטיס נפתח לכרטיס החניכה, כולל כרטיס המעקב שלה.</CardDescription></CardHeader>
          <CardContent>
            {mentees.length ? (
              <ul className="flex flex-col divide-y divide-border">
                {mentees.map((view) => (
                  <li key={view.participant.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <Link className="font-medium text-primary underline-offset-4 hover:underline" href={staffPublicPath(`/staff/participants/${encodeURIComponent(view.participant.id)}`)}>{view.participant.displayName || "חניכה ללא שם"}</Link>
                    <FollowupBadge followup={followupFor(view, now)} />
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">עדיין לא שויכו חניכות לחונכת הזאת.</p>}
          </CardContent>
        </Card>
      </div>
      <TrackingCardPanel kind="mentor" subjectId={mentor.id} subjectName={mentor.displayName} />
    </>
  );
}
