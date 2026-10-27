"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth, useSignIn } from "@clerk/nextjs";
import { AuthFrame } from "./auth-frame";
import { AuthError, CodeField, SignedInActions, SubmitButton, authErrorMessage, useResendCooldown } from "./auth-controls";
import { Button } from "@/components/staff/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/staff/ui/field";
import { Input } from "@/components/staff/ui/input";

type Stage = "password" | "verification" | "recovery-email" | "recovery-code" | "new-password" | "google-verification" | "google-account";
type Factor = "email_code" | "totp" | "backup_code";

export function SignInForm({ googleResult }: { googleResult?: string } = {}) {
  const { signIn, errors, fetchStatus } = useSignIn();
  const { isLoaded, isSignedIn } = useAuth();
  const [stage, setStage] = useState<Stage>(googleResult === "continue" ? "google-verification" : googleResult === "verify-account" ? "google-account" : "password");
  const [factor, setFactor] = useState<Factor>("email_code");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(googleResult === "unavailable" ? "לא ניתן להיכנס עם חשבון Google הזה. הכניסה זמינה רק עם כתובת דוא״ל של חשבון צוות קיים." : googleResult === "verify-account" ? "כדי לחבר את Google לחשבון הקיים, נדרש אימות עם כתובת הדוא״ל והסיסמה של חשבון הצוות." : null);
  const cooldown = useResendCooldown();
  const pending = busy || fetchStatus === "fetching" || !isLoaded;

  async function finalize() {
    const { error } = await signIn.finalize({
      navigate: ({ session, decorateUrl }) => {
        if (session?.currentTask) {
          setMessage("נדרשת השלמת הגדרה נוספת בחשבון. יש לפנות להנהלה לפני הכניסה למידע.");
          return;
        }
        // Only the provider-generated decoration of our fixed internal destination is used.
        window.location.assign(decorateUrl("/staff"));
      },
    });
    if (error) setMessage(authErrorMessage(error));
  }

  async function advance() {
    if (signIn.status === "complete") return finalize();
    if (signIn.status === "needs_new_password") { setStage("new-password"); return; }
    if (signIn.status === "needs_client_trust" || signIn.status === "needs_second_factor") {
      const factors = signIn.supportedSecondFactors;
      if (factors.some((item) => item.strategy === "email_code")) {
        setFactor("email_code");
        setStage("verification");
        const verification = signIn.secondFactorVerification;
        const alreadySent = verification.strategy === "email_code" && verification.status === "unverified" && verification.expireAt && verification.expireAt.getTime() > Date.now();
        if (!alreadySent) {
          const { error } = await signIn.mfa.sendEmailCode();
          if (error) { setMessage(authErrorMessage(error)); return; }
        }
        cooldown.restart();
        return;
      }
      const available = factors.some((item) => item.strategy === "totp") ? "totp" : factors.some((item) => item.strategy === "backup_code") ? "backup_code" : null;
      if (available) { setFactor(available); setStage("verification"); return; }
      setMessage("אמצעי האימות של החשבון אינו נתמך כרגע במסך הזה. יש לפנות להנהלה.");
      return;
    }
    setMessage("נדרשת פעולת אבטחה נוספת שלא הושלמה. אפשר להתחיל מחדש או לפנות להנהלה.");
  }

  async function run(operation: () => Promise<void>) {
    if (pending) return;
    setBusy(true);
    setMessage(null);
    try { await operation(); } catch { setMessage(authErrorMessage(null)); } finally { setBusy(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      if (stage === "google-verification") {
        await advance();
      } else if (stage === "password" || stage === "google-account") {
        // Keep account-link verification on the provider's pending identifier.
        const { error } = await signIn.password(stage === "google-account" ? { password } : { identifier: identifier.trim(), password });
        if (error) { setMessage(authErrorMessage(error)); return; }
        setPassword("");
        await advance();
      } else if (stage === "recovery-email") {
        const { error } = await signIn.create({ identifier: identifier.trim() });
        if (error) { setMessage(authErrorMessage(error)); return; }
        const result = await signIn.resetPasswordEmailCode.sendCode();
        if (result.error) { setMessage(authErrorMessage(result.error)); return; }
        setStage("recovery-code"); cooldown.restart();
      } else if (stage === "recovery-code") {
        const { error } = await signIn.resetPasswordEmailCode.verifyCode({ code });
        if (error) { setMessage(authErrorMessage(error)); return; }
        setCode(""); await advance();
      } else if (stage === "new-password") {
        const { error } = await signIn.resetPasswordEmailCode.submitPassword({ password, signOutOfOtherSessions: true });
        if (error) { setMessage(authErrorMessage(error)); return; }
        setPassword(""); await advance();
      } else {
        const result = factor === "email_code" ? await signIn.mfa.verifyEmailCode({ code }) : factor === "totp" ? await signIn.mfa.verifyTOTP({ code }) : await signIn.mfa.verifyBackupCode({ code });
        if (result.error) { setMessage(authErrorMessage(result.error)); return; }
        setCode(""); await advance();
      }
    });
  }

  async function signInWithGoogle() {
    await run(async () => {
      signIn.reset();
      const { error } = await signIn.sso({
        strategy: "oauth_google",
        redirectUrl: "/staff",
        redirectCallbackUrl: "/staff/login/google-callback",
        oidcPrompt: "select_account",
      });
      if (error) setMessage(authErrorMessage(error));
    });
  }

  function restart(recovery = false) {
    signIn.reset(); setPassword(""); setCode(""); setMessage(null); setStage(recovery ? "recovery-email" : "password");
  }

  async function resend() {
    await run(async () => {
      const result = stage === "recovery-code" ? await signIn.resetPasswordEmailCode.sendCode() : await signIn.mfa.sendEmailCode();
      if (result.error) { setMessage(authErrorMessage(result.error)); return; }
      setCode(""); cooldown.restart();
    });
  }

  const verifying = stage === "verification" || stage === "recovery-code";
  const recovering = stage.startsWith("recovery") || stage === "new-password";
  const title = verifying ? "עוד רגע, נכנסים" : recovering ? "חזרה לחשבון" : "טוב לראות אותך";
  const description = verifying || stage === "google-verification" ? "נשלים את האימות כדי להמשיך למרחב הליווי." : recovering ? "אימות החשבון מאפשר לבחור סיסמה חדשה." : "נכנסים עם Google או עם כתובת הדוא״ל והסיסמה של חשבון הצוות.";

  return (
    <AuthFrame title={title} description={description} footer={<p className="text-sm text-muted-foreground">עדיין אין לך חשבון? <Link href="/staff/signup" className="font-medium text-primary underline-offset-4 hover:underline">יצירת חשבון לצוות</Link></p>}>
      {isSignedIn ? <SignedInActions /> : (
        <form onSubmit={submit}>
          <FieldGroup>
            {stage === "password" && <>
              <Button type="button" variant="outline" size="lg" className="w-full" disabled={pending} onClick={signInWithGoogle}>
                <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5">
                  <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.89-1.74 2.98-4.3 2.98-7.36Z" />
                  <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.81-1.76-5.6-4.12H3.05v2.59A10 10 0 0 0 12 22Z" />
                  <path fill="#FBBC05" d="M6.4 13.92a6 6 0 0 1 0-3.84V7.49H3.05a10 10 0 0 0 0 9.02l3.35-2.59Z" />
                  <path fill="#EA4335" d="M12 5.96c1.47 0 2.79.5 3.82 1.49l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.95 5.49l3.35 2.59C7.19 7.72 9.4 5.96 12 5.96Z" />
                </svg>
                כניסה עם Google
              </Button>
              <FieldDescription className="text-center">עם אותה כתובת דוא״ל שכבר רשומה בחשבון הצוות.</FieldDescription>
              <FieldSeparator>או עם דוא״ל וסיסמה</FieldSeparator>
            </>}
            {(stage === "password" || stage === "google-account" || stage === "recovery-email") && <Field data-invalid={!!errors.fields.identifier || undefined}>
              <FieldLabel htmlFor="staff-email">כתובת דוא״ל</FieldLabel>
              <Input id="staff-email" name="email" type="email" dir="ltr" autoComplete="username" placeholder="name@example.com" value={stage === "google-account" ? signIn.identifier ?? "" : identifier} readOnly={stage === "google-account"} onChange={(event) => setIdentifier(event.target.value)} disabled={pending} aria-invalid={!!errors.fields.identifier} required maxLength={254} />
            </Field>}
            {(stage === "password" || stage === "google-account" || stage === "new-password") && <Field data-invalid={!!errors.fields.password || undefined}>
              <FieldLabel htmlFor="staff-password">{stage === "new-password" ? "סיסמה חדשה" : "סיסמה"}</FieldLabel>
              <Input id="staff-password" name="password" type="password" dir="ltr" autoComplete={stage === "new-password" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} aria-invalid={!!errors.fields.password} minLength={stage === "new-password" ? 15 : undefined} maxLength={512} required />
              {stage === "new-password" && <FieldDescription>לפחות 15 תווים. מומלץ לבחור משפט סודי וייחודי.</FieldDescription>}
            </Field>}
            {verifying && (factor === "backup_code" && stage === "verification" ? <Field>
              <FieldLabel htmlFor="backup-code">קוד גיבוי</FieldLabel>
              <Input id="backup-code" name="backup-code" dir="ltr" autoComplete="off" value={code} onChange={(event) => setCode(event.target.value)} disabled={pending} required />
            </Field> : <CodeField value={code} onChange={setCode} disabled={pending} invalid={!!errors.fields.code} description={stage === "verification" && factor === "totp" ? "יש להזין את שש הספרות מאפליקציית האימות." : "יש להזין את שש הספרות שנשלחו לכתובת הדוא״ל של החשבון."} />)}
            <AuthError message={message} />
            <SubmitButton pending={pending} disabled={verifying && factor !== "backup_code" && code.length !== 6}>{stage === "google-verification" ? "המשך אימות החשבון" : verifying ? "אימות וכניסה" : stage === "recovery-email" ? "שליחת קוד לשחזור" : stage === "new-password" ? "שמירת הסיסמה וכניסה" : "כניסה למרחב הליווי"}</SubmitButton>
            {stage === "password" ? <Button type="button" variant="link" disabled={pending} onClick={() => restart(true)}>שכחת את הסיסמה?</Button> : <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" variant="ghost" disabled={pending} onClick={() => restart()}>חזרה לכניסה</Button>
              {verifying && (stage === "recovery-code" || factor === "email_code") && <Button type="button" variant="link" disabled={pending || cooldown.seconds > 0} onClick={resend}>{cooldown.seconds > 0 ? `שליחה חוזרת בעוד ${cooldown.seconds} שנ׳` : "שליחת קוד חדש"}</Button>}
              {stage === "verification" && factor === "totp" && signIn.supportedSecondFactors.some((item) => item.strategy === "backup_code") && <Button type="button" variant="link" disabled={pending} onClick={() => { setFactor("backup_code"); setCode(""); }}>שימוש בקוד גיבוי</Button>}
            </div>}
          </FieldGroup>
        </form>
      )}
    </AuthFrame>
  );
}
