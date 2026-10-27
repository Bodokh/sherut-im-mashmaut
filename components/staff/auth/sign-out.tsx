"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import { AlertTriangle, LogOut } from "lucide-react";
import { AuthFrame } from "./auth-frame";
import { AuthError } from "./auth-controls";
import { Alert, AlertDescription, AlertTitle } from "@/components/staff/ui/alert";
import { Button } from "@/components/staff/ui/button";
import { Spinner } from "@/components/staff/ui/spinner";
import { clearMentoringOfflineData, getMentoringPendingCount, lockMentoringOfflineData } from "@/lib/mentoring/offline";

export function SignOut() {
  const { signOut, loaded, client } = useClerk();
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [storageFailed, setStorageFailed] = useState(false);
  const [signedOutWithLocalData, setSignedOutWithLocalData] = useState(false);

  useEffect(() => {
    let active = true;
    getMentoringPendingCount().then((count) => { if (active) setPendingCount(count); }).catch(() => { if (active) { setStorageFailed(true); setMessage("לא ניתן לבדוק כרגע אם יש שינויים שטרם הסתנכרנו."); } });
    return () => { active = false; };
  }, []);

  async function retryStorage() {
    setBusy(true); setMessage(null);
    try { setPendingCount(await getMentoringPendingCount()); setStorageFailed(false); }
    catch { setMessage("המידע המקומי עדיין אינו נגיש. אפשר לנסות שוב או לבחור ביציאה בכל זאת."); }
    finally { setBusy(false); }
  }

  async function leave(force = false) {
    if (busy || (pendingCount === null && !force) || !loaded) return;
    setBusy(true); setMessage(null);
    try {
      // Recheck in case another tab saved work since this confirmation was shown.
      if (!force) {
        let currentCount: number;
        try { currentCount = await getMentoringPendingCount(); }
        catch { setStorageFailed(true); setMessage("לא ניתן לבדוק את המידע המקומי לפני היציאה. אפשר לנסות שוב או לבחור ביציאה בכל זאת."); setBusy(false); return; }
        if (currentCount > 0 && currentCount !== pendingCount) { setPendingCount(currentCount); setBusy(false); return; }
      }
      lockMentoringOfflineData();
      try { await clearMentoringOfflineData(); }
      catch {
        if (!force) { setStorageFailed(true); setMessage("לא ניתן לנקות את המידע המקומי. אפשר לנסות שוב או לבחור ביציאה בכל זאת."); setBusy(false); return; }
        // Revoking the session must remain possible even when browser storage fails.
        lockMentoringOfflineData();
        if (!client?.sessions.length) { setSignedOutWithLocalData(true); setBusy(false); return; }
        await signOut(() => { setSignedOutWithLocalData(true); setBusy(false); });
        return;
      }
      if (!client?.sessions.length) {
        // Reload the document after cleanup to discard the previous staff Router state.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/staff/login");
        return;
      }
      await signOut({ redirectUrl: "/staff/login" });
    } catch {
      setMessage("היציאה לא הושלמה. יש לבדוק את החיבור ולנסות שוב.");
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="יציאה ממרחב הליווי" description="היציאה מנקה מהמכשיר את עותק המידע המקומי של מערכת הליווי.">
      <div className="flex flex-col gap-5">
        {signedOutWithLocalData ? <>
          <Alert variant="destructive"><AlertTriangle aria-hidden /><AlertTitle>החשבון נותק, אך ניקוי המידע המקומי נכשל</AlertTitle><AlertDescription>ייתכן שעדיין נשאר מידע מקומי במכשיר. יש לסגור את לשוניות המערכת ולפנות לתמיכה לניקוי האחסון לפני העברת המכשיר לאחרים.</AlertDescription></Alert>
          <Button nativeButton={false} render={<Link href="/staff/login" />}>חזרה למסך הכניסה</Button>
        </> : <>
        {pendingCount !== null && pendingCount > 0 && <Alert variant="destructive"><AlertTriangle aria-hidden /><AlertTitle>יש שינויים שעדיין נמצאים רק במכשיר</AlertTitle><AlertDescription>נמצאו {pendingCount} פריטים או טיוטות שלא הסתנכרנו. יציאה כעת תמחק אותם. כדי לשמור אותם, יש לחזור למערכת ולהשלים סנכרון.</AlertDescription></Alert>}
        {storageFailed && <Alert variant="destructive"><AlertTriangle aria-hidden /><AlertTitle>לא ניתן לגשת לאחסון במכשיר</AlertTitle><AlertDescription>יציאה בכל זאת תנסה לנקות את המידע המקומי ועלולה למחוק שינויים שלא הסתנכרנו. אם הניקוי ייכשל, החשבון ינותק ויוצג חיווי מפורש.</AlertDescription></Alert>}
        <AuthError message={message} />
        {storageFailed ? <>
          <Button variant="outline" onClick={retryStorage} disabled={busy}>ניסיון נוסף לבדוק את המידע המקומי</Button>
          <Button variant="destructive" onClick={() => leave(true)} disabled={busy || !loaded}>ניקוי המידע המקומי ויציאה בכל זאת</Button>
        </> : <Button size="lg" variant={pendingCount ? "destructive" : "default"} onClick={() => leave()} disabled={busy || pendingCount === null || !loaded}>{busy ? <Spinner data-icon="inline-start" aria-label="יציאה מהחשבון" /> : <LogOut data-icon="inline-start" aria-hidden />}{pendingCount ? "מחיקת השינויים המקומיים ויציאה" : "יציאה מהחשבון"}</Button>}
        <Button variant="outline" disabled={busy} nativeButton={false} render={<Link href="/staff" />}>חזרה למרחב הליווי</Button>
        </>}
      </div>
    </AuthFrame>
  );
}
