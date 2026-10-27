export type AuthField = "identifier" | "password" | "code";
export type AuthFieldErrors = Partial<Record<AuthField, string>>;
export type AuthStage = "password" | "verification" | "recovery-email" | "recovery-code" | "new-password" | "google-verification" | "google-account" | "signup";

type AuthInput = { stage: AuthStage; identifier?: string; password?: string; code?: string; factor?: "email_code" | "totp" | "backup_code" };

export function validateAuthInput({ stage, identifier = "", password = "", code = "", factor }: AuthInput): AuthFieldErrors {
  const errors: AuthFieldErrors = {};
  if (stage === "password" || stage === "recovery-email" || stage === "signup") {
    const email = identifier.trim();
    if (!email) errors.identifier = "יש להזין את כתובת הדוא״ל של החשבון.";
    else if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.identifier = "יש להזין כתובת דוא״ל תקינה, למשל name@example.com.";
  }
  if (stage === "password" || stage === "google-account" || stage === "new-password" || stage === "signup") {
    if (!password.trim()) errors.password = "יש להזין סיסמה.";
    else if ((stage === "new-password" || stage === "signup") && password.length < 15) errors.password = "יש לבחור סיסמה באורך 15 תווים לפחות.";
    else if (password.length > 512) errors.password = "הסיסמה ארוכה מדי. ניתן להזין עד 512 תווים.";
  }
  if (stage === "verification" || stage === "recovery-code") {
    if (stage === "verification" && factor === "backup_code") {
      if (!code.trim()) errors.code = "יש להזין אחד מקודי הגיבוי ששמרת בהגדרת האימות.";
      else if (code.trim().length > 128) errors.code = "קוד הגיבוי ארוך מדי. יש להעתיק קוד גיבוי אחד בלבד.";
    } else if (!/^\d{6}$/.test(code.trim())) errors.code = "יש להזין את כל שש הספרות של קוד האימות.";
  }
  return errors;
}

function errorDetails(error: unknown): Record<string, unknown>[] {
  if (!error || typeof error !== "object") return [];
  if ("errors" in error && Array.isArray(error.errors)) {
    return [...error.errors.filter((item): item is Record<string, unknown> => !!item && typeof item === "object"), error as Record<string, unknown>];
  }
  return [error as Record<string, unknown>];
}

function errorField(detail: Record<string, unknown>): AuthField | undefined {
  const meta = detail.meta && typeof detail.meta === "object" ? detail.meta as Record<string, unknown> : {};
  const name = meta.paramName ?? meta.param_name;
  if (["identifier", "emailAddress", "email_address"].includes(String(name))) return "identifier";
  if (name === "password") return "password";
  if (["code", "backup_code"].includes(String(name))) return "code";
  const code = typeof detail.code === "string" ? detail.code : "";
  if (code.includes("code_incorrect") || code.includes("verification_failed") || code.includes("verification_expired") || code.includes("verification_max_attempts")) return "code";
  if (code.includes("password")) return "password";
  if (code.includes("identifier") || code.includes("email_address")) return "identifier";
}

