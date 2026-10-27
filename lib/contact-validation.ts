import { normalizePhoneNumber } from "./phone";

export type ContactLocale = "he" | "en";
export type ContactField = "name" | "email" | "phone" | "topic" | "message";
export type ContactErrors = Partial<Record<ContactField, string>>;

export function validateContactSubmission(payload: Record<string, unknown>, locale: ContactLocale = "he") {
  const read = (field: string) => typeof payload[field] === "string" ? payload[field].trim() : "";
  const values = { name: read("name"), email: read("email"), phone: read("phone"), topic: read("topic"), message: read("message") };
  const errors: ContactErrors = {};
  const he = locale === "he";
  if (values.name.length < 2 || values.name.length > 100) errors.name = he ? "יש להזין שם באורך 2–100 תווים." : "Enter a name between 2 and 100 characters.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) || values.email.length > 254) errors.email = he ? "יש להזין כתובת דוא״ל תקינה, עד 254 תווים." : "Enter a valid email address, up to 254 characters.";
  if (values.phone) {
    const phone = normalizePhoneNumber(values.phone);
    if (!phone) errors.phone = he ? "יש להזין מספר טלפון תקין ולבחור את המדינה המתאימה." : "Enter a valid phone number and select its country.";
    else values.phone = phone;
  }
  if (values.topic.length > 100) errors.topic = he ? "הנושא יכול להכיל עד 100 תווים." : "The subject can contain up to 100 characters.";
  if (values.message.length < 5 || values.message.length > 5_000) errors.message = he ? "יש להזין הודעה באורך 5–5,000 תווים." : "Enter a message between 5 and 5,000 characters.";
  return { values, errors };
}

export function contactSubmissionMessage(code: string, locale: ContactLocale = "he"): string {
  const he = locale === "he";
  if (code === "invalid_submission") return he ? "יש לבדוק את השדות המסומנים ולנסות שוב." : "Check the highlighted fields and try again.";
  if (code === "submission_too_large") return he ? "הפנייה ארוכה מדי. יש לקצר את ההודעה ולנסות שוב." : "Your submission is too long. Shorten the message and try again.";
  if (code === "rate_limit" || code === "429") return he ? "נשלחו בקשות רבות. יש להמתין מעט ולנסות שוב. הפרטים נשמרו בטופס." : "Too many requests. Wait a moment and try again. Your entries are still in the form.";
  if (code === "network") return he ? "לא התקבל אישור לשליחה. יש לבדוק את החיבור ולנסות שוב. הפרטים נשמרו בטופס." : "We could not confirm submission. Check your connection and try again. Your entries are still in the form.";
  return he ? "לא התקבל אישור לשליחה מהשירות. אפשר לנסות שוב מאוחר יותר או ליצור קשר בטלפון. הפרטים נשמרו בטופס." : "The service could not confirm submission. Try again later or contact us by phone. Your entries are still in the form.";
}
