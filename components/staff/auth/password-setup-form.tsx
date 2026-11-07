"use client";

import { useClerk, useReverification, useUser } from "@clerk/nextjs";
import { isReverificationCancelledError } from "@clerk/nextjs/errors";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/staff/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/staff/ui/field";
import { Input } from "@/components/staff/ui/input";
import { staffPublicPath } from "@/lib/staff-host";
import { AuthError, SignedInActions } from "./auth-controls";
import { AuthFrame } from "./auth-frame";
import { authErrorFields, authErrorMessage, validateAuthInput } from "./auth-validation";

export function PasswordSetupForm() {
  const { isLoaded, user } = useUser();
  return (
    <AuthFrame title="הגדרת סיסמה" description="כדי לפתוח את מרחב הליווי, יש לבחור סיסמה לחשבון הצוות.">
      {!isLoaded ? <p role="status">בודקים את פרטי החשבון…</p>
        : !user ? <Button size="lg" nativeButton={false} render={<Link href={staffPublicPath("/staff/login")} />}>לכניסה למערכת</Button>
        : user.passwordEnabled ? <SignedInActions />
        : <NewPasswordForm key={user.id} userId={user.id} email={user.primaryEmailAddress?.emailAddress} />}
    </AuthFrame>
  );
}

function NewPasswordForm({ userId, email }: { userId: string; email?: string }) {
  const clerk = useClerk();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string>();
  const [message, setMessage] = useState<string | null>(null);
  const submitting = useRef(false);
  const updatePassword = useReverification(async (newPassword: string) => {
    // Clerk may retry this callback after its verification modal closes.
    const user = clerk.user;
    if (user?.id !== userId || user.passwordEnabled) throw new Error("Password setup is no longer available.");
    return user.updatePassword({ newPassword, signOutOfOtherSessions: true });
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const validation = validateAuthInput({ stage: "new-password", password });
    setFieldError(validation.password);
    setMessage(null);
    if (validation.password) return;

    submitting.current = true;
    setBusy(true);
    try {
      const updated = await updatePassword(password);
      if (!updated.passwordEnabled) throw new Error("Password setup was not confirmed.");
      setPassword("");
      if (clerk.user?.id === userId) window.location.assign(staffPublicPath("/staff"));
    } catch (error) {
      if (isReverificationCancelledError(error)) setMessage("האימות בוטל. כדי לשמור את הסיסמה, יש לנסות שוב ולהשלים את האימות.");
      else {
        setFieldError(authErrorFields(error).password);
        setMessage(authErrorMessage(error));
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <form method="post" onSubmit={submit} noValidate aria-busy={busy}>
      <FieldGroup>
        {email && <p className="text-sm break-all text-muted-foreground">חשבון הצוות <bdi>{email}</bdi></p>}
        <Field data-invalid={!!fieldError || undefined}>
          <FieldLabel htmlFor="setup-password">סיסמה חדשה</FieldLabel>
          <Input
            id="setup-password" type="password" dir="ltr" autoComplete="new-password"
            value={password} onChange={(event) => { setPassword(event.target.value); setFieldError(undefined); setMessage(null); }}
            disabled={busy} required minLength={15} maxLength={512} aria-invalid={!!fieldError}
            aria-describedby={`setup-password-description${fieldError ? " setup-password-error" : ""}`}
          />
          <FieldDescription id="setup-password-description">יש לבחור סיסמה ייחודית באורך 15 תווים לפחות.</FieldDescription>
          {fieldError && <FieldError id="setup-password-error">{fieldError}</FieldError>}
        </Field>
        <AuthError message={message} />
        <Button type="submit" size="lg" disabled={busy}>{busy ? "שומרים את הסיסמה…" : "שמירת הסיסמה והמשך"}</Button>
        <Button variant="ghost" nativeButton={false} render={<Link href={staffPublicPath("/staff/logout")} />}>יציאה מהחשבון</Button>
      </FieldGroup>
    </form>
  );
}
