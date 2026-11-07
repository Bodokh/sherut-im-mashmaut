import "server-only";

import { emailButton, emailColors, emailPanel, emailParagraph, renderBrandedEmail } from "../../email/brand";
import { ORGANIZATION_EMAIL_FROM } from "../../organization-email";
import type { StaffOnboardingSender } from "./staff-onboarding";

const LOGIN_URL = "https://staff.imashmaut.co.il/login";
const SIGNUP_URL = "https://staff.imashmaut.co.il/signup";
const SUBJECT = "הזמנה לצוות הליווי | שירות עם משמעות";
const WELCOME = "אושרה הצטרפותך לצוות הליווי של שירות עם משמעות.";
const SETUP = "כדי להתחיל, יש לפתוח חשבון עם כתובת הדוא״ל שאליה נשלחה ההזמנה, לבחור סיסמה ולאמת את הכתובת באמצעות הקוד שיישלח אליה.";
const EXISTING = "כבר יש לך חשבון? אפשר להיכנס עם אותו חשבון. אם עדיין אין בו סיסמה, המערכת תבקש להגדיר אחת.";
const WELCOME_HTML = renderBrandedEmail({
  language: "he",
  category: "הצטרפות לצוות",
  title: "הזמנה לצוות הליווי",
  body: `${emailParagraph(WELCOME)}
    ${emailPanel(`${emailParagraph(SETUP)}${emailButton(SIGNUP_URL, "יצירת חשבון והגדרת סיסמה")}`)}
    <p style="margin:20px 0 0;color:${emailColors.muted};font-size:14px;line-height:1.7">${EXISTING}<br />
      <a href="${LOGIN_URL}" style="color:${emailColors.ink};font-weight:bold;text-decoration:underline">כניסה לחשבון קיים</a>
    </p>`,
});
const ACCESS_SUBJECT = "קישור כניסה לצוות הליווי | שירות עם משמעות";
const ACCESS = "אפשר להיכנס למרחב הליווי של שירות עם משמעות באמצעות חשבון הצוות הקיים.";
const RECOVERY = "אם יש צורך לאפס את הסיסמה, אפשר לבחור ״שכחת את הסיסמה?״ במסך הכניסה.";
const ACCESS_HTML = renderBrandedEmail({
  language: "he",
  category: "מרחב הליווי",
  title: "קישור כניסה לצוות הליווי",
  body: `${emailPanel(`${emailParagraph(ACCESS)}${emailButton(LOGIN_URL, "כניסה למרחב הליווי")}`)}
    ${emailParagraph(RECOVERY)}`,
});

export function staffOnboardingSender(env = process.env): StaffOnboardingSender | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (env.MENTORING_STAFF_ONBOARDING_EMAIL_ENABLED !== "true" || !apiKey) return null;

  return async ({ staffId, recipientEmail, deliveryId, kind }) => {
    const key = deliveryId === staffId ? staffId : `${staffId}/${deliveryId}`;
    const accessEmail = kind === "access";
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(8_000),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `staff-onboarding/${key}`,
        },
        body: JSON.stringify({
          from: ORGANIZATION_EMAIL_FROM,
          to: [recipientEmail],
          subject: accessEmail ? ACCESS_SUBJECT : SUBJECT,
          text: (accessEmail ? [ACCESS, LOGIN_URL, RECOVERY] : [WELCOME, SETUP, SIGNUP_URL, EXISTING, LOGIN_URL]).join("\n\n"),
          html: accessEmail ? ACCESS_HTML : WELCOME_HTML,
        }),
      });
      const payload: { id?: unknown; name?: unknown } | null = await response.json().catch(() => null);
      if (response.ok && typeof payload?.id === "string" && payload.id) {
        return { status: "accepted", providerId: payload.id };
      }
      if (response.ok || response.status >= 500 || response.status === 429 || response.status === 408
        || (response.status === 409 && payload?.name === "concurrent_idempotent_requests")) {
        return { status: "retry" };
      }
      return { status: "failed" };
    } catch {
      return { status: "retry" };
    }
  };
}
