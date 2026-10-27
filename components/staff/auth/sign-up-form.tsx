"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth, useSignUp } from "@clerk/nextjs";
import { Info } from "lucide-react";
import { AuthFrame } from "./auth-frame";
import { AuthError, CodeField, SignedInActions, SubmitButton, authErrorMessage, useResendCooldown } from "./auth-controls";
import { Alert, AlertDescription } from "@/components/staff/ui/alert";
import { Button } from "@/components/staff/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/staff/ui/field";
import { Input } from "@/components/staff/ui/input";

export function SignUpForm() {
  const { signUp, errors, fetchStatus } = useSignUp();
  const { isLoaded, isSignedIn } = useAuth();
  const [verifying, setVerifying] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const cooldown = useResendCooldown();
  const pending = busy || fetchStatus === "fetching" || !isLoaded;

  async function run(operation: () => Promise<void>) {
    if (pending) return;
    setBusy(true); setMessage(null);
    try { await operation(); } catch { setMessage(authErrorMessage(null)); } finally { setBusy(false); }
  }

  async function sendCode() {
    const { error } = await signUp.verifications.sendEmailCode();
    if (error) { setMessage(authErrorMessage(error)); return; }
    cooldown.restart();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      if (!verifying) {
        const { error } = await signUp.password({ emailAddress: email.trim(), password, locale: "he-IL" });
        if (error) { setMessage(authErrorMessage(error)); return; }
        setPassword("");
        setVerifying(true);
        await sendCode();
        return;
      }
      const { error } = await signUp.verifications.verifyEmailCode({ code });
      if (error) { setMessage(authErrorMessage(error)); return; }
      if (signUp.status !== "complete") {
        setMessage("החשבון דורש פרטים נוספים לפני השלמת ההרשמה. יש לפנות להנהלה.");
        return;
      }
      const result = await signUp.finalize({
        navigate: ({ session, decorateUrl }) => {
          if (session?.currentTask) { setMessage("נדרשת השלמת הגדרה נוספת בחשבון. יש לפנות להנהלה."); return; }
          window.location.assign(decorateUrl("/staff"));
        },
      });
      if (result.error) setMessage(authErrorMessage(result.error));
    });
  }

  return (
    <AuthFrame title={verifying ? "נאמת את כתובת הדוא״ל" : "מצטרפים למרחב הליווי"} description={verifying ? "הקוד נשלח לכתובת שהזנת. יש להשלים אימות כדי ליצור את החשבון." : "יוצרים חשבון אישי עם כתובת הדוא״ל שאושרה על ידי ההנהלה."} footer={<p className="text-sm text-muted-foreground">כבר יש לך חשבון? <Link href="/staff/login" className="font-medium text-primary underline-offset-4 hover:underline">כניסה למערכת</Link></p>}>
      {isSignedIn ? <SignedInActions /> : <form onSubmit={submit}>
        <FieldGroup>
          {!verifying && <>
            <Field data-invalid={!!errors.fields.emailAddress || undefined}>
              <FieldLabel htmlFor="signup-email">כתובת דוא״ל</FieldLabel>
              <Input id="signup-email" name="email" type="email" dir="ltr" autoComplete="email" placeholder="name@example.com" value={email} onChange={(event) => setEmail(event.target.value)} disabled={pending} aria-invalid={!!errors.fields.emailAddress} required maxLength={254} />
            </Field>
            <Field data-invalid={!!errors.fields.password || undefined}>
              <FieldLabel htmlFor="signup-password">סיסמה</FieldLabel>
              <Input id="signup-password" name="password" type="password" dir="ltr" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} aria-invalid={!!errors.fields.password} minLength={15} maxLength={512} required aria-describedby="signup-password-description" />
              <FieldDescription id="signup-password-description">לפחות 15 תווים. מומלץ לבחור משפט סודי וייחודי.</FieldDescription>
            </Field>
            <Alert><Info aria-hidden /><AlertDescription>יצירת חשבון אינה מעניקה הרשאה למידע. הצטרפות לצוות מחייבת אישור של ההנהלה.</AlertDescription></Alert>
          </>}
          {verifying && <CodeField value={code} onChange={setCode} disabled={pending} invalid={!!errors.fields.code} description="יש להזין את שש הספרות מהודעת הדוא״ל." />}
          <AuthError message={message} />
          <div id="clerk-captcha" />
          <SubmitButton pending={pending} disabled={verifying && code.length !== 6}>{verifying ? "אימות ויצירת חשבון" : "יצירת חשבון"}</SubmitButton>
          {verifying && <div className="flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="ghost" disabled={pending} onClick={() => { signUp.reset(); setCode(""); setPassword(""); setMessage(null); setVerifying(false); }}>שינוי כתובת הדוא״ל</Button>
            <Button type="button" variant="link" disabled={pending || cooldown.seconds > 0} onClick={() => run(sendCode)}>{cooldown.seconds > 0 ? `שליחה חוזרת בעוד ${cooldown.seconds} שנ׳` : "שליחת קוד חדש"}</Button>
          </div>}
        </FieldGroup>
      </form>}
    </AuthFrame>
  );
}
