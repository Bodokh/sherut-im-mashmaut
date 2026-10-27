"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircleIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  Clock3Icon,
  UserRoundIcon,
} from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/staff/ui/alert";
import { Avatar, AvatarFallback } from "@/components/staff/ui/avatar";
import { Badge } from "@/components/staff/ui/badge";
import { Button } from "@/components/staff/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/staff/ui/empty";
import type { ParticipantView } from "@/lib/mentoring/contracts";
import {
  computeFollowup,
  type Followup,
  type ManualColor,
  type StaffRole,
} from "@/lib/mentoring/domain";
import { initials } from "./format";
import { readableWorkspaceError } from "@/lib/mentoring/ui-errors";

export const roleNames: Record<StaffRole, string> = {
  mentor: "חונך/ת",
  coordinator: "רכז/ת",
  ceo: "מנכ״ל",
};
export const serviceNames = {
  national: "שירות לאומי",
  military: "שירות צבאי",
} as const;
export const manualColorNames: Record<ManualColor, string> = {
  green: "ירוק — בוצע",
  orange: "כתום — בעיכוב",
  red: "אדום — נדרש טיפול",
};

export function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold leading-tight">{title}</h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </div>
  );
}

export function ParticipantIdentity({
  name,
  service,
  large = false,
}: {
  name: string;
  service?: string | null;
  large?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className={large ? "size-16" : "size-11"}>
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className={large ? "text-xl font-semibold" : "font-semibold"}>
          {name || "חניכה ללא שם"}
        </p>
        {service && (
          <p className="mt-1 text-sm text-muted-foreground">{service}</p>
        )}
      </div>
    </div>
  );
}

export function followupFor(
  view: ParticipantView,
  now: string | Date,
): Followup | null {
  try {
    return computeFollowup(
      {
        organizationId: view.participant.organizationId,
        participantId: view.participant.id,
        assignedAt: view.assignment?.assignedAt ?? null,
        followupAnchorAt: view.assignment?.followupAnchorAt,
        contacts: view.contacts,
        nextAppointment: view.nextAppointment,
      },
      now,
    );
  } catch {
    return null;
  }
}

export function FollowupBadge({ followup }: { followup: Followup | null }) {
  if (!followup)
    return (
      <Badge variant="outline">
        <AlertCircleIcon data-icon="inline-start" />
        נדרש בירור מועד
      </Badge>
    );
  const labels: Record<Followup["status"], string> = {
    unassigned: "ממתינה לשיוך",
    within_interval: "המעקב במועד",
    appointment_missed: "מועד הפגישה חלף",
    seven_day_overdue: "נדרש קשר — חלפו שבעה ימים",
  };
  const Icon =
    followup.status === "within_interval"
      ? CheckCircle2Icon
      : followup.status === "unassigned"
        ? UserRoundIcon
        : Clock3Icon;
  return (
    <Badge variant="outline" data-followup-status={followup.status}>
      <Icon data-icon="inline-start" />
      {labels[followup.status]}
    </Badge>
  );
}

export function ManualColorBadge({ color }: { color: ManualColor | null }) {
  return color ? (
    <Badge variant="outline" data-manual-color={color}>
      {manualColorNames[color]}
    </Badge>
  ) : (
    <Badge variant="secondary">טרם עודכן דיווח</Badge>
  );
}

export function SectionEmpty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CalendarClockIcon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

export function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert variant="destructive" role="alert">
      <AlertCircleIcon />
      <AlertTitle>לא ניתן להשלים את הפעולה</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export function AccessDenied() {
  return (
    <Alert>
      <AlertCircleIcon />
      <AlertTitle>המסך זמין להנהלה ולרכזים ולרכזות</AlertTitle>
      <AlertDescription>
        ההרשאות בחשבון שלך אינן מאפשרות לבצע את הפעולה הזו. אפשר לחזור למעקב
        האישי או לפנות לרכז/ת.
      </AlertDescription>
    </Alert>
  );
}

export function ContactLink({
  participantId,
  primary = false,
}: {
  participantId?: string;
  primary?: boolean;
}) {
  const href = participantId
    ? `/staff/contacts/new?participant=${encodeURIComponent(participantId)}`
    : "/staff/contacts/new";
  return (
    <Button
      variant={primary ? "default" : "outline"}
      nativeButton={false}
      render={<Link href={href} />}
    >
      <CalendarClockIcon data-icon="inline-start" />
      תיעוד קשר
    </Button>
  );
}

export function useCommandIntent() {
  const current = useRef<{ signature: string; operationId: string } | null>(
    null,
  );
  return {
    operationId(payload: unknown) {
      const signature = JSON.stringify(payload);
      if (current.current?.signature !== signature)
        current.current = { signature, operationId: crypto.randomUUID() };
      return current.current.operationId;
    },
    clear() {
      current.current = null;
    },
  };
}

export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);
  return now;
}

export function readableError(error: unknown): string {
  return readableWorkspaceError(error);
}
