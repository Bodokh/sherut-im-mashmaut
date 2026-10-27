"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { SignUp, useAuth, useSignUp } from "@clerk/nextjs";
import { Info } from "lucide-react";
import { AuthFrame } from "./auth-frame";
import { AuthError, CodeField, SignedInActions, SubmitButton, authErrorMessage, useResendCooldown } from "./auth-controls";
import { authErrorFields, validateAuthInput, type AuthField, type AuthFieldErrors } from "./auth-validation";
import { Alert, AlertDescription } from "@/components/staff/ui/alert";
import { Button } from "@/components/staff/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/staff/ui/field";
import { Input } from "@/components/staff/ui/input";

export function SignUpForm() {
  const { signUp, fetchStatus } = useSignUp();
  const { isLoaded, isSignedIn } = useAuth();
  const [verifying, setVerifying] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const operationActive = useRef(false);
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const cooldown = useResendCooldown();
  const pending = busy || fetchStatus === "fetching" || !isLoaded;

  function fail(error: unknown) {
    setMessage(authErrorMessage(error));
    setFieldErrors(authErrorFields(error));
  }

  function clearField(field: AuthField) {
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setMessage(null);
  }

  function validateField(field: AuthField) {
    const validation = validateAuthInput({ stage: verifying ? "verification" : "signup", identifier: email, password, code });
    setFieldErrors((current) => ({ ...current, [field]: validation[field] }));
  }

  async function run(operation: () => Promise<void>) {
    if (pending || operationActive.current) return;
    operationActive.current = true;
    setBusy(true); setMessage(null);
    try { await operation(); } catch (error) { fail(error); } finally { operationActive.current = false; setBusy(false); }
  }

  async function sendCode() {
    const { error } = await signUp.verifications.sendEmailCode();
    if (error) { fail(error); return; }
    setCode(""); setFieldErrors({}); cooldown.restart();
  }

  async function finalize() {
    const { error } = await signUp.finalize({
      navigate: ({ session, decorateUrl }) => {
        if (session?.currentTask) { setMessage("נדרשת השלמת הגדרה נוספת בחשבון. יש לפנות להנהלה."); return; }
        window.location.assign(decorateUrl("/staff"));
      },
    });
    if (error) fail(error);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || operationActive.current) return;
    if (signUp.status === "complete") { await run(finalize); return; }
    const validation = validateAuthInput({ stage: verifying ? "verification" : "signup", identifier: email, password, code });
    setFieldErrors(validation);
    if (Object.values(validation).some(Boolean)) {
      setMessage("יש לתקן את השדות המסומנים לפני שממשיכים.");
      return;
    }
    await run(async () => {
      if (!verifying) {
        const { error } = await signUp.password({ emailAddress: email.trim(), password, locale: "he-IL" });
        if (error) { fail(error); return; }
        setPassword("");
        setVerifying(true);
        await sendCode();
        return;
      }
      const { error } = await signUp.verifications.verifyEmailCode({ code: code.trim() });
      if (error) { fail(error); return; }
      if (signUp.status !== "complete") {
        setMessage("החשבון דורש פרטים נוספים לפני השלמת ההרשמה. יש לפנות להנהלה.");
        return;
      }
      await finalize();
    });
  }

  // Resume the provider-verified signup with Clerk's supported requirements UI;
  // starting a password signup here would discard the pending Google identity.
  if (!isSignedIn && signUp.verifications.externalAccount.strategy === "oauth_google") {
    return (
      <AuthFrame title="השלמת ההרשמה עם Google" description="נשלים את פרטי החשבון. הגישה למרחב הליווי מחייבת אישור הצטרפות לצוות.">
        <SignUp routing="hash" signInUrl="/staff/login" forceRedirectUrl="/staff" signInForceRedirectUrl="/staff" />
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title={verifying ? "נאמת את כתובת הדוא״ל" : "מצטרפים למרחב הליווי"} description={verifying ? "יש להזין את הקוד מהודעת הדוא״ל כדי ליצור את החשבון. אם ההודעה לא הגיעה, אפשר לבקש קוד חדש." : "יוצרים חשבון אישי עם כתובת הדוא״ל שאושרה על ידי ההנהלה."} footer={<p className="text-sm text-muted-foreground">כבר יש לך חשבון? <Link href="/staff/login" className="font-medium text-primary underline-offset-4 hover:underline">כניסה למערכת</Link></p>}>
      {isSignedIn ? <SignedInActions /> : <form onSubmit={submit} noValidate aria-busy={pending}>
        <FieldGroup>
          {!verifying && <>
            <Field data-invalid={!!fieldErrors.identifier || undefined}>
              <FieldLabel htmlFor="signup-email">כתובת דוא״ל</FieldLabel>
              <Input id="signup-email" name="email" type="email" dir="ltr" autoComplete="email" placeholder="name@example.com" value={email} onChange={(event) => { setEmail(event.target.value); clearField("identifier"); }} onBlur={() => validateField("identifier")} disabled={pending} aria-invalid={!!fieldErrors.identifier} aria-describedby={fieldErrors.identifier ? "signup-email-error" : undefined} required maxLength={254} />
              {fieldErrors.identifier && <FieldError id="signup-email-error">{fieldErrors.identifier}</FieldError>}
            </Field>
            <Field data-invalid={!!fieldErrors.password || undefined}>
              <FieldLabel htmlFor="signup-password">סיסמה</FieldLabel>
              <Input id="signup-password" name="password" type="password" dir="ltr" autoComplete="new-password" value={password} onChange={(event) => { setPassword(event.target.value); clearField("password"); }} onBlur={() => validateField("password")} disabled={pending} aria-invalid={!!fieldErrors.password} minLength={15} maxLength={512} required aria-describedby={`signup-password-description${fieldErrors.password ? " signup-password-error" : ""}`} />
              <FieldDescription id="signup-password-description">לפחות 15 תווים. מומלץ לבחור משפט סודי וייחודי.</FieldDescription>
              {fieldErrors.password && <FieldError id="signup-password-error">{fieldErrors.password}</FieldError>}
            </Field>
            <Alert><Info aria-hidden /><AlertDescription>יצירת חשבון אינה מעניקה הרשאה למידע. הצטרפות לצוות מחייבת אישור של ההנהלה.</AlertDescription></Alert>
          </>}
          {verifying && <CodeField value={code} onChange={(value) => { setCode(value); clearField("code"); }} onBlur={() => validateField("code")} disabled={pending} error={fieldErrors.code} description="יש להזין את שש הספרות מהודעת הדוא״ל." />}
          <AuthError message={message} />
          <div id="clerk-captcha" />
          <SubmitButton pending={pending}>{verifying ? "אימות ויצירת חשבון" : "יצירת חשבון"}</SubmitButton>
          {verifying && <div className="flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="ghost" disabled={pending} onClick={() => { signUp.reset(); setCode(""); setPassword(""); setMessage(null); setFieldErrors({}); setVerifying(false); }}>שינוי כתובת הדוא״ל</Button>
            <Button type="button" variant="link" disabled={pending || cooldown.seconds > 0} onClick={() => { if (cooldown.seconds === 0) void run(sendCode); }}>{cooldown.seconds > 0 ? `שליחה חוזרת בעוד ${cooldown.seconds} שנ׳` : "שליחת קוד חדש"}</Button>
          </div>}
        </FieldGroup>
      </form>}
    </AuthFrame>
  );
}
