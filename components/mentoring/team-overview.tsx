"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDownIcon, ChevronLeftIcon, UserRoundIcon, UsersRoundIcon } from "lucide-react";
import { Badge } from "@/components/staff/ui/badge";
import { Button } from "@/components/staff/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/staff/ui/card";
import { useWorkspace } from "@/lib/mentoring/workspace-client";
import { staffPublicPath } from "@/lib/staff-host";
import { AccessDenied, PageHeading } from "./common";
import { organizationTotals, organizationTree, type TeamNode } from "./team-overview-state";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-muted/60 px-4 py-3">
      <span className="text-3xl font-semibold tabular-nums" data-stat={label}>{value}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

function TeamCard({ team }: { team: TeamNode }) {
  const name = team.coordinator?.displayName ?? "חונכות ללא רכז/ת";
  return (
    <Card data-team={team.coordinator?.id ?? "none"}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {name}
          {team.coordinator && !team.coordinator.active && <Badge variant="outline">אין גישה פעילה</Badge>}
        </CardTitle>
        <CardDescription>{team.coordinator ? "רכז/ת" : "חונכות שטרם שויכו לרכז/ת"}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="חונכות" value={team.mentorCount} />
          <Stat label="חניכות" value={team.menteeCount} />
        </div>
        {team.mentors.length ? (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {team.mentors.map(({ mentor, mentees }) => (
              <li key={mentor.id} className="flex items-center justify-between gap-3 py-2">
                <Link className="min-w-0 truncate text-primary underline-offset-4 hover:underline" href={staffPublicPath(`/staff/mentors/${encodeURIComponent(mentor.id)}`)}>
                  {mentor.displayName}
                </Link>
                <span className="flex shrink-0 items-center gap-2">
                  {!mentor.active && <Badge variant="outline">ללא גישה פעילה</Badge>}
                  <Badge variant="secondary">{mentees.length} חניכות</Badge>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">עדיין אין חונכות בצוות הזה.</p>
        )}
      </CardContent>
    </Card>
  );
}

/** Task 3: per-coordinator mentor and mentee counts; the CEO sees every coordinator side by side. */
export function CoordinatorsView() {
  const { snapshot } = useWorkspace();
  if (!snapshot) return null;
  const actor = snapshot.actor;
  if (actor.role === "mentor") return <AccessDenied />;
  const tree = organizationTree(actor, snapshot.staff, snapshot.participants);
  const totals = organizationTotals(tree);
  const teams = [...tree.teams, ...(tree.withoutCoordinator ? [tree.withoutCoordinator] : [])];
  const isCeo = actor.role === "ceo";

  return (
    <>
      <PageHeading
        title={isCeo ? "צוותי הרכזות" : "הצוות שלי"}
        description={isCeo
          ? "כל הרכזות זו לצד זו: כמה חונכות וכמה חניכות יש בצוות של כל אחת."
          : "מספר החונכות והחניכות בצוות שלך, ופירוט לפי חונכת."}
        action={isCeo ? <Button variant="outline" nativeButton={false} render={<Link href={staffPublicPath("/staff/tree")} />}><UsersRoundIcon data-icon="inline-start" />לעץ הארגון</Button> : undefined}
      />
      {isCeo && (
        <div className="grid gap-3 sm:grid-cols-3" aria-label="סיכום הארגון">
          <Stat label="רכזות פעילות" value={totals.coordinators} />
          <Stat label="חונכות פעילות" value={totals.mentors} />
          <Stat label="חניכות בליווי" value={totals.mentees} />
        </div>
      )}
      {teams.length ? (
        <div className="grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((team) => <TeamCard key={team.coordinator?.id ?? "none"} team={team} />)}
        </div>
      ) : (
        <Card><CardContent className="py-6 text-sm text-muted-foreground">אין עדיין רכזות או חונכות להצגה.</CardContent></Card>
      )}
      {totals.unassignedMentees > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>חניכות ללא חונכת</CardTitle>
            <CardDescription>{totals.unassignedMentees === 1 ? "כרטיס חניכה אחד שטרם שויך לחונכת, ולכן אינו נספר בצוות כלשהו." : `${totals.unassignedMentees} כרטיסי חניכות שטרם שויכו לחונכת, ולכן אינם נספרים בצוות כלשהו.`}</CardDescription>
          </CardHeader>
        </Card>
      )}
    </>
  );
}

function Branch({ label, detail, level, defaultOpen, children, href }: {
  label: string; detail?: ReactNode; level: 1 | 2 | 3; defaultOpen: boolean; children?: ReactNode; href?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const expandable = Boolean(children);
  return (
    <li data-level={level} className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        {expandable ? (
          <Button type="button" variant="ghost" size="icon-sm" aria-expanded={open} aria-label={`${open ? "סגירת" : "פתיחת"} ${label}`} onClick={() => setOpen(!open)}>
            {open ? <ChevronDownIcon /> : <ChevronLeftIcon />}
          </Button>
        ) : <span className="size-11 shrink-0" aria-hidden="true" />}
        {href ? <Link className="font-medium text-primary underline-offset-4 hover:underline" href={href}>{label}</Link> : <span className="font-medium">{label}</span>}
        {detail}
      </div>
      {expandable && open && <ul className="me-4 flex flex-col gap-1 border-s border-border ps-3">{children}</ul>}
    </li>
  );
}

/** Task 4: coordinators → their mentors → those mentors' mentees (CEO only). */
export function OrganizationTreeView() {
  const { snapshot } = useWorkspace();
  const [mode, setMode] = useState<"default" | "all" | "none">("default");
  if (!snapshot) return null;
  if (snapshot.actor.role !== "ceo") return <AccessDenied />;
  const tree = organizationTree(snapshot.actor, snapshot.staff, snapshot.participants);
  const totals = organizationTotals(tree);
  const teams = [...tree.teams, ...(tree.withoutCoordinator ? [tree.withoutCoordinator] : [])];
  const open = (level: 1 | 2 | 3) => mode === "all" ? true : mode === "none" ? false : level === 1;

  return (
    <>
      <PageHeading
        title="עץ הארגון"
        description="רכזות, החונכות שבצוות של כל אחת, והחניכות של כל חונכת. אפשר לפתוח כל ענף ולעבור לכרטיס."
        action={<>
          <Button variant="outline" onClick={() => setMode("all")}>פתיחת הכול</Button>
          <Button variant="outline" onClick={() => setMode("none")}>סגירת הכול</Button>
        </>}
      />
      <Card>
        <CardHeader>
          <CardTitle>{totals.coordinators} רכזות · {totals.mentors} חונכות · {totals.mentees} חניכות</CardTitle>
          {tree.closedMentees > 0 && <CardDescription>{tree.closedMentees} כרטיסים שהליווי בהם הסתיים אינם מוצגים.</CardDescription>}
        </CardHeader>
        <CardContent>
          {teams.length || tree.unassignedMentees.length ? (
            <ul aria-label="עץ הארגון" key={mode} className="flex flex-col gap-2">
              {teams.map((team) => (
                <Branch key={team.coordinator?.id ?? "none"} level={1} defaultOpen={open(1)}
                  label={team.coordinator?.displayName ?? "חונכות ללא רכז/ת"}
                  detail={<Badge variant="secondary">{team.mentorCount} חונכות · {team.menteeCount} חניכות</Badge>}>
                  {team.mentors.length ? team.mentors.map(({ mentor, mentees }) => (
                    <Branch key={mentor.id} level={2} defaultOpen={open(2)} label={mentor.displayName}
                      href={staffPublicPath(`/staff/mentors/${encodeURIComponent(mentor.id)}`)}
                      detail={<Badge variant="outline">{mentees.length} חניכות</Badge>}>
                      {mentees.length ? mentees.map((view) => (
                        <Branch key={view.participant.id} level={3} defaultOpen={false}
                          label={view.participant.displayName || "חניכה ללא שם"}
                          href={staffPublicPath(`/staff/participants/${encodeURIComponent(view.participant.id)}`)}
                          detail={view.participant.lifecycle === "paused" ? <Badge variant="outline">הליווי בהשהיה</Badge> : undefined} />
                      )) : undefined}
                    </Branch>
                  )) : undefined}
                </Branch>
              ))}
              {tree.unassignedMentees.length > 0 && (
                <Branch level={1} defaultOpen={open(1)} label="חניכות ללא חונכת" detail={<Badge variant="secondary">{tree.unassignedMentees.length} חניכות</Badge>}>
                  {tree.unassignedMentees.map((view) => (
                    <Branch key={view.participant.id} level={2} defaultOpen={false} label={view.participant.displayName || "חניכה ללא שם"}
                      href={staffPublicPath(`/staff/participants/${encodeURIComponent(view.participant.id)}`)} />
                  ))}
                </Branch>
              )}
            </ul>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><UserRoundIcon className="size-4" />עדיין אין צוותים להצגה.</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
