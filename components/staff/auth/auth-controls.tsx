"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, ShieldCheck } from "lucide-react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { Button } from "@/components/staff/ui/button";
import { Alert, AlertDescription } from "@/components/staff/ui/alert";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/staff/ui/field";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/staff/ui/input-otp";
import { Spinner } from "@/components/staff/ui/spinner";

export { authErrorMessage } from "./auth-validation";

export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return <Alert variant="destructive"><AlertCircle aria-hidden /><AlertDescription>{message}</AlertDescription></Alert>;
}

export function SubmitButton({ pending, children, disabled = false }: { pending: boolean; children: React.ReactNode; disabled?: boolean }) {
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending || disabled}>
      {pending ? <Spinner aria-label="ממתינים לאימות" data-icon="inline-start" /> : <ArrowLeft aria-hidden data-icon="inline-end" />}
      {pending ? "רגע, מתחברים…" : children}
    </Button>
  );
}

export function CodeField({ value, onChange, onBlur, disabled, invalid, error, description }: { value: string; onChange: (code: string) => void; onBlur?: () => void; disabled: boolean; invalid?: boolean; error?: string; description: string }) {
  return (
    <Field data-invalid={!!error || invalid || undefined}>
      <FieldLabel htmlFor="verification-code">קוד אימות</FieldLabel>
      <div dir="ltr">
        <InputOTP id="verification-code" name="code" autoComplete="one-time-code" inputMode="numeric" maxLength={6} pattern={REGEXP_ONLY_DIGITS} value={value} onChange={onChange} onBlur={onBlur} disabled={disabled} aria-invalid={!!error || invalid} aria-describedby={`verification-description${error ? " verification-error" : ""}`} required>
          <InputOTPGroup>
            {Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index} />)}
          </InputOTPGroup>
        </InputOTP>
      </div>
      <FieldDescription id="verification-description">{description}</FieldDescription>
      {error && <FieldError id="verification-error">{error}</FieldError>}
    </Field>
  );
}

export function SignedInActions() {
  return (
    <div className="flex flex-col gap-5">
      <Alert><ShieldCheck aria-hidden /><AlertDescription>החשבון מחובר. הגישה למידע נפתחת לאחר אישור הצטרפות לצוות.</AlertDescription></Alert>
      <Button size="lg" nativeButton={false} render={<Link href="/staff" />}>המשך למרחב הליווי<ArrowLeft aria-hidden data-icon="inline-end" /></Button>
      <Button variant="ghost" nativeButton={false} render={<Link href="/staff/logout" />}>יציאה מהחשבון</Button>
    </div>
  );
}

export function useResendCooldown() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!seconds) return;
    const timer = window.setTimeout(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds]);
  return { seconds, restart: () => setSeconds(30) };
}
