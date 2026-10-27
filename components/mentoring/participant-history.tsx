"use client";

import { HistoryIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/staff/ui/card";
import { Separator } from "@/components/staff/ui/separator";
import { Badge } from "@/components/staff/ui/badge";
import type { ParticipantView, StaffProfile } from "@/lib/mentoring/contracts";
import { SectionEmpty } from "./common";
import { formatDateTime } from "./format";
import { participantHistory } from "./participant-history-state";

export function ParticipantHistory({ view, staff }: { view: ParticipantView; staff: readonly StaffProfile[] }) {
  const items = participantHistory(view, staff);
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><HistoryIcon className="size-5" />היסטוריית שינויים ואחריות</CardTitle><CardDescription>גרסאות דיווחים, החלטות, שיוכים ושינויים ניהוליים. בקשות שמורות במכשיר מסומנות כממתינות עד לקבלת אישור המערכת. כל החלטת בקרה נשארת קשורה לגרסה שנבדקה.</CardDescription></CardHeader>
      <CardContent>
        {items.length ? <div className="flex flex-col gap-5">{items.map((item, index) => <article key={item.key} className="flex min-w-0 flex-col gap-3">
          {index > 0 && <Separator />}
          <div className="flex flex-col items-start gap-2"><h3 className="font-medium">{item.title}</h3>{item.pending && <Badge variant="outline">בקשה ממתינה לאישור המערכת</Badge>}<p className="text-xs leading-relaxed text-muted-foreground">{item.localTime ? "מועד השמירה במכשיר: " : ""}{formatDateTime(item.at)} · {item.actor}</p></div>
          {item.relatedTimes?.map((time) => <p key={time.label} className="text-sm">{time.label}: {formatDateTime(time.at)}</p>)}
          {item.lines.map((line, lineIndex) => <p key={lineIndex} dir="auto" className="whitespace-pre-wrap break-words text-sm leading-relaxed">{line}</p>)}
        </article>)}</div> : <SectionEmpty title="אין עדיין שינויים נוספים להצגה" description="היסטוריית השינויים תופיע לאחר שמירת עדכונים במערכת. דיווחי הקשר הזמינים מוצגים בלשונית היסטוריית הקשר." />}
      </CardContent>
    </Card>
  );
}
