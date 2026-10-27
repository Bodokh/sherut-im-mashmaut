"use client";

import { useState } from "react";
import Link from "next/link";
import { ArchiveRestoreIcon, LockKeyholeIcon, Trash2Icon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/staff/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/staff/ui/alert-dialog";
import { Button } from "@/components/staff/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/staff/ui/card";
import { Spinner } from "@/components/staff/ui/spinner";
import { useWorkspace } from "@/lib/mentoring/workspace-client";
import { formatDateTime } from "./format";
import { recoveredDocument } from "./recovered-document-state";

function lockReason(reason: string) {
  const labels: Record<string, string> = {
    account_changed: "החשבון המחובר השתנה.",
    authority_changed: "התפקיד או ההרשאות השתנו מאז השמירה.",
    not_authenticated: "נדרש אימות כניסה מחדש.",
    not_staff: "הרשאת הצוות דורשת אימות מחדש.",
    forbidden: "ההרשאות הזמינות השתנו.",
    expired: "תוקף העבודה ללא חיבור הסתיים.",
    logout: "הגישה המקומית נסגרה בעת היציאה מהחשבון.",
  };
  return labels[reason] ?? "העבודה ננעלה ונדרש אימות הרשאות מחדש לפני פתיחתה.";
}

/** Recovery exposes only vault metadata until the server verifies the current
 * account and the person explicitly asks to restore their saved work. */
export function RecoveryControls() {
  const { snapshot, recoveryVaults, recoveredDrafts, recoverLocalWork, discardLocalRecovery, clearRecoveredDraft: clearStoredRecoveredDraft, refresh, isOnline } = useWorkspace();
  const [pending, setPending] = useState<string | null>(null);
  const [discardId, setDiscardId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clearSelection, setClearSelection] = useState<{ key: string; savedAt: string; recoveredAt: string } | null>(null);
  const [clearedDocuments, setClearedDocuments] = useState<readonly string[]>([]);
  const target = recoveryVaults.find((vault) => vault.id === discardId);
  const documents = recoveredDrafts.filter((draft) => !clearedDocuments.includes(JSON.stringify([draft.key, draft.savedAt, draft.recoveredAt])));
  const clearTarget = clearSelection ? documents.find((draft) => draft.key === clearSelection.key && draft.savedAt === clearSelection.savedAt && draft.recoveredAt === clearSelection.recoveredAt) : undefined;
  const clearDocument = snapshot && clearTarget ? recoveredDocument(clearTarget.key, clearTarget.value, snapshot) : null;

  async function recover(vaultId: string) {
    if (pending) return;
    setPending(vaultId); setError(null); setMessage(null);
    try {
      await recoverLocalWork(vaultId);
      setMessage("העבודה שאפשר לפתוח לפי ההרשאות העדכניות הועברה לבדיקה. עדכונים שנשלחו בעבר מוצגים ברשימת העדכונים לבדיקה; טיוטות זמינות בטופס המקורי. מידע שאינו מורשה נשאר נעול.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "לא ניתן לפתוח את העבודה השמורה כרגע. היא נשארה נעולה במכשיר.");
    } finally { setPending(null); }
  }

  async function discard() {
    if (!target || pending) return;
    setPending(target.id); setError(null); setMessage(null);
    try {
      await discardLocalRecovery(target.id);
      setDiscardId(null);
      setMessage("העותק המקומי שנבחר נמחק מהמכשיר. מידע שכבר התקבל במערכת נשאר במערכת.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "לא ניתן למחוק את העותק המקומי. העבודה נשארה שמורה במכשיר.");
    } finally { setPending(null); }
  }

  async function clearRecoveredDraft() {
    if (!clearTarget || pending) return;
    const key = clearTarget.key;
    setPending(key); setError(null); setMessage(null);
    try {
      await clearStoredRecoveredDraft(key, clearTarget.savedAt, clearTarget.recoveredAt);
      const documentId = JSON.stringify([key, clearTarget.savedAt, clearTarget.recoveredAt]);
      setClearedDocuments((ids) => [...ids, documentId]);
      setClearSelection(null);
      setMessage("הטיוטה המשוחזרת שנבחרה נמחקה מהמכשיר. מידע שכבר התקבל במערכת ועדכונים שנשמרו לבדיקה נשארו ללא שינוי.");
      void refresh().catch(() => undefined);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "לא ניתן למחוק את הטיוטה. הפרטים נשארו שמורים במכשיר.");
      void refresh().catch(() => undefined);
    } finally { setPending(null); }
  }

  if (!snapshot || (!recoveryVaults.length && !documents.length && !message && !error)) return null;
  return (
    <section className="flex flex-col gap-4" aria-label="שחזור עבודה מקומית">
      {message && <Alert><ArchiveRestoreIcon /><AlertTitle>העבודה המקומית עודכנה</AlertTitle><AlertDescription>{message}</AlertDescription></Alert>}
      {error && <Alert variant="destructive"><LockKeyholeIcon /><AlertTitle>הפעולה לא הושלמה</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {documents.length > 0 && <Card>
        <CardHeader><CardTitle>טיוטות ששוחזרו לבדיקה</CardTitle><CardDescription>המסמכים הבאים נפתחו לאחר בקשת שחזור ואימות החשבון וההרשאות. אלה פרטים שנשמרו במכשיר; הם אינם דיווחים שהתקבלו במערכת.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3">
          {documents.map((saved) => {
            const document = recoveredDocument(saved.key, saved.value, snapshot);
            return <details key={saved.key} className="min-w-0 rounded-lg border p-4">
              <summary className="flex min-h-11 cursor-pointer flex-col justify-center gap-1"><span className="font-medium">{document.title}{document.participantName ? ` · ${document.participantName}` : ""}</span><span className="text-xs leading-relaxed text-muted-foreground">נשמרה ב־{formatDateTime(saved.savedAt)} · שוחזרה ב־{formatDateTime(saved.recoveredAt)}</span></summary>
              <div className="flex flex-col gap-4 pt-4">
                {document.orphan && <Alert><ArchiveRestoreIcon /><AlertTitle>הטיוטה קשורה לכרטיס שאינו זמין</AlertTitle><AlertDescription>ייתכן שהכרטיס החדש לא נוצר במערכת. השחזור שומר את הפרטים לעיון ואינו יוצר כרטיס או שולח דיווח. יש לבדוק את הכרטיסים הזמינים לפני הזנת הפרטים ושמירת פעולה חדשה.</AlertDescription></Alert>}
                {document.rows.length ? <dl className="flex min-w-0 flex-col gap-3 text-sm">{document.rows.map((row, index) => <div key={index} className="flex min-w-0 flex-col gap-1"><dt className="text-muted-foreground">{row.label}</dt><dd dir="auto" className="whitespace-pre-wrap break-words leading-relaxed">{row.date === "instant" ? formatDateTime(row.value) : row.date === "local" ? `${row.value.replace("T", " ")} (שעון ישראל)` : row.value}</dd></div>)}</dl> : <p className="text-sm text-muted-foreground">אין בטיוטה שדות טופס להצגה.</p>}
                <div className="flex flex-wrap gap-2">{document.href && <Button nativeButton={false} variant="outline" render={<Link href={document.href} />}>לפתיחת הטופס המקורי</Button>}<Button variant="outline" disabled={pending !== null} onClick={() => setClearSelection({ key: saved.key, savedAt: saved.savedAt, recoveredAt: saved.recoveredAt })}><Trash2Icon data-icon="inline-start" />מחיקת הטיוטה המשוחזרת</Button></div>
              </div>
            </details>;
          })}
        </CardContent>
      </Card>}
      {recoveryVaults.map((vault) => (
        <Card key={vault.id}>
          <CardHeader>
            <CardTitle>עבודה שמורה שממתינה לבדיקת הרשאות</CardTitle>
            <CardDescription>ננעלה ב־{formatDateTime(vault.lockedAt)}. מוצגים פרטי השמירה בלבד, לאחר זיהוי החשבון הנוכחי.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p className="break-words">{lockReason(vault.reason)}</p>
            <p>{vault.pendingCount} עדכונים לבדיקה · {vault.draftCount} טיוטות · {vault.historyCount} עדכונים שנקראו</p>
            <p className="text-muted-foreground">הפתיחה בודקת שוב את החשבון וההרשאות מול המערכת. עדכונים ששוחזרו דורשים בדיקה ושמירה חדשה; הם אינם נשלחים אוטומטית.</p>
            {!isOnline && <p role="status" className="text-muted-foreground">נדרש חיבור כדי לאמת את ההרשאות לפני פתיחה או מחיקה של העותק המקומי.</p>}
          </CardContent>
          <CardFooter className="flex flex-wrap gap-2">
            <Button disabled={!isOnline || pending !== null} onClick={() => void recover(vault.id)}>
              {pending === vault.id ? <Spinner data-icon="inline-start" /> : <ArchiveRestoreIcon data-icon="inline-start" />}פתיחת העבודה לבדיקה
            </Button>
            <Button variant="outline" disabled={!isOnline || pending !== null} onClick={() => setDiscardId(vault.id)}><Trash2Icon data-icon="inline-start" />מחיקת העותק המקומי</Button>
          </CardFooter>
        </Card>
      ))}
      <AlertDialog open={Boolean(target)} onOpenChange={(open) => { if (!open && !pending) setDiscardId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>למחוק את העבודה המקומית שנבחרה?</AlertDialogTitle><AlertDialogDescription>הפעולה תמחק מהמכשיר {target?.pendingCount ?? 0} עדכונים לבדיקה ו־{target?.draftCount ?? 0} טיוטות בעותק הנעול הזה. אי אפשר לשחזר אותו אחרי המחיקה. מידע שכבר התקבל במערכת נשאר במערכת.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={pending !== null}>חזרה</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={!isOnline || pending !== null} onClick={(event) => { event.preventDefault(); void discard(); }}>{pending ? <Spinner data-icon="inline-start" /> : <Trash2Icon data-icon="inline-start" />}מחיקת העותק מהמכשיר</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={Boolean(clearTarget)} onOpenChange={(open) => { if (!open && !pending) setClearSelection(null); }}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>למחוק את הטיוטה המשוחזרת?</AlertDialogTitle><AlertDialogDescription>הפעולה תמחק מהמכשיר את {clearDocument?.title ?? "הטיוטה שנבחרה"}. אי אפשר לשחזר את הפרטים האלה אחרי המחיקה. דיווחים שכבר התקבלו במערכת ועדכונים שנשמרו לבדיקה נשארים ללא שינוי.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={pending !== null}>שמירת הטיוטה</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={pending !== null} onClick={(event) => { event.preventDefault(); void clearRecoveredDraft(); }}>{pending ? <Spinner data-icon="inline-start" /> : <Trash2Icon data-icon="inline-start" />}מחיקת הטיוטה מהמכשיר</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
