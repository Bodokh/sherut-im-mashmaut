import "server-only";

import { ORGANIZATION_EMAIL_FROM } from "../../organization-email";
import type { StaffOnboardingSender } from "./staff-onboarding";

const LOGIN_URL = "https://staff.imashmaut.co.il/login";
const SIGNUP_URL = "https://staff.imashmaut.co.il/signup";
const SUBJECT = "הזמנה לצוות הליווי | שירות עם משמעות";
const WELCOME = "אושרה הצטרפותך לצוות הליווי של שירות עם משמעות.";
const SETUP = "כדי להתחיל, יש לפתוח חשבון עם כתובת הדוא״ל שאליה נשלחה ההזמנה, לבחור סיסמה ולאמת את הכתובת באמצעות הקוד שיישלח אליה.";
const EXISTING = "כבר יש לך חשבון? אפשר להיכנס עם אותו חשבון. אם עדיין אין בו סיסמה, המערכת תבקש להגדיר אחת.";

export function staffOnboardingSender(env = process.env): StaffOnboardingSender | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (env.MENTORING_STAFF_ONBOARDING_EMAIL_ENABLED !== "true" || !apiKey) return null;

  return async ({ staffId, recipientEmail }) => {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(8_000),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `staff-onboarding/${staffId}`,
        },
        body: JSON.stringify({
          from: ORGANIZATION_EMAIL_FROM,
          to: [recipientEmail],
          subject: SUBJECT,
          text: [WELCOME, SETUP, SIGNUP_URL, EXISTING, LOGIN_URL].join("\n\n"),
          html: `<div dir="rtl" lang="he" style="font-family:Arial,sans-serif;color:#172033;line-height:1.6">
            <h1 style="font-size:22px">הזמנה לצוות הליווי</h1>
            <p>${WELCOME}</p>
            <p>${SETUP}</p>
            <p><a href="${SIGNUP_URL}">יצירת חשבון והגדרת סיסמה</a></p>
            <p>${EXISTING} <a href="${LOGIN_URL}">כניסה לחשבון קיים</a></p>
          </div>`,
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
