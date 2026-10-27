"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2Icon, LoaderCircleIcon } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/staff/ui/alert";
import { Button } from "@/components/staff/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/staff/ui/card";
import type { CommandSuccess } from "@/lib/mentoring/contracts";

export function RecoveredDraft({
  result,
  onClear,
  participantId,
  children,
  onClose,
}: {
  result: CommandSuccess;
  onClear: () => Promise<void>;
  participantId?: string;
  children: ReactNode;
  onClose?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const href = participantId
    ? `/staff/participants/${encodeURIComponent(participantId)}`
    : "/staff/participants";
  async function finish() {
    setBusy(true);
    setError(null);
    try {
      await onClear();
      onClose?.();
      if (result.acceptance === "queued") {
        // The queued result may come from an offline session without RSC navigation.
        window.location.assign(href);
      } else router.push(href);
    } catch {
      setError(
        "לא ניתן לנקות את הטיוטה כרגע. היא נשארה שמורה, והשמירה הקודמת לא תישלח שוב כפעולה חדשה.",
      );
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>נמצאה שמירה קודמת של הטיוטה</CardTitle>
        <CardDescription>
          {result.acceptance === "queued"
            ? "הפעולה כבר שמורה במכשיר וממתינה לשליחה. אין צורך לשלוח אותה שוב."
            : "בדקנו את פעולת השמירה הקודמת: היא כבר התקבלה במערכת."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Alert>
          <CheckCircle2Icon />
          <AlertTitle>אפשר להמשיך מכרטיס החניכה</AlertTitle>
          <AlertDescription>
            תוכן הטיוטה מוצג כאן לבדיקה. סגירת הטיוטה מנקה את העותק הזה במכשיר;
            הפעולה שנשמרה נשארת במערכת או בתור השליחה.
          </AlertDescription>
        </Alert>
        {children}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
      <CardFooter className="flex-wrap gap-3">
        <Button type="button" disabled={busy} onClick={() => void finish()}>
          {busy && (
            <LoaderCircleIcon
              data-icon="inline-start"
              className="animate-spin"
            />
          )}
          סגירת הטיוטה ומעבר לכרטיס
        </Button>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={href} />}
        >
          פתיחת הכרטיס לבדיקה
        </Button>
      </CardFooter>
    </Card>
  );
}
