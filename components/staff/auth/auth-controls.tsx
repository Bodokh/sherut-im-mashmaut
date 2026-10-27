"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, ShieldCheck } from "lucide-react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { Button } from "@/components/staff/ui/button";
import { Alert, AlertDescription } from "@/components/staff/ui/alert";
import { Field, FieldDescription, FieldLabel } from "@/components/staff/ui/field";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/staff/ui/input-otp";
import { Spinner } from "@/components/staff/ui/spinner";

export function authErrorMessage(error: unknown): string {
  const details = typeof error === "object" && error !== null && "errors" in error && Array.isArray(error.errors) ? error.errors : [];
  const nested = details.find((item: unknown) => typeof item === "object" && item !== null && "code" in item);
  // API response errors wrap the actual provider failure in errors[].code.
  const code = nested && typeof nested === "object" && "code" in nested ? String(nested.code) : typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (code.includes("too_many") || code.includes("rate_limit")) return "בוצעו יותר מדי ניסיונות. יש להמתין מעט ולנסות שוב.";
  if (code.includes("verification_expired")) return "תוקף הקוד פג. אפשר לבקש קוד חדש.";
  if (code.includes("code_incorrect") || code.includes("verification_failed")) return "הקוד אינו תקין. יש לבדוק אותו ולנסות שוב.";
  if (code.includes("password_pwned")) return "הסיסמה הופיעה במאגר סיסמאות שדלפו. יש לבחור סיסמה חדשה וייחודית.";
  if (code.includes("password_length") || code.includes("password_too_short")) return "יש לבחור סיסמה באורך 15 תווים לפחות.";
  if (code.includes("identifier_exists")) return "לא ניתן ליצור חשבון עם הפרטים האלו. אם כבר קיים חשבון, אפשר לעבור למסך הכניסה.";
  if (code.includes("captcha")) return "יש להשלים את בדיקת האבטחה ולנסות שוב.";
  return "לא ניתן להשלים את הפעולה. יש לבדוק את הפרטים ואת החיבור לאינטרנט ולנסות שוב.";
}

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

export function CodeField({ value, onChange, disabled, invalid, description }: { value: string; onChange: (code: string) => void; disabled: boolean; invalid: boolean; description: string }) {
  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor="verification-code">קוד אימות</FieldLabel>
      <div dir="ltr">
        <InputOTP id="verification-code" name="code" autoComplete="one-time-code" inputMode="numeric" maxLength={6} pattern={REGEXP_ONLY_DIGITS} value={value} onChange={onChange} disabled={disabled} aria-invalid={invalid} aria-describedby="verification-description" required>
          <InputOTPGroup>
            {Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index} />)}
          </InputOTPGroup>
        </InputOTP>
      </div>
      <FieldDescription id="verification-description">{description}</FieldDescription>
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