function detailMessage(detail: Record<string, unknown>): string | null {
  const code = typeof detail.code === "string" ? detail.code : "";
  const field = errorField(detail);
  if (code.includes("too_many") || code.includes("rate_limit") || detail.status === 429) return "בוצעו יותר מדי ניסיונות. יש להמתין כמה דקות לפני ניסיון נוסף.";
  if (code.includes("network") || code.includes("offline") || code.includes("fetch_error")) return "לא ניתן להתחבר לשירות האימות. יש לבדוק את החיבור לאינטרנט ולנסות שוב כשהחיבור חוזר.";
  if (code.includes("verification_expired") || code.includes("verification_max_attempts")) return "תוקף הקוד פג או שמוצו ניסיונות האימות. יש לבקש קוד חדש.";
  if (code.includes("code_incorrect") || code.includes("verification_failed")) return "הקוד אינו תקין. יש לבדוק את הקוד העדכני ולנסות שוב.";
  if (code.includes("password_or_identifier_incorrect") || code.includes("password_incorrect") || code.includes("password_validation_failed") || code.includes("identifier_not_found")) return "כתובת הדוא״ל או הסיסמה אינן נכונות. יש לבדוק אותן או לבחור בשחזור סיסמה.";
  if (code.includes("password_pwned") || code.includes("password_compromised") || code.includes("password_untrusted")) return code.includes("sign_in") ? "מטעמי אבטחה צריך להחליף את הסיסמה. יש לבחור בשחזור סיסמה או להיכנס עם Google." : "הסיסמה הופיעה במאגר סיסמאות שדלפו. יש לבחור סיסמה חדשה וייחודית.";
  if (code.includes("password_length") || code.includes("password_too_short")) return "יש לבחור סיסמה באורך 15 תווים לפחות.";
  if (code.includes("password_size")) return "הסיסמה ארוכה מדי עבור שירות האימות. יש לבחור סיסמה קצרה יותר באורך 15 תווים לפחות.";
  if (code.includes("new_password_matches_current") || code.includes("password_matches_identifier")) return "יש לבחור סיסמה חדשה ושונה מכתובת הדוא״ל ומהסיסמה הקודמת.";
  if (code.includes("password_not_strong")) return "הסיסמה אינה חזקה מספיק. יש לבחור משפט סודי ארוך וייחודי.";
  if (code.includes("identifier_exists")) return "לא ניתן ליצור חשבון עם הפרטים האלו. אם כבר קיים חשבון, אפשר לעבור למסך הכניסה או לשחזר סיסמה.";
  if (code.includes("email_address_blocked") || code.includes("not_allowed_access")) return "לא ניתן להשתמש בכתובת הזו לכניסה לצוות. יש לבדוק שהזנת את הכתובת שאושרה על ידי ההנהלה.";
  if (code.includes("captcha") || code.includes("protect_check")) return "בדיקת האבטחה לא הושלמה. יש לנסות שוב; אם הבדיקה אינה מופיעה, יש לרענן את העמוד.";
  if (code.includes("oauth_access_denied") || code.includes("oauth_cancelled")) return "הכניסה עם Google בוטלה או שלא ניתנה הרשאה. אפשר לנסות שוב או להיכנס עם דוא״ל וסיסמה.";
  if (code.includes("oauth") || code.includes("external_account")) return "לא ניתן להשלים כרגע את הכניסה עם Google. אפשר לנסות שוב או להיכנס עם דוא״ל וסיסמה.";
  if (code.includes("expired") || code.includes("resource_not_found")) return "תהליך האימות כבר אינו בתוקף. יש לחזור למסך הכניסה ולהתחיל מחדש.";
  if (code.includes("form_param")) {
    if (field === "identifier") return "יש להזין כתובת דוא״ל תקינה, למשל name@example.com.";
    if (field === "password") return "יש לבדוק את הסיסמה ולהזין אותה שוב.";
    if (field === "code") return "יש לבדוק שהעתקת קוד אימות מלא ולנסות שוב.";
  }
  return null;
}

export function authErrorMessage(error: unknown): string {
  for (const detail of errorDetails(error)) {
    const message = detailMessage(detail);
    if (message) return message;
  }
  if (error instanceof TypeError) return "לא ניתן להתחבר לשירות האימות. יש לבדוק את החיבור לאינטרנט ולנסות שוב כשהחיבור חוזר.";
  return "שירות האימות לא הצליח להשלים את הפעולה. אפשר לנסות שוב בעוד רגע. אם הבעיה חוזרת, יש לפנות להנהלה.";
}

export function authErrorFields(error: unknown): AuthFieldErrors {
  const fields: AuthFieldErrors = {};
  for (const detail of errorDetails(error)) {
    const field = errorField(detail);
    const message = detailMessage(detail);
    if (field && message) fields[field] = message;
  }
  return fields;
}
